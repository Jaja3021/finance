import { format, subDays, parse, isValid, previousDay, type Day } from "date-fns";
import { parseAmount } from "./money";

// Shared shape for both the AI parser and the rule-based fallback.
export type Draft = {
  type: "income" | "expense" | "transfer";
  amount: number; // major units
  currency: string | null;
  accountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  date: string;
  payee: string | null;
  note: string | null;
  splitWith: { person: string; amount: number }[];
};

type AccountRef = { id: string; name: string; type: string; institution: string | null; currency: string };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function resolveDate(text: string, now = new Date()): { date: string; matched: string | null } {
  const t = text.toLowerCase();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  let m = t.match(/\b(yesterday|kahapon)\b/);
  if (m) return { date: fmt(subDays(now, 1)), matched: m[0] };
  m = t.match(/\b(today|kanina|now)\b/);
  if (m) return { date: fmt(now), matched: m[0] };
  m = t.match(/\b(\d+)\s+days?\s+ago\b/);
  if (m) return { date: fmt(subDays(now, +m[1])), matched: m[0] };
  m = t.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/) ?? t.match(/\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) return { date: fmt(previousDay(now, WEEKDAYS.indexOf(m[1]) as Day)), matched: m[0] };
  m = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return { date: m[1], matched: m[0] };
  m = t.match(/\b(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (m) {
    const d = parse(`${m[1].slice(0, 3)} ${m[2]} ${now.getFullYear()}`, "MMM d yyyy", now);
    if (isValid(d)) return { date: fmt(d > now ? subDays(d, 365) : d), matched: m[0] };
  }
  m = t.match(/\bon\s+(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const d = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
    if (isValid(d)) return { date: fmt(d), matched: m[0] };
  }
  return { date: fmt(now), matched: null };
}

const TYPE_WORDS: Record<string, RegExp> = {
  debt: /\b(credit ?card|cc|card|loan)\b/,
};

/** Scores how well a phrase mentions an account. */
export function matchAccount(text: string, accounts: AccountRef[], exclude?: string): AccountRef | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { a: AccountRef; score: number } | null = null;
  for (const a of accounts) {
    if (a.id === exclude) continue;
    let score = 0;
    const name = a.name.toLowerCase();
    if (t.includes(` ${name} `) || t.includes(name)) score += 10;
    for (const w of name.split(/\s+/)) if (w.length > 2 && t.includes(` ${w}`)) score += 3;
    const inst = (a.institution ?? "").toLowerCase().replace(/-cc$|-usd$/, "");
    if (inst && t.includes(` ${inst}`)) score += 4;
    if ((a.type === "credit_card" || a.type === "loan") && TYPE_WORDS.debt.test(t)) score += 2;
    if (a.type === "cash" && /\bcash\b/.test(t)) score += 3;
    if (score > 0 && (!best || score > best.score)) best = { a, score };
  }
  return best?.a ?? null;
}

/**
 * Rule-based parser used when no Gemini API key is configured. Handles
 * common phrasings like "lunch 250", "paid credit card 5k yesterday",
 * "got salary 30k in bdo", "grab 180 gcash", "split dinner 1200 with Ana".
 */
export function parseRuleBased(input: string, accounts: AccountRef[], now = new Date()): { drafts: Draft[]; reply: string } {
  // Split "lunch 250, grab 180 and load 100" into pieces, then glue back any
  // piece without a number ("…with Ana, Ben") onto the one before it.
  const parts: string[] = [];
  for (const piece of input.split(/\s*(;|\n|,(?!\d)|\band then\b|\band\b|\balso\b|\bthen\b)\s*/i)) {
    if (!piece || /^(;|\n|,|and then|and|also|then)$/i.test(piece)) {
      if (piece && parts.length) parts[parts.length - 1] += ` ${piece} `;
      continue;
    }
    if (/\d/.test(piece) || !parts.length) parts.push(piece);
    else parts[parts.length - 1] += piece;
  }
  for (let i = 0; i < parts.length; i++) parts[i] = parts[i].replace(/\s*(,|;|\band\b|\balso\b|\bthen\b)\s*$/i, "").replace(/\s+/g, " ").trim();
  const drafts: Draft[] = [];
  for (const raw of parts) {
    const text = raw.toLowerCase();
    const amt = text.match(/(?:₱|php|p|\$|usd)?\s?(\d[\d,]*(?:\.\d+)?\s?[km]?)\b(?!\s*days?\b)/);
    const amount = amt ? parseAmount(amt[1].replace(/\s/g, "")) : null;
    if (!amount) continue;
    const currency = /\$|usd|dollars?/.test(text) ? "USD" : null;
    const { date, matched } = resolveDate(text, now);

    let type: Draft["type"] = "expense";
    if (/\b(received|receive|got paid|salary|sahod|sweldo|earned|income|sold|refund(ed)?|cashback|allowance)\b/.test(text)) type = "income";
    const debtMention = /\b(credit ?card|cc|card bill|loan)\b/.test(text);
    if (/\b(transfer(red)?|moved?|cash ?in|top ?up|withdr[ae]w|withdrawal|atm)\b/.test(text) || (/\b(paid|pay|payment)\b/.test(text) && debtMention)) type = "transfer";

    let account: AccountRef | null = null;
    let toAccount: AccountRef | null = null;
    if (type === "transfer") {
      const toMatch = text.match(/\bto\s+(.+?)(?:\s+(?:from|yesterday|today|on)\b|$)/);
      const fromMatch = text.match(/\bfrom\s+(.+?)(?:\s+(?:to|yesterday|today|on)\b|$)/);
      toAccount = toMatch ? matchAccount(toMatch[1], accounts) : null;
      if (!toAccount && debtMention) toAccount = accounts.find((a) => a.type === "credit_card" || a.type === "loan") ?? null;
      if (!toAccount && /\bwithdr|atm\b/.test(text)) toAccount = accounts.find((a) => a.type === "cash") ?? null;
      account = fromMatch ? matchAccount(fromMatch[1], accounts, toAccount?.id) : null;
      if (!account) {
        const other = matchAccount(text.replace(toMatch?.[0] ?? "", ""), accounts, toAccount?.id);
        account = other && other.type !== "credit_card" && other.type !== "loan" ? other : null;
      }
      if (!toAccount) type = "expense";
    } else {
      const via = text.match(/\b(?:via|using|with|from|in|on|thru|through)\s+(.+?)$/);
      account = matchAccount(via?.[1] ?? text, accounts);
    }

    const splitMatch = raw.match(/\bsplit\b.*?\bwith\s+(.+?)(?:\s+(?:yesterday|today|on|using|via|last|\d+\s+days?\s+ago)\b|$)/i);
    const splitWith: Draft["splitWith"] = [];
    if (splitMatch && type === "expense") {
      const people = splitMatch[1].split(/\s*(?:,|&|\band\b)\s*/).map((p) => p.trim()).filter((p) => p && !/^\d/.test(p));
      const share = Math.round((amount / (people.length + 1)) * 100) / 100;
      for (const p of people) splitWith.push({ person: p.replace(/^./, (c) => c.toUpperCase()), amount: share });
    }

    // Whatever is left after removing amount, date and filler is the payee.
    let payee = raw;
    if (amt) payee = payee.replace(new RegExp(amt[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    if (matched) payee = payee.replace(new RegExp(matched, "i"), " ");
    if (splitMatch) payee = payee.replace(splitMatch[1], " ");
    payee = payee.replace(
      /\b(paid|pay|spent|bought|for|at|on|to|from|via|using|in|with|thru|through|the|my|a|an|php|pesos?|received|got|split|transfer(red)?)\b/gi,
      " ",
    );
    // Drop words that only identified the account ("…in bdo", "…gcash").
    for (const a of [account, toAccount]) {
      if (!a) continue;
      const words = [...a.name.split(/\s+/), (a.institution ?? "").replace(/-.*$/, "")].filter((w) => w.length > 1);
      for (const w of words) payee = payee.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    }
    payee = payee.replace(/\s+/g, " ").trim();

    drafts.push({
      type,
      amount,
      currency,
      accountName: account?.name ?? null,
      toAccountName: toAccount?.name ?? null,
      categoryName: null,
      date,
      payee: type === "transfer" ? null : payee || null,
      note: raw,
      splitWith,
    });
  }
  return {
    drafts,
    reply: drafts.length
      ? `Got ${drafts.length} transaction${drafts.length > 1 ? "s" : ""}.`
      : "I couldn't find an amount in that. Try something like “lunch 250 gcash” or “paid credit card 5k yesterday”.",
  };
}
