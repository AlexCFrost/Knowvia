import { ingestMarkdown, ingestPdfPages } from "./knowledge.mjs";

const sourceDocs = [];
const question = document.querySelector("#question");
const askButton = document.querySelector("#ask");
const resultsRegion = document.querySelector("#results");
const evidenceList = document.querySelector("#evidence-list");
const answerPanel = document.querySelector("#answer-panel");
const answerContent = document.querySelector("#answer-content");
const answerState = document.querySelector("#answer-state");
const resultSummary = document.querySelector("#result-summary");
const visibleCount = document.querySelector("#visible-count");
const resultControls = document.querySelector("#result-controls");
const sourceTypeFilter = document.querySelector("#source-type-filter");
const sourcesPanel = document.querySelector("#sources-panel");
const panelScrim = document.querySelector("#panel-scrim");
const sourceDialog = document.querySelector("#source-dialog");
const toast = document.querySelector("#toast");
let currentResults = [];
let supabaseAvailable = false;
let retrievalMode = "";

renderSources();
setConnectionStatus("Connecting to the knowledge base…", "loading");
const documentsReady = loadStoredDocuments();

askButton.addEventListener("click", search);
question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    search();
  }
});
document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    question.value = button.dataset.query;
    search();
  });
});
document.querySelector("#manage-docs").addEventListener("click", openSources);
document.querySelector("#manage-sources-footer").addEventListener("click", openSources);
document.querySelector("#close-sources").addEventListener("click", closeSources);
panelScrim.addEventListener("click", closeSources);
document.querySelector("#file-upload").addEventListener("change", handleFileUpload);
sourceTypeFilter.addEventListener("change", renderResults);
document.querySelector("#close-dialog").addEventListener("click", () => sourceDialog.close());
document.querySelector("#dialog-done").addEventListener("click", () => sourceDialog.close());
sourceDialog.addEventListener("click", (event) => {
  if (event.target === sourceDialog) sourceDialog.close();
});

async function search() {
  const query = question.value.trim();
  if (!query) {
    showToast("Enter a question to search the knowledge sources.");
    question.focus();
    return;
  }

  resultsRegion.setAttribute("aria-busy", "true");
  answerPanel.hidden = false;
  answerContent.textContent = "Searching approved documents…";
  askButton.disabled = true;
  askButton.querySelector("span:first-child").textContent = "Searching…";
  try {
    await documentsReady;
    if (!supabaseAvailable) await loadStoredDocuments();
    const response = await fetch(`/api/knowledge?q=${encodeURIComponent(query)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Search service returned ${response.status}`);
    currentResults = payload.results || [];
    retrievalMode = payload.retrievalMode || "";
    renderResults();
    if (!currentResults.length) {
      renderAnswer({ abstained: true, answer: "I don't have enough evidence in the approved, current documents to answer that.", claims: [] });
    } else {
      try {
        renderAnswer(await requestAnswer(query, currentResults));
      } catch (error) {
        renderAnswerError(error);
      }
    }
  } catch (error) {
    currentResults = [];
    renderResults();
    answerContent.replaceChildren();
    const message = document.createElement("p");
    message.className = "answer-error";
    message.textContent = error.message || "Search is unavailable. Please try again.";
    answerContent.append(message);
    showToast(error.message || "Semantic search failed.");
  } finally {
    askButton.disabled = false;
    askButton.querySelector("span:first-child").textContent = "Search knowledge";
    resultsRegion.setAttribute("aria-busy", "false");
  }
}

function renderResults() {
  const filter = sourceTypeFilter.value;
  const results = filter === "all" ? currentResults : currentResults.filter((result) => result.kind === filter);
  evidenceList.replaceChildren();
  resultControls.hidden = currentResults.length === 0;
  answerState.hidden = true;

  if (!currentResults.length) {
    resultSummary.textContent = "No supporting passages found in approved, current sources.";
    evidenceList.append(emptyState("No evidence found", "The available documents do not support an answer to this question. Try rephrasing it or add a relevant approved source."));
    return;
  }

  const total = currentResults.length;
  resultSummary.textContent = `${total} relevant ${total === 1 ? "passage" : "passages"} from approved, current sources${retrievalMode ? ` · ${retrievalMode}` : ""}`;
  visibleCount.textContent = `${results.length} shown`;
  if (!results.length) {
    evidenceList.append(emptyState("No passages match this source type", "Choose a different source type to see other supporting evidence."));
    return;
  }
  results.forEach((result, index) => evidenceList.append(renderEvidence(result, index)));
}

