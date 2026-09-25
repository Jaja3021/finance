import { eq } from "drizzle-orm";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { ArrowsClockwiseIcon, ProhibitIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { accessibleAccounts } from "@/lib/access";
import { detectRecurring } from "@/lib/recurring";
import { formatMoney, toMajor } from "@/lib/money";
import { acceptRecurring, deleteBill, dismissRecurring, payBill } from "@/app/actions/data";
import { PageHeader, Empty } from "@/components/ui";
import { BillForm } from "@/components/simple-forms";

export default async function BillsPage(props: PageProps<"/bills">) {
  const user = await requireUser();
  const { edit } = await props.searchParams;
  const bills = await db.select().from(schema.bills).where(eq(schema.bills.userId, user.id)).orderBy(schema.bills.nextDue).all();
  const accounts = await accessibleAccounts(user.id);
  const categories = await db.select().from(schema.categories).where(eq(schema.categories.userId, user.id)).orderBy(schema.categories.name).all();
  const suggestions = await detectRecurring(user.id);
  const editing = bills.find((b) => b.id === edit);
  const today = new Date();

  return (
    <div>
      <PageHeader title="Bills & subscriptions" description="You get a reminder a few days before each one is due. Paying one logs it and moves the due date forward." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
        <div className="space-y-5">
          {suggestions.length > 0 && (
            <section className="card">
              <h2 className="card-title mb-1">Looks recurring</h2>
              <p className="mb-3 text-xs text-muted">Found from payments with the same amount on a regular schedule.</p>
              <ul className="divide-y divide-line">
                {suggestions.map((s) => (
                  <li key={s.matchKey} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <ArrowsClockwiseIcon size={15} weight="bold" className="text-link" aria-hidden /> {s.name}
                      </div>
                      <div className="text-xs text-muted">
                        {formatMoney(s.amount, s.currency)} · {s.frequency} · seen {s.occurrences}× · next around {format(parseISO(s.nextDue), "MMM d")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={acceptRecurring}>
                        <input type="hidden" name="matchKey" value={s.matchKey} />
                        <button className="btn-primary px-3 py-1 text-xs">Track</button>
                      </form>
                      <form action={dismissRecurring}>
                        <input type="hidden" name="matchKey" value={s.matchKey} />
                        <button className="btn-ghost px-3 py-1 text-xs">Dismiss</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            {bills.length === 0 ? (
              <Empty title="No bills tracked yet">Add rent, utilities and subscriptions so you never miss a due date.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {bills.map((b) => {
                  const days = differenceInCalendarDays(parseISO(b.nextDue), today);
                  const acct = accounts.find((a) => a.id === b.accountId);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-muted">
                          {b.frequency} · {acct?.name ?? "no account"} · remind {b.remindDaysBefore}d before
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="tabular font-medium">{formatMoney(b.amount, b.currency)}</div>
                        <div className={`inline-flex items-center gap-1 text-xs ${days < 0 ? "text-bad" : days <= b.remindDaysBefore ? "text-warn" : "text-muted"}`}>
                          {days < 0 ? (
                            <ProhibitIcon size={12} weight="bold" aria-hidden />
                          ) : (
                            days <= b.remindDaysBefore && <WarningIcon size={12} weight="bold" aria-hidden />
                          )}
                          {days < 0 ? `${-days}d overdue` : days === 0 ? "Due today" : `Due ${format(parseISO(b.nextDue), "MMM d")}`}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <form action={payBill}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="btn-ghost px-3 py-1 text-xs">Mark paid</button>
                        </form>
                        <a className="btn-ghost px-3 py-1 text-xs" href={`/bills?edit=${b.id}`}>Edit</a>
                        <form action={deleteBill}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="px-1 text-xs text-muted hover:text-bad">Delete</button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <section className="card h-fit">
          <h2 className="card-title mb-3">{editing ? `Edit ${editing.name}` : "Add a bill"}</h2>
          <BillForm
            accounts={accounts}
            categories={categories}
            initial={
              editing
                ? { ...editing, amount: String(toMajor(editing.amount, editing.currency)) }
                : undefined
            }
          />
        </section>
      </div>
    </div>
  );
}
