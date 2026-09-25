import "server-only";
import { format, subDays, parseISO, differenceInCalendarDays } from "date-fns";
import { listTransactions, type TxRow } from "./transactions";
import { convertMinor, ensureRates } from "./fx";
import { budgetStatus } from "./engagement";

const ownShare = (t: TxRow) => t.amount - t.splits.reduce((s, x) => s + x.amount, 0);

export type Statement = {
  from: string;
  to: string;
  currency: string;
  income: { category: string; icon: string | null; amount: number }[];
  expense: { category: string; icon: string | null; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  net: number;
  transactions: (TxRow & { amountHome: number | null })[];
  unconverted: number;
};

/** Income/expense statement for any date range, converted to home currency. */
export async function statement(userId: string, home: string, from: string, to: string): Promise<Statement> {
  const txs = await listTransactions(userId, { from, to, limit: 100_000 });
  await ensureRates(txs.map((t) => t.account.currency), home);
  const inc = new Map<string, { icon: string | null; amount: number }>();
  const exp = new Map<string, { icon: string | null; amount: number }>();
  let unconverted = 0;
  const rows = txs.map((t) => {
    const amountHome = convertMinor(t.type === "expense" ? ownShare(t) : t.amount, t.account.currency, home, t.date);
    if (amountHome === null) unconverted++;
    else if (t.type !== "transfer") {
      const m = t.type === "income" ? inc : exp;
      const key = t.category?.name ?? "Uncategorized";
      const cur = m.get(key) ?? { icon: t.category?.icon ?? null, amount: 0 };
      cur.amount += amountHome;
      m.set(key, cur);
    }
    return { ...t, amountHome };
  });
  const list = (m: typeof inc) =>
    [...m].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.amount - a.amount);
  const totalIncome = [...inc.values()].reduce((s, v) => s + v.amount, 0);
  const totalExpense = [...exp.values()].reduce((s, v) => s + v.amount, 0);
  return {
    from,
    to,
    currency: home,
    income: list(inc),
    expense: list(exp),
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    transactions: rows,
    unconverted,
  };
}

export type DailySummary = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  count: number;
  transfers: number;
  topCategory: { name: string; icon: string | null; amount: number } | null;
  avgDailySpend30: number;
  vsAverage: number | null; // outflow / average - 1
  transactions: Statement["transactions"];
  budgetsLeft: { name: string; icon: string | null; left: number; perDay: number }[];
  headline: string;
};

/** A short readout of how money moved on one day. */
export async function dailySummary(userId: string, home: string, date: string): Promise<DailySummary> {
  const day = await statement(userId, home, date, date);
  const prevFrom = format(subDays(parseISO(date), 30), "yyyy-MM-dd");
  const prevTo = format(subDays(parseISO(date), 1), "yyyy-MM-dd");
  const month = await statement(userId, home, prevFrom, prevTo);
  const avg = Math.round(month.totalExpense / 30);
  const vs = avg > 0 ? day.totalExpense / avg - 1 : null;

  const monthEnd = new Date(parseISO(date).getFullYear(), parseISO(date).getMonth() + 1, 0);
  const daysLeft = Math.max(1, differenceInCalendarDays(monthEnd, parseISO(date)) + 1);
  const budgets = (await budgetStatus(userId, home, parseISO(date)))
    .filter((b) => b.limit > b.spent)
    .slice(0, 4)
    .map((b) => ({ name: b.categoryName, icon: b.icon, left: b.limit - b.spent, perDay: Math.floor((b.limit - b.spent) / daysLeft) }));

  const top = day.expense[0] ?? null;
  const count = day.transactions.length;
  let headline: string;
  if (count === 0) headline = "Nothing logged for this day yet.";
  else if (day.totalExpense === 0 && day.totalIncome > 0) headline = "Money came in and nothing went out. A good day.";
  else if (vs === null) headline = `You spent on ${day.expense.length} categor${day.expense.length === 1 ? "y" : "ies"}.`;
  else if (vs <= -0.25) headline = `Spending was ${Math.round(-vs * 100)}% below your 30-day daily average.`;
  else if (vs >= 0.25) headline = `Spending was ${Math.round(vs * 100)}% above your 30-day daily average${top ? `, mostly on ${top.category}` : ""}.`;
  else headline = "Spending was close to your usual day.";

  return {
    date,
    inflow: day.totalIncome,
    outflow: day.totalExpense,
    net: day.net,
    count,
    transfers: day.transactions.filter((t) => t.type === "transfer").length,
    topCategory: top ? { name: top.category, icon: top.icon, amount: top.amount } : null,
    avgDailySpend30: avg,
    vsAverage: vs,
    transactions: day.transactions,
    budgetsLeft: budgets,
    headline,
  };
}
