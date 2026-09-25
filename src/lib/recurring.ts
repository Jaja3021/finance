import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { db, schema } from "@/db";
import type { BillFrequency } from "@/db/schema";
import { accessibleAccounts } from "./access";
import { normalizeKey } from "./categorize";

export function advanceDue(date: string, freq: BillFrequency): string {
  const d = parseISO(date);
  const next = freq === "weekly" ? addWeeks(d, 1) : freq === "yearly" ? addYears(d, 1) : addMonths(d, 1);
  return format(next, "yyyy-MM-dd");
}

export type RecurringSuggestion = {
  matchKey: string;
  name: string;
  amount: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
  frequency: BillFrequency;
  nextDue: string;
  occurrences: number;
  lastDate: string;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Finds expenses that repeat with a near-identical amount on a regular
 * schedule (weekly or monthly) and aren't tracked as bills yet.
 */
export async function detectRecurring(userId: string): Promise<RecurringSuggestion[]> {
  const accts = await accessibleAccounts(userId);
  if (!accts.length) return [];
  const currencyOf = new Map(accts.map((a) => [a.id, a.currency]));
  const since = format(subDays(new Date(), 200), "yyyy-MM-dd");
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        inArray(schema.transactions.accountId, accts.map((a) => a.id)),
        eq(schema.transactions.type, "expense"),
        gte(schema.transactions.date, since),
      ),
    )
    .orderBy(schema.transactions.date)
    .all();

  const tracked = new Set(
    (await db
      .select({ k: schema.bills.matchKey })
      .from(schema.bills)
      .where(eq(schema.bills.userId, userId))
      .all())
      .map((b) => b.k),
  );
  const dismissed = new Set(
    (await db
      .select({ k: schema.dismissedRecurring.matchKey })
      .from(schema.dismissedRecurring)
      .where(eq(schema.dismissedRecurring.userId, userId))
      .all())
      .map((d) => d.k),
  );

  const groups = new Map<string, typeof rows>();
  for (const t of rows) {
    const k = normalizeKey(t.payee || t.note);
    if (!k) continue;
    const key = `${k}|${currencyOf.get(t.accountId)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2 || tracked.has(key) || dismissed.has(key)) continue;
    const med = median(txs.map((t) => t.amount));
    // Keep entries within 15% of the typical amount (utility bills vary).
    const same = txs.filter((t) => Math.abs(t.amount - med) <= med * 0.15);
    // A merchant you visit often with varying amounts (food, rides) isn't a
    // subscription: most of its payments must match, and two matches only
    // count when the amounts are identical.
    if (same.length < 2 || same.length / txs.length < 0.6) continue;
    if (same.length === 2 && same[0].amount !== same[1].amount) continue;
    const gaps = same.slice(1).map((t, i) => differenceInCalendarDays(parseISO(t.date), parseISO(same[i].date)));
    const g = median(gaps);
    let frequency: BillFrequency | null = null;
    if (g >= 26 && g <= 35 && gaps.every((x) => x >= 20 && x <= 40)) frequency = "monthly";
    else if (g >= 6 && g <= 8 && same.length >= 3 && gaps.every((x) => x >= 5 && x <= 9)) frequency = "weekly";
    if (!frequency) continue;
    const last = same[same.length - 1];
    // Ignore patterns that have clearly stopped.
    if (differenceInCalendarDays(new Date(), parseISO(last.date)) > (frequency === "weekly" ? 16 : 45)) continue;
    let nextDue = advanceDue(last.date, frequency);
    while (nextDue < format(new Date(), "yyyy-MM-dd")) nextDue = advanceDue(nextDue, frequency);
    out.push({
      matchKey: key,
      name: last.payee || last.note || "Recurring payment",
      amount: med,
      currency: currencyOf.get(last.accountId)!,
      accountId: last.accountId,
      categoryId: last.categoryId,
      frequency,
      nextDue,
      occurrences: same.length,
      lastDate: last.date,
    });
  }
  return out;
}

/** When a new expense looks like a tracked bill's payment, roll the bill forward. */
export async function matchBillPayment(userId: string, tx: { payee: string | null; note: string | null; date: string; amount: number; accountId: string; currency: string }) {
  const k = normalizeKey(tx.payee || tx.note);
  if (!k) return null;
  const bill = await db
    .select()
    .from(schema.bills)
    .where(and(eq(schema.bills.userId, userId), eq(schema.bills.matchKey, `${k}|${tx.currency}`), eq(schema.bills.active, true)))
    .get();
  if (!bill) return null;
  const window = differenceInCalendarDays(parseISO(bill.nextDue), parseISO(tx.date));
  if (window > 10 || window < -20) return null;
  await db.update(schema.bills)
    .set({ nextDue: advanceDue(bill.nextDue, bill.frequency) })
    .where(eq(schema.bills.id, bill.id))
    .run();
  return bill.id;
}

export async function dueSoon(userId: string, withinDays = 14) {
  const limit = format(addDays(new Date(), withinDays), "yyyy-MM-dd");
  return (await db
    .select()
    .from(schema.bills)
    .where(and(eq(schema.bills.userId, userId), eq(schema.bills.active, true)))
    .orderBy(schema.bills.nextDue)
    .all())
    .filter((b) => b.nextDue <= limit);
}