function renderEvidence(result, index) {
  const card = document.createElement("article");
  card.className = "evidence-card";

  const top = document.createElement("div");
  top.className = "evidence-topline";
  const order = document.createElement("span");
  order.className = "result-number";
  order.textContent = String(index + 1).padStart(2, "0");
  const sourceKind = document.createElement("span");
  sourceKind.className = "kind-badge";
  sourceKind.textContent = result.kind;
  const relevance = document.createElement("span");
  relevance.className = "relevance-score";
  relevance.innerHTML = '<span>●</span> Strong match';
  top.append(order, sourceKind, relevance);

  const title = document.createElement("h3");
  title.className = "evidence-title";
  title.textContent = result.heading;
  const documentMeta = document.createElement("div");
  documentMeta.className = "evidence-source-name";
  documentMeta.textContent = `${result.title}  ·  ${result.version}`;

  const passage = document.createElement("blockquote");
  passage.className = "passage";
  appendHighlightedText(passage, result.text, result.matchedQueryTerms);

  const matchedTerms = result.matchedQueryTerms ?? [];
  const matched = document.createElement("div");
  matched.className = "matched-line";
  const matchedLabel = document.createElement("span");
  matchedLabel.textContent = "MATCHED TERMS";
  const termList = document.createElement("div");
  termList.className = "matched-terms";
  for (const term of matchedTerms) {
    const chip = document.createElement("span");
    chip.className = "matched-term";
    chip.textContent = term;
    termList.append(chip);
  }
  matched.append(matchedLabel, termList);

  const footer = document.createElement("div");
  footer.className = "evidence-footer";
  const citationInfo = document.createElement("span");
  citationInfo.className = "citation-info";
  citationInfo.innerHTML = '<span class="citation-check">✓</span> CITED SOURCE';
  const citationLink = document.createElement("button");
  citationLink.className = "citation-link";
  citationLink.type = "button";
  const citationLocation = result.pageNumber ? `Page ${result.pageNumber}`
    : result.startLine === result.endLine ? `Line ${result.startLine}`
      : `Lines ${result.startLine}–${result.endLine}`;
  citationLink.innerHTML = `<span>${citationLocation}</span><span aria-hidden="true">↗</span>`;
  citationLink.addEventListener("click", () => openCitation(result));
  footer.append(citationInfo, citationLink);

  card.append(top, title, documentMeta, passage, matched, footer);
  return card;
}

function renderAnswer(answer) {
  answerPanel.hidden = false;
  answerContent.replaceChildren();
  if (answer.abstained) {
    const message = document.createElement("p");
    message.className = "answer-abstention";
    message.textContent = answer.answer;
    answerContent.append(message);
    return;
  }

  for (const claim of answer.claims) {
    const item = document.createElement("article");
    item.className = "answer-claim";
    const text = document.createElement("p");
    text.textContent = claim.text;
    const citations = document.createElement("div");
    citations.className = "answer-citations";
    for (const citation of claim.citations) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "answer-citation";
      const location = citation.pageNumber ? `Page ${citation.pageNumber}`
        : citation.startLine === citation.endLine ? `Line ${citation.startLine}`
          : `Lines ${citation.startLine}–${citation.endLine}`;
      link.textContent = `${citation.title} · ${citation.version} · ${location}`;
      link.addEventListener("click", () => {
        openCitation({ ...citation, documentId: citation.documentId });
      });
      citations.append(link);
    }
    item.append(text, citations);
    answerContent.append(item);
  }
}

function renderAnswerError(error) {
  answerPanel.hidden = false;
  answerContent.replaceChildren();
  const message = document.createElement("p");
  message.className = "answer-error";
  message.textContent = `I couldn't generate an answer right now. ${error?.message || "The retrieved passages are shown below."}`;
  answerContent.append(message);
}

