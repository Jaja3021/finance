import "server-only";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { db, client, schema } from "@/db";
import { accessibleAccounts } from "./access";
import { convertMinor, ensureRates, rateOn, today } from "./fx";
import { priceOn, priceSeries, refreshPrices } from "./market";
import { toMinor } from "./money";

export type Account = typeof schema.accounts.$inferSelect;
export const DEBT_TYPES = new Set(["credit_card", "loan"]);

/** Current balance per account id, in each account's own currency (minor units). */
export async function accountBalances(accountIds: string[], asOf?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!accountIds.length) return out;
  const ph = accountIds.map(() => "?").join(",");
  const dateCond = asOf ? "AND date <= ?" : "";
  const dateArg = asOf ? [asOf] : [];
  const { rows } = await client.execute({
    sql: `SELECT a.id, a.opening_balance +
         COALESCE((SELECT SUM(CASE type WHEN 'income' THEN amount ELSE -amount END)
                   FROM transactions WHERE account_id = a.id ${dateCond}), 0) +
         COALESCE((SELECT SUM(to_amount) FROM transactions
                   WHERE type = 'transfer' AND to_account_id = a.id ${dateCond}), 0) AS balance
       FROM accounts a WHERE a.id IN (${ph})`,
    args: [...dateArg, ...dateArg, ...accountIds],
  });
  for (const r of rows) out.set(String(r.id), Number(r.balance));
  return out;
}

export type AccountWithBalance = Account & { balance: number; balanceHome: number | null };

export async function accountsWithBalances(userId: string, home: string) {
  const accts = await accessibleAccounts(userId);
  const [bal] = await Promise.all([accountBalances(accts.map((a) => a.id)), ensureRates(accts.map((a) => a.currency), home)]);
  return accts.map<AccountWithBalance>((a) => {
    const balance = bal.get(a.id) ?? 0;
    return { ...a, balance, balanceHome: convertMinor(balance, a.currency, home) };
  });
}

// ---------------------------------------------------------------- portfolio

export type HoldingView = typeof schema.holdings.$inferSelect & {
  currency: string | null;
  price: number | null;
  priceDate: string | null;
  valueHome: number | null; // minor units of home currency
  value30Home: number | null;
  priceEffectHome: number | null;
  fxEffectHome: number | null;
};

export type Portfolio = {
  holdings: HoldingView[];
  total: number;
  total30: number;
  change30: number;
  priceEffect: number;
  fxEffect: number;
  byKind: { stock: number; crypto: number };
  series: { date: string; value: number }[];
  missing: string[];
};

export async function portfolio(userId: string, home: string): Promise<Portfolio> {
  const rows = await db.select().from(schema.holdings).where(eq(schema.holdings.userId, userId)).all();
  await refreshPrices(rows.map((h) => ({ kind: h.kind, symbol: h.symbol })));

  const now = today();
  const then = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const seriesFrom = format(subDays(new Date(), 40), "yyyy-MM-dd");
  const [quotes, quotes30, seriesByHolding] = await Promise.all([
    Promise.all(rows.map((h) => priceOn(h.kind, h.symbol, now))),
    Promise.all(rows.map((h) => priceOn(h.kind, h.symbol, then))),
    Promise.all(rows.map((h) => priceSeries(h.kind, h.symbol, seriesFrom))),
  ]);
  const currencies = new Set<string>();
  for (const q of [...quotes, ...seriesByHolding.flat()]) if (q) currencies.add(q.currency);
  await ensureRates([...currencies], home);

  const toHome = (major: number, ccy: string, date: string) => {
    const r = rateOn(ccy, home, date);
    return r === null ? null : toMinor(major * r, home);
  };

  const missing: string[] = [];
  const holdings: HoldingView[] = rows.map((h, i) => {
    const q = quotes[i];
    if (!q) {
      missing.push(h.name);
      return { ...h, currency: null, price: null, priceDate: null, valueHome: null, value30Home: null, priceEffectHome: null, fxEffectHome: null };
    }
    const p30 = quotes30[i] ?? q;
    const fxNow = rateOn(q.currency, home, now);
    const fx30 = rateOn(q.currency, home, then) ?? fxNow;
    const valueHome = toHome(h.quantity * q.close, q.currency, now);
    const value30Home = fx30 === null ? null : toMinor(h.quantity * p30.close * fx30, home);
    // Split the 30-day move into "the asset moved" vs "the exchange rate moved".
    const priceEffectHome =
      fx30 === null ? null : toMinor(h.quantity * (q.close - p30.close) * fx30, home);
    const fxEffectHome =
      fxNow === null || fx30 === null ? null : toMinor(h.quantity * q.close * (fxNow - fx30), home);
    if (valueHome === null) missing.push(`${h.name} (no ${q.currency}→${home} rate)`);
    return { ...h, currency: q.currency, price: q.close, priceDate: q.date, valueHome, value30Home, priceEffectHome, fxEffectHome };
  });

  const sum = (f: (h: HoldingView) => number | null) =>
    holdings.reduce((s, h) => s + (f(h) ?? 0), 0);

  // Daily value over the last 30 days using current quantities.
  const days = eachDayOfInterval({ start: subDays(new Date(), 30), end: new Date() }).map((d) =>
    format(d, "yyyy-MM-dd"),
  );
  const series = days.map((date) => {
    let value = 0;
    rows.forEach((h, i) => {
      const s = seriesByHolding[i];
      let last: (typeof s)[number] | undefined;
      for (const p of s) if (p.date <= date) last = p;
      if (!last) return;
      const r = rateOn(last.currency, home, date);
      if (r !== null) value += toMinor(h.quantity * last.close * r, home);
    });
    return { date, value };
  });

  const total = sum((h) => h.valueHome);
  const total30 = sum((h) => h.value30Home);
  return {
    holdings,
    total,
    total30,
    change30: total - total30,
    priceEffect: sum((h) => h.priceEffectHome),
    fxEffect: sum((h) => h.fxEffectHome),
    byKind: {
      stock: sum((h) => (h.kind === "stock" ? h.valueHome : 0)),
      crypto: sum((h) => (h.kind === "crypto" ? h.valueHome : 0)),
    },
    series,
    missing,
  };
}

