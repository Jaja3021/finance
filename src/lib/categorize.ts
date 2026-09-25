import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense"; icon: string }[] = [
  { name: "Food & Dining", kind: "expense", icon: "🍜" },
  { name: "Groceries", kind: "expense", icon: "🛒" },
  { name: "Transport", kind: "expense", icon: "🚌" },
  { name: "Bills & Utilities", kind: "expense", icon: "💡" },
  { name: "Subscriptions", kind: "expense", icon: "🔁" },
  { name: "Housing", kind: "expense", icon: "🏠" },
  { name: "Shopping", kind: "expense", icon: "🛍️" },
  { name: "Health", kind: "expense", icon: "💊" },
  { name: "Education", kind: "expense", icon: "📚" },
  { name: "Entertainment", kind: "expense", icon: "🎬" },
  { name: "Travel", kind: "expense", icon: "✈️" },
  { name: "Personal Care", kind: "expense", icon: "💇" },
  { name: "Family & Gifts", kind: "expense", icon: "🎁" },
  { name: "Fees & Interest", kind: "expense", icon: "🏦" },
  { name: "Other", kind: "expense", icon: "📦" },
  { name: "Salary", kind: "income", icon: "💼" },
  { name: "Business", kind: "income", icon: "🏪" },
  { name: "Freelance", kind: "income", icon: "💻" },
  { name: "Interest & Dividends", kind: "income", icon: "📈" },
  { name: "Gifts Received", kind: "income", icon: "🎉" },
  { name: "Refunds", kind: "income", icon: "↩️" },
  { name: "Other Income", kind: "income", icon: "💰" },
];

export async function seedCategories(userId: string) {
  await db.insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })))
    .onConflictDoNothing()
    .run();
}

// Cold-start hints, used only until the user has history for a merchant.
const KEYWORDS: [RegExp, string][] = [
  [/\b(jollibee|mcdo|mcdonald|kfc|chowking|mang inasal|starbucks|coffee|cafe|resto|restaurant|lunch|dinner|breakfast|merienda|food ?panda|grab ?food|pizza|burger|milk ?tea)\b/, "Food & Dining"],
  [/\b(sm ?market|puregold|robinsons supermarket|s&r|landers|savemore|grocery|groceries|palengke|market|7-?eleven|alfamart|ministop)\b/, "Groceries"],
  [/\b(grab|angkas|joyride|uber|taxi|jeep|jeepney|bus|mrt|lrt|train|gas|gasoline|petron|shell|caltex|fuel|toll|parking|beep)\b/, "Transport"],
  [/\b(meralco|maynilad|manila water|electric|electricity|water bill|pldt|globe|smart|converge|internet|wifi|load|postpaid|phone bill)\b/, "Bills & Utilities"],
  [/\b(netflix|spotify|youtube premium|disney|hbo|apple ?music|icloud|google one|chatgpt|claude|prime video|viu|subscription)\b/, "Subscriptions"],
  [/\b(rent|condo|apartment|dues|association|mortgage)\b/, "Housing"],
  [/\b(shopee|lazada|zalora|uniqlo|mall|clothes|shoes|amazon)\b/, "Shopping"],
  [/\b(mercury|watsons|pharmacy|medicine|doctor|hospital|clinic|dental|checkup|philhealth)\b/, "Health"],
  [/\b(tuition|school|books?|course|udemy|seminar)\b/, "Education"],
  [/\b(cinema|movie|concert|games?|steam|playstation|netflix)\b/, "Entertainment"],
  [/\b(hotel|airbnb|cebu pacific|pal|philippine airlines|airasia|flight|agoda|booking)\b/, "Travel"],
  [/\b(salon|barber|haircut|spa|massage)\b/, "Personal Care"],
  [/\b(gift|birthday|donation|church|padala)\b/, "Family & Gifts"],
  [/\b(fee|charge|interest|penalty|annual fee)\b/, "Fees & Interest"],
  [/\b(salary|payroll|sweldo|13th month)\b/, "Salary"],
  [/\b(dividend|interest income|interest earned)\b/, "Interest & Dividends"],
  [/\b(refund|cashback|rebate)\b/, "Refunds"],
  [/\b(freelance|upwork|fiverr|client)\b/, "Freelance"],
];

/** "GRAB*RIDE 1234 Makati" → "grab ride makati". Used to group merchants. */
export function normalizeKey(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z\s&]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4)
    .join(" ");
}

export type Suggestion = { categoryId: string; confidence: number; reason: string } | null;

/**
 * Suggests a category from the user's own history first (their corrections
 * count triple), then falls back to built-in keyword hints.
 */
export async function suggestCategory(
  userId: string,
  text: string,
  kind: "income" | "expense",
): Promise<Suggestion> {
  const key = normalizeKey(text);
  if (!key) return null;
  const cats = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), eq(schema.categories.kind, kind)))
    .all();
  const catIds = new Set(cats.map((c) => c.id));

  const history = await db
    .select({
      payee: schema.transactions.payee,
      note: schema.transactions.note,
      categoryId: schema.transactions.categoryId,
      source: schema.transactions.categorySource,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), isNotNull(schema.transactions.categoryId)))
    .orderBy(desc(schema.transactions.createdAt))
    .limit(3000)
    .all();

  const words = new Set(key.split(" "));
  const exact = new Map<string, number>();
  const partial = new Map<string, number>();
  for (const h of history) {
    if (!h.categoryId || !catIds.has(h.categoryId)) continue;
    const w = h.source === "user" ? 3 : 1;
    const hk = normalizeKey(h.payee || h.note);
    if (!hk) continue;
    if (hk === key) exact.set(h.categoryId, (exact.get(h.categoryId) ?? 0) + w);
    else {
      const overlap = hk.split(" ").filter((x) => words.has(x) && x.length > 2).length;
      if (overlap) partial.set(h.categoryId, (partial.get(h.categoryId) ?? 0) + w * overlap);
    }
  }
  const best = (m: Map<string, number>) => {
    let top: [string, number] | null = null;
    let total = 0;
    for (const e of m) {
      total += e[1];
      if (!top || e[1] > top[1]) top = e;
    }
    return top ? { id: top[0], share: top[1] / total, votes: top[1] } : null;
  };
  const e = best(exact);
  if (e) return { categoryId: e.id, confidence: Math.min(0.99, 0.6 + 0.4 * e.share), reason: "Matches your past entries" };
  const p = best(partial);
  if (p && p.votes >= 2) return { categoryId: p.id, confidence: 0.5 * p.share, reason: "Similar to past entries" };

  for (const [re, name] of KEYWORDS) {
    if (re.test(key)) {
      const c = cats.find((c) => c.name === name);
      if (c) return { categoryId: c.id, confidence: 0.4, reason: "Keyword match" };
    }
  }
  return null;
}
