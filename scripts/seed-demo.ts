// Creates a demo account with ~90 days of realistic history.
//   npm run seed:demo        (login: demo@example.com / demo12345)
// Re-running replaces the demo user's data; other users are untouched.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { format, subDays, addDays } from "date-fns";
import { db, schema } from "../src/db";
import type { AccountType } from "../src/db/schema";
import { seedCategories } from "../src/lib/categorize";
import { checkBadges } from "../src/lib/engagement";

const EMAIL = "demo@example.com";
const PASSWORD = "demo12345";

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const rand = rng(42);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

async function main() {
  const old = db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).get();
  if (old) db.delete(schema.users).where(eq(schema.users.id, old.id)).run();

  const user = db
    .insert(schema.users)
    .values({ email: EMAIL, name: "Demo User", homeCurrency: "PHP", passwordHash: await bcrypt.hash(PASSWORD, 10) })
    .returning()
    .get();
  seedCategories(user.id);
  const cats = new Map(db.select().from(schema.categories).where(eq(schema.categories.userId, user.id)).all().map((c) => [c.name, c.id]));

  const acct = (name: string, type: AccountType, currency: string, opening: number, institution: string, color: string, extra = {}) =>
    db.insert(schema.accounts).values({ ownerId: user.id, name, type, currency, openingBalance: opening, institution, color, ...extra }).returning().get();
  const gcash = acct("GCash", "ewallet", "PHP", 350000, "gcash", "#0070e0");
  const bdo = acct("BDO Savings", "bank", "PHP", 8500000, "bdo", "#1a3d8f");
  const usd = acct("BDO Dollar Savings", "bank", "USD", 120000, "bdo-usd", "#1a3d8f");
  const card = acct("BPI Credit Card", "credit_card", "PHP", -1850000, "bpi-cc", "#b11116", { creditLimit: 10000000, interestRate: 36 });
  const cash = acct("Cash Wallet", "cash", "PHP", 250000, "cash", "#4b5563");

  const txs: (typeof schema.transactions.$inferInsert)[] = [];
  const add = (daysAgo: number, t: Omit<typeof schema.transactions.$inferInsert, "userId" | "date" | "createdAt">) => {
    const d = subDays(new Date(), daysAgo);
    const created = new Date(d);
    created.setHours(between(8, 21), between(0, 59));
    // Keep "logged today" false so the demo shows the streak nudge.
    if (daysAgo === 0) return;
    txs.push({ ...t, userId: user.id, date: format(d, "yyyy-MM-dd"), createdAt: created.getTime(), categorySource: "user" });
  };

  const food = ["Jollibee", "Mang Inasal", "Chowking", "Starbucks", "Karinderya", "Grab Food", "McDonald's"];
  for (let day = 90; day >= 0; day--) {
    const d = subDays(new Date(), day);
    // Skip two random days early on so the streak history isn't perfect.
    if (day === 61 || day === 40) continue;
    add(day, { accountId: pick([gcash.id, cash.id]), type: "expense", amount: between(120, 450) * 100, payee: pick(food), categoryId: cats.get("Food & Dining")! });
    if (rand() < 0.6) add(day, { accountId: gcash.id, type: "expense", amount: between(90, 320) * 100, payee: pick(["Grab", "Angkas", "Jeep", "MRT"]), categoryId: cats.get("Transport")! });
    // Food spending creeps up this month so the coach has something to flag.
    if (day < 20 && rand() < 0.5) add(day, { accountId: card.id, type: "expense", amount: between(600, 1400) * 100, payee: pick(["Samgyup place", "Sushi bar", "Grab Food"]), categoryId: cats.get("Food & Dining")! });
    if (d.getDay() === 6) add(day, { accountId: card.id, type: "expense", amount: between(1800, 3500) * 100, payee: pick(["SM Supermarket", "Puregold", "S&R"]), categoryId: cats.get("Groceries")! });
    if (d.getDate() === 15 || d.getDate() === 30) add(day, { accountId: bdo.id, type: "income", amount: 3250000, payee: "Acme Corp payroll", categoryId: cats.get("Salary")! });
    if (d.getDate() === 5) add(day, { accountId: card.id, type: "expense", amount: 54900, payee: "Netflix", categoryId: cats.get("Subscriptions")! });
    if (d.getDate() === 8) add(day, { accountId: card.id, type: "expense", amount: 14900, payee: "Spotify", categoryId: cats.get("Subscriptions")! });
    if (d.getDate() === 12) add(day, { accountId: bdo.id, type: "expense", amount: between(2300, 2700) * 100, payee: "Meralco", categoryId: cats.get("Bills & Utilities")! });
    if (d.getDate() === 1) add(day, { accountId: bdo.id, type: "expense", amount: 1500000, payee: "Rent", categoryId: cats.get("Housing")! });
    if (d.getDate() === 18) add(day, { accountId: bdo.id, type: "transfer", amount: 1200000, toAccountId: card.id, toAmount: 1200000, note: "Card payment" });
    if (d.getDate() === 10 || d.getDate() === 25) add(day, { accountId: bdo.id, type: "transfer", amount: 600000, toAccountId: cash.id, toAmount: 600000, note: "ATM withdrawal" });
    if (d.getDate() === 3 || d.getDate() === 20) add(day, { accountId: bdo.id, type: "transfer", amount: 500000, toAccountId: gcash.id, toAmount: 500000, note: "Cash in" });
    if (rand() < 0.12) add(day, { accountId: pick([card.id, gcash.id]), type: "expense", amount: between(400, 2500) * 100, payee: pick(["Shopee", "Lazada", "Uniqlo"]), categoryId: cats.get("Shopping")! });
  }
  db.insert(schema.transactions).values(txs).run();

  // A split dinner someone still owes.
  const dinner = db
    .insert(schema.transactions)
    .values({ userId: user.id, accountId: card.id, type: "expense", amount: 360000, payee: "Birthday dinner", categoryId: cats.get("Food & Dining")!, date: format(subDays(new Date(), 3), "yyyy-MM-dd"), createdAt: subDays(new Date(), 3).getTime() })
    .returning()
    .get();
  db.insert(schema.splits).values([
    { transactionId: dinner.id, person: "Ana", amount: 120000 },
    { transactionId: dinner.id, person: "Ben", amount: 120000 },
  ]).run();

  db.insert(schema.budgets).values([
    { userId: user.id, categoryId: cats.get("Food & Dining")!, monthlyLimit: 1200000 },
    { userId: user.id, categoryId: cats.get("Transport")!, monthlyLimit: 500000 },
    { userId: user.id, categoryId: cats.get("Groceries")!, monthlyLimit: 1500000 },
    { userId: user.id, categoryId: cats.get("Shopping")!, monthlyLimit: 300000 },
  ]).run();

  // Netflix is tracked; Spotify and Meralco are left for recurring detection to find.
  db.insert(schema.bills).values({
    userId: user.id,
    accountId: card.id,
    categoryId: cats.get("Subscriptions")!,
    name: "Netflix",
    amount: 54900,
    currency: "PHP",
    frequency: "monthly",
    nextDue: format(addDays(new Date(), 2), "yyyy-MM-dd"),
    matchKey: "netflix|PHP",
  }).run();

  db.insert(schema.holdings).values([
    { userId: user.id, kind: "stock", symbol: "AAPL", name: "Apple Inc.", quantity: 5 },
    { userId: user.id, kind: "stock", symbol: "VOO", name: "Vanguard S&P 500 ETF", quantity: 3 },
    { userId: user.id, kind: "crypto", symbol: "bitcoin", name: "Bitcoin", quantity: 0.015 },
    { userId: user.id, kind: "crypto", symbol: "ethereum", name: "Ethereum", quantity: 0.4 },
  ]).run();

  checkBadges(user.id);
  console.log(`Demo ready: ${EMAIL} / ${PASSWORD} (${txs.length + 1} transactions, accounts: ${[gcash, bdo, usd, card, cash].map((a) => a.name).join(", ")})`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
