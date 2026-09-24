"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/app/actions/auth";
import { format } from "date-fns";
import Link from "next/link";
import { PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react/ssr";
import { addTransaction, suggestCategoryFor } from "@/app/actions/data";
import { FormMessage } from "./auth-shell";

type Account = { id: string; name: string; currency: string; type: string };
type Category = { id: string; name: string; kind: "income" | "expense"; icon: string | null };

export function TxForm({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [payee, setPayee] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [suggested, setSuggested] = useState<string | null>(null);
  const [splits, setSplits] = useState<{ person: string; amount: string }[]>([]);
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addTransaction(prev, fd);
    if (res?.ok) {
      formRef.current?.reset();
      setPayee("");
      setCategoryId("");
      setSuggested(null);
      setSplits([]);
      setTouched(false);
    }
    return res;
  }, undefined);

  const from = accounts.find((a) => a.id === accountId);
  const to = accounts.find((a) => a.id === toAccountId);

  // Suggest a category from past entries while the user types the payee.
  useEffect(() => {
    if (type === "transfer" || payee.trim().length < 2) return;
    const t = setTimeout(async () => {
      const s = await suggestCategoryFor(payee, type);
      setSuggested(s?.categoryId ?? null);
      if (s && !touched) setCategoryId(s.categoryId);
    }, 300);
    return () => clearTimeout(t);
  }, [payee, type, touched]);

  if (!accounts.length) {
    return (
      <div className="text-sm text-muted">
        <p>You need an account to log transactions against, like GCash, a bank or cash.</p>
        <Link href="/accounts" className="btn-primary mt-3 w-full">
          Add your first account
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Type">
        {(["expense", "income", "transfer"] as const).map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-lg py-1.5 text-center text-sm capitalize ${type === t ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}
          >
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {t}
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">
            Amount {from && `(${from.currency})`}
          </label>
          <input className="input tabular text-lg" id="amount" name="amount" inputMode="decimal" placeholder="0.00 or 5k" required />
        </div>
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input className="input" id="date" name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required />
        </div>
        <div>
          <label className="label" htmlFor="accountId">{type === "transfer" ? "From" : "Account"}</label>
          <select className="input" id="accountId" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </div>
        {type === "transfer" ? (
          <div>
            <label className="label" htmlFor="toAccountId">To</label>
            <select className="input" id="toAccountId" name="toAccountId" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="payee">{type === "income" ? "From" : "Paid to"}</label>
            <input
              className="input"
              id="payee"
              name="payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder={type === "income" ? "Employer, client…" : "Jollibee, Meralco…"}
              autoComplete="off"
            />
          </div>
        )}
      </div>

      {type === "transfer" && from && to && from.currency !== to.currency && (
        <div>
          <label className="label" htmlFor="toAmount">Amount received ({to.currency}), optional</label>
          <input className="input" id="toAmount" name="toAmount" inputMode="decimal" placeholder="Leave blank to use today's rate" />
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <label className="label" htmlFor="categoryId">
            Category {suggested && suggested === categoryId && <span className="chip ml-1">suggested</span>}
          </label>
          <select
            className="input"
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={(e) => {
              setTouched(true);
              setCategoryId(e.target.value);
            }}
          >
            <option value="">Auto (based on your history)</option>
            {categories
              .filter((c) => c.kind === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="note">Note</label>
        <input className="input" id="note" name="note" placeholder="Optional" />
      </div>

      {type === "expense" && (
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Split with others</span>
            <button type="button" className="inline-flex items-center gap-1 text-sm text-link" onClick={() => setSplits((s) => [...s, { person: "", amount: "" }])}>
              <Plus size={14} /> Add person
            </button>
          </div>
          {splits.length > 0 && <p className="mt-1 text-xs text-muted">Enter each person&apos;s share. Your share is what&apos;s left; budgets only count your share.</p>}
          {splits.map((s, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input
                className="input"
                name="splitPerson"
                placeholder="Name"
                value={s.person}
                onChange={(e) => setSplits((xs) => xs.map((x, j) => (j === i ? { ...x, person: e.target.value } : x)))}
                aria-label="Person"
              />
              <input
                className="input w-32"
                name="splitAmount"
                placeholder="Share"
                inputMode="decimal"
                value={s.amount}
                onChange={(e) => setSplits((xs) => xs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                aria-label="Share"
              />
              <button type="button" className="btn-ghost px-2" onClick={() => setSplits((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove person">
                <X size={16} />
              </button>
            </div>
          ))}
          {splits.length > 0 && (
            <button
              type="button"
              className="mt-2 text-xs text-link"
              onClick={() => {
                const total = Number((document.getElementById("amount") as HTMLInputElement).value.replace(/,/g, "").replace(/k$/i, "e3"));
                if (!(total > 0)) return;
                const share = (total / (splits.length + 1)).toFixed(2);
                setSplits((xs) => xs.map((x) => ({ ...x, amount: share })));
              }}
            >
              Split equally
            </button>
          )}
        </div>
      )}

      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save transaction"}
      </button>
    </form>
  );
}
