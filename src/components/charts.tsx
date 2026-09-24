"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/money";
import { CategoryIcon } from "@/components/category-icon";

// Chart styling follows fixed specs: 2px lines, a ~10% area wash, hairline
// solid grid, thin bars with rounded data-ends, text in ink tokens (never the
// series color), and a tooltip on every chart.

const axis = { fontSize: 11, fill: "var(--muted)" };

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-md">{children}</div>;
}

/** Single-series value over time (no legend: the card title names it). */
export function ValueLineChart({ data, currency, label }: { data: { date: string; value: number }[]; currency: string; label: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={`${label} over the last 30 days`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={["auto", "auto"]}
            tickFormatter={(v) => formatMoney(v, currency, { compact: true })}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox>
                  <div className="text-muted">{format(parseISO(String(payload[0].payload.date)), "EEE, MMM d")}</div>
                  <div className="font-medium text-ink">{formatMoney(Number(payload[0].value), currency)}</div>
                </TipBox>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="var(--series-1)"
            fillOpacity={0.1}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-part composition bar with legend + direct labels (e.g. stocks vs crypto). */
export function SplitBar({ parts, currency }: { parts: { label: string; value: number; color: string }[]; currency: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${formatMoney(p.value, currency)}`} />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-ink-2">{p.label}</span>
            <span className="tabular font-medium">{formatMoney(p.value, currency)}</span>
            <span className="text-muted">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one series, value at the tip. */
export function CategoryBars({ rows, currency }: { rows: { category: string; icon: string | null; amount: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.category} className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3 text-sm" title={`${r.category}: ${formatMoney(r.amount, currency)}`}>
          <span className="truncate text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <CategoryIcon name={r.category} icon={r.icon} size={16} className="shrink-0 text-ink-2" />
              <span className="truncate">{r.category}</span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, maxWidth: "calc(100% - 6rem)", background: "var(--series-1)" }} />
            <span className="tabular whitespace-nowrap text-ink">{formatMoney(r.amount, currency, { compact: r.amount >= 1e7 })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Income vs expense per period: two series, legend always shown. */
export function IncomeExpenseChart({ data, currency }: { data: { label: string; income: number; expense: number }[]; currency: string }) {
  return (
    <div>
      <ul className="mb-2 flex gap-4 text-xs text-ink-2">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-1)" }} />Income</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-2)" }} />Expenses</li>
      </ul>
      <div className="h-56 w-full" role="img" aria-label="Income and expenses by period">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="mb-1 text-muted">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
                        <span className="h-2 w-2 rounded-sm" style={{ background: String(p.color) }} />
                        {p.dataKey === "income" ? "Income" : "Expenses"}: {formatMoney(Number(p.value), currency)}
                      </div>
                    ))}
                  </TipBox>
                ) : null
              }
            />
            <Bar dataKey="income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="expense" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
