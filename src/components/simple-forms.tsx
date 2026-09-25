"use client";

import { useActionState, useState } from "react";
import { CategoryIcon } from "./category-icon";
import { ICON_KEYS, categoryIconKey, type IconKey } from "@/lib/category-icons";
import type { FormState } from "@/app/actions/auth";
import { addCategory, saveBill, saveBudget, createHousehold, joinHousehold, updateProfile, restoreBackup, snapshotNow } from "@/app/actions/data";
import { setPin, removePin } from "@/app/actions/auth";
import { COMMON_CURRENCIES } from "@/lib/money";
import { FormMessage } from "./auth-shell";

type Category = { id: string; name: string; kind: "income" | "expense"; icon: string | null };

export function BudgetForm({ categories, currency, initial }: { categories: Category[]; currency: string; initial?: { categoryId: string; limit: string; alertAt: number } }) {
  const [state, action, pending] = useActionState(saveBudget, undefined);
  return (
    <form action={action} className="space-y-3" key={initial?.categoryId}>
      <div>
        <label className="label" htmlFor="b-cat">Category</label>
        <select className="input" id="b-cat" name="categoryId" defaultValue={initial?.categoryId ?? ""} required>
          <option value="" disabled>Choose…</option>
          {categories
            .filter((c) => c.kind === "expense")
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="b-limit">Monthly limit ({currency})</label>
          <input className="input" id="b-limit" name="limit" inputMode="decimal" defaultValue={initial?.limit} placeholder="5,000" required />
        </div>
        <div>
          <label className="label" htmlFor="b-alert">Alert at (%)</label>
          <input className="input" id="b-alert" name="alertAt" type="number" min={50} max={99} defaultValue={Math.round((initial?.alertAt ?? 0.8) * 100)} />
        </div>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>Save budget</button>
    </form>
  );
}

export function CategoryForm() {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<IconKey | null>(null);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addCategory(prev, fd);
    if (res?.ok) {
      setName("");
      setPicked(null);
    }
    return res;
  }, undefined);
  // Until the user picks one, preview the icon the name would get automatically.
  const shown = picked ?? categoryIconKey(name, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="icon" value={picked ? `ph:${picked}` : ""} />
      <div className="grid grid-cols-[3rem_1fr_7rem] gap-2">
        <button
          type="button"
          className={`flex h-full items-center justify-center rounded-xl border bg-surface text-ink hover:bg-surface-2 ${open ? "border-accent" : "border-line"}`}
          onClick={() => setOpen((o) => !o)}
          aria-label="Choose an icon"
          aria-expanded={open}
        >
          <CategoryIcon icon={`ph:${shown}`} size={22} />
        </button>
        <input className="input" name="name" placeholder="Pets" aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="input" name="kind" aria-label="Kind">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      {open && (
        <div className="grid grid-cols-7 gap-1 rounded-2xl border border-line bg-surface p-2 sm:grid-cols-8" role="listbox" aria-label="Icons">
          {ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="option"
              aria-selected={shown === k}
              aria-label={k.replace(/([a-z])([A-Z])/g, "$1 $2")}
              title={k.replace(/([a-z])([A-Z])/g, "$1 $2")}
              onClick={() => {
                setPicked(k);
                setOpen(false);
              }}
              className={`flex aspect-square items-center justify-center rounded-lg text-ink ${shown === k ? "bg-accent-soft text-link ring-1 ring-accent" : "hover:bg-surface-2"}`}
            >
              <CategoryIcon icon={`ph:${k}`} size={20} />
            </button>
          ))}
        </div>
      )}
      <FormMessage state={state} />
      <button className="btn-ghost w-full" disabled={pending}>Add category</button>
    </form>
  );
}

type BillInitial = { id: string; name: string; amount: string; frequency: string; nextDue: string; remindDaysBefore: number; accountId: string | null; categoryId: string | null };

