import { embedText } from "../src/gemini-embeddings.mjs";
import { retrieveEvidence } from "../src/knowledge.mjs";
import { supabaseRequest } from "../src/supabase-rest.mjs";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 60 };

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      if (request.query?.q) return response.status(200).json(await search(request.query.q));
      const select = request.query?.id ? "id,title,source_type,content,version,status,effective_at,created_at" : "id,title,source_type,version,status,effective_at,created_at";
      const filter = request.query?.id ? `id=eq.${encodeURIComponent(request.query.id)}&` : "";
      const docs = await supabaseRequest(`documents?${filter}select=${select}&order=created_at.desc`);
      if (request.query?.id && !docs.length) return response.status(404).json({ error: "Document not found" });
      return response.status(200).json({ documents: docs.map(mapDocument) });
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return response.status(405).json({ error: "Method not allowed" });
    }
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (body?.action === "approve") return response.status(200).json(await approveDocument(body.documentId));
    return response.status(201).json(await createDocument(body));
  } catch (error) {
    console.error("Knowledge API error:", error.message);
    return response.status(error.status >= 400 && error.status < 500 ? error.status : 500)
      .json({ error: error.message || "Knowledge service failed" });
  }
}

async function createDocument(body) {
  if (!body || typeof body.title !== "string" || !body.title.trim()
    || typeof body.content !== "string" || !body.content.trim()
    || !["markdown", "pdf", "ticket", "wiki"].includes(body.sourceType)) {
    throw Object.assign(new Error("Provide a title, content, and supported source type"), { status: 400 });
  }
  if (body.content.length > 2_000_000) throw Object.assign(new Error("Document must be smaller than 2 MB"), { status: 413 });
  const chunks = Array.isArray(body.chunks) ? body.chunks : [];
  if (chunks.length > 200) throw Object.assign(new Error("A document cannot contain more than 200 citation chunks"), { status: 400 });
  if (chunks.some((chunk) => typeof chunk?.content !== "string" || !chunk.content.trim() || chunk.content.length > 12_000)) {
    throw Object.assign(new Error("Every chunk needs non-empty text of 12,000 characters or fewer"), { status: 400 });
  }
  const embedded = [];
  for (let offset = 0; offset < chunks.length; offset += 16) {
    embedded.push(...await Promise.all(chunks.slice(offset, offset + 16).map((chunk) =>
      embedText(chunk.content, "document", process.env.GEMINI_API_KEY, { title: body.title }))));
  }
  const document = (await supabaseRequest("documents?select=id,title,source_type,content,version,status,effective_at,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      title: body.title.trim().slice(0, 200), source_type: body.sourceType, content: body.content,
      version: String(body.version || "1").slice(0, 100), status: "pending", effective_at: null,
    }]),
  }))[0];
  if (chunks.length) {
    const rows = chunks.map((chunk, i) => ({
      document_id: document.id, content: chunk.content, heading: chunk.heading || "Document",
      chunk_index: i, page_number: chunk.pageNumber || null,
      line_start: chunk.startLine || null, line_end: chunk.endLine || null,
      embedding: `[${embedded[i].join(",")}]`,
    }));
    await supabaseRequest("chunks", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  }
  return { document: mapDocument(document), chunkCount: chunks.length };
}

async function approveDocument(documentId) {
  if (typeof documentId !== "string" || !documentId) throw Object.assign(new Error("documentId is required"), { status: 400 });
  const rows = await supabaseRequest(`documents?id=eq.${encodeURIComponent(documentId)}&select=id,title,source_type,content,version,status,effective_at,created_at`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "approved", effective_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!rows.length) throw Object.assign(new Error("Document not found"), { status: 404 });
  return { document: mapDocument(rows[0]) };
}

async function search(question) {
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    throw Object.assign(new Error("Enter a question up to 1,000 characters"), { status: 400 });
  }
  const rows = await supabaseRequest("chunks?select=id,document_id,content,heading,chunk_index,page_number,line_start,line_end,documents!inner(title,source_type,version,status,effective_at)&documents.status=eq.approved&limit=2000");
  const chunks = rows.map((row) => ({
    id: row.id, documentId: row.document_id, text: row.content, heading: row.heading,
    title: row.documents.title, version: row.documents.version || "1", kind: sourceKind(row.documents.source_type),
    approved: row.documents.status === "approved", current: row.documents.status === "approved",
    pageNumber: row.page_number, startLine: row.line_start, endLine: row.line_end,
  }));
  let queryVector = null;
  try { queryVector = await embedText(question, "query", process.env.GEMINI_API_KEY); } catch { /* keyword retrieval remains available */ }
  const lexical = retrieveEvidence(question, chunks, Math.max(1, chunks.length));
  let semantic = [];
  if (queryVector) {
    try {
      const rpcRows = await supabaseRequest("rpc/search_knowledge_chunks", {
        method: "POST", body: JSON.stringify({ query_embedding: `[${queryVector.join(",")}]`, match_count: 80, min_similarity: 0.25 }),
      });
      semantic = rpcRows.map((row) => ({
        id: row.id, documentId: row.document_id, text: row.content, heading: row.heading,
        title: row.title, version: row.version || "1", kind: sourceKind(row.source_type),
        approved: true, current: true, pageNumber: row.page_number,
        startLine: row.line_start, endLine: row.line_end, similarity: row.similarity,
      }));
    } catch (error) { console.warn("Semantic database search unavailable:", error.message); }
  }
  const fused = new Map();
  const add = (items, field, weight) => items.forEach((item, index) => {
    const result = fused.get(item.id) || { ...item, keywordRank: null, semanticRank: null, score: 0 };
    result[field] = index + 1;
    result.score += weight / (60 + index + 1);
    if (field === "keywordRank") { result.matchedTerms = item.matchedTerms; result.matchedQueryTerms = item.matchedQueryTerms; }
    fused.set(item.id, result);
  });
  add(lexical, "keywordRank", 1);
  add(semantic, "semanticRank", 1);
  const results = [...fused.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4).map((item) => ({
    ...item,
    citation: { documentId: item.documentId, title: item.title, version: item.version, heading: item.heading,
      ...(item.pageNumber == null ? {} : { pageNumber: item.pageNumber }), startLine: item.startLine, endLine: item.endLine },
  }));
  return { results };
}

function sourceKind(type) { return ({ markdown: "Uploaded Markdown", pdf: "PDF", ticket: "Support ticket", wiki: "Technical wiki" })[type] || "Document"; }
function mapDocument(doc) { return { documentId: doc.id, title: doc.title, kind: sourceKind(doc.source_type), version: doc.version || "1", approved: doc.status === "approved", current: doc.status !== "superseded", markdown: doc.content || "", sourceType: doc.source_type }; }
