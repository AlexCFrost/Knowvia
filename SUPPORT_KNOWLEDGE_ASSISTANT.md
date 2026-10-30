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

This is the deterministic baseline for the RAG pipeline. Embeddings, PostgreSQL/pgvector persistence, PDF parsing, and model-based answer verification remain subsequent integration work.

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
