import Link from "next/link";
import { Suspense } from "react";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { accountsWithBalances, netWorthFrom, portfolio, DEBT_TYPES } from "@/lib/finance";
import { AccountCard } from "@/components/account-card";
import { budgetStatus, generateNotifications, streakFor } from "@/lib/engagement";
import { dueSoon, detectRecurring } from "@/lib/recurring";
import { dailySummary } from "@/lib/reports";
import { listTransactions } from "@/lib/transactions";
import { currentTips, aiEnabled } from "@/lib/ai";
import { generateDebtReminders, listDebts } from "@/lib/debts";
import { DebtStatusBadge } from "@/components/debt-status-badge";
import { acceptRecurring, dismissRecurring, payBill, rateTip, refreshCoach } from "@/app/actions/data";
import { CardHeader, CardSkeleton, Empty, Meter, Money, Stat, StatusLabel } from "@/components/ui";
import {
  WalletIcon as Wallet,
  FireIcon,
  WarningIcon,
  SparkleIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react/ssr";
import { QuickLog } from "@/components/quick-log";
import { TxList } from "@/components/tx-list";
import { formatMoney } from "@/lib/money";
import { CategoryIcon } from "@/components/category-icon";

export default async function Dashboard() {
  const user = await requireUser();
  await generateNotifications(user.id);
  const home = user.homeCurrency;
  await generateDebtReminders(user.id, home);
  const streak = await streakFor(user.id);
  const recent = await listTransactions(user.id, { limit: 6 });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight">Hi, {user.name.split(" ")[0]}</h1>
        </div>
        <Link
          href="/achievements"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
          style={{ boxShadow: "var(--shadow)" }}
          title="Daily logging streak"
        >
          <FireIcon size={17} weight="fill" className="text-warn" aria-hidden />
          {streak.current}-day streak
          {!streak.loggedToday && streak.current > 0 && <span className="font-normal text-warn">· log today</span>}
        </Link>
      </div>

      <QuickLog />

      <Suspense fallback={<CardSkeleton title="Net worth" note="Fetching live prices…" />}>
        <NetWorthCard userId={user.id} home={home} />
      </Suspense>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-6">
          <Suspense fallback={<CardSkeleton title="Today" />}>
            <TodayCard userId={user.id} home={home} />
          </Suspense>
          <DebtsCard userId={user.id} home={home} />
        </div>
        <Suspense fallback={<CardSkeleton title="Coach" note="Looking over your spending for today’s tips…" />}>
          <CoachCard userId={user.id} home={home} />
        </Suspense>
        <BudgetsCard userId={user.id} home={home} />
        <BillsCard userId={user.id} />
      </div>

      <section className="card">
        <CardHeader title="Recent transactions" href="/transactions" linkLabel="See all" />
        {recent.length ? (
          <TxList rows={recent} compact />
        ) : (
          <Empty title="No transactions yet">Type one above, e.g. “lunch 250 gcash”.</Empty>
        )}
      </section>
    </div>
  );
}

