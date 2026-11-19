import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/ingest-pdf.mjs";

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("PDF function returns extracted page text without losing page numbers", async () => {
  const pdf = await readFile(new URL("../examples/mfa-and-sso-support.pdf", import.meta.url));
  const response = mockResponse();
  await handler({ method: "POST", body: { pdfBase64: pdf.toString("base64") } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.pages.length, 2);
  assert.equal(response.body.pages[1].pageNumber, 2);
  assert.match(response.body.pages[1].text, /five minutes/);
});

test("PDF function rejects unsupported methods and invalid payloads", async () => {
  const methodResponse = mockResponse();
  await handler({ method: "GET" }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.Allow, "POST");

  const bodyResponse = mockResponse();
  await handler({ method: "POST", body: { pdfBase64: "%%%" } }, bodyResponse);
  assert.equal(bodyResponse.statusCode, 400);
});
