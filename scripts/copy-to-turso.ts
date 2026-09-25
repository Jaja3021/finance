// Copies everything from the local database file into Turso (or any libSQL
// database named by TURSO_DATABASE_URL). The target must already have the
// schema (every Vercel build migrates it) and must not have any users yet,
// so nothing there gets overwritten.
//
//   vercel env pull .env.production.local --environment=production
//   npx tsx --env-file=.env.production.local scripts/copy-to-turso.ts
//   (then delete .env.production.local)
import path from "node:path";
import { createClient, type InStatement } from "@libsql/client";

const SKIP = new Set(["__drizzle_migrations"]);

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set. Run `vercel env pull .env.production.local --environment=production` first.");
  const localPath = path.relative(process.cwd(), path.resolve(process.env.DATABASE_PATH ?? "./data/finance.db")).replace(/\\/g, "/");
  const source = createClient({ url: `file:${localPath}` });
  const target = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const hasSchema = await target.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  if (!hasSchema.rows.length) throw new Error("The target database has no tables yet. Deploy once on Vercel so the build creates them, then retry.");
  const users = Number((await target.execute("SELECT COUNT(*) n FROM users")).rows[0].n);
  if (users > 0) throw new Error(`The target already has ${users} user(s). This script only copies into an empty database, so nothing is overwritten.`);

  const tables = (await source.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows
    .map((r) => String(r.name))
    .filter((t) => !SKIP.has(t));

  const statements: InStatement[] = [];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { rows, columns } = await source.execute(`SELECT * FROM "${table}"`);
    counts[table] = rows.length;
    if (!rows.length) continue;
    const cols = columns.map((c) => `"${c}"`).join(", ");
    const marks = columns.map(() => "?").join(", ");
    for (const row of rows) statements.push({ sql: `INSERT INTO "${table}" (${cols}) VALUES (${marks})`, args: columns.map((c) => row[c]) });
  }

  // migrate() runs everything in one transaction with foreign keys off, so
  // table order doesn't matter and a failure leaves the target untouched.
  await target.migrate(statements);

  for (const [t, n] of Object.entries(counts)) if (n) console.log(`  ${t.padEnd(24)} ${n}`);
  console.log(`\nCopied ${statements.length} rows. Sign in on the live site with your usual email and password.`);
  console.log("Photos you attached (receipts, debt proofs) stay on this PC; they aren't copied.");
  source.close();
  target.close();
}

main().catch((err) => {
  console.error(`\n[copy-to-turso] ${(err as Error).message}`);
  process.exit(1);
});
