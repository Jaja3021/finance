import "server-only";
import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { db, query, schema } from "@/db";
import { accessibleAccounts } from "./access";
import { accountBalances, DEBT_TYPES } from "./finance";
import { budgetStatus } from "./engagement";
import { createTransaction } from "./transactions";
import { formatMoney, parseAmount, toMinor } from "./money";
import { logoFor } from "./templates";
import { iconText } from "./category-icons";

// The three-tap flow (amount → category → account) shared by phone shortcuts
// and the /quick page. Lists are ordered by how often the user picks them.

type User = { id: string; homeCurrency: string };

export async function quickOptions(userId: string, kind: "expense" | "income" = "expense") {
  const catUse = new Map(
    (await query<{ id: string; n: number }>(`SELECT category_id id, COUNT(*) n FROM transactions WHERE user_id = ? AND type = ? GROUP BY category_id`, [userId, kind])).map((r) => [r.id, r.n]),
  );
  const acctUse = new Map(
    (await query<{ id: string; n: number }>(`SELECT account_id id, COUNT(*) n FROM transactions WHERE user_id = ? AND type = ? GROUP BY account_id`, [userId, kind])).map((r) => [r.id, r.n]),
  );
  const categories = (await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), eq(schema.categories.kind, kind)))
    .all())
    .sort((a, b) => (catUse.get(b.id) ?? 0) - (catUse.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
  const accts = (await accessibleAccounts(userId)).filter((a) => kind === "expense" || !DEBT_TYPES.has(a.type));
  const bal = await accountBalances(accts.map((a) => a.id));
  const accounts = accts
    .sort((a, b) => (acctUse.get(b.id) ?? 0) - (acctUse.get(a.id) ?? 0))
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      type: a.type,
      institution: a.institution,
      color: a.color,
      logo: logoFor(a.institution),
      balance: bal.get(a.id) ?? 0,
    }));
  return { categories, accounts };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Finds an item by id, exact name, or a loose name match ("gcash", "food"). */
function pick<T extends { id: string; name: string }>(items: T[], value: string | undefined | null): T | undefined {
  if (!value) return undefined;
  // norm() drops emoji and punctuation, so "🍜 Food & Dining" matches "food dining".
  const v = norm(value);
  if (!v) return undefined;
  return (
    items.find((i) => i.id === value) ??
    items.find((i) => norm(i.name) === v) ??
    items.find((i) => norm(i.name).startsWith(v)) ??
    items.find((i) => norm(i.name).includes(v) || v.includes(norm(i.name)))
  );
}

export type Receipt = {
  ok: true;
  id: string;
  title: string; // short, for the notification title
  message: string; // one or two lines, for the notification body
  amount: string;
  account: string;
  category: string | null;
  balance: string;
  budget: string | null;
};

export async function quickLog(
  user: User,
  input: { amount: string | number; category?: string | null; account?: string | null; note?: string | null; type?: "expense" | "income"; date?: string | null },
): Promise<Receipt> {
  const type = input.type === "income" ? "income" : "expense";
  const opts = await quickOptions(user.id, type);
  const account = pick(opts.accounts, input.account) ?? (input.account ? undefined : opts.accounts[0]);
  if (!account) throw new Error(input.account ? `No account called “${input.account}”` : "Add an account in the app first");
  const category = pick(opts.categories, input.category);
  if (input.category && !category) throw new Error(`No category called “${input.category}”`);
  const major = typeof input.amount === "number" ? input.amount : parseAmount(String(input.amount));
  if (!major || !(major > 0)) throw new Error("Enter an amount, like 250 or 1.5k");

  const tx = await createTransaction(user.id, {
    accountId: account.id,
    type,
    amount: toMinor(major, account.currency),
    date: input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : format(new Date(), "yyyy-MM-dd"),
    categoryId: category?.id ?? null,
    payee: input.note?.trim() || null,
    note: input.note?.trim() ? null : "Quick log",
  });

  const finalCat = tx.categoryId ? opts.categories.find((c) => c.id === tx.categoryId) : undefined;
  const balance = (await accountBalances([account.id])).get(account.id) ?? 0;
  const isDebt = DEBT_TYPES.has(account.type as never);
  const amountText = formatMoney(tx.amount, account.currency);
  const balanceText = isDebt && balance < 0 ? `${formatMoney(-balance, account.currency)} owed` : formatMoney(balance, account.currency);

  let budgetText: string | null = null;
  if (type === "expense" && tx.categoryId) {
    const b = (await budgetStatus(user.id, user.homeCurrency)).find((x) => x.categoryId === tx.categoryId);
    if (b) {
      budgetText =
        b.ratio >= 1
          ? `⚠ Over ${b.categoryName} budget: ${formatMoney(b.spent, user.homeCurrency)} of ${formatMoney(b.limit, user.homeCurrency)}`
          : `${b.categoryName} budget: ${formatMoney(b.limit - b.spent, user.homeCurrency)} left this month`;
    }
  }

  const catLabel = finalCat ? `${iconText(finalCat.icon)} ${finalCat.name}`.trim() : null;
  const title = type === "expense" ? `−${amountText} from ${account.name}` : `+${amountText} to ${account.name}`;
  const message = [`${catLabel ?? (type === "expense" ? "Expense" : "Income")} · ${account.name} balance ${balanceText}`, budgetText].filter(Boolean).join("\n");
  return {
    ok: true,
    id: tx.id,
    title,
    message,
    amount: amountText,
    account: account.name,
    category: finalCat?.name ?? null,
    balance: balanceText,
    budget: budgetText,
  };
}
