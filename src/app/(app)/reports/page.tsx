import Link from "next/link";
import { format, parseISO, startOfMonth, subDays, subMonths, endOfMonth, startOfYear, differenceInCalendarDays, eachMonthOfInterval, eachWeekOfInterval, endOfWeek } from "date-fns";
import { WarningIcon } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { dailySummary, statement } from "@/lib/reports";
import { accountsWithBalances, DEBT_TYPES } from "@/lib/finance";
import { formatMoney, toMajor } from "@/lib/money";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { CategoryBars, IncomeExpenseChart } from "@/components/charts";
import { PayoffCalculator } from "@/components/payoff-calculator";
import { PrintButton } from "@/components/print-button";
import { CategoryIcon } from "@/components/category-icon";

const TABS = [
  { key: "daily", label: "Daily summary" },
  { key: "statement", label: "Statement" },
  { key: "payoff", label: "Debt payoff" },
];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export default async function ReportsPage(props: PageProps<"/reports">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "daily";

  return (
    <div>
      <PageHeader title="Reports" />
      <nav className="no-print mb-5 flex gap-1 overflow-x-auto" aria-label="Report type">
        {TABS.map((t) => (
          <Link key={t.key} href={`/reports?tab=${t.key}`} className={`chip px-3 py-1.5 text-sm ${tab === t.key ? "bg-accent text-accent-ink" : ""}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "daily" && <Daily userId={user.id} home={user.homeCurrency} date={typeof sp.date === "string" ? sp.date : ymd(new Date())} />}
      {tab === "statement" && <Statement userId={user.id} home={user.homeCurrency} name={user.name} sp={sp} />}
      {tab === "payoff" && <Payoff userId={user.id} home={user.homeCurrency} />}
    </div>
  );
}

async function Daily({ userId, home, date }: { userId: string; home: string; date: string }) {
  const s = await dailySummary(userId, home, date);
  const prev = ymd(subDays(parseISO(date), 1));
  const next = ymd(subDays(parseISO(date), -1));
  const isToday = date >= ymd(new Date());
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link className="btn-ghost px-3 py-1" href={`/reports?tab=daily&date=${prev}`} aria-label="Previous day">‹</Link>
            <form className="flex items-center gap-2">
              <input type="hidden" name="tab" value="daily" />
              <input className="input py-1" type="date" name="date" defaultValue={date} aria-label="Date" />
              <button className="btn-ghost px-3 py-1">Go</button>
            </form>
            {!isToday && <Link className="btn-ghost px-3 py-1" href={`/reports?tab=daily&date=${next}`} aria-label="Next day">›</Link>}
          </div>
          <span className="text-sm text-muted">{format(parseISO(date), "EEEE, MMMM d, yyyy")}</span>
        </div>
        <p className="text-lg">{s.headline}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Money in" value={s.inflow} currency={home} />
          <Stat label="Money out" value={s.outflow} currency={home} />
          <Stat label="Net" value={s.net} currency={home} />
          <Stat label="30-day daily average spend" value={s.avgDailySpend30} currency={home} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {s.count} transaction{s.count === 1 ? "" : "s"}
          {s.transfers > 0 && `, ${s.transfers} transfer${s.transfers === 1 ? "" : "s"} between accounts`}
          {s.topCategory && `. Biggest category: ${s.topCategory.name} (${formatMoney(s.topCategory.amount, home)})`}.
        </p>
      </section>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="card">
          <h2 className="card-title mb-2">What moved</h2>
          {s.transactions.length === 0 ? (
            <p className="text-sm text-muted">Nothing logged.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.transactions.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-2">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <CategoryIcon name={t.type === "transfer" ? "__transfer" : t.category?.name} icon={t.category?.icon} size={16} className="shrink-0 text-ink-2" />
                    <span className="truncate">{t.type === "transfer" ? `${t.account.name} → ${t.toAccount?.name}` : t.payee || t.note || t.category?.name || "—"}</span>
                  </span>
                  <span className={`tabular ${t.type === "income" ? "text-good" : ""}`}>
                    {t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}
                    {formatMoney(t.amount, t.account.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="card-title mb-2">Budget room for the rest of the month</h2>
          {s.budgetsLeft.length === 0 ? (
            <p className="text-sm text-muted">No budgets with room left, or none set.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.budgetsLeft.map((b) => (
                <li key={b.name} className="flex justify-between gap-2 py-2">
                  <span className="inline-flex items-center gap-2">
                    <CategoryIcon name={b.name} icon={b.icon} size={16} className="text-ink-2" />
                    {b.name}
                  </span>
                  <span className="tabular">
                    {formatMoney(b.left, home)} <span className="text-muted">· {formatMoney(b.perDay, home)}/day</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

async function Statement({ userId, home, name, sp }: { userId: string; home: string; name: string; sp: Record<string, string | string[] | undefined> }) {
  const now = new Date();
  const presets = [
    { label: "This month", from: startOfMonth(now), to: now },
    { label: "Last month", from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) },
    { label: "Last 90 days", from: subDays(now, 89), to: now },
    { label: "Year to date", from: startOfYear(now), to: now },
  ];
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : ymd(startOfMonth(now));
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : ymd(now);
  const st = await statement(userId, home, from, to);

  // Bucket by week for short ranges, by month otherwise.
  const span = differenceInCalendarDays(parseISO(to), parseISO(from));
  const byMonth = span > 62;
  const buckets = (byMonth
    ? eachMonthOfInterval({ start: parseISO(from), end: parseISO(to) }).map((d) => ({ key: format(d, "yyyy-MM"), label: format(d, "MMM yy"), end: "" }))
    : eachWeekOfInterval({ start: parseISO(from), end: parseISO(to) }, { weekStartsOn: 1 }).map((d) => ({ key: ymd(d), label: format(d, "MMM d"), end: ymd(endOfWeek(d, { weekStartsOn: 1 })) }))
  ).map((b) => ({ ...b, income: 0, expense: 0 }));
  for (const t of st.transactions) {
    if (t.type === "transfer" || t.amountHome === null) continue;
    const b = byMonth ? buckets.find((x) => t.date.startsWith(x.key)) : buckets.findLast((x) => t.date >= x.key);
    if (b) b[t.type] += toMajor(t.amountHome, home);
  }
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <section className="card no-print">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="statement" />
          <div>
            <label className="label" htmlFor="st-from">From</label>
            <input className="input" id="st-from" type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label className="label" htmlFor="st-to">To</label>
            <input className="input" id="st-to" type="date" name="to" defaultValue={to} />
          </div>
          <button className="btn-primary">Show</button>
          <div className="ml-auto flex flex-wrap gap-2">
            <a className="btn-ghost" href={`/api/export/statement?${qs}&format=csv`}>Export CSV</a>
            <PrintButton />
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-1">
          {presets.map((p) => (
            <Link key={p.label} className="chip hover:bg-line" href={`/reports?tab=statement&from=${ymd(p.from)}&to=${ymd(p.to)}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Income & expense statement</h2>
          <p className="text-sm text-muted">
            {name} · {format(parseISO(from), "MMM d, yyyy")} – {format(parseISO(to), "MMM d, yyyy")} · amounts in {home}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Income" value={st.totalIncome} currency={home} />
          <Stat label="Expenses" value={st.totalExpense} currency={home} />
          <Stat label="Net" value={st.net} currency={home} hint={st.totalIncome > 0 ? `Saved ${Math.round((st.net / st.totalIncome) * 100)}% of income` : undefined} />
        </div>
        {st.unconverted > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-warn"><WarningIcon size={13} weight="bold" aria-hidden /> {st.unconverted} transaction(s) left out: no exchange rate for their currency.</p>}
      </section>

      {st.transactions.length === 0 ? (
        <Empty title="No transactions in this range" />
      ) : (
        <>
          <section className="card">
            <h2 className="card-title mb-2">By {byMonth ? "month" : "week"}</h2>
            <IncomeExpenseChart data={buckets.map((b) => ({ label: b.label, income: Math.round(b.income), expense: Math.round(b.expense) }))} currency={home} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <section className="card">
              <h2 className="card-title mb-3">Expenses by category</h2>
              {st.expense.length ? <CategoryBars rows={st.expense} currency={home} /> : <p className="text-sm text-muted">None</p>}
            </section>
            <section className="card">
              <h2 className="card-title mb-3">Income by category</h2>
              {st.income.length ? <CategoryBars rows={st.income} currency={home} /> : <p className="text-sm text-muted">None</p>}
            </section>
          </div>
          <section className="card">
            <h2 className="card-title mb-2">All transactions ({st.transactions.length})</h2>
            {/* Phones: stacked rows. The table is used on wider screens and when printing. */}
            <ul className="divide-y divide-line text-sm sm:hidden print:hidden">
              {st.transactions.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{t.type === "transfer" ? `Transfer → ${t.toAccount?.name}` : t.payee || t.note || "—"}</div>
                    <div className="text-xs text-muted">
                      {t.date} · {t.type === "transfer" ? t.account.name : `${t.category?.name ?? "Uncategorized"} · ${t.account.name}`}
                    </div>
                  </div>
                  <div className={`tabular shrink-0 text-right ${t.type === "income" ? "text-good" : ""}`}>
                    {t.amountHome === null ? "—" : `${t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}${formatMoney(t.amountHome, home)}`}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block print:block">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Date</th>
                  <th className="font-medium">Description</th>
                  <th className="font-medium">Category</th>
                  <th className="font-medium">Account</th>
                  <th className="text-right font-medium">Amount ({home})</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {st.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1.5">{t.date}</td>
                    <td className="max-w-56 truncate">{t.type === "transfer" ? `Transfer → ${t.toAccount?.name}` : t.payee || t.note || "—"}</td>
                    <td>{t.type === "transfer" ? "—" : t.category?.name ?? "Uncategorized"}</td>
                    <td>{t.account.name}</td>
                    <td className={`text-right ${t.type === "income" ? "text-good" : ""}`}>
                      {t.amountHome === null ? "—" : `${t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}${formatMoney(t.amountHome, home)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

async function Payoff({ userId, home }: { userId: string; home: string }) {
  const accts = await accountsWithBalances(userId, home);
  const debts = accts
    .filter((a) => DEBT_TYPES.has(a.type) && a.balance < 0)
    .map((a) => ({ id: a.id, name: a.name, owed: toMajor(-(a.balanceHome ?? a.balance), home), apr: a.interestRate }));
  return (
    <section className="card">
      <h2 className="card-title mb-1">How long until it&apos;s paid off?</h2>
      <p className="mb-4 text-sm text-muted">Interest is charged monthly on the remaining balance. Assumes no new charges.</p>
      <PayoffCalculator debts={debts} currency={home} />
    </section>
  );
}
