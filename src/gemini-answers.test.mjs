import test from "node:test";
import assert from "node:assert/strict";
import { generateGroundedAnswer, INSUFFICIENT_EVIDENCE_MESSAGE } from "./gemini-answers.mjs";

const passage = {
  id: "identity-guide:v2:5:1",
  documentId: "identity-guide",
  title: "Identity & Access Administration",
  version: "v2.4",
  heading: "Reset MFA",
  text: "An administrator can reset MFA from Admin Console, Users, Security, then Reset MFA.",
  startLine: 5,
  endLine: 5,
  approved: true,
  current: true,
};

function responseFor(generated) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("returns a clear abstention without calling the model when evidence is empty", async () => {
  let called = false;
  const result = await generateGroundedAnswer("How do I reset MFA?", [], {
    apiKey: "test-key",
    fetchImpl: async () => { called = true; },
  });

  assert.equal(called, false);
  assert.deepEqual(result, { abstained: true, answer: INSUFFICIENT_EVIDENCE_MESSAGE, claims: [] });
});

test("returns concise claims with citations resolved from approved evidence", async () => {
  let request;
  const result = await generateGroundedAnswer("How do I reset MFA?", [passage], {
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return responseFor({ abstained: false, claims: [{ text: "Open Users, select the account, and choose Security → Reset MFA.", citationIds: [passage.id] }] });
    },
  });

  assert.match(request.url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(request.options.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(request.options.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.match(body.systemInstruction.parts[0].text, /Do not use outside knowledge/);
  assert.deepEqual(result.claims[0].citations[0], {
    id: passage.id,
    documentId: passage.documentId,
    title: passage.title,
    version: passage.version,
    heading: passage.heading,
    startLine: passage.startLine,
    endLine: passage.endLine,
    pageNumber: undefined,
  });
});

test("does not send unapproved or outdated passages to the model", async () => {
  let prompt = "";
  const result = await generateGroundedAnswer("How do I reset MFA?", [
    passage,
    { ...passage, id: "draft", approved: false, text: "Do not use this draft." },
    { ...passage, id: "old", current: false, text: "Do not use this old procedure." },
  ], {
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      prompt = options.body;
      return responseFor({ abstained: false, claims: [{ text: "Use Reset MFA.", citationIds: [passage.id] }] });
    },
  });

  assert.equal(result.abstained, false);
  assert.equal(prompt.includes("Do not use this draft."), false);
  assert.equal(prompt.includes("Do not use this old procedure."), false);
});

test("converts model abstention to the product's explicit evidence message", async () => {
  const result = await generateGroundedAnswer("How long are logs kept?", [passage], {
    apiKey: "test-key",
    fetchImpl: async () => responseFor({ abstained: true, claims: [] }),
  });

  assert.equal(result.abstained, true);
  assert.equal(result.answer, INSUFFICIENT_EVIDENCE_MESSAGE);
});

test("rejects citations that refer to evidence the caller did not supply", async () => {
  await assert.rejects(() => generateGroundedAnswer("How do I reset MFA?", [passage], {
    apiKey: "test-key",
    fetchImpl: async () => responseFor({ abstained: false, claims: [{ text: "Unsupported claim.", citationIds: ["made-up-id"] }] }),
  }), /unknown evidence passage/);
});

test("surfaces provider failures and validates request bounds", async () => {
  await assert.rejects(() => generateGroundedAnswer("How do I reset MFA?", [passage], {
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "Quota limit" } }), { status: 429 }),
  }), (error) => error.status === 429 && /Quota limit/.test(error.message));
  await assert.rejects(() => generateGroundedAnswer(" ", [passage]), /non-empty string/);
  await assert.rejects(() => generateGroundedAnswer("x".repeat(1001), [passage]), /1000 characters/);
  await assert.rejects(() => generateGroundedAnswer("Question", [passage], { apiKey: "" }), /GEMINI_API_KEY/);
});
