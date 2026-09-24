"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftIcon as ArrowLeft, CheckIcon as Check, BackspaceIcon as Delete, ArrowUUpLeftIcon as Undo2, XIcon as X } from "@phosphor-icons/react/ssr";
import { quickLogAction, undoQuickLog } from "@/app/actions/data";
import { formatMoney } from "@/lib/money";
import { ensureServiceWorker, showSystemNotification } from "@/lib/notify-client";
import { InstitutionIcon } from "./institution-icon";
import { CategoryIcon } from "@/components/category-icon";

type Category = { id: string; name: string; icon: string | null };
type Account = { id: string; name: string; currency: string; type: string; institution: string | null; color: string | null; balance: number };
type Receipt = { id: string; title: string; message: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

/**
 * Three taps: amount → category → account. Picking the account saves it,
 * then a receipt (and a system notification, if allowed) confirms the deduction.
 */
export function QuickFlow({
  kind: initialKind,
  expense,
  income,
  currency,
}: {
  kind: "expense" | "income";
  expense: { categories: Category[]; accounts: Account[] };
  income: { categories: Category[]; accounts: Account[] };
  currency: string;
}) {
  const [kind, setKind] = useState(initialKind);
  const [step, setStep] = useState<"amount" | "category" | "account" | "done">("amount");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [pending, start] = useTransition();
  const opts = kind === "expense" ? expense : income;
  const value = Number(amount || "0");

  useEffect(() => {
    void ensureServiceWorker();
  }, []);

  function press(k: (typeof KEYS)[number]) {
    setAmount((a) => {
      if (k === "del") return a.slice(0, -1);
      if (k === "." && a.includes(".")) return a;
      if (/\.\d{2}$/.test(a)) return a; // two decimals max
      if (a.replace(".", "").length >= 9) return a;
      if (a === "0" && k !== ".") return k;
      return (a === "" && k === "." ? "0" : a) + k;
    });
  }

  // Physical keyboard support (desktop, or phones with a keyboard).
  useEffect(() => {
    if (step !== "amount") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Enter" && Number(amount) > 0) setStep("category");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, amount]);

  function save(account: Account) {
    setError(null);
    start(async () => {
      const r = await quickLogAction({ amount, categoryId: category?.id ?? null, accountId: account.id, type: kind });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReceipt(r);
      setUndone(false);
      setStep("done");
      void showSystemNotification(r.title, r.message);
    });
  }

  function reset() {
    setAmount("");
    setCategory(null);
    setReceipt(null);
    setError(null);
    setStep("amount");
  }

  const back = () => setStep(step === "account" ? "category" : "amount");
  const shown = amount ? formatMoney(Math.round(value * 100), currency).replace(/\.00$/, amount.includes(".") ? ".00" : "") : formatMoney(0, currency).replace(/\.00$/, "");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-4 flex items-center justify-between">
        {step === "category" || step === "account" ? (
          <button className="btn-ghost px-3" onClick={back} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link href="/" className="btn-ghost px-3" aria-label="Close">
            <X size={18} />
          </Link>
        )}
        {step !== "done" && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm" role="radiogroup" aria-label="Type">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setCategory(null);
                }}
                className={`rounded-lg px-4 py-1.5 capitalize ${kind === k ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}
              >
                {k}
              </button>
            ))}
          </div>
        )}
        <span className="w-11 text-right text-xs text-muted">{step === "done" ? "" : `${["amount", "category", "account"].indexOf(step) + 1}/3`}</span>
      </header>

      {step !== "done" && (
        <div className="mb-4 text-center">
          <div className={`tabular text-5xl font-semibold tracking-tight ${kind === "income" ? "text-good" : ""}`}>{shown}</div>
          {step !== "amount" && (
            <div className="mt-2 text-sm text-muted">
              {category ? (
                <span className="inline-flex items-center gap-1.5">
                  <CategoryIcon name={category.name} icon={category.icon} size={16} />
                  {category.name}
                </span>
              ) : step === "account" ? (
                "Category: automatic"
              ) : (
                "Pick a category"
              )}
            </div>
          )}
        </div>
      )}

      {step === "amount" && (
        <div className="mt-auto">
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className="flex h-16 items-center justify-center rounded-2xl bg-surface text-2xl font-medium active:bg-surface-2"
                aria-label={k === "del" ? "Delete" : k}
              >
                {k === "del" ? <Delete size={22} /> : k}
              </button>
            ))}
          </div>
          <button className="btn-primary mt-3 h-14 w-full text-base" disabled={!(value > 0)} onClick={() => setStep("category")}>
            Next
          </button>
        </div>
      )}

      {step === "category" && (
        <div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {opts.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCategory(c);
                  setStep("account");
                }}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-2 text-center transition hover:bg-surface-2 active:bg-surface-3"
              >
                <CategoryIcon name={c.name} icon={c.icon} size={30} className="text-ink" />
                <span className="line-clamp-2 text-xs leading-tight text-ink-2">{c.name}</span>
              </button>
            ))}
          </div>
          <button className="mt-3 w-full py-2 text-sm text-link" onClick={() => setStep("account")}>
            Skip, pick automatically
          </button>
        </div>
      )}

      {step === "account" && (
        <div className="space-y-2">
          {opts.accounts.length === 0 && (
            <Link href="/accounts" className="btn-primary w-full">
              Add an account first
            </Link>
          )}
          {opts.accounts.map((a) => (
            <button
              key={a.id}
              disabled={pending}
              onClick={() => save(a)}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left active:bg-surface-2 disabled:opacity-60"
            >
              <InstitutionIcon institution={a.institution} name={a.name} color={a.color} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="text-xs text-muted">
                  {(a.type === "credit_card" || a.type === "loan") && a.balance < 0
                    ? `${formatMoney(-a.balance, a.currency)} owed`
                    : `${formatMoney(a.balance, a.currency)} available`}
                </span>
              </span>
            </button>
          ))}
          {pending && <p className="text-center text-sm text-muted">Saving…</p>}
          {error && <p className="text-center text-sm text-bad" role="alert">{error}</p>}
        </div>
      )}

      {step === "done" && receipt && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${undone ? "bg-surface-2 text-muted" : "bg-good text-white"}`}>
            {undone ? <Undo2 size={28} /> : <Check size={32} />}
          </div>
          <h1 className={`mt-4 text-2xl font-semibold ${undone ? "text-muted line-through" : ""}`}>{receipt.title}</h1>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{undone ? "Removed." : receipt.message}</p>
          <div className="mt-8 grid w-full gap-2">
            <button className="btn-primary h-12 w-full text-base" onClick={reset}>
              Log another
            </button>
            <Link href="/" className="btn-ghost h-12 w-full">
              Done
            </Link>
            {!undone && (
              <button
                className="mt-1 inline-flex items-center justify-center gap-1 text-sm text-muted"
                onClick={() =>
                  start(async () => {
                    await undoQuickLog(receipt.id);
                    setUndone(true);
                  })
                }
              >
                <Undo2 size={14} /> Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
