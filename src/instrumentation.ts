export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { REMOTE_DB } = await import("./db");
  // On Vercel (Turso) migrations run at build time and /api/cron replaces the
  // in-process scheduler, since functions don't stay running between requests.
  if (REMOTE_DB) return;
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
