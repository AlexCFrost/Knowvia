import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { embedText } from "./src/gemini-embeddings.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method === "POST" && request.url === "/api/embeddings") {
    try {
      const body = await readJson(request, 64 * 1024);
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
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 32) {
    throw new Error("items must contain between 1 and 32 entries");
  }
  return body;
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
