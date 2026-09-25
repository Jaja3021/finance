import "server-only";
import path from "node:path";
import fs from "node:fs";
import { put, del, get } from "@vercel/blob";
import { DB_PATH } from "@/db";

// Proof-of-payment / receipt photos. Locally they live on disk next to the
// database (see [[cash-hey-local-first]]); on Vercel, where there is no
// lasting disk, they go to Vercel Blob. Either way each row in the
// receipts/debtProofs/debtPayments tables only stores a filename, and
// /api/uploads/[file] checks ownership before serving it.
export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ path.dirname(DB_PATH), "uploads");
const BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const blobPath = (file: string) => `uploads/${file}`;

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
  const name = `${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  if (BLOB) {
    await put(blobPath(name), buf, { access: "private", contentType: file.type, addRandomSuffix: false });
  } else {
    fs.mkdirSync(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, name), buf);
  }
  return { file: name, contentType: file.type };
}

export async function deleteUpload(file: string | null | undefined) {
  if (!file) return;
  try {
    if (BLOB) await del(blobPath(file));
    else fs.rmSync(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, file));
  } catch {}
}

/** The stored image's bytes, or null if it's gone. */
export async function readUpload(file: string): Promise<Uint8Array | null> {
  try {
    if (BLOB) {
      const res = await get(blobPath(file), { access: "private" });
      if (!res || res.statusCode !== 200) return null;
      return new Uint8Array(await new Response(res.stream).arrayBuffer());
    }
    return new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, file)));
  } catch {
    return null;
  }
}
