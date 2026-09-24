import "server-only";
import path from "node:path";
import fs from "node:fs";
import { DB_PATH } from "@/db";

// Proof-of-payment / receipt photos live on disk next to the database, never
// uploaded anywhere else (see [[cash-hey-local-first]]). Each row in the
// receipts/debtProofs/debtPayments tables just points at a filename here.
export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ path.dirname(DB_PATH), "uploads");

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Saves an uploaded image, returns its stored filename, or null if not an image. */
export async function saveUpload(file: File): Promise<{ file: string; contentType: string } | null> {
  const ext = ALLOWED[file.type];
  if (!ext || file.size === 0 || file.size > 15 * 1024 * 1024) return null;
  fs.mkdirSync(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, name), buf);
  return { file: name, contentType: file.type };
}

export function deleteUpload(file: string | null | undefined) {
  if (!file) return;
  try {
    fs.rmSync(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, file));
  } catch {}
}

export function uploadPath(file: string) {
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file);
}
