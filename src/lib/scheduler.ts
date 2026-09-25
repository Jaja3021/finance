import { db, schema } from "@/db";
import { generateNotifications } from "./engagement";
import { generateDebtReminders } from "./debts";
import { lastSnapshotDate, snapshotDatabase } from "./backup";
import { today } from "./fx";

// In-process jobs: bill reminders, budget alerts and the daily backup.
// They also run lazily on page loads, so nothing is missed if the server
// was asleep when a tick was due.

const TICK_MS = 30 * 60 * 1000;

/** Daily backup (local database only) plus reminders for every user. Also called by /api/cron on Vercel. */
export async function runScheduledJobs() {
  try {
    if (lastSnapshotDate() !== today()) {
      const file = await snapshotDatabase("daily");
      if (file) console.log(`[backup] wrote ${file}`);
    }
  } catch (err) {
    console.error("[backup] failed:", err);
  }
  for (const u of await db.select({ id: schema.users.id, homeCurrency: schema.users.homeCurrency }).from(schema.users).all()) {
    try {
      await generateNotifications(u.id);
      await generateDebtReminders(u.id, u.homeCurrency);
    } catch (err) {
      console.error(`[notify] ${u.id}:`, err);
    }
  }
}

export function startScheduler() {
  const g = globalThis as unknown as { __financeScheduler?: NodeJS.Timeout };
  if (g.__financeScheduler) return;
  g.__financeScheduler = setInterval(runScheduledJobs, TICK_MS);
  setTimeout(runScheduledJobs, 5_000);
}
