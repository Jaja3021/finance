import "server-only";
import path from "node:path";
import fs from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { db, sqlite, schema, DB_PATH } from "@/db";

// Two layers of protection:
//  1. A full SQLite snapshot every day (server side), keeping the last 14.
//     Point BACKUP_DIR at a synced folder (OneDrive, Dropbox, a NAS) to get
//     an off-machine copy.
//  2. A per-user JSON export the user can download and keep anywhere.

export const BACKUP_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR ?? path.join(path.dirname(DB_PATH), "..", "backups"));
const KEEP = Number(process.env.BACKUP_KEEP ?? 14);

export async function snapshotDatabase(reason = "daily") {
  fs.mkdirSync(/*turbopackIgnore: true*/ BACKUP_DIR, { recursive: true });
  const file = path.join(/*turbopackIgnore: true*/ BACKUP_DIR, `finance-${format(new Date(), "yyyyMMdd-HHmmss")}-${reason}.db`);
  // better-sqlite3's online backup is safe while the app is writing.
  await sqlite.backup(file);
  const all = fs
    .readdirSync(/*turbopackIgnore: true*/ BACKUP_DIR)
    .filter((f) => f.startsWith("finance-") && f.endsWith(".db"))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) fs.rmSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, old));
  return file;
}

export function listSnapshots() {
  if (!fs.existsSync(/*turbopackIgnore: true*/ BACKUP_DIR)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ BACKUP_DIR)
    .filter((f) => f.startsWith("finance-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map((f) => ({ file: f, size: fs.statSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, f)).size, mtime: fs.statSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, f)).mtimeMs }));
}

export function lastSnapshotDate(): string | null {
  const s = listSnapshots()[0];
  return s ? format(new Date(s.mtime), "yyyy-MM-dd") : null;
}

export const EXPORT_VERSION = 1;

/** Everything the user owns, as plain JSON. */
export function exportUserData(userId: string) {
  const { users, accounts, categories, transactions, splits, budgets, bills, holdings, badges } = schema;
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  const accts = db.select().from(accounts).where(eq(accounts.ownerId, userId)).all();
  const txs = db.select().from(transactions).where(eq(transactions.userId, userId)).all();
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user: { email: user.email, name: user.name, homeCurrency: user.homeCurrency },
    accounts: accts,
    categories: db.select().from(categories).where(eq(categories.userId, userId)).all(),
    transactions: txs,
    splits: txs.length ? db.select().from(splits).where(inArray(splits.transactionId, txs.map((t) => t.id))).all() : [],
    budgets: db.select().from(budgets).where(eq(budgets.userId, userId)).all(),
    bills: db.select().from(bills).where(eq(bills.userId, userId)).all(),
    holdings: db.select().from(holdings).where(eq(holdings.userId, userId)).all(),
    badges: db.select().from(badges).where(eq(badges.userId, userId)).all(),
  };
}

type Export = ReturnType<typeof exportUserData>;

/**
 * Restores a JSON export into the current user's account, replacing what they
 * own. Takes a server snapshot first so a bad restore can be undone.
 */
export async function importUserData(userId: string, data: Export) {
  if (data?.version !== EXPORT_VERSION) throw new Error("Unrecognized backup file");
  await snapshotDatabase("pre-restore");
  const s = schema;
  db.transaction((trx) => {
    // Delete in dependency order; cascades clean up splits.
    trx.delete(s.transactions).where(eq(s.transactions.userId, userId)).run();
    trx.delete(s.budgets).where(eq(s.budgets.userId, userId)).run();
    trx.delete(s.bills).where(eq(s.bills.userId, userId)).run();
    trx.delete(s.holdings).where(eq(s.holdings.userId, userId)).run();
    trx.delete(s.accounts).where(eq(s.accounts.ownerId, userId)).run();
    trx.delete(s.categories).where(eq(s.categories.userId, userId)).run();

    const own = <T extends object>(rows: T[], key: keyof T) => rows.map((r) => ({ ...r, [key]: userId }));
    if (data.categories.length) trx.insert(s.categories).values(own(data.categories, "userId")).run();
    if (data.accounts.length)
      trx.insert(s.accounts).values(own(data.accounts, "ownerId").map((a) => ({ ...a, householdId: null }))).run();
    for (let i = 0; i < data.transactions.length; i += 500)
      trx.insert(s.transactions).values(own(data.transactions.slice(i, i + 500), "userId")).run();
    if (data.splits.length) trx.insert(s.splits).values(data.splits).run();
    if (data.budgets.length) trx.insert(s.budgets).values(own(data.budgets, "userId")).run();
    if (data.bills.length) trx.insert(s.bills).values(own(data.bills, "userId")).run();
    if (data.holdings.length) trx.insert(s.holdings).values(own(data.holdings, "userId")).run();
  });
}