async function NetWorthCard({ userId, home }: { userId: string; home: string }) {
  const [accts, pf] = await Promise.all([accountsWithBalances(userId, home), portfolio(userId, home)]);
  const nw = netWorthFrom(accts, pf.total);
  if (!accts.length && !pf.holdings.length) {
    return (
      <section className="card flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-link" aria-hidden>
          <Wallet size={24} />
        </span>
        <div className="flex-1">
          <h2 className="card-title">Add your first account</h2>
          <p className="mt-1 text-sm text-ink-2">Pick your bank or e-wallet (GCash, Maya, BDO…) and type the balance. It takes a few taps.</p>
        </div>
        <Link href="/accounts" className="btn-primary">
          Add an account
        </Link>
      </section>
    );
  }
  const order = ["cash", "ewallet", "other", "bank", "credit_card", "loan"];
  const cards = [...accts].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return (
    <div className="space-y-4">
      <section className="card">
        <CardHeader title="Net worth" href="/accounts" linkLabel="Accounts" />
        <div className="text-4xl font-semibold tracking-tight">
          <Money value={nw.total} currency={home} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="Cash & e-wallets" value={nw.cash} currency={home} />
          <Stat label="Bank accounts" value={nw.bank} currency={home} />
          <Stat
            label="Investments"
            value={nw.investments}
            currency={home}
            delta={pf.holdings.length ? { value: pf.change30, label: "30 days" } : null}
          />
          <Stat label="Debts" value={nw.debts} currency={home} />
        </div>
        {nw.unconverted.length > 0 && (
          <p className="mt-3 flex items-center gap-1 text-xs text-warn">
            <WarningIcon size={13} weight="bold" aria-hidden /> Not included (no exchange rate yet): {nw.unconverted.join(", ")}
          </p>
        )}
      </section>
      {/* Cards grow to fill the row when there are few, and scroll sideways when there are many. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-label="Your accounts">
        {cards.map((a) => (
          <Link key={a.id} href="/accounts" className="min-w-56 flex-1 basis-56 snap-start rounded-2xl transition hover:-translate-y-0.5 hover:brightness-105">
            <AccountCard account={a} debt={DEBT_TYPES.has(a.type)} homeCurrency={home} editable={false} sharedBy={null} households={[]} />
          </Link>
        ))}
      </div>
    </div>
  );
}

async function TodayCard({ userId, home }: { userId: string; home: string }) {
  const s = await dailySummary(userId, home, format(new Date(), "yyyy-MM-dd"));
  return (
    <section className="card">
      <CardHeader title="Today" href="/reports" linkLabel="Daily summary" />
      <p className="text-sm text-ink-2">{s.headline}</p>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="In" value={s.inflow} currency={home} />
        <Stat label="Out" value={s.outflow} currency={home} />
        <Stat label="Net" value={s.net} currency={home} />
      </div>
      {s.budgetsLeft.length > 0 && (
        <p className="mt-5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
          Safe to spend per day: {s.budgetsLeft.slice(0, 3).map((b) => `${b.name} ${formatMoney(b.perDay, home)}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

async function DebtsCard({ userId, home }: { userId: string; home: string }) {
  const debts = await listDebts(userId);
  const open = debts.filter((d) => d.status !== "paid");
  const owe = open.filter((d) => d.direction === "owe").reduce((s, d) => s + d.remaining, 0);
  const owed = open.filter((d) => d.direction === "owed").reduce((s, d) => s + d.remaining, 0);
  // Soonest due first; debts without a due date go last.
  const next = [...open].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).slice(0, 3);
  return (
    <section className="card">
      <CardHeader title="Debts" href="/debts" linkLabel="All debts" />
      <div className="grid grid-cols-3 gap-4">
        <Stat label="You owe" value={-owe} currency={home} />
        <Stat label="Owed to you" value={owed} currency={home} />
        <Stat label="Net" value={owed - owe} currency={home} />
      </div>
      {next.length === 0 ? (
        <p className="mt-5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">No open debts. Track money you lend or borrow on the Debts page.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {next.map((d) => (
            <li key={d.id}>
              <Link href={`/debts/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-link">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.person}</span>
                  <span className="text-xs text-muted">
                    {d.direction === "owe" ? "You owe" : "Owes you"}
                    {d.dueDate && ` · due ${format(new Date(d.dueDate + "T00:00:00"), "MMM d")}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`tabular block font-semibold ${d.direction === "owe" ? "text-bad" : "text-good"}`}>{formatMoney(d.remaining, home)}</span>
                  <DebtStatusBadge status={d.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function CoachCard({ userId, home }: { userId: string; home: string }) {
  // The dashboard shows the top two; the rest are one Refresh away.
  const tips = (await currentTips(userId, home)).slice(0, 2);
  return (
    <section className="card">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Coach {aiEnabled() && <SparkleIcon size={16} weight="fill" className="text-link" aria-hidden />}
          </span>
        }
        action={
          <form action={refreshCoach}>
            <button className="text-sm font-medium text-link hover:underline">Refresh</button>
          </form>
        }
      />
      {tips.length === 0 && <p className="text-sm text-muted">Log a few transactions and tips will show up here.</p>}
      <ul className="space-y-3">
        {tips.map((t) => (
          <li key={t.id} className="rounded-2xl bg-surface-2 p-4">
            <div className="text-sm font-semibold text-ink">{t.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.body}</p>
            <form action={rateTip} className="mt-3 flex gap-2 text-xs">
              <input type="hidden" name="id" value={t.id} />
              {t.feedback ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  Thanks, noted{" "}
                  {t.feedback === "helpful" ? <ThumbsUpIcon size={13} weight="fill" aria-hidden /> : <ThumbsDownIcon size={13} weight="fill" aria-hidden />}
                </span>
              ) : (
                <>
                  <button name="feedback" value="helpful" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-2 hover:text-ink">
                    <ThumbsUpIcon size={13} weight="bold" aria-hidden /> Helpful
                  </button>
                  <button name="feedback" value="not_helpful" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-2 hover:text-ink">
                    <ThumbsDownIcon size={13} weight="bold" aria-hidden /> Not helpful
                  </button>
                </>
              )}
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function BudgetsCard({ userId, home }: { userId: string; home: string }) {
  const budgets = (await budgetStatus(userId, home)).slice(0, 5);
  return (
    <section className="card">
      <CardHeader title="Budgets this month" href="/budgets" linkLabel="Manage" />
      {budgets.length === 0 ? (
        <Empty title="No budgets yet" href="/budgets" cta="Set a budget" />
      ) : (
        <ul className="space-y-5">
          {budgets.map((b) => (
            <li key={b.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <CategoryIcon name={b.categoryName} icon={b.icon} size={16} tile />
                  <span className="truncate">{b.categoryName}</span>
                </span>
                <StatusLabel ratio={b.ratio} alertAt={b.alertAt} />
              </div>
              <Meter ratio={b.ratio} alertAt={b.alertAt} />
              <div className="mt-1 text-right text-xs text-ink-2 tabular">
                {formatMoney(b.spent, home)} of {formatMoney(b.limit, home)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function BillsCard({ userId }: { userId: string }) {
  const bills = (await dueSoon(userId, 14)).slice(0, 5);
  const suggestions = (await detectRecurring(userId)).slice(0, 2);
  const today = format(new Date(), "yyyy-MM-dd");
  return (
    <section className="card">
      <CardHeader title="Bills due in the next 2 weeks" href="/bills" linkLabel="All bills" />
      {bills.length === 0 && <Empty title="Nothing due soon">Bills and subscriptions you track show up here two weeks ahead.</Empty>}
      <ul className="divide-y divide-line">
        {bills.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{b.name}</div>
              <div className={`text-xs ${b.nextDue < today ? "text-bad" : "text-muted"}`}>
                {b.nextDue < today ? "Overdue · " : ""}
                {format(new Date(b.nextDue + "T00:00:00"), "EEE, MMM d")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Money value={b.amount} currency={b.currency} />
              <form action={payBill}>
                <input type="hidden" name="id" value={b.id} />
                <button className="btn-ghost px-2 py-1 text-xs">Mark paid</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {suggestions.map((s) => (
        <div key={s.matchKey} className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
          <div className="flex gap-2">
            <ArrowsClockwiseIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-link" aria-hidden />
            <span>
              <b className="text-ink">{s.name}</b> looks {s.frequency}: {formatMoney(s.amount, s.currency)}, {s.occurrences} times so far. Track it as a bill?
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <form action={acceptRecurring}>
              <input type="hidden" name="matchKey" value={s.matchKey} />
              <button className="btn-primary px-3 py-1 text-xs">Track it</button>
            </form>
            <form action={dismissRecurring}>
              <input type="hidden" name="matchKey" value={s.matchKey} />
              <button className="btn-ghost px-3 py-1 text-xs">Not recurring</button>
            </form>
          </div>
        </div>
      ))}
    </section>
  );
}
