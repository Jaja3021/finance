"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ACCOUNT_TYPES, BILL_FREQUENCIES, type AccountType } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accessibleAccounts, assertAccountAccess, householdIdsFor } from "@/lib/access";
import { createTransaction } from "@/lib/transactions";
import { parseAmount, toMinor } from "@/lib/money";
import { ACCOUNT_TEMPLATES } from "@/lib/templates";
import { checkBadges, generateNotifications } from "@/lib/engagement";
import { suggestCategory, normalizeKey } from "@/lib/categorize";
import { currentTips } from "@/lib/ai";
import type { FormState } from "./auth";
import { ICON_KEYS } from "@/lib/category-icons";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const DEBT = new Set<AccountType>(["credit_card", "loan"]);

function amountFrom(f: FormData, key: string, currency: string): number | null {
  const n = parseAmount(str(f, key));
  return n === null ? null : toMinor(n, currency);
}

function refresh() {
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ accounts

export async function addAccount(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const template = ACCOUNT_TEMPLATES.find((t) => t.key === str(f, "template"));
  const type = (str(f, "type") || template?.type) as AccountType;
  if (!ACCOUNT_TYPES.includes(type)) return { error: "Pick an account type" };
  const name = str(f, "name") || template?.name;
  if (!name) return { error: "Give the account a name" };
  const currency = (str(f, "currency") || template?.currency || user.homeCurrency).toUpperCase();
  // For cards and loans the user enters what they owe; store it as negative.
  const raw = str(f, "balance") ? amountFrom(f, "balance", currency) : 0;
  if (raw === null) return { error: "Balance must be a number" };
  const opening = DEBT.has(type) ? -Math.abs(raw) : raw;
  const limit = str(f, "creditLimit") ? amountFrom(f, "creditLimit", currency) : null;
  const rate = str(f, "interestRate") ? Number(str(f, "interestRate")) : null;

  // Adding an account you already have tops up the existing one instead of creating a duplicate.
  const existing = (await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.ownerId, user.id), eq(schema.accounts.archived, false), eq(schema.accounts.type, type), eq(schema.accounts.currency, currency)))
    .all())
    .find((a) => (template ? a.institution === template.key : !a.institution && a.name.trim().toLowerCase() === name.trim().toLowerCase()));
  if (existing) {
    await db.update(schema.accounts)
      .set({
        openingBalance: existing.openingBalance + opening,
        creditLimit: existing.creditLimit ?? limit,
        interestRate: existing.interestRate ?? (rate !== null && Number.isFinite(rate) ? rate : null),
      })
      .where(eq(schema.accounts.id, existing.id))
      .run();
    refresh();
    return { ok: opening ? `Added to your existing ${existing.name}` : `You already have ${existing.name}` };
  }

  await db.insert(schema.accounts)
    .values({
      ownerId: user.id,
      name,
      type,
      currency,
      institution: template?.key ?? null,
      color: template?.color ?? null,
      openingBalance: opening,
      creditLimit: limit,
      interestRate: rate !== null && Number.isFinite(rate) ? rate : null,
    })
    .run();
  refresh();
  return { ok: `${name} added` };
}

export async function updateAccount(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(f, "id");
  const acct = await db.select().from(schema.accounts).where(and(eq(schema.accounts.id, id), eq(schema.accounts.ownerId, user.id))).get();
  if (!acct) return { error: "Only the owner can edit this account" };
  const raw = amountFrom(f, "balance", acct.currency) ?? (str(f, "balance") === "0" ? 0 : null);
  const householdId = str(f, "householdId") || null;
  if (householdId && !(await householdIdsFor(user.id)).includes(householdId)) return { error: "Not a member of that household" };
  const rate = str(f, "interestRate") ? Number(str(f, "interestRate")) : null;
  await db.update(schema.accounts)
    .set({
      name: str(f, "name") || acct.name,
      openingBalance: raw === null ? acct.openingBalance : DEBT.has(acct.type) ? -Math.abs(raw) : raw,
      householdId,
      interestRate: rate !== null && Number.isFinite(rate) ? rate : acct.interestRate,
    })
    .where(eq(schema.accounts.id, id))
    .run();
  refresh();
  return { ok: "Saved" };
}

export async function archiveAccount(f: FormData) {
  const user = await requireUser();
  await db.update(schema.accounts)
    .set({ archived: true })
    .where(and(eq(schema.accounts.id, str(f, "id")), eq(schema.accounts.ownerId, user.id)))
    .run();
  refresh();
}

// -------------------------------------------------------------- transactions

