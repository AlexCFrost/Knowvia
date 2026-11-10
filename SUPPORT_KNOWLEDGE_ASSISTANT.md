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

`src/knowledge.mjs` implements a dependency-free Markdown ingestion and lexical retrieval core. It preserves section headings and source line ranges, splits long passages with overlap, and returns citation metadata with ranked evidence. Retrieval filters out documents unless both `approved` and `current` are true.

This is the deterministic baseline for the RAG pipeline. Retrieval gives extra weight to query terms found in a passage heading, while preserving body-text matching and current/approved filtering. Embeddings, PostgreSQL/pgvector persistence, PDF parsing, and model-based answer verification remain subsequent integration work.

## Browser demo

Run `python3 -m http.server 4173` from the project directory and open `http://localhost:4173/demo.html`. The interface opens with a sample MFA search. Try the SSO suggestion for another supported query or the audit-log suggestion to demonstrate abstention when no evidence is available. Matched query terms are highlighted in each passage. Select a citation to open the original document and highlight the cited lines and matching terms. To demonstrate ingestion, download the sample API key policy from the source panel or upload another Markdown file. New uploads are session-only and excluded from retrieval until approved with “Approve for this demo”; after approval, search for API key rotation or the topic in your uploaded note. Search is lexical and returns supporting passages; it does not generate an answer.

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