// ---------------------------------------------------------------- net worth

/** Total net worth (all accounts, converted to home currency) for each of the last `days` days. */
export async function netWorthHistory(userId: string, home: string, days = 14): Promise<{ date: string; value: number }[]> {
  const accts = await accessibleAccounts(userId);
  if (!accts.length) return [];
  const ids = accts.map((a) => a.id);
  const dates = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() }).map((d) => format(d, "yyyy-MM-dd"));
  // Today's balances, then walk back through the window's transactions: two queries, not one per day.
  const t = schema.transactions;
  const [current, recent] = await Promise.all([
    accountBalances(ids),
    db
      .select({ accountId: t.accountId, toAccountId: t.toAccountId, type: t.type, amount: t.amount, toAmount: t.toAmount, date: t.date })
      .from(t)
      .where(and(gt(t.date, dates[0]), or(inArray(t.accountId, ids), inArray(t.toAccountId, ids))))
      .all(),
    ensureRates([...new Set(accts.map((a) => a.currency))], home),
  ]);
  return dates.map((date) => {
    const bal = new Map(current);
    for (const r of recent) {
      if (r.date <= date) continue;
      bal.set(r.accountId, (bal.get(r.accountId) ?? 0) - (r.type === "income" ? r.amount : -r.amount));
      if (r.type === "transfer" && r.toAccountId) bal.set(r.toAccountId, (bal.get(r.toAccountId) ?? 0) - (r.toAmount ?? 0));
    }
    let value = 0;
    for (const a of accts) {
      const converted = convertMinor(bal.get(a.id) ?? 0, a.currency, home, date);
      if (converted !== null) value += converted;
    }
    return { date, value };
  });
}

export type NetWorth = {
  cash: number; // cash + e-wallets + "other" assets
  bank: number;
  investments: number;
  debts: number; // negative number
  total: number;
  unconverted: string[];
};

export function netWorthFrom(accts: AccountWithBalance[], investments: number): NetWorth {
  const nw: NetWorth = { cash: 0, bank: 0, investments, debts: 0, total: 0, unconverted: [] };
  for (const a of accts) {
    if (a.balanceHome === null) {
      nw.unconverted.push(a.name);
      continue;
    }
    if (DEBT_TYPES.has(a.type) || a.balanceHome < 0) nw.debts += Math.min(a.balanceHome, 0);
    if (DEBT_TYPES.has(a.type)) {
      if (a.balanceHome > 0) nw.cash += a.balanceHome; // overpaid card
    } else if (a.balanceHome > 0) {
      if (a.type === "bank") nw.bank += a.balanceHome;
      else nw.cash += a.balanceHome;
    }
  }
  nw.total = nw.cash + nw.bank + nw.investments + nw.debts;
  return nw;
}
