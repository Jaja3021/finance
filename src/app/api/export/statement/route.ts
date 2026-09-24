import { type NextRequest } from "next/server";
import { format, startOfMonth } from "date-fns";
import { requireUser } from "@/lib/auth";
import { statement } from "@/lib/reports";
import { toMajor } from "@/lib/money";

const csvCell = (v: unknown) => {
  if (typeof v === "number") return String(v);
  const s = v === null || v === undefined ? "" : String(v);
  // Quote text; neutralize spreadsheet formula injection in user-entered text.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** CSV income/expense statement for any date range. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const p = req.nextUrl.searchParams;
  const valid = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = valid(p.get("from")) ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const to = valid(p.get("to")) ?? format(new Date(), "yyyy-MM-dd");
  const home = user.homeCurrency;
  const st = await statement(user.id, home, from, to);

  const lines: unknown[][] = [
    ["Income & expense statement", `${from} to ${to}`, `Amounts in ${home}`],
    [],
    ["Summary"],
    ["Total income", toMajor(st.totalIncome, home)],
    ["Total expenses", toMajor(st.totalExpense, home)],
    ["Net", toMajor(st.net, home)],
    [],
    ["Income by category"],
    ...st.income.map((r) => [r.category, toMajor(r.amount, home)]),
    [],
    ["Expenses by category"],
    ...st.expense.map((r) => [r.category, toMajor(r.amount, home)]),
    [],
    ["Date", "Type", "Description", "Category", "Account", "Amount (account currency)", "Account currency", `Amount (${home})`, "Split with", "Note"],
    ...st.transactions.map((t) => [
      t.date,
      t.type,
      t.type === "transfer" ? `Transfer to ${t.toAccount?.name ?? ""}` : t.payee ?? "",
      t.category?.name ?? "",
      t.account.name,
      toMajor(t.amount, t.account.currency),
      t.account.currency,
      t.amountHome === null ? "" : toMajor(t.amountHome, home),
      t.splits.map((s) => `${s.person} ${toMajor(s.amount, t.account.currency)}`).join("; "),
      t.note ?? "",
    ]),
  ];
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${from}-to-${to}.csv"`,
    },
  });
}
