import { embedText } from "../src/gemini-embeddings.mjs";

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 32) {
      return response.status(400).json({ error: "items must contain between 1 and 32 entries" });
    }
    const embeddings = await Promise.all(body.items.map(({ text, purpose, title }) =>
      embedText(text, purpose, process.env.GEMINI_API_KEY, { title })
    ));
    return response.status(200).json({ embeddings });
  } catch (error) {
    const status = error.status >= 400 && error.status < 500 ? 502 : 400;
    return response.status(status).json({ error: error.message || "Could not create embeddings" });
  }
}
