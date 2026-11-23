import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { ingestMarkdown, ingestPdfPages } from "./knowledge.mjs";
export { ingestPdfPages } from "./knowledge.mjs";

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 100;
const MAX_EXTRACTED_CHARS = 1_000_000;

/** Extract selectable text by page without sending the PDF to an external service. */
export async function extractPdfPages(input, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_PDF_BYTES;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const maxCharacters = options.maxCharacters ?? MAX_EXTRACTED_CHARS;
  const data = toBytes(input);
  if (data.length === 0) throw new TypeError("PDF file is empty");
  if (data.length > maxBytes) throw new RangeError(`PDF files must be ${formatBytes(maxBytes)} or smaller`);
  if (!new TextDecoder("latin1").decode(data.subarray(0, 1024)).includes("%PDF-")) {
    throw new TypeError("The selected file does not have a valid PDF header");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new RangeError("maxPages must be positive");

  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
    if (pdf.numPages > maxPages) throw new RangeError(`PDF files must have ${maxPages} pages or fewer`);
    const pages = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      totalCharacters += text.length;
      if (totalCharacters > maxCharacters) throw new RangeError("Extracted PDF text is too large to process");
      pages.push({ pageNumber, text });
      page.cleanup();
    }
    if (!pages.some((page) => page.text)) {
      throw new Error("No selectable text was found. Scanned PDFs require OCR, which this demo does not support yet.");
    }
    return pages;
  } catch (error) {
    if (error instanceof RangeError || error.message.startsWith("No selectable text")) throw error;
    throw new Error("Could not read this PDF. Make sure it is valid and not password-protected.");
  } finally {
    if (pdf) await pdf.cleanup();
    await loadingTask.destroy();
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return Uint8Array.from(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("PDF input must be bytes");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${bytes} bytes`;
}
