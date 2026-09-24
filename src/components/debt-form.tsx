"use client";

import { useActionState, useRef, useState } from "react";
import { format } from "date-fns";
import { XIcon as X } from "@phosphor-icons/react/ssr";
import { addDebt, editDebt } from "@/app/actions/debts";
import type { FormState } from "@/app/actions/auth";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import type { PaymentMethod } from "@/db/schema";
import { FormMessage } from "./auth-shell";

type Initial = {
  id: string;
  person: string;
  direction: "owe" | "owed";
  amount: string; // major units, as a string for the input
  date: string;
  time: string | null;
  dueDate: string | null;
  paymentMethod: PaymentMethod;
  paymentMethodOther: string | null;
  note: string | null;
};

/**
 * The add/edit debt form, always shown as a single modal so the whole
 * thing — direction, person, amount, dates, payment method, note, proof —
 * fits on one screen. `children` is the trigger button's content; the
 * button itself lives in here (not passed in as a function), since a
 * Server Component can't hand a closure to a Client Component.
 */
export function DebtFormModal({
  currency,
  initial,
  children,
  buttonClassName = "btn-primary",
}: {
  currency: string;
  initial?: Initial;
  children: React.ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"owe" | "owed">(initial?.direction ?? "owe");
  const [method, setMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "cash");
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!initial;

  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = isEdit ? await editDebt(prev, fd) : await addDebt(prev, fd);
    if (res?.ok) {
      formRef.current?.reset();
      setDirection("owe");
      setMethod("cash");
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
          <div
            className="card max-h-[90vh] w-full max-w-md overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={isEdit ? "Edit debt" : "Add a debt"}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="card-title">{isEdit ? "Edit debt" : "Add a debt"}</h2>
              <button type="button" className="icon-btn h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form ref={formRef} action={action} className="space-y-3">
              {isEdit && <input type="hidden" name="id" value={initial.id} />}

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Direction">
                {(
                  [
                    ["owe", "I owe them"],
                    ["owed", "They owe me"],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className={`cursor-pointer rounded-lg py-1.5 text-center text-sm ${direction === v ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}>
                    <input type="radio" name="direction" value={v} checked={direction === v} onChange={() => setDirection(v)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="label" htmlFor="d-person">{direction === "owe" ? "Who you owe" : "Who owes you"}</label>
                <input className="input" id="d-person" name="person" defaultValue={initial?.person} placeholder="Jane Doe" required />
              </div>

              <div>
                <label className="label" htmlFor="d-amount">Amount ({currency})</label>
                <input className="input tabular text-lg" id="d-amount" name="amount" inputMode="decimal" defaultValue={initial?.amount} placeholder="500 or 2k" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="d-date">Date</label>
                  <input className="input" id="d-date" name="date" type="date" defaultValue={initial?.date ?? format(new Date(), "yyyy-MM-dd")} required />
                </div>
                <div>
                  <label className="label" htmlFor="d-time">Time (optional)</label>
                  <input className="input" id="d-time" name="time" type="time" defaultValue={initial?.time ?? ""} />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="d-due">Due date (optional)</label>
                <input className="input" id="d-due" name="dueDate" type="date" defaultValue={initial?.dueDate ?? ""} />
                <p className="mt-1 text-xs text-muted">You&apos;ll get a reminder a few days before this.</p>
              </div>

              <div>
                <label className="label" htmlFor="d-method">Payment method</label>
                <select className="input" id="d-method" name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {method === "other" && (
                <div>
                  <label className="label" htmlFor="d-method-other">Method name</label>
                  <input className="input" id="d-method-other" name="paymentMethodOther" defaultValue={initial?.paymentMethodOther ?? ""} placeholder="PayMaya, check, PayPal…" />
                </div>
              )}

              <div>
                <label className="label" htmlFor="d-note">Note (optional)</label>
                <input className="input" id="d-note" name="note" defaultValue={initial?.note ?? ""} placeholder="Borrowed for groceries" />
              </div>

              {!isEdit && (
                <div>
                  <label className="label" htmlFor="d-proof">Proof of payment (optional)</label>
                  <input className="input py-1.5" id="d-proof" name="proof" type="file" accept="image/*" capture="environment" />
                  <p className="mt-1 text-xs text-muted">A screenshot of a transfer, or a photo, if you already have one.</p>
                </div>
              )}

              <FormMessage state={state} />
              <button className="btn-primary w-full" disabled={pending}>
                {pending ? "Saving…" : isEdit ? "Save changes" : "Add debt"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
