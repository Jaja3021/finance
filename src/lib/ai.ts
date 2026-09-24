import "server-only";
import { GoogleGenAI, ApiError, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { format, startOfMonth, subMonths, endOfMonth, getDate, getDaysInMonth } from "date-fns";
import { db, sqlite, schema } from "@/db";
import { accessibleAccounts } from "./access";
import { parseRuleBased, matchAccount, type Draft } from "./nlp";
import { budgetStatus, spendingByCategory } from "./engagement";
import { formatMoney, toMajor } from "./money";
import { convertMinor, ensureRates } from "./fx";

// Google Gemini. The "-latest" alias follows Google's current Flash model;
// set GEMINI_MODEL to pin a specific one. When a model is overloaded or
// rate-limited, the next one in the list is tried.
const MODELS = [...new Set([process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"])];
const RETRYABLE = new Set([429, 500, 503, 504]);

export function aiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

let client: GoogleGenAI | null = null;
const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const describeError = (err: unknown) => (err instanceof ApiError ? `${err.status} ${err.message}` : err);

/** Runs a JSON-schema-constrained request; returns null if the reply is blocked or doesn't validate. */
async function structured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  user: string;
  effort: "low" | "medium" | "high";
  /** Total time for all attempts; past it the caller falls back to rules. */
  timeoutMs: number;
}): Promise<z.infer<T> | null> {
  const deadline = Date.now() + opts.timeoutMs;
  for (let i = 0; ; i++) {
    try {
      return await structuredOnce(MODELS[i], opts, AbortSignal.timeout(Math.max(1000, deadline - Date.now())));
    } catch (err) {
      if (!(err instanceof ApiError && RETRYABLE.has(err.status)) || i === MODELS.length - 1 || Date.now() >= deadline) throw err;
      console.warn(`[ai] ${MODELS[i]} unavailable (${err.status}), trying ${MODELS[i + 1]}`);
    }
  }
}

async function structuredOnce<T extends z.ZodType>(
  model: string,
  opts: { schema: T; system: string; user: string; effort: "low" | "medium" | "high" },
  signal: AbortSignal,
): Promise<z.infer<T> | null> {
  const res = await gemini().models.generateContent({
    model,
    contents: opts.user,
    config: {
      abortSignal: signal,
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(opts.schema),
      // Thinking levels exist on Gemini 3+; older models pick their own.
      ...(/gemini-(1|2)\./.test(model)
        ? {}
        : { thinkingConfig: { thinkingLevel: opts.effort === "low" ? ThinkingLevel.LOW : ThinkingLevel.HIGH } }),
    },
  });
  const text = res.text;
  if (!text) return null;
  const parsed = opts.schema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

// ------------------------------------------------------------ chat parsing

const DraftSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().describe("Positive amount in major units. '5k' = 5000."),
  currency: z.string().nullable().describe("ISO code only if the user said a currency, else null"),
  accountName: z.string().nullable().describe("Exact name from the account list, or null if unclear"),
  toAccountName: z.string().nullable().describe("Transfers only: destination account name from the list"),
  categoryName: z.string().nullable().describe("Exact name from the category list, or null"),
  date: z.string().describe("YYYY-MM-DD"),
  payee: z.string().nullable().describe("Merchant or person, short, e.g. 'Jollibee'"),
  note: z.string().nullable(),
  splitWith: z.array(z.object({ person: z.string(), amount: z.number() })),
});
const ParseSchema = z.object({
  transactions: z.array(DraftSchema),
  reply: z.string().describe("One short sentence confirming what was recorded, or asking what's missing"),
});

export type ParseContext = {
  userId: string;
  homeCurrency: string;
};

const PARSE_SYSTEM = `You turn short messages about money into transaction records for a personal finance app.

Rules:
- One record per money movement. "lunch 250 and grab 180" is two records.
- Paying a credit card or loan from another account is a "transfer" to that card/loan account, not an expense.
- Moving money between the user's own accounts, cash-ins, top-ups and ATM withdrawals are transfers.
- Salary, refunds, cashback, money received are "income".
- "5k" = 5000, "1.2m" = 1200000. Amounts are always positive.
- Resolve relative dates ("yesterday", "last Friday") against today's date given below.
- Use account and category names exactly as listed. If the account isn't mentioned, use null and the app will pick the usual one.
- For "split with X and Y", record the full amount and put each other person's share in splitWith (equal split unless stated).
- If the message has no amount or isn't about a transaction, return an empty list and use reply to ask briefly.
- Messages may mix English and Filipino/Taglish.`;

export async function parseMessage(ctx: ParseContext, text: string): Promise<{ drafts: Draft[]; reply: string; engine: "ai" | "rules" }> {
  const accounts = accessibleAccounts(ctx.userId);
  if (!aiEnabled()) return { ...parseRuleBased(text, accounts), engine: "rules" };

  const categories = db.select().from(schema.categories).where(eq(schema.categories.userId, ctx.userId)).all();
  const context = [
    `Today: ${format(new Date(), "yyyy-MM-dd (EEEE)")}`,
    `Home currency: ${ctx.homeCurrency}`,
    `Accounts:\n${accounts.map((a) => `- ${a.name} (${a.type}, ${a.currency})`).join("\n")}`,
    `Expense categories: ${categories.filter((c) => c.kind === "expense").map((c) => c.name).join(", ")}`,
    `Income categories: ${categories.filter((c) => c.kind === "income").map((c) => c.name).join(", ")}`,
  ].join("\n\n");

  try {
    const out = await structured({
      schema: ParseSchema,
      system: PARSE_SYSTEM,
      user: `${context}\n\nMessage:\n${text}`,
      effort: "low",
      timeoutMs: 20_000,
    });
    if (out) return { drafts: out.transactions, reply: out.reply, engine: "ai" };
  } catch (err) {
    console.warn("[ai] parse failed, using rules:", describeError(err));
  }
  return { ...parseRuleBased(text, accounts), engine: "rules" };
}

/** The account the user logs to most for a given type, as a default. */
export function usualAccount(userId: string, type: Draft["type"]) {
  const accts = accessibleAccounts(userId);
  const counts = sqlite
    .prepare(`SELECT account_id, COUNT(*) n FROM transactions WHERE user_id = ? AND type = ? GROUP BY account_id ORDER BY n DESC`)
    .all(userId, type) as { account_id: string; n: number }[];
  for (const c of counts) {
    const a = accts.find((x) => x.id === c.account_id);
    if (a && (type !== "transfer" || (a.type !== "credit_card" && a.type !== "loan"))) return a;
  }
  return accts.find((a) => a.type === "ewallet" || a.type === "cash" || a.type === "bank") ?? accts[0] ?? null;
}

export function resolveAccount(userId: string, name: string | null, fallbackType: Draft["type"], exclude?: string) {
  const accts = accessibleAccounts(userId);
  if (name) {
    const exact = accts.find((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== exclude);
    if (exact) return exact;
    const fuzzy = matchAccount(name, accts, exclude);
    if (fuzzy) return fuzzy;
  }
  const usual = usualAccount(userId, fallbackType);
  return usual && usual.id !== exclude ? usual : accts.find((a) => a.id !== exclude) ?? null;
}

// ------------------------------------------------------------------ coach

const TipSchema = z.object({
  tips: z
    .array(
      z.object({
        title: z.string().describe("Under 60 characters"),
        body: z.string().describe("One or two sentences with specific numbers from the data"),
        category: z.string().nullable().describe("Spending category the tip is about, if any"),
      }),
    )
    .describe("2 to 4 tips, most useful first"),
});

export type CoachTip = { title: string; body: string; category: string | null };

type CategoryTrend = {
  category: string;
  thisMonth: number;
  projected: number;
  avgPrev3: number;
  change: number | null;
  months: number[];
};

/** Numbers the coach reasons over. Also drives the rule-based tips. */
export async function coachFeatures(userId: string, home: string) {
  const now = new Date();
  const cats = db.select().from(schema.categories).where(eq(schema.categories.userId, userId)).all();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const monthly: Map<string | null, number>[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(now, i);
    monthly.push(
      await spendingByCategory(userId, home, format(startOfMonth(m), "yyyy-MM-dd"), format(i === 0 ? now : endOfMonth(m), "yyyy-MM-dd")),
    );
  }
  const dayFrac = getDate(now) / getDaysInMonth(now);
  const catIds = new Set(monthly.flatMap((m) => [...m.keys()]));
  const trends: CategoryTrend[] = [...catIds].map((id) => {
    const series = monthly.map((m) => m.get(id) ?? 0);
    const thisMonth = series[5];
    const projected = dayFrac > 0.15 ? Math.round(thisMonth / dayFrac) : thisMonth;
    const prev = series.slice(2, 5).filter((v) => v > 0);
    const avgPrev3 = prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : 0;
    return {
      category: id ? catName.get(id) ?? "Uncategorized" : "Uncategorized",
      thisMonth,
      projected,
      avgPrev3,
      change: avgPrev3 > 0 ? projected / avgPrev3 - 1 : null,
      months: series,
    };
  });

  const firstTx = sqlite.prepare(`SELECT MIN(created_at) m, COUNT(*) n FROM transactions WHERE user_id = ?`).get(userId) as { m: number | null; n: number };
  const daysOfData = firstTx.m ? Math.ceil((Date.now() - firstTx.m) / 86_400_000) : 0;
  const incomeTx = sqlite
    .prepare(
      `SELECT substr(t.date,1,7) ym, t.date, t.amount, a.currency FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = ? AND t.type='income' AND t.date >= ?`,
    )
    .all(userId, format(startOfMonth(subMonths(now, 3)), "yyyy-MM-dd")) as { ym: string; date: string; amount: number; currency: string }[];
  await ensureRates(incomeTx.map((r) => r.currency), home);
  const incomeByMonth: Record<string, number> = {};
  for (const r of incomeTx) incomeByMonth[r.ym] = (incomeByMonth[r.ym] ?? 0) + (convertMinor(r.amount, r.currency, home, r.date) ?? 0);
  const topPayees = sqlite
    .prepare(
      `SELECT lower(payee) p, COUNT(*) n FROM transactions WHERE user_id = ? AND type='expense' AND payee IS NOT NULL AND date >= ? GROUP BY p ORDER BY n DESC LIMIT 8`,
    )
    .all(userId, format(subMonths(now, 1), "yyyy-MM-dd")) as { p: string; n: number }[];

  return {
    home,
    daysOfData,
    transactionCount: firstTx.n,
    dayOfMonth: getDate(now),
    daysInMonth: getDaysInMonth(now),
    trends: trends.filter((t) => t.thisMonth > 0 || t.avgPrev3 > 0).sort((a, b) => b.projected - a.projected),
    budgets: await budgetStatus(userId, home),
    incomeByMonth,
    topPayees,
  };
}

type Features = Awaited<ReturnType<typeof coachFeatures>>;

/** Deterministic tips; used without an API key and as a safety net. */
export function ruleTips(f: Features): CoachTip[] {
  const m = (v: number) => formatMoney(v, f.home);
  const tips: CoachTip[] = [];
  if (f.daysOfData < 7 || f.transactionCount < 10) {
    tips.push({
      title: "Log for a week to unlock real insights",
      body: `You have ${f.transactionCount} transaction${f.transactionCount === 1 ? "" : "s"} so far. After about a week of daily logging, tips will be based on your own spending patterns instead of general advice.`,
      category: null,
    });
  }
  const rising = f.trends
    .filter((t) => t.change !== null && t.change > 0.25 && t.projected - t.avgPrev3 > 0 && f.dayOfMonth >= 5)
    .sort((a, b) => b.projected - b.avgPrev3 - (a.projected - a.avgPrev3));
  const daysLeft = f.daysInMonth - f.dayOfMonth + 1;
  const whole = (v: number) => Math.round(v / 100) * 100;
  for (const t of rising.slice(0, 2)) {
    const room = t.avgPrev3 - t.thisMonth;
    const advice =
      room > 0
        ? `Keeping it under ${m(whole(room / daysLeft))} a day for the last ${daysLeft} days keeps you at your usual.`
        : `You've already passed your usual ${m(whole(t.avgPrev3))}. A cap of about ${m(whole((t.avgPrev3 / f.daysInMonth) * 0.8))} a day for the last ${daysLeft} days limits the overshoot.`;
    tips.push({
      title: `${t.category} is up ${Math.round(t.change! * 100)}%`,
      body: `At this pace you'll spend ${m(whole(t.projected))} on ${t.category} this month vs your usual ${m(whole(t.avgPrev3))}. ${advice}`,
      category: t.category,
    });
  }
  for (const b of f.budgets.filter((b) => b.ratio >= 0.9).slice(0, 1)) {
    tips.push({
      title: b.ratio >= 1 ? `${b.categoryName} is over budget` : `${b.categoryName} budget almost used`,
      body: `${m(b.spent)} of ${m(b.limit)} spent with ${daysLeft} days to go. Consider moving a little from a category with room left, or raising this budget by ${m(Math.round(Math.max(b.spent - b.limit, b.limit * 0.1)))} if it's consistently tight.`,
      category: b.categoryName,
    });
  }
  const under = f.budgets.filter((b) => b.ratio < 0.5 && f.dayOfMonth > 20);
  if (under.length) {
    const b = under[0];
    tips.push({
      title: `Room to trim the ${b.categoryName} budget`,
      body: `You've used ${Math.round(b.ratio * 100)}% of it this late in the month. Lowering it by ${m(Math.round((b.limit - b.spent) / 2))} would free that money for savings.`,
      category: b.categoryName,
    });
  }
  if (!f.budgets.length && f.trends.length) {
    const top = f.trends[0];
    tips.push({
      title: `Set a budget for ${top.category}`,
      body: `It's your biggest category (${m(top.projected)} projected this month). A limit around ${m(Math.round((top.avgPrev3 || top.projected) * 0.9))} is 10% under your usual.`,
      category: top.category,
    });
  }
  return tips.slice(0, 4);
}

const COACH_SYSTEM = `You are a friendly, practical personal finance coach inside a budgeting app.
Write short, specific tips grounded only in the numbers provided. Mention actual amounts and categories.
Prefer small, realistic adjustments (e.g. trimming a budget 10%, a weekly cap) over big lifestyle changes.
Match depth to how much data exists: with little history, focus on building the logging habit and early observations; with months of history, compare against the user's own baselines and spot trends.
Don't repeat tips the user marked unhelpful; lean toward the kinds they found helpful. Don't repeat recent tips verbatim.
All amounts are in the stated home currency; write them formatted with its symbol, e.g. ₱1,250.`;

export async function generateCoachTips(userId: string, home: string): Promise<{ tips: CoachTip[]; source: "ai" | "rules" }> {
  const f = await coachFeatures(userId, home);
  const rules = ruleTips(f);
  if (!aiEnabled() || f.transactionCount < 3) return { tips: rules, source: "rules" };

  const history = db
    .select()
    .from(schema.coachTips)
    .where(eq(schema.coachTips.userId, userId))
    .orderBy(desc(schema.coachTips.createdAt))
    .limit(30)
    .all();
  const liked = history.filter((h) => h.feedback === "helpful").map((h) => `- ${h.title}`);
  const disliked = history.filter((h) => h.feedback === "not_helpful").map((h) => `- ${h.title}`);
  const recent = history.slice(0, 8).map((h) => `- ${h.title}`);

  const M = (v: number) => toMajor(v, home);
  const payload = {
    homeCurrency: home,
    historyDays: f.daysOfData,
    transactionCount: f.transactionCount,
    today: `day ${f.dayOfMonth} of ${f.daysInMonth}`,
    categoryTrends: f.trends.slice(0, 12).map((t) => ({
      category: t.category,
      last6Months: t.months.map(M),
      thisMonthSoFar: M(t.thisMonth),
      projectedThisMonth: M(t.projected),
      avgPrev3Months: M(t.avgPrev3),
    })),
    budgets: f.budgets.map((b) => ({ category: b.categoryName, limit: M(b.limit), spent: M(b.spent) })),
    incomeByMonth: Object.fromEntries(Object.entries(f.incomeByMonth).map(([k, v]) => [k, M(v)])),
    topPayeesLast30Days: f.topPayees.map((p) => ({ payee: p.p, count: p.n })),
    ruleBasedObservations: rules.map((r) => r.title),
  };

  try {
    const out = await structured({
      schema: TipSchema,
      system: COACH_SYSTEM,
      user: [
        `Spending data:\n${JSON.stringify(payload)}`,
        liked.length ? `Tips the user found helpful:\n${liked.join("\n")}` : "",
        disliked.length ? `Tips the user found unhelpful:\n${disliked.join("\n")}` : "",
        recent.length ? `Recent tips (avoid repeating):\n${recent.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      effort: "medium",
      timeoutMs: 12_000,
    });
    if (out?.tips.length) return { tips: out.tips.slice(0, 4), source: "ai" };
  } catch (err) {
    console.warn("[ai] coach failed, using rules:", describeError(err));
  }
  return { tips: rules, source: "rules" };
}

/** Latest saved tips, regenerating at most once a day unless forced. */
export async function currentTips(userId: string, home: string, force = false) {
  const latest = db
    .select()
    .from(schema.coachTips)
    .where(eq(schema.coachTips.userId, userId))
    .orderBy(desc(schema.coachTips.createdAt))
    .limit(1)
    .get();
  const fresh = latest && Date.now() - latest.createdAt < 24 * 60 * 60 * 1000;
  if (!force && fresh) {
    return db
      .select()
      .from(schema.coachTips)
      .where(and(eq(schema.coachTips.userId, userId), eq(schema.coachTips.createdAt, latest.createdAt)))
      .all();
  }
  const { tips, source } = await generateCoachTips(userId, home);
  const at = Date.now();
  if (!tips.length) return [];
  return db
    .insert(schema.coachTips)
    .values(tips.map((t) => ({ userId, ...t, source, createdAt: at })))
    .returning()
    .all();
}
