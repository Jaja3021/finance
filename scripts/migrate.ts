// Applies database migrations. Runs in the Vercel build (see "vercel-build"),
// against Turso when TURSO_DATABASE_URL is set, otherwise the local file.
import { runMigrations } from "../src/db/migrate";

runMigrations()
  .then(() => {
    console.log("[migrate] database is up to date");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
