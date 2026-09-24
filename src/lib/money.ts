// Amounts are integer minor units. The number of decimals comes from Intl so
// JPY/KRW (0 decimals) and BHD/KWD (3) work without a lookup table.

const digitsCache = new Map<string, number>();

export function currencyDigits(currency: string): number {
  let d = digitsCache.get(currency);
  if (d === undefined) {
    try {
      d =
        new Intl.NumberFormat("en", { style: "currency", currency })
          .resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(currency, d);
  }
  return d;
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyDigits(currency));
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

export function formatMoney(
  minor: number,
  currency: string,
  opts: { compact?: boolean; sign?: boolean } = {},
): string {
  const major = toMajor(minor, currency);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : undefined,
      signDisplay: opts.sign ? "exceptZero" : "auto",
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

/**
 * Parses what people actually type: "1,250.50", "5k", "2.5m", "₱300".
 * Returns major units, or null if it isn't a positive number.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[,\s₱$€£¥]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  return n > 0 ? n : null;
}

export const COMMON_CURRENCIES = [
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "SGD",
  "HKD",
  "AUD",
  "CAD",
  "CNY",
  "KRW",
  "MYR",
  "THB",
  "IDR",
  "INR",
  "AED",
  "SAR",
  "CHF",
  "NZD",
];

/** Unit prices can be tiny (0.00001234) or huge; keep ~4 significant digits. */
export function formatPrice(major: number, currency: string): string {
  const digits = major >= 1 ? Math.max(currencyDigits(currency), 2) : Math.min(8, 2 - Math.floor(Math.log10(major || 1)) + 2);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, currencyDigits(currency)) }).format(major);
  } catch {
    return `${currency} ${major}`;
  }
}
