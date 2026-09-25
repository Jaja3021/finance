import Link from "next/link";
import { inArray } from "drizzle-orm";
import { format, parseISO } from "date-fns";
import { LightbulbIcon, TrendUpIcon, TrendDownIcon } from "@phosphor-icons/react/ssr";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { householdIdsFor } from "@/lib/access";
import { accountsWithBalances, netWorthHistory, DEBT_TYPES, type AccountWithBalance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { Empty } from "@/components/ui";
import { AccountAdder } from "@/components/account-adder";
import { AccountCard } from "@/components/account-card";
import { LogoMark } from "@/components/logo";

const GROUPS = [
  { key: "ewallet", label: "Cash & e-wallets", chip: "E-wallets", types: ["cash", "ewallet", "other"], debt: false },
  { key: "bank", label: "Bank accounts", chip: "Bank accounts", types: ["bank"], debt: false },
  { key: "credit_card", label: "Credit cards", chip: "Credit cards", types: ["credit_card"], debt: true },
  { key: "loan", label: "Loans", chip: "Loans", types: ["loan"], debt: true },
] as const;

const VIEWS = [
  { key: "all", label: "All" },
  { key: "assets", label: "Assets" },
  { key: "liabilities", label: "Liabilities" },
] as const;

type View = (typeof VIEWS)[number]["key"];

const sumHome = (xs: AccountWithBalance[]) => xs.reduce((s, a) => s + (a.balanceHome ?? 0), 0);

function insightFor(accts: AccountWithBalance[], home: string): string | null {
  const debts = accts.filter((a) => DEBT_TYPES.has(a.type) && a.balance < 0);
  const priciest = debts.filter((a) => (a.interestRate ?? 0) > 0).sort((a, b) => b.interestRate! - a.interestRate!)[0];
  if (priciest) {
    return `${priciest.name} charges ${priciest.interestRate}% a year on ${formatMoney(-priciest.balance, priciest.currency)}. Paying it down first saves you the most.`;
  }
  const maxedCard = debts
    .filter((a) => a.creditLimit)
    .map((a) => ({ a, util: -a.balance / a.creditLimit! }))
    .sort((x, y) => y.util - x.util)[0];
  if (maxedCard && maxedCard.util > 0.3) {
    return `${maxedCard.a.name} is at ${Math.round(maxedCard.util * 100)}% of its limit. Keeping cards under 30% is easier on your credit.`;
  }
  const assets = accts.filter((a) => !DEBT_TYPES.has(a.type) && (a.balanceHome ?? 0) > 0);
  const total = sumHome(assets);
  const biggest = [...assets].sort((a, b) => (b.balanceHome ?? 0) - (a.balanceHome ?? 0))[0];
  if (biggest && total > 0 && assets.length > 1) {
    const pct = Math.round(((biggest.balanceHome ?? 0) / total) * 100);
    return `${pct}% of your money (${formatMoney(biggest.balanceHome ?? 0, home)}) sits in ${biggest.name}.`;
  }
  return null;
}

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const welcome = sp.welcome;
  const view: View = sp.view === "assets" || sp.view === "liabilities" ? sp.view : "all";
  const typeFilter = typeof sp.type === "string" && GROUPS.some((g) => g.key === sp.type) ? sp.type : "all";
  const home = user.homeCurrency;

  const [accts, history] = await Promise.all([accountsWithBalances(user.id, home), netWorthHistory(user.id, home, 14)]);
  const hhIds = await householdIdsFor(user.id);
  const households = (hhIds.length ? await db.select().from(schema.households).where(inArray(schema.households.id, hhIds)).all() : []).map((h) => ({ id: h.id, name: h.name }));
  const owners = new Map((await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).all()).map((u) => [u.id, u.name]));

  const assetAccts = accts.filter((a) => !DEBT_TYPES.has(a.type));
  const debtAccts = accts.filter((a) => DEBT_TYPES.has(a.type));
  const assets = sumHome(assetAccts);
  const liabilities = sumHome(debtAccts);
  const headline = view === "assets" ? assets : view === "liabilities" ? -liabilities : assets + liabilities;
  const headlineLabel = view === "assets" ? "Total assets" : view === "liabilities" ? "Total owed" : "Net worth";

  const first = history[0]?.value ?? 0;
  const last = history.at(-1)?.value ?? 0;
  const change = last - first;
  const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : null;
  const lo = Math.min(...history.map((h) => h.value));
  const hi = Math.max(...history.map((h) => h.value));

  const insight = insightFor(accts, home);
  const groups = GROUPS.filter((g) => (view === "assets" ? !g.debt : view === "liabilities" ? g.debt : true))
    .map((g) => ({ ...g, items: accts.filter((a) => (g.types as readonly string[]).includes(a.type)) }))
    .filter((g) => g.items.length > 0);
  const shown = typeFilter === "all" ? groups : groups.filter((g) => g.key === typeFilter);

  const href = (next: { view?: View; type?: string }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    const t = next.type ?? typeFilter;
    if (v !== "all") q.set("view", v);
    if (t !== "all") q.set("type", t);
    const s = q.toString();
    return s ? `/accounts?${s}` : "/accounts";
  };

  return (
    <div>
      {welcome && (
        <div className="card mb-5 border-accent">
          <p className="font-medium">Welcome! Start by adding the accounts you use.</p>
          <p className="text-sm text-muted">Tap your bank or e-wallet, type the balance, done. You can add more any time.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
        <div className="space-y-5">
          <section
            className="relative overflow-hidden rounded-3xl p-5 text-white shadow-md sm:p-6"
            style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, white) 0%, var(--accent) 50%, color-mix(in srgb, var(--accent) 65%, black) 100%)" }}
          >
            <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
            <span className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-white/5" aria-hidden />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-white/80">Manage your wallets and balances</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{headlineLabel}</span>
                  {view === "all" && changePct !== null && history.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
                      {change >= 0 ? <TrendUpIcon size={12} weight="bold" /> : <TrendDownIcon size={12} weight="bold" />}
                      {changePct >= 0 ? "+" : ""}
                      {changePct.toFixed(1)}% · 14 days
                    </span>
                  )}
                </div>
                <div className="tabular mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatMoney(headline, home)}</div>
                <p className="mt-1 text-xs text-white/75">
                  Assets {formatMoney(assets, home)} · Owed {formatMoney(Math.abs(liabilities), home)} · investments are on their own page
                </p>
              </div>
              <LogoMark size={64} className="shadow-lg ring-4 ring-white/20 max-sm:hidden" />
            </div>
            <nav className="relative mt-5 flex gap-1.5" aria-label="Show">
              {VIEWS.map((v) => (
                <Link
                  key={v.key}
                  href={href({ view: v.key, type: "all" })}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${view === v.key ? "bg-white text-link shadow-sm" : "bg-white/15 text-white hover:bg-white/25"}`}
                  aria-current={view === v.key ? "page" : undefined}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
          </section>

          {accts.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_17rem]">
              <section className="card flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-link">
                  <LightbulbIcon size={18} weight="fill" aria-hidden />
                </span>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Insight</div>
                  <p className="mt-1 text-sm">{insight ?? "Add a few more accounts to get tips on where your money sits."}</p>
                </div>
              </section>
              <section className="card">
                <div className="flex items-baseline justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Daily balance</div>
                  <div className={`tabular text-xs font-medium ${change >= 0 ? "text-good" : "text-bad"}`}>
                    {change >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(change), home)}
                  </div>
                </div>
                <div className="mt-3 flex h-16 items-end gap-1" role="img" aria-label={`Net balance over the last ${history.length} days`}>
                  {history.map((h, i) => (
                    <div
                      key={h.date}
                      title={`${format(parseISO(h.date), "MMM d")}: ${formatMoney(h.value, home)}`}
                      className={`flex-1 rounded-t ${i === history.length - 1 ? "bg-accent" : "bg-accent/30"}`}
                      style={{ height: `${hi === lo ? 60 : 15 + ((h.value - lo) / (hi - lo)) * 85}%` }}
                    />
                  ))}
                </div>
                {history.length > 1 && (
                  <div className="mt-1 flex justify-between text-[10px] text-muted">
                    <span>{format(parseISO(history[0].date), "MMM d")}</span>
                    <span>Today</span>
                  </div>
                )}
              </section>
            </div>
          )}

          {groups.length > 1 && (
            <nav className="flex flex-wrap gap-1.5" aria-label="Account type">
              {[{ key: "all", chip: "All" }, ...groups].map((g) => (
                <Link
                  key={g.key}
                  href={href({ type: g.key })}
                  className={`chip px-3 py-1.5 text-sm ${typeFilter === g.key ? "bg-accent text-accent-ink" : ""}`}
                  aria-current={typeFilter === g.key ? "page" : undefined}
                >
                  {g.chip}
                </Link>
              ))}
            </nav>
          )}

          {accts.length === 0 && (
            <div className="card">
              <Empty title="No accounts yet">Pick one from the list to get started.</Empty>
            </div>
          )}

          {shown.map((g) => {
            const total = sumHome(g.items);
            return (
              <section key={g.key}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-semibold">
                    {g.label} <span className="text-sm font-normal text-muted">· {g.items.length}</span>
                  </h2>
                  <span className={`tabular text-sm font-medium ${g.debt ? "text-bad" : "text-ink-2"}`}>
                    {g.debt ? `−${formatMoney(Math.abs(total), home)}` : formatMoney(total, home)}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {g.items.map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      debt={g.debt}
                      homeCurrency={home}
                      editable={a.ownerId === user.id}
                      sharedBy={a.ownerId !== user.id ? (owners.get(a.ownerId)?.split(" ")[0] ?? null) : null}
                      households={households}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="card h-fit xl:sticky xl:top-6">
          <h2 className="card-title mb-3">Add an account</h2>
          <AccountAdder homeCurrency={home} />
        </section>
      </div>
    </div>
  );
}
