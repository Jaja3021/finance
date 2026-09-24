"use client";

import { useActionState, useState } from "react";
import { PencilSimpleIcon as Pencil } from "@phosphor-icons/react/ssr";
import { archiveAccount, updateAccount } from "@/app/actions/data";
import { toMajor } from "@/lib/money";
import { FormMessage } from "./auth-shell";

type Props = {
  account: { id: string; name: string; currency: string; openingBalance: number; householdId: string | null; interestRate: number | null; debt: boolean };
  households: { id: string; name: string }[];
};

export function AccountEditor({ account, households, buttonClassName = "rounded-lg p-1.5 text-muted hover:bg-surface-2" }: Props & { buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateAccount, undefined);
  const opening = toMajor(Math.abs(account.openingBalance), account.currency);
  return (
    <>
      <button className={buttonClassName} onClick={() => setOpen(true)} aria-label={`Edit ${account.name}`}>
        <Pencil size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Edit ${account.name}`}>
            <form action={action} className="space-y-3">
              <input type="hidden" name="id" value={account.id} />
              <div>
                <label className="label" htmlFor="ae-name">Name</label>
                <input className="input" id="ae-name" name="name" defaultValue={account.name} />
              </div>
              <div>
                <label className="label" htmlFor="ae-bal">
                  {account.debt ? "Owed when you started tracking" : "Starting balance"} ({account.currency})
                </label>
                <input className="input" id="ae-bal" name="balance" defaultValue={String(opening)} inputMode="decimal" />
                <p className="mt-1 text-xs text-muted">The current balance is this plus everything logged since.</p>
              </div>
              {account.debt && (
                <div>
                  <label className="label" htmlFor="ae-rate">Interest (% per year)</label>
                  <input className="input" id="ae-rate" name="interestRate" defaultValue={account.interestRate ?? ""} inputMode="decimal" />
                </div>
              )}
              <div>
                <label className="label" htmlFor="ae-hh">Share with household</label>
                <select className="input" id="ae-hh" name="householdId" defaultValue={account.householdId ?? ""}>
                  <option value="">Not shared (only you)</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {households.length === 0 && <p className="mt-1 text-xs text-muted">Create or join a household on the Shared page to share accounts.</p>}
              </div>
              <FormMessage state={state} />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={pending}>Save</button>
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
              </div>
            </form>
            <form
              action={archiveAccount}
              className="mt-3 border-t border-line pt-3"
              onSubmit={(e) => {
                if (!confirm(`Hide ${account.name}? Its history stays in reports.`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={account.id} />
              <button className="text-sm text-bad">Archive account</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
