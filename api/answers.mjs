import { generateGroundedAnswer } from "../src/gemini-answers.mjs";

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (!body || typeof body !== "object" || !Array.isArray(body.evidence)) {
      return response.status(400).json({ error: "Request must include an evidence array" });
    }
    const answer = await generateGroundedAnswer(body.question, body.evidence);
    return response.status(200).json(answer);
  } catch (error) {
    const status = error.status >= 400 && error.status < 500 ? 502 : 400;
    return response.status(status).json({ error: error.message || "Could not generate an answer" });
  }
}
