"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PaperPlaneTiltIcon as Send, ArrowUUpLeftIcon as Undo2 } from "@phosphor-icons/react/ssr";
import { sendToAssistant, undoRecorded, type Recorded } from "@/app/actions/assistant";
import { formatMoney } from "@/lib/money";
import { MicButton } from "./speech";

type Msg = { id: string; role: "user" | "assistant"; content: string; recorded?: Recorded[]; errors?: string[]; undone?: boolean };

const EXAMPLES = [
  "paid credit card 5k yesterday",
  "lunch 250 and grab 180 via gcash",
  "got salary 30k in bdo",
  "split dinner 1,800 with Ana and Ben",
  "netflix $15.49",
  "withdrew 3k from bdo last friday",
];

export function AssistantChat({ history, aiOn }: { history: Msg[]; aiOn: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(history);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an
  // effect may only return a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, pending]);

  function send(value = text) {
    const v = value.trim();
    if (!v) return;
    setText("");
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", content: v }]);
    start(async () => {
      const r = await sendToAssistant(v);
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: r.reply, recorded: r.recorded, errors: r.errors }]);
    });
  }

  function undo(msgId: string, ids: string[]) {
    start(async () => {
      await undoRecorded(ids);
      setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, undone: true } : x)));
    });
  }

  return (
    <div className="card flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col p-0 sm:p-0">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="py-6 text-center text-sm text-muted">
            <p>Tell me what you spent or received, the way you&apos;d text a friend.</p>
            <p className="mt-1">{aiOn ? "Powered by Google Gemini." : "Running on built-in rules. Add a GEMINI_API_KEY for smarter parsing."}</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-accent text-accent-ink" : "bg-surface-2"}`}>
              <p className={m.undone ? "line-through opacity-60" : ""}>{m.content}</p>
              {m.recorded && m.recorded.length > 0 && (
                <ul className={`mt-2 space-y-1 ${m.undone ? "opacity-50" : ""}`}>
                  {m.recorded.map((r) => (
                    <li key={r.id} className="rounded-xl bg-surface px-2 py-1.5 text-ink">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">
                          {r.type === "transfer" ? `${r.account} → ${r.toAccount}` : r.payee ?? r.type}
                        </span>
                        <span className={`tabular font-medium ${r.type === "income" ? "text-good" : ""}`}>
                          {r.type === "expense" ? "−" : r.type === "income" ? "+" : ""}
                          {formatMoney(r.amount, r.currency)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 text-xs text-muted">
                        <span>{r.date}</span>
                        {r.type !== "transfer" && <span>· {r.account}</span>}
                        {r.category && <span>· {r.category}</span>}
                        {r.splitWith.length > 0 && <span>· split with {r.splitWith.join(", ")}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {m.errors?.map((e) => (
                <p key={e} className="mt-1 text-bad">{e}</p>
              ))}
              {m.recorded && m.recorded.length > 0 && !m.undone && (
                <button className="mt-2 inline-flex items-center gap-1 text-xs text-link" onClick={() => undo(m.id, m.recorded!.map((r) => r.id))}>
                  <Undo2 size={14} /> Undo
                </button>
              )}
            </div>
          </div>
        ))}
        {pending && <div className="text-sm text-muted">Recording…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip shrink-0 hover:bg-line" onClick={() => send(e)} disabled={pending}>
              {e}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. paid meralco 2,450 today" aria-label="Message" />
          <MicButton onText={setText} onFinal={(t) => send(t)} />
          <button className="btn-primary px-3" disabled={pending || !text.trim()} aria-label="Send">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
