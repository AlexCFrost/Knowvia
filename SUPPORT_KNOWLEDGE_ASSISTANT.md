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

`src/knowledge.mjs` implements dependency-free Markdown ingestion and retrieval. It preserves section headings and source line ranges, splits long passages with overlap, and returns citation metadata with ranked evidence. `retrieveEvidence` provides lexical search. `retrieveByEmbedding` ranks pre-embedded chunks with cosine similarity, supports a minimum similarity threshold, and applies the same approved/current source filter. Both retrieval paths return citation metadata.

This is the retrieval foundation for the RAG pipeline. `src/gemini-embeddings.mjs` connects it to Google's `gemini-embedding-2` embedding endpoint, and `server.mjs` keeps the API key on the server. The browser demo embeds approved/current document passages and questions, then ranks evidence with cosine similarity. The lexical path remains available when no key is configured. PDF parsing, persistent vector storage, and model-based answer verification remain subsequent integration work.

Run the retrieval checks with `node --test src/knowledge.test.mjs`.

## Browser demo

Copy `.env.example` to `.env.local`, put a fresh `GEMINI_API_KEY` in `.env.local`, and start the app with `node --env-file=.env.local server.mjs`. Open `http://localhost:4173`. The API key stays server-side. Without a key, the demo falls back to lexical search. Confirm Google AI Studio shows the project on its Free tier before using a key; a paid-tier project can incur charges. Do not commit `.env.local`.

The interface opens with a sample MFA search. Try the SSO suggestion for another supported query or the audit-log suggestion to demonstrate abstention when no evidence is available. Select a citation to open the original document and highlight the cited lines. To demonstrate ingestion, upload another Markdown file; new uploads are session-only and excluded from retrieval until approved with “Approve for this demo.” Search for a topic in the uploaded note after approval. Search retrieves supporting passages; it does not generate an answer.

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