export async function addTransaction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const type = str(f, "type") as "income" | "expense" | "transfer";
  if (!["income", "expense", "transfer"].includes(type)) return { error: "Pick a type" };
  let acct;
  try {
    acct = await assertAccountAccess(user.id, str(f, "accountId"));
  } catch {
    return { error: "Pick an account" };
  }
  const amount = amountFrom(f, "amount", acct.currency);
  if (!amount) return { error: "Enter an amount, e.g. 250 or 5k" };

  const splits: { person: string; amount: number }[] = [];
  const people = f.getAll("splitPerson").map(String);
  const shares = f.getAll("splitAmount").map(String);
  people.forEach((p, i) => {
    const a = parseAmount(shares[i] ?? "");
    if (p.trim() && a) splits.push({ person: p, amount: toMinor(a, acct.currency) });
  });

  let toAmount: number | null = null;
  if (type === "transfer" && str(f, "toAmount")) {
    const dest = (await accessibleAccounts(user.id)).find((a) => a.id === str(f, "toAccountId"));
    if (dest) toAmount = amountFrom(f, "toAmount", dest.currency);
  }

  try {
    await createTransaction(user.id, {
      accountId: acct.id,
      type,
      amount,
      date: str(f, "date"),
      categoryId: str(f, "categoryId") || null,
      payee: str(f, "payee") || null,
      note: str(f, "note") || null,
      toAccountId: str(f, "toAccountId") || null,
      toAmount,
      billId: str(f, "billId") || null,
      splits,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh();
  return { ok: "Saved" };
}

/** Owners can delete their own entries; household members can delete entries on shared accounts. */
export async function deleteTransaction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "id");
  const ids = (await accessibleAccounts(user.id, true)).map((a) => a.id);
  if (!ids.length) return;
  await db.delete(schema.transactions)
    .where(and(eq(schema.transactions.id, id), or(eq(schema.transactions.userId, user.id), inArray(schema.transactions.accountId, ids))))
    .run();
  refresh();
}

/** Correcting a category marks it as user-chosen, which trains future suggestions. */
export async function setTransactionCategory(txId: string, categoryId: string | null) {
  const user = await requireUser();
  const ids = (await accessibleAccounts(user.id, true)).map((a) => a.id);
  const cat = categoryId
    ? await db.select().from(schema.categories).where(and(eq(schema.categories.id, categoryId), eq(schema.categories.userId, user.id))).get()
    : null;
  if (categoryId && !cat) return;
  await db.update(schema.transactions)
    .set({ categoryId, categorySource: "user" })
    .where(and(eq(schema.transactions.id, txId), inArray(schema.transactions.accountId, ids)))
    .run();
  refresh();
}

export async function suggestCategoryFor(text: string, kind: "income" | "expense") {
  const user = await requireUser();
  return suggestCategory(user.id, text, kind);
}

export async function settleSplit(f: FormData) {
  const user = await requireUser();
  const split = await db
    .select({ s: schema.splits, userId: schema.transactions.userId })
    .from(schema.splits)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.splits.transactionId))
    .where(eq(schema.splits.id, str(f, "id")))
    .get();
  if (!split || split.userId !== user.id) return;
  await db.update(schema.splits).set({ settled: str(f, "settled") !== "0" }).where(eq(schema.splits.id, split.s.id)).run();
  refresh();
}

// -------------------------------------------------------------------- budgets

export async function saveBudget(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const categoryId = str(f, "categoryId");
  const cat = await db.select().from(schema.categories).where(and(eq(schema.categories.id, categoryId), eq(schema.categories.userId, user.id))).get();
  if (!cat) return { error: "Pick a category" };
  const limit = amountFrom(f, "limit", user.homeCurrency);
  if (!limit) return { error: "Enter a monthly limit" };
  const alertAt = Math.min(0.99, Math.max(0.5, Number(str(f, "alertAt") || 80) / 100));
  await db.insert(schema.budgets)
    .values({ userId: user.id, categoryId, monthlyLimit: limit, alertAt })
    .onConflictDoUpdate({ target: [schema.budgets.userId, schema.budgets.categoryId], set: { monthlyLimit: limit, alertAt } })
    .run();
  await checkBadges(user.id);
  await generateNotifications(user.id);
  refresh();
  return { ok: `Budget for ${cat.name} saved` };
}

export async function deleteBudget(f: FormData) {
  const user = await requireUser();
  await db.delete(schema.budgets).where(and(eq(schema.budgets.id, str(f, "id")), eq(schema.budgets.userId, user.id))).run();
  refresh();
}