async function requestAnswer(query, results) {
  const response = await fetch("/api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: query,
      evidence: results.map((result) => ({
        id: result.id,
        documentId: result.documentId,
        title: result.title,
        version: result.version,
        heading: result.heading,
        text: result.text,
        startLine: result.startLine,
        endLine: result.endLine,
        pageNumber: result.pageNumber,
        approved: result.approved,
        current: result.current,
      })),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Answer service returned ${response.status}`);
  return payload;
}

function renderSources() {
  const list = document.querySelector("#source-list");
  list.replaceChildren();
  for (const doc of sourceDocs) {
    const entry = document.createElement("div");
    entry.className = "source-entry";
    const item = document.createElement("button");
    item.className = "source-item";
    item.type = "button";
    item.dataset.sourceId = doc.documentId;
    item.addEventListener("click", () => openSource(doc));

    const top = document.createElement("span");
    top.className = "source-item-top";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = doc.kind === "Archived guide" ? "◷" : doc.kind === "PDF" ? "▧" : "▤";
    const details = document.createElement("span");
    details.className = "source-details";
    const name = document.createElement("strong");
    name.textContent = doc.title;
    const sub = document.createElement("small");
    sub.textContent = `${doc.kind} · ${doc.version}`;
    details.append(name, sub);
    const arrow = document.createElement("span");
    arrow.className = "source-arrow";
    arrow.textContent = "↗";
    top.append(icon, details, arrow);

    const tags = document.createElement("span");
    tags.className = "source-tags";
    tags.append(statusTag(doc.approved ? "Approved" : "Pending approval", doc.approved), statusTag(doc.current ? "Current" : "Outdated", doc.current));
    item.append(top, tags);
    entry.append(item);
    if (!doc.approved && doc.current) {
      const approveButton = document.createElement("button");
      approveButton.className = "approve-source-button";
      approveButton.type = "button";
      approveButton.textContent = "Approve source";
      approveButton.addEventListener("click", () => { void approveSource(doc); });
      entry.append(approveButton);
    }
    list.append(entry);
  }

  if (!sourceDocs.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = supabaseAvailable ? "No documents yet. Add a Markdown or PDF source to get started." : "Waiting for the knowledge database…";
    list.append(empty);
  }
  const activeCount = sourceDocs.filter((doc) => doc.approved && doc.current).length;
  const pendingCount = sourceDocs.filter((doc) => !doc.approved && doc.current).length;
  document.querySelector("#source-count").textContent = String(sourceDocs.length);
  document.querySelector("#current-source-count").textContent = pendingCount ? `${activeCount} active · ${pendingCount} pending` : `${activeCount} active ${activeCount === 1 ? "source" : "sources"}`;
  document.querySelector("#library-total").textContent = String(sourceDocs.length).padStart(2, "0");
  const selectedType = sourceTypeFilter.value || "all";
  const kinds = [...new Set(sourceDocs.filter((doc) => doc.approved && doc.current).map((doc) => doc.kind))].sort((a, b) => a.localeCompare(b));
  sourceTypeFilter.replaceChildren(new Option("All types", "all"));
  for (const kind of kinds) sourceTypeFilter.add(new Option(kind, kind));
  sourceTypeFilter.value = kinds.includes(selectedType) ? selectedType : "all";
}

function statusTag(text, active) {
  const element = document.createElement("span");
  element.className = active ? "tag" : "tag muted";
  element.textContent = text;
  return element;
}

async function approveSource(doc) {
  try {
    const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", documentId: doc.documentId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Approval could not be saved");
    Object.assign(doc, payload.document);
    renderSources();
    showToast(`“${doc.title}” is approved and ready to search.`);
  } catch (error) {
    showToast(error.message || "Approval could not be saved.");
  }
}

function openCitation(result) {
  const doc = sourceDocs.find((source) => source.documentId === result.documentId);
  if (doc) openSource(doc, {
    pageNumber: result.pageNumber,
    startLine: result.startLine,
    endLine: result.endLine,
    matchedTerms: result.matchedQueryTerms,
  });
}

async function openSource(doc, range = null) {
  if (doc.persisted && !doc.markdown) {
    try {
      const response = await fetch(`/api/knowledge?id=${encodeURIComponent(doc.documentId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load source");
      doc.markdown = payload.documents[0]?.markdown || "";
    } catch (error) {
      showToast(`Could not load the saved source: ${error.message}`);
      return;
    }
  }
  document.querySelector("#dialog-title").textContent = doc.title;
  document.querySelector("#dialog-meta").textContent = `${doc.kind} · ${doc.version} · ${doc.approved ? "Approved" : "Pending approval"}`;
  document.querySelector(".dialog-trust").innerHTML = doc.approved ? '<span>✓</span> Approved source' : '<span>◷</span> Awaiting approval';
  const callout = document.querySelector("#citation-callout");
  callout.hidden = !range;
  if (range) {
    const location = range.pageNumber ? `page ${range.pageNumber}`
      : range.startLine === range.endLine ? `line ${range.startLine}`
        : `lines ${range.startLine}–${range.endLine}`;
    callout.querySelector("p").textContent = `Showing cited passage · ${location}`;
  }

  const documentText = document.querySelector("#document-text");
  documentText.replaceChildren();
  if (Array.isArray(doc.pages)) {
    for (const page of doc.pages) {
      const section = document.createElement("section");
      section.className = `pdf-source-page${range?.pageNumber === page.pageNumber ? " cited-page" : ""}`;
      section.dataset.pageNumber = String(page.pageNumber);
      const heading = document.createElement("h3");
      heading.textContent = `Page ${page.pageNumber}`;
      const content = document.createElement("p");
      appendHighlightedText(content, page.text || "No selectable text on this page.", range?.pageNumber === page.pageNumber ? range.matchedTerms ?? [] : []);
      section.append(heading, content);
      documentText.append(section);
    }
    sourceDialog.showModal();
    documentText.querySelector(".cited-page")?.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  doc.markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const row = document.createElement("span");
    row.className = `document-line${range && lineNumber >= range.startLine && lineNumber <= range.endLine ? " cited-line" : ""}`;
    const number = document.createElement("span");
    number.className = "line-number";
    number.textContent = String(lineNumber).padStart(2, "0");
    const content = document.createElement("span");
    content.className = "line-content";
    appendHighlightedText(content, line || " ", range?.matchedTerms ?? []);
    row.append(number, content);
    documentText.append(row);
  });

  sourceDialog.showModal();
  const citedLine = documentText.querySelector(".cited-line");
  citedLine?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function appendHighlightedText(container, text, terms = []) {
  const uniqueTerms = [...new Set(terms)].sort((a, b) => b.length - a.length);
  if (!uniqueTerms.length) {
    container.textContent = text;
    return;
  }

  const alternatives = uniqueTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_-])(${alternatives})(?![\\p{L}\\p{N}_-])`, "giu");
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    const mark = document.createElement("mark");
    mark.className = "query-match";
    mark.textContent = match[0];
    container.append(mark);
    cursor = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function openSources() {
  sourcesPanel.classList.add("open");
  sourcesPanel.setAttribute("aria-hidden", "false");
  panelScrim.classList.add("visible");
  document.querySelector("#close-sources").focus();
}

function closeSources() {
  sourcesPanel.classList.remove("open");
  sourcesPanel.setAttribute("aria-hidden", "true");
  panelScrim.classList.remove("visible");
}

async function importMarkdown(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!/\.(?:md|markdown)$/i.test(file.name)) throw new Error("Choose a .md or .markdown file.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Markdown files must be smaller than 2 MB.");
    const markdown = await file.text();
    const title = file.name.replace(/\.markdown?$/i, "").replace(/[-_]+/g, " ");
    const sourceType = document.querySelector("#markdown-source-type").value;
    const sourceKinds = { markdown: "Uploaded Markdown", ticket: "Support ticket", wiki: "Technical wiki" };
    const doc = {
      documentId: `upload-${crypto.randomUUID()}`,
      title,
      version: "1",
      approved: false,
      current: true,
      kind: sourceKinds[sourceType] || "Uploaded Markdown",
      markdown,
    };
    const newChunks = ingestMarkdown(markdown, doc);
    if (!newChunks.length) throw new Error("No readable Markdown passages were found.");
    await persistDocument(doc, newChunks, sourceType);
    sourceDocs.push(doc);
    renderSources();
    showToast(`Added “${title}”. Approve it from the source library before searching.`);
  } catch (error) {
    showToast(error.message || "Could not read that Markdown file.");
  } finally {
    event.target.value = "";
  }
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setUploadBusy(true);
  try {
    if (/\.pdf$/i.test(file.name)) await importPdf(event, file);
    else if (/\.(?:md|markdown)$/i.test(file.name)) await importMarkdown(event);
    else showToast("Choose a .pdf, .md, or .markdown file.");
  } finally {
    event.target.value = "";
    setUploadBusy(false);
  }
}

async function importPdf(event, file) {
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("PDF files must be smaller than 2 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024));
    }
    const response = await fetch("/api/ingest-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64: btoa(binary) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `PDF service returned ${response.status}`);

    const title = file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
    const doc = {
      documentId: `upload-${crypto.randomUUID()}`,
      title,
      version: "1",
      approved: false,
      current: true,
      kind: "PDF",
      pages: payload.pages,
      markdown: payload.pages.map((page) => `# Page ${page.pageNumber}\n\n${page.text}`).join("\n\n"),
    };
    const newChunks = ingestPdfPages(payload.pages, doc);
    if (!newChunks.length) throw new Error("No readable text was found in the PDF.");
    await persistDocument(doc, newChunks, "pdf");
    sourceDocs.push(doc);
    renderSources();
    showToast(`Added “${title}”. Approve it before searching; citations will show PDF page numbers.`);
  } catch (error) {
    showToast(error.message || "Could not read that PDF file.");
  } finally {
    event.target.value = "";
  }
}

