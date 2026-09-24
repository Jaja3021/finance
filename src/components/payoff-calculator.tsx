"use client";

import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { LightbulbIcon, ProhibitIcon } from "@phosphor-icons/react/ssr";
import { payoff } from "@/lib/payoff";
import { formatMoney, toMinor } from "@/lib/money";

type Debt = { id: string; name: string; owed: number; apr: number | null };

export function PayoffCalculator({ debts, currency }: { debts: Debt[]; currency: string }) {
  const first = debts[0];
  const [balance, setBalance] = useState(first ? String(first.owed) : "50000");
  const [apr, setApr] = useState(first?.apr != null ? String(first.apr) : "36");
  const [payment, setPayment] = useState("5000");
  const [showSchedule, setShowSchedule] = useState(false);

  const b = Number(balance.replace(/,/g, ""));
  const r = Number(apr);
  const p = Number(payment.replace(/,/g, ""));
  const valid = b > 0 && r >= 0 && p > 0;
  const result = useMemo(() => (valid ? payoff(b, r, p) : null), [valid, b, r, p]);
  // A comparison helps: what does paying a bit more save?
  const faster = useMemo(() => (valid ? payoff(b, r, p * 1.25) : null), [valid, b, r, p]);
  const m = (v: number) => formatMoney(toMinor(v, currency), currency);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[18rem_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-3">
        {debts.length > 0 && (
          <div>
            <label className="label" htmlFor="po-debt">Start from an account</label>
            <select
              className="input"
              id="po-debt"
              onChange={(e) => {
                const d = debts.find((x) => x.id === e.target.value);
                if (d) {
                  setBalance(String(d.owed));
                  if (d.apr != null) setApr(String(d.apr));
                }
              }}
            >
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · owe {m(d.owed)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="po-bal">Balance owed ({currency})</label>
          <input className="input tabular" id="po-bal" value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="label" htmlFor="po-apr">Interest rate (% per year)</label>
          <input className="input tabular" id="po-apr" value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" />
          <p className="mt-1 text-xs text-muted">Credit cards in the Philippines are capped at 3% a month (36% a year).</p>
        </div>
        <div>
          <label className="label" htmlFor="po-pay">Monthly payment ({currency})</label>
          <input className="input tabular" id="po-pay" value={payment} onChange={(e) => setPayment(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <div>
        {!result ? (
          <p className="text-sm text-muted">Enter a balance, rate and payment.</p>
        ) : !result.ok ? (
          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="flex items-center gap-1.5 font-medium text-bad">
              <ProhibitIcon size={16} weight="bold" aria-hidden /> {result.reason}
            </p>
            <p className="mt-1 text-sm">Pay at least {m(result.minPayment)} a month to start reducing it.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">Debt-free in</div>
                <div className="text-2xl font-semibold">
                  {Math.floor(result.months / 12) > 0 && `${Math.floor(result.months / 12)}y `}
                  {result.months % 12}m
                </div>
                <div className="text-xs text-muted">{format(addMonths(new Date(), result.months), "MMMM yyyy")}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Total interest</div>
                <div className="text-2xl font-semibold tabular">{m(result.totalInterest)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Total paid</div>
                <div className="text-2xl font-semibold tabular">{m(result.totalPaid)}</div>
              </div>
            </div>
            {faster?.ok && faster.months < result.months && (
              <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <LightbulbIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <span>
                  Paying {m(p * 1.25)} instead ({m(p * 0.25)} more) clears it {result.months - faster.months} month
                  {result.months - faster.months === 1 ? "" : "s"} sooner and saves {m(result.totalInterest - faster.totalInterest)} in interest.
                </span>
              </p>
            )}
            <button className="text-sm text-link" onClick={() => setShowSchedule((s) => !s)}>
              {showSchedule ? "Hide" : "Show"} month-by-month schedule
            </button>
            {showSchedule && (
              <div className="max-h-80 overflow-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                    <tr>
                      <th className="p-2 font-medium">Month</th>
                      <th className="p-2 text-right font-medium">Interest</th>
                      <th className="p-2 text-right font-medium">Principal</th>
                      <th className="p-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-line">
                    {result.schedule.map((s) => (
                      <tr key={s.month}>
                        <td className="p-2">{format(addMonths(new Date(), s.month), "MMM yyyy")}</td>
                        <td className="p-2 text-right">{m(s.interest)}</td>
                        <td className="p-2 text-right">{m(s.principal)}</td>
                        <td className="p-2 text-right">{m(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
