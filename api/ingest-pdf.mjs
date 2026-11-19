import { extractPdfPages } from "../src/pdf-ingestion.mjs";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 30 };

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (typeof body?.pdfBase64 !== "string" || body.pdfBase64.length > 2_800_000) {
      return response.status(400).json({ error: "Provide a PDF smaller than 2 MB" });
    }
    const bytes = Buffer.from(body.pdfBase64, "base64");
    if (bytes.toString("base64") !== body.pdfBase64) {
      return response.status(400).json({ error: "The PDF data is not valid base64" });
    }
    const pages = await extractPdfPages(bytes);
    return response.status(200).json({ pages });
  } catch (error) {
    const status = error instanceof RangeError || error instanceof TypeError ? 400 : 422;
    return response.status(status).json({ error: error.message || "Could not extract PDF text" });
  }
}