async function persistDocument(doc, docChunks, sourceType) {
  if (docChunks.length > 200) throw new Error("This document creates more than 200 passages. Split it into smaller files and upload them separately.");
  const response = await fetch("/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: doc.title, version: doc.version, sourceType,
      content: doc.markdown,
      chunks: docChunks.map((chunk) => ({
        content: chunk.text, heading: chunk.heading,
        pageNumber: chunk.pageNumber, startLine: chunk.startLine, endLine: chunk.endLine,
      })),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not save document");
  if (!payload.document?.documentId) throw new Error("The database did not confirm that the document was saved");
  doc.documentId = payload.document.documentId;
  doc.persisted = true;
  Object.assign(doc, payload.document);
  showToast(`Saved ${payload.chunkCount} passages. Approve the source before searching.`);
}

function setUploadBusy(busy) {
  const input = document.querySelector("#file-upload");
  const button = document.querySelector(".upload-button");
  input.disabled = busy;
  button.setAttribute("aria-disabled", String(busy));
  button.classList.toggle("is-busy", busy);
  button.replaceChildren();
  const icon = document.createElement("span");
  icon.textContent = busy ? "◌" : "＋";
  button.append(icon, document.createTextNode(busy ? " Saving to knowledge base…" : " Add a source"));
}

async function loadStoredDocuments() {
  try {
    const response = await fetch("/api/knowledge");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load saved documents");
    supabaseAvailable = true;
    sourceDocs.splice(0, sourceDocs.length, ...(payload.documents || []).map((doc) => ({ ...doc, persisted: true })));
    renderSources();
    setConnectionStatus("Knowledge base connected", "ready");
  } catch (error) {
    supabaseAvailable = false;
    renderSources();
    setConnectionStatus("Knowledge base unavailable", "error");
    showToast(`Could not connect to the knowledge database: ${error.message}`);
  }
}

function setConnectionStatus(message, state) {
  const status = document.querySelector(".sync-status");
  status.dataset.state = state;
  status.querySelector("span:last-of-type").textContent = message;
  const footerStatus = document.querySelector(".panel-footer span");
  footerStatus.dataset.state = state;
  footerStatus.replaceChildren();
  const indicator = document.createElement("i");
  footerStatus.append(indicator, document.createTextNode(state === "ready" ? " Connected" : state === "error" ? " Connection failed" : " Connecting"));
}

function emptyState(title, description) {
  const box = document.createElement("div");
  box.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.textContent = "⌕";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  box.append(icon, strong, text);
  return box;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}
