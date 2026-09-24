"use client";

import { useState, useTransition } from "react";
import { PaperPlaneTiltIcon as Send, ArrowUUpLeftIcon as Undo2, ArrowsLeftRightIcon } from "@phosphor-icons/react/ssr";
import { sendToAssistant, undoRecorded, type AssistantReply } from "@/app/actions/assistant";
import { formatMoney } from "@/lib/money";
import { MicButton } from "./speech";

/** One-line assistant: type or speak a transaction and it's recorded. */
export function QuickLog() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AssistantReply | null>(null);
  const [undone, setUndone] = useState(false);
  const [pending, start] = useTransition();

  function submit(value = text) {
    if (!value.trim()) return;
    start(async () => {
      setUndone(false);
      setResult(await sendToAssistant(value));
      setText("");
    });
  }

  return (
    <section className="card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-1.5 pl-4 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft"
      >
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-muted"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Log it like a text: “paid credit card 5k yesterday”, “lunch 250 gcash”"
          aria-label="Describe a transaction"
          disabled={pending}
        />
        <MicButton onText={setText} onFinal={(t) => submit(t)} />
        <button className="btn-primary h-10 w-10 shrink-0 rounded-xl p-0" disabled={pending || !text.trim()} aria-label="Record">
          <Send size={17} />
        </button>
      </form>
      {pending && <p className="mt-2 text-sm text-muted">Recording…</p>}
      {result && !pending && (
        <div className="mt-3 text-sm">
          <p className={undone ? "text-muted line-through" : ""}>{result.reply}</p>
          {result.recorded.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.recorded.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 ${undone ? "opacity-50" : ""}`}>
                  <span className={`tabular inline-flex items-center gap-0.5 font-medium ${r.type === "income" ? "text-good" : ""}`}>
                    {r.type === "expense" ? "−" : r.type === "income" ? "+" : <ArrowsLeftRightIcon size={14} weight="bold" aria-label="Transfer" />}
                    {formatMoney(r.amount, r.currency)}
                  </span>
                  <span className="text-ink-2">
                    {r.type === "transfer" ? `${r.account} → ${r.toAccount}` : `${r.payee ?? ""} · ${r.account}`}
                  </span>
                  {r.category && <span className="chip">{r.category}{r.categoryAuto ? " · auto" : ""}</span>}
                  <span className="text-xs text-muted">{r.date}</span>
                  {r.splitWith.length > 0 && <span className="chip">split with {r.splitWith.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
          {result.errors.map((e) => (
            <p key={e} className="mt-1 text-bad">
              {e}
            </p>
          ))}
          {result.recorded.length > 0 && !undone && (
            <button
              className="mt-2 inline-flex items-center gap-1 text-xs text-link"
              onClick={() =>
                start(async () => {
                  await undoRecorded(result.recorded.map((r) => r.id));
                  setUndone(true);
                })
              }
            >
              <Undo2 size={14} /> Undo
            </button>
          )}
        </div>
      )}
    </section>
  );
}
