import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { addDays, format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { db, sqlite, schema } from "@/db";
import { accessibleAccounts } from "./access";
import { convertMinor, ensureRates, today } from "./fx";
import { dueSoon } from "./recurring";
import { formatMoney } from "./money";

// ------------------------------------------------------------------ streaks

export const BADGES: Record<string, { label: string; icon: string; description: string }> = {
  first_log: { label: "First log", icon: "🌱", description: "Logged your first transaction" },
  streak_3: { label: "3-day streak", icon: "🔥", description: "Logged 3 days in a row" },
  streak_7: { label: "7-day streak", icon: "⚡", description: "Logged every day for a week" },
  streak_30: { label: "30-day streak", icon: "🏆", description: "Logged every day for 30 days" },
  streak_100: { label: "100-day streak", icon: "💎", description: "100 days without missing one" },
  tx_100: { label: "Centurion", icon: "💯", description: "Logged 100 transactions" },
  first_budget: { label: "Planner", icon: "🎯", description: "Set your first budget" },
  first_investment: { label: "Investor", icon: "📈", description: "Added your first holding" },
  under_budget: { label: "On target", icon: "✅", description: "Finished a month within every budget" },
};

const localDay = (ms: number) => format(new Date(ms), "yyyy-MM-dd");

/**
 * A day counts when the user logged at least one transaction that day
 * (by when it was logged, not the transaction date). Missing a whole day
 * resets the streak; today still counts as "in progress" until midnight.
 */
export function streakFor(userId: string) {
  const rows = sqlite
    .prepare(`SELECT DISTINCT created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5000`)
    .all(userId) as { created_at: number }[];
  const days = new Set(rows.map((r) => localDay(r.created_at)));
  const t = today();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const loggedToday = days.has(t);
  let cursor = loggedToday ? new Date() : subDays(new Date(), 1);
  let current = 0;
  if (loggedToday || days.has(yesterday)) {
    while (days.has(format(cursor, "yyyy-MM-dd"))) {
      current++;
      cursor = subDays(cursor, 1);
    }
  }
  // Longest run ever.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && format(addDays(new Date(prev + "T00:00:00"), 1), "yyyy-MM-dd") === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  // Last 28 days for the calendar strip.
  const recent = Array.from({ length: 28 }, (_, i) => {
    const d = format(subDays(new Date(), 27 - i), "yyyy-MM-dd");
    return { date: d, logged: days.has(d) };
  });
  return { current, longest, loggedToday, recent };
}

function award(userId: string, badge: string): boolean {
  const res = db.insert(schema.badges).values({ userId, badge }).onConflictDoNothing().run();
  if (res.changes > 0) {
    const b = BADGES[badge];
    notify(userId, {
      kind: "badge",
      title: `Badge earned: ${b.label}`,
      body: b.description,
      href: "/achievements",
      dedupeKey: `badge:${badge}`,
    });
    return true;
  }
  return false;
}

/** Checks every badge rule. Cheap enough to run after each write. */
export function checkBadges(userId: string): string[] {
  const earned: string[] = [];
  const { current } = streakFor(userId);
  const txCount = (sqlite.prepare(`SELECT COUNT(*) n FROM transactions WHERE user_id = ?`).get(userId) as { n: number }).n;
  const rules: [string, boolean][] = [
    ["first_log", txCount >= 1],
    ["streak_3", current >= 3],
    ["streak_7", current >= 7],
    ["streak_30", current >= 30],
    ["streak_100", current >= 100],
    ["tx_100", txCount >= 100],
    ["first_budget", !!db.select().from(schema.budgets).where(eq(schema.budgets.userId, userId)).get()],
    ["first_investment", !!db.select().from(schema.holdings).where(eq(schema.holdings.userId, userId)).get()],
  ];
  for (const [b, ok] of rules) if (ok && award(userId, b)) earned.push(b);
  return earned;
}

// ------------------------------------------------------------------ budgets

export type BudgetStatus = {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string | null;
  limit: number;
  spent: number;
  ratio: number;
  alertAt: number;
};

/**
 * Spending per expense category for a date range, in home currency.
 * Split expenses only count the user's own share.
 */
export async function spendingByCategory(userId: string, home: string, from: string, to: string) {
  const accts = accessibleAccounts(userId, true);
  if (!accts.length) return new Map<string | null, number>();
  await ensureRates(accts.map((a) => a.currency), home);
  const cur = new Map(accts.map((a) => [a.id, a.currency]));
  const ph = accts.map(() => "?").join(",");
  const rows = sqlite
    .prepare(
      `SELECT t.account_id, t.category_id, t.date,
              t.amount - COALESCE((SELECT SUM(s.amount) FROM splits s WHERE s.transaction_id = t.id), 0) AS own
       FROM transactions t
       WHERE t.type = 'expense' AND t.date BETWEEN ? AND ? AND t.account_id IN (${ph})`,
    )
    .all(from, to, ...accts.map((a) => a.id)) as { account_id: string; category_id: string | null; date: string; own: number }[];
  const out = new Map<string | null, number>();
  for (const r of rows) {
    const v = convertMinor(Math.max(r.own, 0), cur.get(r.account_id)!, home, r.date) ?? 0;
    out.set(r.category_id, (out.get(r.category_id) ?? 0) + v);
  }
  return out;
}

export async function budgetStatus(userId: string, home: string, month = new Date()): Promise<BudgetStatus[]> {
  const from = format(startOfMonth(month), "yyyy-MM-dd");
  const to = format(endOfMonth(month), "yyyy-MM-dd");
  const spent = await spendingByCategory(userId, home, from, to);
  return db
    .select({
      id: schema.budgets.id,
      categoryId: schema.budgets.categoryId,
      limit: schema.budgets.monthlyLimit,
      alertAt: schema.budgets.alertAt,
      categoryName: schema.categories.name,
      icon: schema.categories.icon,
    })
    .from(schema.budgets)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.budgets.categoryId))
    .where(eq(schema.budgets.userId, userId))
    .all()
    .map((b) => {
      const s = spent.get(b.categoryId) ?? 0;
      return { ...b, spent: s, ratio: b.limit > 0 ? s / b.limit : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

// ------------------------------------------------------------ notifications

export function notify(
  userId: string,
  n: { kind: string; title: string; body: string; href?: string; dedupeKey: string },
) {
  db.insert(schema.notifications).values({ userId, ...n }).onConflictDoNothing().run();
}

/** Creates bill reminders and budget alerts that are due. Safe to call often. */
export async function generateNotifications(userId: string) {
  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return;
  const t = today();

  for (const bill of dueSoon(userId, 31)) {
    const daysLeft = Math.round((new Date(bill.nextDue).getTime() - new Date(t).getTime()) / 86_400_000);
    if (daysLeft > bill.remindDaysBefore) continue;
    const when = daysLeft < 0 ? `was due ${-daysLeft} day(s) ago` : daysLeft === 0 ? "is due today" : `is due in ${daysLeft} day(s)`;
    notify(userId, {
      kind: "bill",
      title: `${bill.name} ${when}`,
      body: `${formatMoney(bill.amount, bill.currency)} on ${format(new Date(bill.nextDue + "T00:00:00"), "MMM d")}`,
      href: "/bills",
      dedupeKey: `bill:${bill.id}:${bill.nextDue}`,
    });
  }

  const month = format(new Date(), "yyyy-MM");
  for (const b of await budgetStatus(userId, user.homeCurrency)) {
    if (b.ratio >= 1) {
      notify(userId, {
        kind: "budget",
        title: `Over budget: ${b.categoryName}`,
        body: `${formatMoney(b.spent, user.homeCurrency)} spent of ${formatMoney(b.limit, user.homeCurrency)} this month.`,
        href: "/budgets",
        dedupeKey: `budget:${b.id}:${month}:over`,
      });
    } else if (b.ratio >= b.alertAt) {
      notify(userId, {
        kind: "budget",
        title: `${b.categoryName} is at ${Math.round(b.ratio * 100)}% of budget`,
        body: `${formatMoney(b.limit - b.spent, user.homeCurrency)} left for the rest of the month.`,
        href: "/budgets",
        dedupeKey: `budget:${b.id}:${month}:near`,
      });
    }
  }

  // Nudge in the evening if today's log is missing but a streak is alive.
  const s = streakFor(userId);
  if (!s.loggedToday && s.current >= 2 && new Date().getHours() >= 19) {
    notify(userId, {
      kind: "streak",
      title: `Keep your ${s.current}-day streak alive`,
      body: "Log at least one transaction before midnight.",
      href: "/transactions",
      dedupeKey: `streak:${t}`,
    });
  }
}

export function unreadNotifications(userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), sql`${schema.notifications.readAt} IS NULL`))
    .orderBy(sql`${schema.notifications.createdAt} DESC`)
    .all();
}
