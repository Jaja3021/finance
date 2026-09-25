import "server-only";
import { and, desc, eq, gte, inArray, lte, or, like } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TxType } from "@/db/schema";
import { accessibleAccounts, assertAccountAccess } from "./access";
import { suggestCategory } from "./categorize";
import { matchBillPayment } from "./recurring";
import { checkBadges, generateNotifications } from "./engagement";
import { convertMinor, ensureRates } from "./fx";

export type NewTransaction = {
  accountId: string;
  type: TxType;
  amount: number; // minor units, positive, in the source account's currency
  date: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  toAccountId?: string | null;
  toAmount?: number | null;
  billId?: string | null;
  categorySource?: "user" | "auto" | "ai";
  splits?: { person: string; amount: number }[];
};

export async function createTransaction(userId: string, input: NewTransaction) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Amount must be positive");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Invalid date");
  const acct = await assertAccountAccess(userId, input.accountId);

  let toAmount: number | null = null;
  if (input.type === "transfer") {
    if (!input.toAccountId || input.toAccountId === input.accountId) throw new Error("Pick a different destination account");
    const dest = await assertAccountAccess(userId, input.toAccountId);
    toAmount = input.toAmount ?? null;
    if (toAmount === null) {
      await ensureRates([acct.currency], dest.currency);
      toAmount = convertMinor(input.amount, acct.currency, dest.currency, input.date);
      if (toAmount === null) throw new Error(`No ${acct.currency}→${dest.currency} rate; enter the received amount`);
    }
  }

  let categoryId = input.type === "transfer" ? null : (input.categoryId ?? null);
  let categorySource = input.categorySource ?? "user";
  if (categoryId) {
    const ok = await db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.userId, userId)))
      .get();
    if (!ok) categoryId = null;
  }
  if (!categoryId && input.type !== "transfer") {
    const s = await suggestCategory(userId, input.payee || input.note || "", input.type);
    if (s) {
      categoryId = s.categoryId;
      categorySource = "auto";
    }
  }

  const splits = (input.splits ?? []).filter((s) => s.person.trim() && s.amount > 0);
  if (splits.length && input.type !== "expense") throw new Error("Only expenses can be split");
  if (splits.reduce((a, s) => a + s.amount, 0) > input.amount) throw new Error("Split shares exceed the total");

  let billId = input.billId ?? null;
  const tx = await db.transaction(async (trx) => {
    const row = await trx
      .insert(schema.transactions)
      .values({
        userId,
        accountId: input.accountId,
        type: input.type,
        amount: input.amount,
        toAccountId: input.type === "transfer" ? input.toAccountId! : null,
        toAmount,
        categoryId,
        categorySource,
        date: input.date,
        payee: input.payee?.trim() || null,
        note: input.note?.trim() || null,
        billId,
      })
      .returning()
      .get();
    if (splits.length) {
      await trx.insert(schema.splits)
        .values(splits.map((s) => ({ transactionId: row.id, person: s.person.trim(), amount: s.amount })))
        .run();
    }
    return row;
  });

  if (input.type === "expense" && !billId) {
    billId = await matchBillPayment(userId, { ...tx, currency: acct.currency });
    if (billId) await db.update(schema.transactions).set({ billId }).where(eq(schema.transactions.id, tx.id)).run();
  }

  await checkBadges(userId);
  await generateNotifications(userId);
  return tx;
}

export type TxFilter = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
  limit?: number;
};

export async function listTransactions(userId: string, f: TxFilter = {}) {
  const accts = await accessibleAccounts(userId, true);
  if (!accts.length) return [];
  const ids = accts.map((a) => a.id);
  const t = schema.transactions;
  const conds = [or(inArray(t.accountId, ids), inArray(t.toAccountId, ids))];
  if (f.from) conds.push(gte(t.date, f.from));
  if (f.to) conds.push(lte(t.date, f.to));
  if (f.accountId) conds.push(or(eq(t.accountId, f.accountId), eq(t.toAccountId, f.accountId)));
  if (f.categoryId) conds.push(eq(t.categoryId, f.categoryId));
  if (f.q) conds.push(or(like(t.payee, `%${f.q}%`), like(t.note, `%${f.q}%`)));
  const rows = await db
    .select({
      tx: t,
      category: schema.categories,
      loggedBy: schema.users.name,
    })
    .from(t)
    .leftJoin(schema.categories, eq(schema.categories.id, t.categoryId))
    .leftJoin(schema.users, eq(schema.users.id, t.userId))
    .where(and(...conds))
    .orderBy(desc(t.date), desc(t.createdAt))
    .limit(f.limit ?? 500)
    .all();
  const txIds = rows.map((r) => r.tx.id);
  const splitRows = txIds.length
    ? await db.select().from(schema.splits).where(inArray(schema.splits.transactionId, txIds)).all()
    : [];
  const acctById = new Map(accts.map((a) => [a.id, a]));
  return rows.map((r) => ({
    ...r.tx,
    category: r.category,
    loggedBy: r.loggedBy,
    account: acctById.get(r.tx.accountId)!,
    toAccount: r.tx.toAccountId ? acctById.get(r.tx.toAccountId) ?? null : null,
    splits: splitRows.filter((s) => s.transactionId === r.tx.id),
  }));
}

export type TxRow = Awaited<ReturnType<typeof listTransactions>>[number];
