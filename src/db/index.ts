import "server-only";
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Turso when TURSO_DATABASE_URL is set (Vercel), otherwise a local SQLite file.
// libSQL enforces foreign keys by default, which the ON DELETE CASCADEs rely on.
export const REMOTE_DB = !!process.env.TURSO_DATABASE_URL;

export const DB_PATH = path.resolve(
  /*turbopackIgnore: true*/
  process.env.DATABASE_PATH ?? "./data/finance.db",
);

function open() {
  if (REMOTE_DB) {
    return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(DB_PATH), { recursive: true });
  return createClient({ url: `file:${path.relative(process.cwd(), DB_PATH).replace(/\\/g, "/")}` });
}

// Reuse one client across hot reloads in dev.
const g = globalThis as unknown as { __financeClient?: ReturnType<typeof open> };
export const client = (g.__financeClient ??= open());
export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };

/** Raw SQL for the few queries that read better as SQL than as Drizzle. */
export async function query<T>(sql: string, args: (string | number | null)[] = []): Promise<T[]> {
  return (await client.execute({ sql, args })).rows as unknown as T[];
}
