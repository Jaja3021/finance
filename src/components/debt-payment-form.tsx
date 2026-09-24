"use client";

import { useActionState, useRef, useState } from "react";
import { format } from "date-fns";
import { XIcon as X } from "@phosphor-icons/react/ssr";
import { addDebtPayment } from "@/app/actions/debts";
import type { FormState } from "@/app/actions/auth";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import type { PaymentMethod } from "@/db/schema";
import { formatMoney, toMajor } from "@/lib/money";
import { FormMessage } from "./auth-shell";

/**
 * Logs a (possibly partial) payment against a debt. `children` is the
 * trigger button's content — see the note on DebtFormModal for why the
 * button lives inside this Client Component instead of being passed in.
 */
export function PaymentFormModal({
  debtId,
  currency,
  remaining,
  defaultMethod,
  children,
  buttonClassName = "btn-primary",
}: {
  debtId: string;
  currency: string;
  remaining: number; // minor units
  defaultMethod: PaymentMethod;
  children: React.ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addDebtPayment(prev, fd);
    if (res?.ok) {
      formRef.current?.reset();
      setMethod(defaultMethod);
      setOpen(false);
    }
    return res;
  }, undefined);

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Log a payment">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="card-title">Log a payment</h2>
              <button type="button" className="icon-btn h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form ref={formRef} action={action} className="space-y-3">
              <input type="hidden" name="debtId" value={debtId} />
              <div>
                <label className="label" htmlFor="p-amount">Amount ({currency})</label>
                <input
                  className="input tabular text-lg"
                  id="p-amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={String(toMajor(remaining, currency))}
                  required
                />
                <p className="mt-1 text-xs text-muted">{formatMoney(remaining, currency)} remaining. Change the amount for a partial payment.</p>
              </div>
              <div>
                <label className="label" htmlFor="p-date">Date</label>
                <input className="input" id="p-date" name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required />
              </div>
              <div>
                <label className="label" htmlFor="p-method">Payment method</label>
                <select className="input" id="p-method" name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {method === "other" && (
                <div>
                  <label className="label" htmlFor="p-method-other">Method name</label>
                  <input className="input" id="p-method-other" name="paymentMethodOther" placeholder="PayMaya, check, PayPal…" />
                </div>
              )}
              <div>
                <label className="label" htmlFor="p-note">Note (optional)</label>
                <input className="input" id="p-note" name="note" placeholder="Optional" />
              </div>
              <div>
                <label className="label" htmlFor="p-proof">Proof of payment (optional)</label>
                <input className="input py-1.5" id="p-proof" name="proof" type="file" accept="image/*" capture="environment" />
              </div>
              <FormMessage state={state} />
              <button className="btn-primary w-full" disabled={pending}>
                {pending ? "Saving…" : "Log payment"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
