import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";

export function runMigrations() {
  return migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
}