export async function addCategory(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name");
  const kind = str(f, "kind") === "income" ? "income" : "expense";
  if (!name) return { error: "Name the category" };
  const icon = str(f, "icon");
  // Only Phosphor keys from the picker; otherwise the icon is chosen from the name.
  const validIcon = icon.startsWith("ph:") && (ICON_KEYS as readonly string[]).includes(icon.slice(3)) ? icon : null;
  await db.insert(schema.categories).values({ userId: user.id, name, kind, icon: validIcon }).onConflictDoNothing().run();
  refresh();
  return { ok: `${name} added` };
}

// ---------------------------------------------------------------------- bills

const BillSchema = z.object({
  name: z.string().trim().min(1, "Name the bill"),
  frequency: z.enum(BILL_FREQUENCIES),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the next due date"),
  remindDaysBefore: z.coerce.number().int().min(0).max(30),
});

export async function saveBill(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = BillSchema.safeParse(Object.fromEntries(f));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const accountId = str(f, "accountId") || null;
  const acct = accountId ? (await accessibleAccounts(user.id)).find((a) => a.id === accountId) : null;
  const currency = acct?.currency ?? user.homeCurrency;
  const amount = amountFrom(f, "amount", currency);
  if (!amount) return { error: "Enter the amount" };
  const values = {
    ...parsed.data,
    userId: user.id,
    accountId: acct?.id ?? null,
    categoryId: str(f, "categoryId") || null,
    amount,
    currency,
    matchKey: str(f, "matchKey") || `${normalizeKey(parsed.data.name)}|${currency}`,
  };
  const id = str(f, "id");
  if (id) await db.update(schema.bills).set(values).where(and(eq(schema.bills.id, id), eq(schema.bills.userId, user.id))).run();
  else await db.insert(schema.bills).values(values).run();
  await generateNotifications(user.id);
  refresh();
  return { ok: `${parsed.data.name} saved` };
}

export async function deleteBill(f: FormData) {
  const user = await requireUser();
  await db.delete(schema.bills).where(and(eq(schema.bills.id, str(f, "id")), eq(schema.bills.userId, user.id))).run();
  refresh();
}

/** Logs the payment and rolls the due date forward. */
export async function payBill(f: FormData) {
  const user = await requireUser();
  const bill = await db.select().from(schema.bills).where(and(eq(schema.bills.id, str(f, "id")), eq(schema.bills.userId, user.id))).get();
  if (!bill || !bill.accountId) redirect(`/bills?edit=${bill?.id ?? ""}`);
  const { advanceDue } = await import("@/lib/recurring");
  await createTransaction(user.id, {
    accountId: bill.accountId,
    type: "expense",
    amount: bill.amount,
    date: new Date().toISOString().slice(0, 10),
    categoryId: bill.categoryId,
    payee: bill.name,
    billId: bill.id,
  });
  await db.update(schema.bills).set({ nextDue: advanceDue(bill.nextDue, bill.frequency) }).where(eq(schema.bills.id, bill.id)).run();
  refresh();
}

export async function acceptRecurring(f: FormData) {
  const user = await requireUser();
  const { detectRecurring } = await import("@/lib/recurring");
  const s = (await detectRecurring(user.id)).find((r) => r.matchKey === str(f, "matchKey"));
  if (!s) return;
  await db.insert(schema.bills)
    .values({
      userId: user.id,
      accountId: s.accountId,
      categoryId: s.categoryId,
      name: s.name,
      amount: s.amount,
      currency: s.currency,
      frequency: s.frequency,
      nextDue: s.nextDue,
      matchKey: s.matchKey,
    })
    .run();
  refresh();
}

export async function dismissRecurring(f: FormData) {
  const user = await requireUser();
  await db.insert(schema.dismissedRecurring).values({ userId: user.id, matchKey: str(f, "matchKey") }).onConflictDoNothing().run();
  refresh();
}

// ---------------------------------------------------------------- investments

export async function addHolding(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = str(f, "kind") === "crypto" ? "crypto" : "stock";
  const symbol = str(f, "symbol");
  const quantity = Number(str(f, "quantity").replace(/,/g, ""));
  if (!symbol) return { error: "Search for and pick an instrument" };
  if (!(quantity > 0)) return { error: "Enter how many units you hold" };
  await db.insert(schema.holdings)
    .values({
      userId: user.id,
      kind,
      symbol: kind === "stock" ? symbol.toUpperCase() : symbol,
      name: str(f, "name") || symbol,
      quantity,
    })
    .run();
  await checkBadges(user.id);
  refresh();
  return { ok: "Holding added" };
}

export async function updateHolding(f: FormData) {
  const user = await requireUser();
  const quantity = Number(str(f, "quantity").replace(/,/g, ""));
  if (!(quantity > 0)) return;
  await db.update(schema.holdings).set({ quantity }).where(and(eq(schema.holdings.id, str(f, "id")), eq(schema.holdings.userId, user.id))).run();
  refresh();
}

