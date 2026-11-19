import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPdfPages, ingestPdfPages } from "./pdf-ingestion.mjs";
import { retrieveEvidence } from "./knowledge.mjs";

const fixturePath = new URL("../examples/mfa-and-sso-support.pdf", import.meta.url);

test("extracts selectable text by page and preserves page citations through retrieval", async () => {
  const bytes = await readFile(fixturePath);
  const pages = await extractPdfPages(bytes);

  assert.equal(pages.length, 2);
  assert.match(pages[0].text, /Reset MFA/);
  assert.match(pages[1].text, /five minutes/);

  const chunks = ingestPdfPages(pages, {
    documentId: "sample-pdf",
    title: "MFA and SSO Support Guide",
    version: "v1",
    approved: true,
    current: true,
    kind: "PDF",
  });
  const results = retrieveEvidence("SSO setting five minutes", chunks, 3);

  assert.equal(results[0].pageNumber, 2);
  assert.equal(results[0].citation.pageNumber, 2);
  assert.match(results[0].id, /:p2:/);
});

test("enforces size, page-count, and valid-PDF constraints", async () => {
  const bytes = await readFile(fixturePath);
  await assert.rejects(() => extractPdfPages(Buffer.from("not a PDF")), /valid PDF header/);
  await assert.rejects(() => extractPdfPages(bytes, { maxBytes: 100 }), /100 bytes or smaller/);
  await assert.rejects(() => extractPdfPages(bytes, { maxPages: 1 }), /1 pages or fewer/);
  await assert.rejects(() => extractPdfPages(bytes, { maxPages: 0 }), /maxPages must be positive/);
});

test("rejects malformed page records and skips blank PDF pages", () => {
  assert.throws(() => ingestPdfPages([{ pageNumber: 0, text: "bad" }], {
    documentId: "doc", title: "Document", version: "v1",
  }), /positive pageNumber/);
  assert.deepEqual(ingestPdfPages([{ pageNumber: 1, text: "  " }], {
    documentId: "doc", title: "Document", version: "v1",
  }), []);
});
