"use client";

import { useActionState, useEffect, useState } from "react";
import { addHolding } from "@/app/actions/data";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "./auth-shell";

type Result = { kind: "stock" | "crypto"; symbol: string; name: string; detail: string };

export function HoldingForm() {
  const [kind, setKind] = useState<"stock" | "crypto">("stock");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [picked, setPicked] = useState<Result | null>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addHolding(prev, fd);
    if (res?.ok) {
      setPicked(null);
      setQ("");
      setResults([]);
    }
    return res;
  }, undefined);

  useEffect(() => {
    if (picked || q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/instruments?kind=${kind}&q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults(Array.isArray(r) ? r : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind, picked]);

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(["stock", "crypto"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setPicked(null);
              setResults([]);
            }}
            className={`rounded-lg py-1.5 text-sm ${kind === k ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}
          >
            {k === "stock" ? "Stock / ETF" : "Crypto"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="symbol" value={picked?.symbol ?? ""} />
      <input type="hidden" name="name" value={picked?.name ?? ""} />
      <div className="relative">
        <label className="label" htmlFor="h-q">{kind === "stock" ? "Search ticker or company" : "Search coin"}</label>
        <input
          className="input"
          id="h-q"
          value={picked ? `${picked.name} (${picked.detail})` : q}
          onChange={(e) => {
            setPicked(null);
            setQ(e.target.value);
          }}
          placeholder={kind === "stock" ? "AAPL, JFC.PS, VOO…" : "bitcoin, ethereum…"}
          autoComplete="off"
        />
        {!picked && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
            {results.map((r) => (
              <li key={r.symbol}>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => setPicked(r)}>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted">{r.detail}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <label className="label" htmlFor="h-qty">Units held</label>
        <input className="input" id="h-qty" name="quantity" inputMode="decimal" placeholder={kind === "crypto" ? "0.05" : "10"} required />
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full" disabled={pending || !picked}>
        {pending ? "Adding…" : "Add holding"}
      </button>
      <p className="text-xs text-muted">Prices: Yahoo Finance for stocks, CoinGecko for crypto. Converted with daily ECB exchange rates.</p>
    </form>
  );
}