export async function deleteHolding(f: FormData) {
  const user = await requireUser();
  await db.delete(schema.holdings).where(and(eq(schema.holdings.id, str(f, "id")), eq(schema.holdings.userId, user.id))).run();
  refresh();
}

// ----------------------------------------------------------------- households

export async function createHousehold(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name") || `${user.name.split(" ")[0]}'s household`;
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  await db.transaction(async (trx) => {
    const h = await trx.insert(schema.households).values({ name, ownerId: user.id, inviteCode: code }).returning().get();
    await trx.insert(schema.householdMembers).values({ householdId: h.id, userId: user.id }).run();
  });
  refresh();
  return { ok: `Created. Share invite code ${code}` };
}

export async function joinHousehold(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const h = await db.select().from(schema.households).where(eq(schema.households.inviteCode, str(f, "code").toUpperCase())).get();
  if (!h) return { error: "No household with that code" };
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: user.id }).onConflictDoNothing().run();
  refresh();
  return { ok: `Joined ${h.name}` };
}

export async function leaveHousehold(f: FormData) {
  const user = await requireUser();
  const id = str(f, "id");
  await db.transaction(async (trx) => {
    await trx.delete(schema.householdMembers)
      .where(and(eq(schema.householdMembers.householdId, id), eq(schema.householdMembers.userId, user.id)))
      .run();
    // Stop sharing your own accounts with a household you left.
    await trx.update(schema.accounts)
      .set({ householdId: null })
      .where(and(eq(schema.accounts.ownerId, user.id), eq(schema.accounts.householdId, id)))
      .run();
  });
  refresh();
}

// ---------------------------------------------------------------------- coach

export async function refreshCoach() {
  const user = await requireUser();
  await currentTips(user.id, user.homeCurrency, true);
  refresh();
}

export async function rateTip(f: FormData) {
  const user = await requireUser();
  const feedback = str(f, "feedback") === "helpful" ? "helpful" : "not_helpful";
  await db.update(schema.coachTips)
    .set({ feedback })
    .where(and(eq(schema.coachTips.id, str(f, "id")), eq(schema.coachTips.userId, user.id)))
    .run();
  refresh();
}

// ------------------------------------------------------------------- settings

export async function updateProfile(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const currency = str(f, "homeCurrency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Pick a currency" };
  await db.update(schema.users)
    .set({ name: str(f, "name") || user.name, homeCurrency: currency })
    .where(eq(schema.users.id, user.id))
    .run();
  refresh();
  return { ok: "Saved" };
}

export async function snapshotNow(): Promise<FormState> {
  await requireUser();
  const { snapshotDatabase } = await import("@/lib/backup");
  const file = await snapshotDatabase("manual");
  if (!file) return { ok: "Your data lives in Turso, which keeps its own point-in-time backups. Use “Download my data” for a copy you keep." };
  refresh();
  return { ok: `Backup saved: ${file.split(/[\\/]/).pop()}` };
}

export async function restoreBackup(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a backup file" };
  try {
    const { importUserData } = await import("@/lib/backup");
    await importUserData(user.id, JSON.parse(await file.text()));
  } catch (err) {
    return { error: `Restore failed: ${(err as Error).message}` };
  }
  refresh();
  return { ok: "Restored. A snapshot of the previous data was saved first." };
}

// ------------------------------------------------------------ quick log & keys

export async function quickLogAction(input: { amount: string; categoryId: string | null; accountId: string; note?: string; type?: "expense" | "income" }) {
  const user = await requireUser();
  const { quickLog } = await import("@/lib/quick-log");
  try {
    const receipt = await quickLog(user, {
      amount: input.amount,
      category: input.categoryId,
      account: input.accountId,
      note: input.note,
      type: input.type,
    });
    refresh();
    return receipt;
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

export async function undoQuickLog(id: string) {
  const user = await requireUser();
  await db.delete(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, user.id))).run();
  refresh();
}

export async function createShortcutKey(_: (FormState & { token?: string }) | undefined, f: FormData): Promise<FormState & { token?: string }> {
  const user = await requireUser();
  const { createApiToken } = await import("@/lib/api-tokens");
  const token = await createApiToken(user.id, str(f, "name") || "My phone");
  refresh();
  return { ok: "Key created. Copy it now; it won't be shown again.", token };
}

export async function revokeShortcutKey(f: FormData) {
  const user = await requireUser();
  const { revokeApiToken } = await import("@/lib/api-tokens");
  await revokeApiToken(user.id, str(f, "id"));
  refresh();
}