export function BillForm({ accounts, categories, initial }: { accounts: { id: string; name: string; currency: string }[]; categories: Category[]; initial?: BillInitial }) {
  const [state, action, pending] = useActionState(saveBill, undefined);
  return (
    <form action={action} className="space-y-3" key={initial?.id ?? "new"}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div>
        <label className="label" htmlFor="bl-name">Name</label>
        <input className="input" id="bl-name" name="name" defaultValue={initial?.name} placeholder="Netflix, Meralco, Rent…" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="bl-amt">Amount</label>
          <input className="input" id="bl-amt" name="amount" inputMode="decimal" defaultValue={initial?.amount} required />
        </div>
        <div>
          <label className="label" htmlFor="bl-freq">Repeats</label>
          <select className="input" id="bl-freq" name="frequency" defaultValue={initial?.frequency ?? "monthly"}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bl-due">Next due</label>
          <input className="input" id="bl-due" name="nextDue" type="date" defaultValue={initial?.nextDue} required />
        </div>
        <div>
          <label className="label" htmlFor="bl-remind">Remind me (days before)</label>
          <input className="input" id="bl-remind" name="remindDaysBefore" type="number" min={0} max={30} defaultValue={initial?.remindDaysBefore ?? 3} />
        </div>
        <div>
          <label className="label" htmlFor="bl-acct">Paid from</label>
          <select className="input" id="bl-acct" name="accountId" defaultValue={initial?.accountId ?? accounts[0]?.id ?? ""}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bl-cat">Category</label>
          <select className="input" id="bl-cat" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">—</option>
            {categories
              .filter((c) => c.kind === "expense")
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </div>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>{initial ? "Save changes" : "Add bill"}</button>
    </form>
  );
}

export function HouseholdForms() {
  const [cState, create, cPending] = useActionState(createHousehold, undefined);
  const [jState, join, jPending] = useActionState(joinHousehold, undefined);
  return (
    <div className="space-y-4">
      <form action={create} className="space-y-2">
        <label className="label" htmlFor="hh-name">Start a household</label>
        <div className="flex gap-2">
          <input className="input" id="hh-name" name="name" placeholder="Family budget" />
          <button className="btn-primary shrink-0" disabled={cPending}>Create</button>
        </div>
        <FormMessage state={cState} />
      </form>
      <form action={join} className="space-y-2">
        <label className="label" htmlFor="hh-code">Join with an invite code</label>
        <div className="flex gap-2">
          <input className="input uppercase" id="hh-code" name="code" placeholder="AB12CD34" required />
          <button className="btn-ghost shrink-0" disabled={jPending}>Join</button>
        </div>
        <FormMessage state={jState} />
      </form>
    </div>
  );
}

export function ProfileForm({ name, homeCurrency }: { name: string; homeCurrency: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const list = COMMON_CURRENCIES.includes(homeCurrency) ? COMMON_CURRENCIES : [homeCurrency, ...COMMON_CURRENCIES];
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="p-name">Name</label>
        <input className="input" id="p-name" name="name" defaultValue={name} />
      </div>
      <div>
        <label className="label" htmlFor="p-cur">Home currency</label>
        <select className="input" id="p-cur" name="homeCurrency" defaultValue={homeCurrency}>
          {list.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Net worth, budgets and reports are converted to this. Budget limits aren&apos;t converted when you change it.</p>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>Save</button>
    </form>
  );
}

export function PinForms({ hasPin, minutes }: { hasPin: boolean; minutes: number }) {
  const [sState, set, sPending] = useActionState(setPin, undefined);
  const [rState, remove, rPending] = useActionState(removePin, undefined);
  return (
    <div className="space-y-4">
      <form action={set} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="pin">{hasPin ? "New PIN" : "PIN"}</label>
            <input className="input" id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" required />
          </div>
          <div>
            <label className="label" htmlFor="pin2">Confirm</label>
            <input className="input" id="pin2" name="confirm" type="password" inputMode="numeric" pattern="\d{4,8}" required />
          </div>
          <div>
            <label className="label" htmlFor="pin-min">Lock after (min)</label>
            <input className="input" id="pin-min" name="minutes" type="number" min={1} max={120} defaultValue={minutes} />
          </div>
        </div>
        <FormMessage state={sState} />
        <button className="btn-primary" disabled={sPending}>{hasPin ? "Change PIN" : "Turn on PIN lock"}</button>
      </form>
      {hasPin && (
        <form action={remove} className="space-y-2 border-t border-line pt-4">
          <label className="label" htmlFor="rm-pw">Turn off PIN lock (enter your password)</label>
          <div className="flex gap-2">
            <input className="input" id="rm-pw" name="password" type="password" autoComplete="current-password" required />
            <button className="btn-danger shrink-0" disabled={rPending}>Turn off</button>
          </div>
          <FormMessage state={rState} />
        </form>
      )}
    </div>
  );
}

export function BackupForms({ serverSnapshots }: { serverSnapshots: boolean }) {
  const [rState, restore, rPending] = useActionState(restoreBackup, undefined);
  const [sState, snap, sPending] = useActionState(snapshotNow, undefined);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href="/api/export/backup" download>
          Download my data (JSON)
        </a>
        {serverSnapshots && (
          <form action={snap}>
            <button className="btn-ghost" disabled={sPending}>{sPending ? "Backing up…" : "Back up server now"}</button>
          </form>
        )}
      </div>
      <FormMessage state={sState} />
      <form
        action={restore}
        className="space-y-2 border-t border-line pt-4"
        onSubmit={(e) => {
          if (!confirm(`Replace your current data with this backup?${serverSnapshots ? " A snapshot of the current data is saved first." : ""}`)) e.preventDefault();
        }}
      >
        <label className="label" htmlFor="restore">Restore from a downloaded backup</label>
        <input className="input" id="restore" name="file" type="file" accept="application/json,.json" required />
        <FormMessage state={rState} />
        <button className="btn-danger" disabled={rPending}>{rPending ? "Restoring…" : "Restore"}</button>
      </form>
    </div>
  );
}
