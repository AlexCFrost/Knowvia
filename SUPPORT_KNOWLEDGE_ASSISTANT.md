# Enterprise SaaS Support Knowledge Assistant

## Product scope

The assistant answers support questions from approved documentation and tickets, shows the exact passages it used, and says when available sources do not support an answer.

## Workflow

1. An admin adds Markdown, PDF, or support-ticket content and records its source, version, approval status, and effective date.
2. Ingestion extracts text, splits it into citation-sized chunks, and stores chunk metadata and embeddings.
3. A question is classified as a how-to, troubleshooting, policy, or unsupported request.
4. Retrieval excludes unapproved or superseded material, searches the remaining chunks, and reranks the strongest matches.
5. Answer generation uses retrieved passages and links factual claims to their source passage and version.
6. A verification step checks whether citations support the answer. If evidence is missing or weak, the assistant says it cannot confirm the answer from available documents.

## Technical implementation

`src/knowledge.mjs` implements dependency-free Markdown ingestion and retrieval. It preserves section headings and source line ranges, splits long passages with overlap, and returns citation metadata with ranked evidence. `retrieveEvidence` provides lexical search. `retrieveByEmbedding` ranks pre-embedded chunks with cosine similarity, supports a minimum similarity threshold, and applies the approved/current source filter. `retrieveHybrid` merges keyword and semantic rankings with weighted reciprocal rank fusion (RRF), retains citation metadata, and falls back to keyword results when no query embedding is available.

`src/gemini-answers.mjs` uses Google's Free-tier `gemini-3.5-flash-lite` to generate short, claim-level answers from retrieved approved/current passages. Each claim includes a citation ID that the server resolves against the supplied passages; unknown IDs fail closed. The model returns an explicit abstention when it cannot answer, and the app also abstains without calling the model when retrieval returns no evidence. Claim citations open the cited source passage.

`src/gemini-embeddings.mjs` connects semantic retrieval to Google's `gemini-embedding-2` endpoint. `src/pdf-ingestion.mjs` extracts selectable PDF text by page and preserves that page number on every chunk and citation. The browser demo uses `api/knowledge.mjs` to store uploaded Markdown/PDF documents and citation chunks in Supabase, persist approval state, and search approved material with keyword ranking plus a pgvector RPC. Supabase service credentials are read only by server code through `src/supabase-rest.mjs`; they are never sent to the browser. Local serving uses `scripts/local-server.mjs`; Vercel serves browser files directly and deploys handlers from `api/` as Functions. The SQL migration defines document content, version and approval metadata, page/line citation chunks, 3,072-dimensional embeddings, a halfvec HNSW index, and a bounded vector-search function.

Run the retrieval checks with `node --test src/knowledge.test.mjs`.

Run the local retrieval evaluation with `node src/evaluate-retrieval.mjs`. It reports hit rate at 3, mean reciprocal rank, unsupported-question abstention, citation line validity, active-source filtering, and retrieval time against the demo's shared sample documents. The evaluation stays local and does not send the document corpus to an external model.

## Browser demo

Copy `.env.example` to `.env.local`, configure `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, and start the app with `node --env-file=.env.local scripts/local-server.mjs`. The model key and Supabase service-role key stay server-side; do not commit `.env.local`. With Supabase configured, uploads remain pending until approved, and approved chunks are searchable across sessions. Without Supabase credentials the API reports the missing configuration and the browser can still use its sample/session sources. Confirm Google AI Studio shows the project on its Free tier before using a key; a paid-tier project can incur charges.

The interface opens with a sample MFA search. Try the SSO suggestion for another supported query or the audit-log suggestion to demonstrate abstention when no evidence is available. Each answer claim links to one or more supporting passages. Upload a PDF or Markdown file; Markdown can be classified as support documentation, a ticket, or a technical wiki. PDFs must contain selectable text, be smaller than 2 MB, and have at most 100 pages. With Supabase configured, uploads are persisted as pending sources and become searchable after approval. Without Supabase credentials, uploads remain in the current session.

## Initial product architecture

- **Web app:** Next.js with TypeScript for the question interface, source viewer, and document administration.
- **API and jobs:** Node.js/TypeScript endpoints for ingestion, retrieval, answering, and evaluation.
- **Storage:** PostgreSQL with pgvector for documents, chunks, metadata, and vector search.
- **Answer record:** Store the question, answer, retrieved chunk IDs, citation spans, model/config version, and latency so a response can be reviewed later.

## MVP acceptance criteria

- A user can ingest a Markdown file and ask a question answered from it.
- Every answer that uses document facts shows clickable citations with a source title and version.
- Unapproved and superseded sources are excluded by default.
- If no adequate evidence is found, the assistant clearly says so instead of filling gaps from general knowledge.
- A small evaluation set records retrieval hit rate, citation validity, faithfulness review, abstention behavior, and response time.
