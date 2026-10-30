/**
 * Small, dependency-free Markdown ingestion and evidence retrieval core.
 * Chunks retain their exact source text and line range for citation display.
 */

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 120;

/**
 * Convert Markdown into citation-ready chunks. Input metadata should come from
 * the document catalogue, not from the Markdown body.
 */
export function ingestMarkdown(markdown, metadata, options = {}) {
  if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
  if (!metadata?.documentId || !metadata?.title || !metadata?.version) {
    throw new TypeError("metadata requires documentId, title, and version");
  }

  const maxChars = options.maxChars ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be positive");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars) {
    throw new RangeError("overlap must be non-negative and smaller than maxChars");
  }

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let heading = "Document";
  let block = [];
  let blockStart = 1;
  let fenced = false;

  const flush = (endLine) => {
    if (!block.length) return;
    const text = block.join("\n").trim();
    if (text) sections.push({ heading, text, startLine: blockStart, endLine });
    block = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;
    const headingMatch = !fenced && line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flush(lineNumber - 1);
      heading = headingMatch[2].trim();
      continue;
    }

    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === "") {
      flush(lineNumber - 1);
      continue;
    }
    if (!block.length) blockStart = lineNumber;
    block.push(line);
  }
  flush(lines.length);

  const chunks = [];
  for (const section of sections) {
    const pieces = splitWithOverlap(section.text, maxChars, overlap);
    for (let i = 0; i < pieces.length; i += 1) {
      const { text: piece, start, end } = pieces[i];
      const startLine = section.startLine + countNewlines(section.text.slice(0, start));
      const endLine = section.startLine + countNewlines(section.text.slice(0, end));
      const id = `${metadata.documentId}:${metadata.version}:${startLine}:${i + 1}`;
      chunks.push({
        id,
        documentId: metadata.documentId,
        title: metadata.title,
        version: metadata.version,
        approved: metadata.approved === true,
        current: metadata.current === true,
        heading: section.heading,
        text: piece,
        startLine,
        endLine,
      });
    }
  }
  return chunks;
}

/** Return ranked, citation-ready evidence from approved current chunks only. */
export function retrieveEvidence(query, chunks, limit = 5) {
  if (typeof query !== "string" || !query.trim()) return [];
  if (!Array.isArray(chunks)) throw new TypeError("chunks must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");

  const terms = tokenize(query);
  if (!terms.length) return [];
  const eligible = chunks.filter((chunk) => chunk.approved && chunk.current && chunk.text);
  const documentFrequency = new Map();
  for (const chunk of eligible) {
    for (const term of new Set(tokenize(chunk.text))) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return eligible
    .map((chunk) => {
      const words = tokenize(`${chunk.heading} ${chunk.text}`);
      const frequencies = new Map();
      for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
      const score = terms.reduce((sum, term) => {
        const tf = frequencies.get(term) ?? 0;
        if (!tf) return sum;
        const idf = Math.log(1 + eligible.length / (1 + (documentFrequency.get(term) ?? 0)));
        return sum + (tf / (tf + 1.2)) * idf;
      }, 0);
      return {
        ...chunk,
        score,
        citation: {
          documentId: chunk.documentId,
          title: chunk.title,
          version: chunk.version,
          heading: chunk.heading,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
        },
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function splitWithOverlap(text, maxChars, overlap) {
  if (text.length <= maxChars) return [{ text, start: 0, end: text.length }];
  const pieces = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(maxChars * 0.6)) end = boundary;
    }
    const raw = text.slice(start, end);
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const pieceStart = start + leadingWhitespace;
    const pieceEnd = end - trailingWhitespace;
    pieces.push({ text: text.slice(pieceStart, pieceEnd), start: pieceStart, end: pieceEnd });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return pieces.filter((piece) => piece.text);
}

function tokenize(text) {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
}

function countNewlines(text) {
  return (text.match(/\n/g) ?? []).length;
}
