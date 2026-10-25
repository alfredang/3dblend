/**
 * Reference attachments for the design agent. Images are passed to the model
 * as-is (the browser already downscaled them). PDFs are rendered (first page)
 * to a PNG and their text extracted, since the model only sees text + images.
 */
import { createCanvas } from "@napi-rs/canvas";
import { parseSTL, parse3MF, specFromBlenderScript, meshToSTL, type ImportedMesh } from "@/agent/meshio";

export interface ProcessedAttachment {
  kind: "image" | "pdf" | "mesh" | "script";
  /** For STL/3MF uploads (and Blender scripts without an embedded spec): the imported geometry as binary STL + stats. */
  mesh?: ImportedMesh;
  meshStl?: Buffer;
  /** For uploaded 3DBlend Blender scripts: the embedded spec to continue editing. */
  spec?: unknown;
  /** PNG/JPEG bytes to show the model and the user. */
  image?: Buffer;
  imageMime?: "image/png" | "image/jpeg";
  /** Extracted text (PDF only), capped. */
  text?: string;
  pages?: number;
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export async function processAttachment(name: string, mime: string, data: Buffer): Promise<ProcessedAttachment> {
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return processPdf(data);
  if (/\.stl$/i.test(name) || mime === "model/stl" || mime === "application/sla") {
    const mesh = parseSTL(data);
    return { kind: "mesh", mesh, meshStl: meshToSTL(mesh, name) };
  }
  if (/\.3mf$/i.test(name) || mime === "model/3mf") {
    const mesh = parse3MF(data);
    return { kind: "mesh", mesh, meshStl: meshToSTL(mesh, name) };
  }
  if (/\.py$/i.test(name) || mime === "text/x-python" || mime === "text/x-python-script") {
    const text = data.toString("utf8");
    const spec = specFromBlenderScript(text);
    return { kind: "script", spec: spec ?? undefined, text: spec ? undefined : text.slice(0, 12000) };
  }
  if (mime === "image/png") return { kind: "image", image: data, imageMime: "image/png" };
  if (mime === "image/jpeg" || mime === "image/jpg") return { kind: "image", image: data, imageMime: "image/jpeg" };
  throw new Error("Unsupported attachment type. Use a JPEG/PNG image, a PDF, an STL, a 3MF or a Blender .py script.");
}

async function processPdf(data: Buffer): Promise<ProcessedAttachment> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, disableFontFace: true }).promise;
  const pages = doc.numPages;
  const chunks: string[] = [];
  for (let i = 1; i <= Math.min(pages, 6); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    chunks.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    if (chunks.join("\n").length > 8000) break;
  }
  const text = chunks.join("\n\n").replace(/\s{3,}/g, "  ").slice(0, 8000);

  let image: Buffer | undefined;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1400 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // pdfjs types expect a DOM canvas; the napi canvas is API-compatible.
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    image = canvas.toBuffer("image/png");
  } catch (e) {
    console.warn("[attachments] PDF render failed, using text only:", (e as Error).message);
  }
  return { kind: "pdf", image, imageMime: image ? "image/png" : undefined, text, pages };
}

export function toDataUrl(buf: Buffer, mime: string) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}
