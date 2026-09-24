import "server-only";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { db, schema } from "@/db";
import { currencyDigits } from "./money";

// Exchange rates come from Frankfurter (ECB reference rates, no API key).
// We cache daily rates in SQLite so historical conversions and the 30-day
// currency effect in the portfolio don't need a network call.

const FRANKFURTER = "https://api.frankfurter.dev/v1";
const HISTORY_DAYS = 40;
const REFRESH_MS = 6 * 60 * 60 * 1000;
const lastFetch = new Map<string, number>();

export const today = () => format(new Date(), "yyyy-MM-dd");

async function fetchSeries(base: string, quote: string) {
  const start = format(subDays(new Date(), HISTORY_DAYS), "yyyy-MM-dd");
  const res = await fetch(
    `${FRANKFURTER}/${start}..?base=${base}&symbols=${quote}`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = (await res.json()) as {
    rates: Record<string, Record<string, number>>;
  };
  const rows = Object.entries(data.rates)
    .map(([date, r]) => ({ base, quote, date, rate: r[quote] }))
    .filter((r) => typeof r.rate === "number");
  if (rows.length) {
    db.insert(schema.fxRates)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.fxRates.base, schema.fxRates.quote, schema.fxRates.date],
        set: { rate: sql`excluded.rate` },
      })
      .run();
  }
}

/** Make sure recent daily rates for each base → quote pair are cached. */
export async function ensureRates(bases: string[], quote: string) {
  const pairs = [...new Set(bases)].filter((b) => b && b !== quote);
  await Promise.all(
    pairs.map(async (base) => {
      const k = `${base}:${quote}`;
      if (Date.now() - (lastFetch.get(k) ?? 0) < REFRESH_MS) return;
      lastFetch.set(k, Date.now());
      try {
        await fetchSeries(base, quote);
      } catch (err) {
        // Offline or unsupported currency: fall back to whatever is cached.
        console.warn(`[fx] ${k}:`, (err as Error).message);
      }
    }),
  );
}

/** Most recent cached rate on or before `date`. Null if we have nothing. */
export function rateOn(base: string, quote: string, date = today()): number | null {
  if (base === quote) return 1;
  const { fxRates } = schema;
  const direct = db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), lte(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .get();
  if (direct) return direct.rate;
  const inverse = db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, quote), eq(fxRates.quote, base), lte(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .get();
  return inverse ? 1 / inverse.rate : null;
}

/** Converts minor units between currencies (handles differing decimal places). */
export function convertMinor(
  minor: number,
  from: string,
  to: string,
  date?: string,
): number | null {
  if (from === to) return minor;
  const rate = rateOn(from, to, date);
  if (rate === null) return null;
  return Math.round((minor / 10 ** currencyDigits(from)) * rate * 10 ** currencyDigits(to));
}

