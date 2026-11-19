import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { embedText } from "./src/gemini-embeddings.mjs";
import { generateGroundedAnswer } from "./src/gemini-answers.mjs";
import { extractPdfPages } from "./src/pdf-ingestion.mjs";
import knowledgeHandler from "./api/knowledge.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".json": "application/json; charset=utf-8", ".pdf": "application/pdf",
};

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (new URL(request.url, "http://localhost").pathname === "/api/knowledge") {
    try {
      const body = request.method === "POST" ? await readJson(request, 4 * 1024 * 1024) : undefined;
      const url = new URL(request.url, "http://localhost");
      const apiResponse = {
        setHeader: (name, value) => response.setHeader(name, value),
        status(code) { this.code = code; return this; },
        json(data) {
          response.writeHead(this.code || 200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(data));
          return this;
        },
      };
      await knowledgeHandler({ method: request.method, body, query: Object.fromEntries(url.searchParams) }, apiResponse);
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Knowledge request failed" });
    }
    return;
  }
  if (request.method === "POST" && request.url === "/api/ingest-pdf") {
    try {
      const body = await readJson(request, 4 * 1024 * 1024);
      if (typeof body.pdfBase64 !== "string" || body.pdfBase64.length > 2_800_000) {
        throw new Error("Provide a PDF smaller than 2 MB");
      }
      const bytes = Buffer.from(body.pdfBase64, "base64");
      if (bytes.toString("base64") !== body.pdfBase64) throw new Error("The PDF data is not valid base64");
      const pages = await extractPdfPages(bytes);
      sendJson(response, 200, { pages });
    } catch (error) {
      const status = error instanceof RangeError || error instanceof TypeError ? 400 : 422;
      sendJson(response, status, { error: error.message || "Could not extract PDF text" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/answers") {
    try {
      const body = await readJson(request, 64 * 1024);
      const result = await generateGroundedAnswer(body.question, body.evidence);
      sendJson(response, 200, result);
    } catch (error) {
      const status = error.status && error.status >= 400 && error.status < 500 ? 502 : 400;
      sendJson(response, status, { error: error.message || "Could not generate an answer" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/embeddings") {
    try {
      const body = await readJson(request, 64 * 1024);
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 32) {
        throw new Error("items must contain between 1 and 32 entries");
      }
      const vectors = await Promise.all(body.items.map(({ text, purpose, title }) => embedText(text, purpose, process.env.GEMINI_API_KEY, { title })));
      sendJson(response, 200, { embeddings: vectors });
    } catch (error) {
      const status = error.status && error.status >= 400 && error.status < 500 ? 502 : 400;
      sendJson(response, status, { error: error.message || "Could not create embeddings" });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const requested = resolve(root, `.${pathname === "/" ? "/demo.html" : pathname}`);
  if (requested !== root && !requested.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(requested);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": mimeTypes[extname(requested)] || "application/octet-stream" });
    if (request.method === "HEAD") response.end();
    else response.end(await readFile(requested));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Knowvia demo available at http://localhost:${port}`));

async function readJson(request, limit) {
  const parts = [];
  let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > limit) throw new Error("Request is too large");
    parts.push(part);
  }
  const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
  return body;
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
