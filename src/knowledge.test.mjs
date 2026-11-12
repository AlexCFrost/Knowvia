import test from "node:test";
import assert from "node:assert/strict";
import { retrieveByEmbedding } from "./knowledge.mjs";

function chunk(id, embedding, overrides = {}) {
  return {
    id,
    documentId: `doc-${id}`,
    title: `Document ${id}`,
    version: "v1",
    heading: "Support instructions",
    text: `Evidence passage ${id}`,
    startLine: 4,
    endLine: 5,
    approved: true,
    current: true,
    embedding,
    ...overrides,
  };
}

test("ranks approved current chunks by cosine similarity and retains citation metadata", () => {
  const results = retrieveByEmbedding([1, 0], [
    chunk("less-relevant", [0.8, 0.6]),
    chunk("best", [4, 0]),
    chunk("opposite", [-1, 0]),
    chunk("pending", [1, 0], { approved: false }),
    chunk("outdated", [1, 0], { current: false }),
    chunk("unembedded", undefined),
  ]);

  assert.deepEqual(results.map((result) => result.id), ["best", "less-relevant"]);
  assert.equal(results[0].similarity, 1);
  assert.equal(results[1].similarity, 0.8);
  assert.equal(results[0].score, results[0].similarity);
  assert.deepEqual(results[0].citation, {
    documentId: "doc-best",
    title: "Document best",
    version: "v1",
    heading: "Support instructions",
    startLine: 4,
    endLine: 5,
  });
});

test("applies the similarity threshold, result limit, and stable tie ordering", () => {
  const results = retrieveByEmbedding([1, 0], [
    chunk("zeta", [0.6, 0.8]),
    chunk("beta", [0.6, -0.8]),
    chunk("below-threshold", [0.2, Math.sqrt(0.96)]),
  ], 1, 0.5);

  assert.deepEqual(results.map((result) => result.id), ["beta"]);
});

test("accepts typed-array embeddings", () => {
  const results = retrieveByEmbedding(new Float32Array([1, 0]), [
    chunk("typed", new Float32Array([1, 0])),
  ]);

  assert.equal(results[0].id, "typed");
  assert.equal(results[0].similarity, 1);
});

test("rejects invalid query embeddings and search options", () => {
  const chunks = [chunk("valid", [1, 0])];
  assert.throws(() => retrieveByEmbedding([], chunks), /non-empty numeric array/);
  assert.throws(() => retrieveByEmbedding([1, Number.NaN], chunks), /finite numbers/);
  assert.throws(() => retrieveByEmbedding([0, 0], chunks), /zero vector/);
  assert.throws(() => retrieveByEmbedding([1, 0], chunks, 0), /limit must be positive/);
  assert.throws(() => retrieveByEmbedding([1, 0], chunks, 1, 1.1), /between -1 and 1/);
  assert.throws(() => retrieveByEmbedding([1, 0], {}), /chunks must be an array/);
});

test("rejects mismatched stored embedding dimensions", () => {
  assert.throws(
    () => retrieveByEmbedding([1, 0], [chunk("wrong-dimension", [1, 0, 0])]),
    /dimensions do not match/,
  );
});

test("rejects zero vectors in stored chunk embeddings", () => {
  assert.throws(
    () => retrieveByEmbedding([1, 0], [chunk("zero-vector", [0, 0])]),
    /must not be a zero vector/,
  );
});

test("returns no matches when all eligible similarities fall below the threshold", () => {
  const results = retrieveByEmbedding([1, 0], [chunk("sideways", [0, 1])], 5, 0.5);
  assert.deepEqual(results, []);
});
