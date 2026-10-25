import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

export async function saveFile(rel: string, data: Buffer | string) {
  const abs = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export async function readFile(rel: string) {
  return fs.readFile(path.join(ROOT, rel));
}

export async function fileExists(rel: string) {
  try {
    await fs.access(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}
