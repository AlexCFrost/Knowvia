import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/answers.mjs";

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("answer function abstains on empty evidence without needing a model key", async () => {
  const response = mockResponse();
  await handler({ method: "POST", body: { question: "How long are audit logs kept?", evidence: [] } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.abstained, true);
  assert.match(response.body.answer, /don't have enough evidence/);
});

test("answer function rejects unsupported methods and malformed request bodies", async () => {
  const methodResponse = mockResponse();
  await handler({ method: "GET" }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.Allow, "POST");

  const bodyResponse = mockResponse();
  await handler({ method: "POST", body: { question: "Question", evidence: "not-an-array" } }, bodyResponse);
  assert.equal(bodyResponse.statusCode, 400);
  assert.match(bodyResponse.body.error, /evidence array/);
});
