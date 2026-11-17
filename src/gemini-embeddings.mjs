const MODEL = "gemini-embedding-2";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;
const MAX_INPUT_CHARS = 12_000;

/** Generate one semantic-search embedding using Google's Gemini API. */
export async function embedText(text, purpose, apiKey, { fetchImpl = fetch, title = "none" } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("text must be a non-empty string");
  if (text.length > MAX_INPUT_CHARS) throw new RangeError(`text must be ${MAX_INPUT_CHARS} characters or fewer`);
  if (purpose !== "query" && purpose !== "document") throw new TypeError("purpose must be query or document");
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("GEMINI_API_KEY is not configured on the server");

  const formatted = purpose === "query"
    ? `task: search result | query: ${text}`
    : `title: ${title || "none"} | text: ${text}`;
  const response = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text: formatted }] },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message ?? `Embedding request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const values = payload.embedding?.values;
  if (!Array.isArray(values) || !values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned an invalid vector");
  }
  return values;
}

export { MODEL as GEMINI_EMBEDDING_MODEL };
