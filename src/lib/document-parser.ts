import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { convert as htmlToText } from "html-to-text";
import mammoth from "mammoth";
import { nanoid } from "nanoid";

import { DocumentChunk, ParsedDocument } from "@/lib/types";
import { truncate } from "@/lib/utils";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const require = createRequire(import.meta.url);

export function chunkText(documentId: string, input: string): DocumentChunk[] {
  const text = input.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push({
        id: `${documentId}-chunk-${index}`,
        documentId,
        index,
        text: slice,
      });
      index += 1;
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

export function extractTextFromHtml(html: string) {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextFromPdf(buffer: Buffer) {
  if (typeof globalThis.DOMMatrix === "undefined") {
    const canvas = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
    globalThis.DOMMatrix = canvas.DOMMatrix as unknown as typeof globalThis.DOMMatrix;
    globalThis.DOMPoint = canvas.DOMPoint as unknown as typeof globalThis.DOMPoint;
    globalThis.DOMRect = canvas.DOMRect as unknown as typeof globalThis.DOMRect;
    globalThis.ImageData = canvas.ImageData as unknown as typeof globalThis.ImageData;
    globalThis.Path2D = canvas.Path2D as unknown as typeof globalThis.Path2D;
  }

  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(
    pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href
  );
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\n{3,}/g, "\n\n").trim();
}

export async function parseUploadedFile(file: File): Promise<ParsedDocument> {
  const id = nanoid();
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  let content = "";

  if (fileName.endsWith(".pdf")) {
    content = await extractTextFromPdf(buffer);
  } else if (fileName.endsWith(".docx")) {
    content = await extractTextFromDocx(buffer);
  } else if (fileName.endsWith(".txt")) {
    content = buffer.toString("utf8").trim();
  } else if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
    content = extractTextFromHtml(buffer.toString("utf8"));
  } else {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const chunks = chunkText(id, content);
  const summary = chunks.length
    ? truncate(chunks.slice(0, 2).map((chunk) => chunk.text).join(" "), 320)
    : "No readable text could be extracted.";

  return {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    content,
    summary,
    chunks,
  };
}
