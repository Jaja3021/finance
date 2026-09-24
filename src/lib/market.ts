import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { format } from "date-fns";
import { db, schema } from "@/db";

// Live prices: CoinGecko for crypto (by CoinGecko id), Yahoo Finance for
// stocks/ETFs (by Yahoo symbol, e.g. "AAPL", "JFC.PS"), with Alpha Vantage as
// an optional fallback when ALPHA_VANTAGE_KEY is set. Daily closes for the last
// ~month are cached so the 30-day change works offline.

export type HoldingKind = "stock" | "crypto";
export const priceKey = (kind: HoldingKind, symbol: string) => `${kind}:${symbol}`;

const REFRESH_MS = 15 * 60 * 1000;
const UA = { "User-Agent": "Mozilla/5.0 (finance-tracker)" };
type Close = { date: string; close: number };

// Some exchanges quote in a sub-unit (London in pence, etc.).
const SUBUNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100],
  GBX: ["GBP", 100],
  ZAc: ["ZAR", 100],
  ILA: ["ILS", 100],
};

function store(key: string, currency: string, closes: Close[]) {
  if (!closes.length) return;
  const now = Date.now();
  db.insert(schema.prices)
    .values(closes.map((c) => ({ key, currency, date: c.date, close: c.close, fetchedAt: now })))
    .onConflictDoUpdate({
      target: [schema.prices.key, schema.prices.date],
      set: { close: sql`excluded.close`, currency: sql`excluded.currency`, fetchedAt: now },
    })
    .run();
}

const day = (ms: number) => format(new Date(ms), "yyyy-MM-dd");

async function fetchCrypto(id: string) {
  const base = "https://api.coingecko.com/api/v3";
  const [chart, spot] = await Promise.all([
    fetch(`${base}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=35&interval=daily`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${base}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
  ]);
  if (!chart.ok) throw new Error(`CoinGecko ${chart.status}`);
  const { prices } = (await chart.json()) as { prices: [number, number][] };
  const closes = new Map<string, number>();
  for (const [ms, p] of prices) closes.set(day(ms), p);
  if (spot.ok) {
    const s = (await spot.json()) as Record<string, { usd?: number }>;
    if (s[id]?.usd) closes.set(day(Date.now()), s[id].usd!);
  }
  store(
    priceKey("crypto", id),
    "USD",
    [...closes].map(([date, close]) => ({ date, close })),
  );
}

async function fetchYahoo(symbol: string) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2mo&interval=1d`,
    { cache: "no-store", headers: UA, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = (await res.json()) as {
    chart: {
      result?: {
        meta: { currency: string; regularMarketPrice?: number; regularMarketTime?: number };
        timestamp?: number[];
        indicators: { quote: { close: (number | null)[] }[] };
      }[];
      error?: { description?: string } | null;
    };
  };
  const r = json.chart.result?.[0];
  if (!r) throw new Error(json.chart.error?.description ?? "Unknown symbol");
  let currency = r.meta.currency;
  let div = 1;
  if (SUBUNITS[currency]) [currency, div] = SUBUNITS[currency];
  const closes: Close[] = [];
  const ts = r.timestamp ?? [];
  const cl = r.indicators.quote[0]?.close ?? [];
  ts.forEach((t, i) => {
    if (cl[i] != null) closes.push({ date: day(t * 1000), close: cl[i]! / div });
  });
  if (r.meta.regularMarketPrice) {
    const d = day((r.meta.regularMarketTime ?? Date.now() / 1000) * 1000);
    const existing = closes.find((c) => c.date === d);
    if (existing) existing.close = r.meta.regularMarketPrice / div;
    else closes.push({ date: d, close: r.meta.regularMarketPrice / div });
  }
  store(priceKey("stock", symbol), currency, closes);
}

async function fetchAlphaVantage(symbol: string) {
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) throw new Error("No Alpha Vantage key");
  const res = await fetch(
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  const json = (await res.json()) as {
    "Time Series (Daily)"?: Record<string, { "4. close": string }>;
  };
  const series = json["Time Series (Daily)"];
  if (!series) throw new Error("Alpha Vantage returned no data");
  // Alpha Vantage doesn't report the quote currency; US listings are USD.
  store(
    priceKey("stock", symbol),
    "USD",
    Object.entries(series)
      .slice(0, 45)
      .map(([date, v]) => ({ date, close: parseFloat(v["4. close"]) })),
  );
}

const inflight = new Map<string, Promise<void>>();

/** Refreshes prices that are older than 15 minutes. Failures keep cached data. */
export async function refreshPrices(items: { kind: HoldingKind; symbol: string }[]) {
  await Promise.all(
    items.map(({ kind, symbol }) => {
      const key = priceKey(kind, symbol);
      const latest = db
        .select({ fetchedAt: schema.prices.fetchedAt })
        .from(schema.prices)
        .where(eq(schema.prices.key, key))
        .orderBy(desc(schema.prices.fetchedAt))
        .limit(1)
        .get();
      if (latest && Date.now() - latest.fetchedAt < REFRESH_MS) return;
      if (inflight.has(key)) return inflight.get(key);
      const p = (async () => {
        try {
          if (kind === "crypto") await fetchCrypto(symbol);
          else {
            try {
              await fetchYahoo(symbol);
            } catch (err) {
              if (!process.env.ALPHA_VANTAGE_KEY) throw err;
              await fetchAlphaVantage(symbol);
            }
          }
        } catch (err) {
          console.warn(`[market] ${key}:`, (err as Error).message);
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    }),
  );
}

export function priceOn(kind: HoldingKind, symbol: string, date: string) {
  return (
    db
      .select({ close: schema.prices.close, currency: schema.prices.currency, date: schema.prices.date })
      .from(schema.prices)
      .where(and(eq(schema.prices.key, priceKey(kind, symbol)), lte(schema.prices.date, date)))
      .orderBy(desc(schema.prices.date))
      .limit(1)
      .get() ?? null
  );
}

export function priceSeries(kind: HoldingKind, symbol: string, from: string) {
  return db
    .select({ date: schema.prices.date, close: schema.prices.close, currency: schema.prices.currency })
    .from(schema.prices)
    .where(and(eq(schema.prices.key, priceKey(kind, symbol)), gte(schema.prices.date, from)))
    .orderBy(schema.prices.date)
    .all();
}

export type SearchResult = { kind: HoldingKind; symbol: string; name: string; detail: string };

export async function searchInstruments(q: string, kind: HoldingKind): Promise<SearchResult[]> {
  if (q.trim().length < 1) return [];
  try {
    if (kind === "crypto") {
      const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json()) as { coins: { id: string; name: string; symbol: string }[] };
      return json.coins.slice(0, 8).map((c) => ({
        kind,
        symbol: c.id,
        name: c.name,
        detail: c.symbol.toUpperCase(),
      }));
    }
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
      { headers: UA, signal: AbortSignal.timeout(8000) },
    );
    const json = (await res.json()) as {
      quotes: { symbol: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string }[];
    };
    return json.quotes
      .filter((x) => ["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(x.quoteType ?? ""))
      .map((x) => ({
        kind,
        symbol: x.symbol,
        name: x.longname ?? x.shortname ?? x.symbol,
        detail: `${x.symbol} · ${x.exchDisp ?? ""}`,
      }));
  } catch {
    return [];
  }
}
