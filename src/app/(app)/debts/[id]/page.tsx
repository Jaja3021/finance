import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon as ArrowLeft, ImageBrokenIcon as ImageOff } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { getDebt, PAYMENT_METHOD_LABELS } from "@/lib/debts";
import { formatMoney, toMajor } from "@/lib/money";
import { removeDebtAndRedirect, removeDebtPayment } from "@/app/actions/debts";
import { Money } from "@/components/ui";
import { DebtFormModal } from "@/components/debt-form";
import { PaymentFormModal } from "@/components/debt-payment-form";
import { DebtStatusBadge } from "@/components/debt-status-badge";
import { ConfirmSubmit } from "@/components/confirm-submit";

function methodLabel(method: string, other: string | null) {
  return method === "other" ? other || "Other" : PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS];
}

export default async function DebtDetailPage(props: PageProps<"/debts/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const debt = await getDebt(user.id, id);
  if (!debt) notFound();
  const home = user.homeCurrency;

  return (
    <div className="max-w-2xl">
      <Link href="/debts" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Debts
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{debt.direction === "owe" ? "You owe" : "Owes you"}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{debt.person}</h1>
          </div>
          <DebtStatusBadge status={debt.status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted">Remaining</div>
            <div className={`text-xl font-semibold tabular ${debt.direction === "owe" ? "text-bad" : "text-good"}`}>
              <Money value={debt.remaining} currency={home} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Original amount</div>
            <div className="tabular text-xl font-semibold">{formatMoney(debt.amount, home)}</div>
          </div>
          {debt.paid > 0 && (
            <div>
              <div className="text-xs text-muted">Paid so far</div>
              <div className="tabular text-xl font-semibold text-good">{formatMoney(debt.paid, home)}</div>
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Date made</dt>
            <dd>
              {format(parseISO(debt.date), "MMM d, yyyy")}
              {debt.time && ` · ${debt.time}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Due date</dt>
            <dd>{debt.dueDate ? format(parseISO(debt.dueDate), "MMM d, yyyy") : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Payment method</dt>
            <dd>{methodLabel(debt.paymentMethod, debt.paymentMethodOther)}</dd>
          </div>
          {debt.note && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-muted">Note</dt>
              <dd>{debt.note}</dd>
            </div>
          )}
        </dl>

        {debt.proofs.length > 0 && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="mb-2 text-xs text-muted">Proof</div>
            <div className="flex flex-wrap gap-2">
              {debt.proofs.map((p) => (
                <a key={p.id} href={`/api/uploads/${p.file}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/uploads/${p.file}`} alt="Proof of debt" className="h-24 w-24 object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
          {debt.remaining > 0 && (
            <PaymentFormModal debtId={debt.id} currency={home} remaining={debt.remaining} defaultMethod={debt.paymentMethod}>
              Log payment
            </PaymentFormModal>
          )}
          <DebtFormModal
            currency={home}
            buttonClassName="btn-ghost"
            initial={{
              id: debt.id,
              person: debt.person,
              direction: debt.direction,
              amount: String(toMajor(debt.amount, home)),
              date: debt.date,
              time: debt.time,
              dueDate: debt.dueDate,
              paymentMethod: debt.paymentMethod,
              paymentMethodOther: debt.paymentMethodOther,
              note: debt.note,
            }}
          >
            Edit
          </DebtFormModal>
          <form action={removeDebtAndRedirect} className="ml-auto">
            <input type="hidden" name="id" value={debt.id} />
            <ConfirmSubmit confirmMessage={`Delete this debt with ${debt.person}? This also removes its payment history.`} className="btn-ghost text-bad">
              Delete
            </ConfirmSubmit>
          </form>
        </div>
      </section>

      {debt.payments.length > 0 && (
        <section className="card mt-5">
          <h2 className="card-title mb-3">Payment history</h2>
          <ul className="divide-y divide-line">
            {debt.payments.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-3">
                {p.proofFile ? (
                  <a href={`/api/uploads/${p.proofFile}`} target="_blank" rel="noopener noreferrer" className="shrink-0 overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/uploads/${p.proofFile}`} alt="Proof of payment" className="h-12 w-12 object-cover" />
                  </a>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <ImageOff size={18} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="tabular font-medium text-good">{formatMoney(p.amount, home)}</span>
                    <span className="text-xs text-muted">{format(parseISO(p.date), "MMM d, yyyy")}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {methodLabel(p.paymentMethod, p.paymentMethodOther)}
                    {p.note && ` · ${p.note}`}
                  </div>
                </div>
                <form action={removeDebtPayment}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit confirmMessage="Remove this payment? The remaining balance will go back up." className="text-xs text-muted hover:text-bad">
                    Remove
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
