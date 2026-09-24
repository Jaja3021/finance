import { format, parseISO } from "date-fns";
import { WarningIcon } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { portfolio } from "@/lib/finance";
import { formatMoney, formatPrice } from "@/lib/money";
import { deleteHolding, updateHolding } from "@/app/actions/data";
import { PageHeader, Money, Empty } from "@/components/ui";
import { ValueLineChart, SplitBar } from "@/components/charts";
import { HoldingForm } from "@/components/holding-form";

export default async function InvestmentsPage() {
  const user = await requireUser();
  const home = user.homeCurrency;
  const pf = await portfolio(user.id, home);
  const pct = pf.total30 > 0 ? (pf.change30 / pf.total30) * 100 : null;

  return (
    <div>
      <PageHeader title="Investments" description={`Live prices, converted to ${home}. Counted in your net worth.`} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
        <div className="space-y-5">
          {pf.holdings.length === 0 ? (
            <Empty title="No holdings yet">Add a stock, ETF or coin and it will be priced automatically.</Empty>
          ) : (
            <>
              <section className="card">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted">Portfolio value</div>
                    <div className="text-3xl font-semibold tracking-tight">
                      <Money value={pf.total} currency={home} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">30-day change</div>
                    <div className={`text-xl font-semibold ${pf.change30 >= 0 ? "text-good" : "text-bad"}`}>
                      {pf.change30 >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(pf.change30), home)}
                      {pct !== null && <span className="ml-1 text-sm">({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-muted">What moved it</div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-2">Prices</span>
                      <Money value={pf.priceEffect} currency={home} sign tone="auto" />
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-2">Exchange rates</span>
                      <Money value={pf.fxEffect} currency={home} sign tone="auto" />
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <SplitBar
                    currency={home}
                    parts={[
                      { label: "Stocks & ETFs", value: pf.byKind.stock, color: "var(--series-1)" },
                      { label: "Crypto", value: pf.byKind.crypto, color: "var(--series-2)" },
                    ]}
                  />
                </div>
              </section>

              <section className="card">
                <h2 className="card-title mb-2">Portfolio value, last 30 days</h2>
                <ValueLineChart data={pf.series} currency={home} label="Portfolio value" />
                <p className="mt-1 text-xs text-muted">Uses your current units at each day&apos;s price and exchange rate.</p>
              </section>

              <section className="card">
                <h2 className="card-title mb-2">Holdings</h2>
                {/* Phones: one card per holding. */}
                <ul className="divide-y divide-line sm:hidden">
                  {pf.holdings.map((h) => {
                    const change = h.valueHome !== null && h.value30Home !== null ? h.valueHome - h.value30Home : null;
                    return (
                      <li key={h.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{h.name}</div>
                            <div className="text-xs text-muted">
                              {h.kind === "crypto" ? "Crypto" : h.symbol} · {h.price !== null && h.currency ? formatPrice(h.price, h.currency) : "no price"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="tabular font-medium">{h.valueHome !== null ? formatMoney(h.valueHome, home) : "—"}</div>
                            <div className="text-xs">{change !== null ? <Money value={change} currency={home} sign tone="auto" /> : "—"}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <form action={updateHolding} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={h.id} />
                            <label className="text-xs text-muted" htmlFor={`q-${h.id}`}>Units</label>
                            <input id={`q-${h.id}`} name="quantity" defaultValue={h.quantity} className="input w-28 py-1" inputMode="decimal" />
                            <button className="text-xs text-link">Save</button>
                          </form>
                          <form action={deleteHolding}>
                            <input type="hidden" name="id" value={h.id} />
                            <button className="text-xs text-muted hover:text-bad">Remove</button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 font-medium">Name</th>
                      <th className="font-medium">Units</th>
                      <th className="text-right font-medium">Price</th>
                      <th className="text-right font-medium">Value ({home})</th>
                      <th className="text-right font-medium">30 days</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pf.holdings.map((h) => {
                      const change = h.valueHome !== null && h.value30Home !== null ? h.valueHome - h.value30Home : null;
                      return (
                        <tr key={h.id}>
                          <td className="py-2">
                            <div className="font-medium">{h.name}</div>
                            <div className="text-xs text-muted">
                              {h.kind === "crypto" ? "Crypto" : h.symbol}
                              {h.priceDate && ` · ${format(parseISO(h.priceDate), "MMM d")}`}
                            </div>
                          </td>
                          <td>
                            <form action={updateHolding} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={h.id} />
                              <input name="quantity" defaultValue={h.quantity} className="input w-24 py-1" aria-label={`Units of ${h.name}`} inputMode="decimal" />
                              <button className="text-xs text-link">Save</button>
                            </form>
                          </td>
                          <td className="tabular text-right">{h.price !== null && h.currency ? formatPrice(h.price, h.currency) : "—"}</td>
                          <td className="tabular text-right font-medium">{h.valueHome !== null ? formatMoney(h.valueHome, home) : "—"}</td>
                          <td className="text-right">{change !== null ? <Money value={change} currency={home} sign tone="auto" /> : "—"}</td>
                          <td className="text-right">
                            <form action={deleteHolding}>
                              <input type="hidden" name="id" value={h.id} />
                              <button className="text-xs text-muted hover:text-bad">Remove</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {pf.missing.length > 0 && <p className="mt-2 flex items-start gap-1 text-xs text-warn"><WarningIcon size={13} weight="bold" className="mt-px shrink-0" aria-hidden /> Couldn&apos;t price: {pf.missing.join(", ")}. Showing the last known data where available.</p>}
              </section>
            </>
          )}
        </div>
        <section className="card h-fit">
          <h2 className="card-title mb-3">Add a holding</h2>
          <HoldingForm />
        </section>
      </div>
    </div>
  );
}
