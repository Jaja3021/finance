import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a key and returns it in plain text. It can't be shown again. */
export async function createApiToken(userId: string, name: string) {
  const token = `ft_${randomBytes(24).toString("base64url")}`;
  await db.insert(schema.apiTokens)
    .values({ userId, name: name.trim().slice(0, 60) || "Phone", tokenHash: hash(token), prefix: token.slice(0, 7) })
    .run();
  return token;
}

export async function listApiTokens(userId: string) {
  return await db
    .select({ id: schema.apiTokens.id, name: schema.apiTokens.name, prefix: schema.apiTokens.prefix, lastUsedAt: schema.apiTokens.lastUsedAt, createdAt: schema.apiTokens.createdAt })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .orderBy(desc(schema.apiTokens.createdAt))
    .all();
}

export async function revokeApiToken(userId: string, id: string) {
  await db.delete(schema.apiTokens).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId))).run();
}

/** Resolves `Authorization: Bearer ft_…` to its user, or null. */
export async function userFromApiRequest(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(ft_[\w-]+)$/i)?.[1];
  if (!token) return null;
  const row = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hash(token))).get();
  if (!row) return null;
  await db.update(schema.apiTokens).set({ lastUsedAt: Date.now() }).where(eq(schema.apiTokens.id, row.id)).run();
  return await db.select().from(schema.users).where(eq(schema.users.id, row.userId)).get() ?? null;
}
