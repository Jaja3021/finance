"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/auth";
import { addAccount } from "@/app/actions/data";
import { ACCOUNT_TEMPLATES, ACCOUNT_TYPE_LABELS, type AccountTemplate } from "@/lib/templates";
import { COMMON_CURRENCIES } from "@/lib/money";
import { FormMessage } from "./auth-shell";
import { InstitutionIcon } from "./institution-icon";

const GROUPS = ["E-wallets", "Banks", "Digital banks", "Credit cards", "Other"] as const;

export function AccountAdder({ homeCurrency }: { homeCurrency: string }) {
  const [picked, setPicked] = useState<AccountTemplate | "custom" | null>(null);
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("E-wallets");
  const [customType, setCustomType] = useState("bank");
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addAccount(prev, fd);
    if (res?.ok) setPicked(null);
    return res;
  }, undefined);

  const type = picked === "custom" ? customType : picked?.type;
  const isDebt = type === "credit_card" || type === "loan";

  if (!picked) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={`chip ${group === g ? "bg-accent text-accent-ink" : ""}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
          {ACCOUNT_TEMPLATES.filter((t) => t.group === group).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPicked(t)}
              className="flex items-center gap-2 rounded-xl border border-line p-2 text-left text-sm hover:bg-surface-2"
            >
              <InstitutionIcon institution={t.key} name={t.name} color={t.color} size={32} />
              <span className="min-w-0">
                <span className="line-clamp-2 block font-medium leading-tight">{t.name}</span>
                <span className="text-xs text-muted">{t.currency}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setPicked("custom")} className="rounded-xl border border-dashed border-line p-2 text-sm text-ink-2 hover:bg-surface-2">
            + Something else
          </button>
        </div>
        {state?.ok && <p className="mt-3 text-sm text-good">{state.ok}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {picked !== "custom" && <input type="hidden" name="template" value={picked.key} />}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          {picked !== "custom" && <InstitutionIcon institution={picked.key} name={picked.name} color={picked.color} size={28} />}
          {picked === "custom" ? "Custom account" : picked.name}
        </span>
        <button type="button" className="text-sm text-link" onClick={() => setPicked(null)}>
          Back
        </button>
      </div>
      {picked === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="type">Type</label>
            <select className="input" id="type" name="type" value={customType} onChange={(e) => setCustomType(e.target.value)}>
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <select className="input" id="currency" name="currency" defaultValue={homeCurrency}>
              {COMMON_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input className="input" id="name" name="name" defaultValue={picked === "custom" ? "" : picked.name} required={picked === "custom"} />
      </div>
      <div>
        <label className="label" htmlFor="balance">
          {isDebt ? "Amount you currently owe" : "Current balance"} ({picked === "custom" ? "account currency" : picked.currency})
        </label>
        <input className="input tabular" id="balance" name="balance" inputMode="decimal" placeholder="0" autoFocus />
      </div>
      {isDebt && (
        <div className="grid grid-cols-2 gap-2">
          {type === "credit_card" && (
            <div>
              <label className="label" htmlFor="creditLimit">Credit limit</label>
              <input className="input" id="creditLimit" name="creditLimit" inputMode="decimal" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="interestRate">Interest (% per year)</label>
            <input className="input" id="interestRate" name="interestRate" inputMode="decimal" placeholder={type === "credit_card" ? "36" : "6.5"} />
          </div>
        </div>
      )}
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}
