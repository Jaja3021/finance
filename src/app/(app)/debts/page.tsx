import Link from "next/link";
import { format, parseISO, isPast } from "date-fns";
import { PlusIcon as Plus, HandCoinsIcon as HandCoins } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { listDebts, debtTotals, generateDebtReminders, PAYMENT_METHOD_LABELS } from "@/lib/debts";
import { formatMoney } from "@/lib/money";
import { PageHeader, Empty, Money } from "@/components/ui";
import { DebtFormModal } from "@/components/debt-form";
import { DebtStatusBadge } from "@/components/debt-status-badge";

const TABS = [
  { key: "owe", label: "I owe" },
  { key: "owed", label: "Owed to me" },
] as const;

export default async function DebtsPage(props: PageProps<"/debts">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = sp.tab === "owed" ? "owed" : "owe";
  const home = user.homeCurrency;

  await generateDebtReminders(user.id, home);
  const totals = await debtTotals(user.id);
  const debts = await listDebts(user.id, tab);

  return (
    <div>
      <PageHeader
        title="Debts"
        description="Money you owe or that's owed to you — separate from your accounts, with a running balance for each person."
        action={
          <DebtFormModal currency={home}>
            <Plus size={17} /> Add debt
          </DebtFormModal>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:gap-6">
        <div className="card">
          <div className="text-xs font-medium text-muted">You owe</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-bad sm:text-3xl">
            <Money value={totals.owe} currency={home} />
          </div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-muted">Owed to you</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-good sm:text-3xl">
            <Money value={totals.owed} currency={home} />
          </div>
        </div>
      </div>

      <nav className="mb-5 flex gap-1" aria-label="Debt direction">
        {TABS.map((t) => (
          <Link key={t.key} href={`/debts?tab=${t.key}`} className={`chip px-3 py-1.5 text-sm ${tab === t.key ? "bg-accent text-accent-ink" : ""}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      <section className="card">
        {debts.length === 0 ? (
          <Empty title={tab === "owe" ? "You don't owe anyone right now" : "No one owes you right now"}>
            <span className="inline-flex items-center gap-1.5">
              <HandCoins size={15} /> Tap &ldquo;Add debt&rdquo; to track one.
            </span>
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {debts.map((d) => {
              const overdue = d.dueDate && d.status !== "paid" && isPast(parseISO(d.dueDate)) && d.dueDate !== format(new Date(), "yyyy-MM-dd");
              const method = d.paymentMethod === "other" ? d.paymentMethodOther || "Other" : PAYMENT_METHOD_LABELS[d.paymentMethod];
              return (
                <li key={d.id}>
                  <Link href={`/debts/${d.id}`} className="flex items-center gap-3 py-3 hover:bg-surface-2 sm:-mx-2 sm:px-2 sm:rounded-xl">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.person}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        <span>{format(parseISO(d.date), "MMM d, yyyy")}</span>
                        <span className="chip">{method}</span>
                        {d.dueDate && (
                          <span className={overdue ? "font-medium text-bad" : ""}>
                            {overdue ? "Overdue: " : "Due "}
                            {format(parseISO(d.dueDate), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular font-semibold">{formatMoney(d.remaining, home)}</div>
                      {d.paid > 0 && d.status !== "paid" && <div className="tabular text-xs text-muted">of {formatMoney(d.amount, home)}</div>}
                      <DebtStatusBadge status={d.status} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
