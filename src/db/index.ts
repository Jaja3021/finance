import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export const DB_PATH = path.resolve(
  /*turbopackIgnore: true*/
  process.env.DATABASE_PATH ?? "./data/finance.db",
);

function open() {
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  return { sqlite, db };
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __financeDb?: ReturnType<typeof open> };
const conn = (g.__financeDb ??= open());

export const db = conn.db;
export const sqlite = conn.sqlite;
export type DB = typeof db;
export { schema };
