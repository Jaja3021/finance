import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { db, query, schema } from "@/db";
import type { PaymentMethod } from "@/db/schema";
import { notify } from "./engagement";
import { formatMoney } from "./money";
import { deleteUpload } from "./uploads";

// Re-exported for server-side callers (pages, actions) so they can import
// everything debt-related from one place. Client components must import
// this directly from "./payment-methods" instead — see that file's comment.
export { PAYMENT_METHOD_LABELS } from "./payment-methods";

export type Debt = typeof schema.debts.$inferSelect;
export type DebtPayment = typeof schema.debtPayments.$inferSelect;

/** Sum of a debt's logged payments (home-currency minor units). */
export async function paidAmount(debtId: string): Promise<number> {
  const rows = await db.select({ amount: schema.debtPayments.amount }).from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).all();
  return rows.reduce((s, r) => s + r.amount, 0);
}

function statusFor(amount: number, paid: number): (typeof schema.DEBT_STATUSES)[number] {
  if (paid <= 0) return "pending";
  if (paid >= amount) return "paid";
  return "partial";
}

async function refreshStatus(debtId: string) {
  const debt = await db.select().from(schema.debts).where(eq(schema.debts.id, debtId)).get();
  if (!debt) return;
  const status = statusFor(debt.amount, await paidAmount(debtId));
  if (status !== debt.status) await db.update(schema.debts).set({ status }).where(eq(schema.debts.id, debtId)).run();
}

export type DebtWithProgress = Debt & { paid: number; remaining: number; proofs: { id: string; file: string }[] };

export async function listDebts(userId: string, direction?: "owe" | "owed"): Promise<DebtWithProgress[]> {
  const rows = await db
    .select()
    .from(schema.debts)
    .where(direction ? and(eq(schema.debts.userId, userId), eq(schema.debts.direction, direction)) : eq(schema.debts.userId, userId))
    .orderBy(desc(schema.debts.status), schema.debts.dueDate, desc(schema.debts.createdAt))
    .all();
  if (!rows.length) return [];
  // Two grouped queries instead of two per debt (each is a round trip on Turso).
  const ids = rows.map((d) => d.id);
  const [payments, proofs] = await Promise.all([
    db.select({ debtId: schema.debtPayments.debtId, amount: schema.debtPayments.amount }).from(schema.debtPayments).where(inArray(schema.debtPayments.debtId, ids)).all(),
    db.select({ debtId: schema.debtProofs.debtId, id: schema.debtProofs.id, file: schema.debtProofs.file }).from(schema.debtProofs).where(inArray(schema.debtProofs.debtId, ids)).all(),
  ]);
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.debtId, (paidBy.get(p.debtId) ?? 0) + p.amount);
  return rows.map((d) => {
    const paid = paidBy.get(d.id) ?? 0;
    return { ...d, paid, remaining: Math.max(0, d.amount - paid), proofs: proofs.filter((p) => p.debtId === d.id).map(({ id, file }) => ({ id, file })) };
  });
}

export async function getDebt(userId: string, debtId: string): Promise<(DebtWithProgress & { payments: DebtPayment[] }) | null> {
  const debt = await db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) return null;
  const payments = await db.select().from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).orderBy(desc(schema.debtPayments.date), desc(schema.debtPayments.createdAt)).all();
  const proofs = await db.select({ id: schema.debtProofs.id, file: schema.debtProofs.file }).from(schema.debtProofs).where(eq(schema.debtProofs.debtId, debtId)).all();
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { ...debt, payments, proofs, paid, remaining: Math.max(0, debt.amount - paid) };
}

export type DebtTotals = { owe: number; owed: number; net: number };

/** Totals count only the remaining (unpaid) balance of each debt. */
export async function debtTotals(userId: string): Promise<DebtTotals> {
  const [rows, payments] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)).all(),
    query<{ debt_id: string; s: number }>(
      `SELECT p.debt_id, SUM(p.amount) s FROM debt_payments p JOIN debts d ON d.id = p.debt_id WHERE d.user_id = ? GROUP BY p.debt_id`,
      [userId],
    ),
  ]);
  const paidBy = new Map(payments.map((p) => [p.debt_id, Number(p.s)]));
  let owe = 0;
  let owed = 0;
  for (const d of rows) {
    const remaining = Math.max(0, d.amount - (paidBy.get(d.id) ?? 0));
    if (d.direction === "owe") owe += remaining;
    else owed += remaining;
  }
  return { owe, owed, net: owed - owe };
}

export type NewDebt = {
  person: string;
  direction: "owe" | "owed";
  amount: number;
  date: string;
  time?: string | null;
  dueDate?: string | null;
  paymentMethod: PaymentMethod;
  paymentMethodOther?: string | null;
  note?: string | null;
};

export async function createDebt(userId: string, input: NewDebt) {
  if (!input.person.trim()) throw new Error("Enter who the debt is with");
  if (!(input.amount > 0)) throw new Error("Enter an amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Invalid date");
  return await db
    .insert(schema.debts)
    .values({
      userId,
      person: input.person.trim(),
      direction: input.direction,
      amount: input.amount,
      date: input.date,
      time: input.time || null,
      dueDate: input.dueDate || null,
      paymentMethod: input.paymentMethod,
      paymentMethodOther: input.paymentMethod === "other" ? input.paymentMethodOther?.trim() || null : null,
      note: input.note?.trim() || null,
    })
    .returning()
    .get();
}

export async function updateDebt(userId: string, debtId: string, input: NewDebt) {
  if (!input.person.trim()) throw new Error("Enter who the debt is with");
  if (!(input.amount > 0)) throw new Error("Enter an amount");
  const existing = await db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!existing) throw new Error("Debt not found");
  await db.update(schema.debts)
    .set({
      person: input.person.trim(),
      direction: input.direction,
      amount: input.amount,
      date: input.date,
      time: input.time || null,
      dueDate: input.dueDate || null,
      paymentMethod: input.paymentMethod,
      paymentMethodOther: input.paymentMethod === "other" ? input.paymentMethodOther?.trim() || null : null,
      note: input.note?.trim() || null,
    })
    .where(eq(schema.debts.id, debtId))
    .run();
  await refreshStatus(debtId);
}

export async function deleteDebt(userId: string, debtId: string) {
  const debt = await db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) return;
  for (const p of await db.select().from(schema.debtProofs).where(eq(schema.debtProofs.debtId, debtId)).all()) await deleteUpload(p.file);
  for (const p of await db.select({ proofFile: schema.debtPayments.proofFile }).from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).all()) await deleteUpload(p.proofFile);
  await db.delete(schema.debts).where(eq(schema.debts.id, debtId)).run(); // cascades payments + proofs
}

export async function addDebtProof(userId: string, debtId: string, file: string, contentType: string) {
  const debt = await db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) throw new Error("Debt not found");
  await db.insert(schema.debtProofs).values({ debtId, file, contentType }).run();
}

export type NewPayment = { amount: number; date: string; paymentMethod: PaymentMethod; paymentMethodOther?: string | null; note?: string | null; proofFile?: string | null };

export async function addPayment(userId: string, debtId: string, input: NewPayment) {
  const debt = await db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) throw new Error("Debt not found");
  if (!(input.amount > 0)) throw new Error("Enter a payment amount");
  const remaining = Math.max(0, debt.amount - await paidAmount(debtId));
  if (input.amount > remaining + 100) {
    // Allow tiny rounding overage (1 minor unit slack isn't worth blocking); anything bigger is likely a typo.
    throw new Error(`That's more than the ${formatMoney(remaining, "PHP")} remaining`);
  }
  const payment = await db
    .insert(schema.debtPayments)
    .values({
      debtId,
      amount: input.amount,
      date: input.date,
      paymentMethod: input.paymentMethod,
      paymentMethodOther: input.paymentMethod === "other" ? input.paymentMethodOther?.trim() || null : null,
      note: input.note?.trim() || null,
      proofFile: input.proofFile ?? null,
    })
    .returning()
    .get();
  await refreshStatus(debtId);
  return payment;
}

export async function deletePayment(userId: string, paymentId: string) {
  const row = await db
    .select({ payment: schema.debtPayments, debtUserId: schema.debts.userId, debtId: schema.debts.id })
    .from(schema.debtPayments)
    .innerJoin(schema.debts, eq(schema.debts.id, schema.debtPayments.debtId))
    .where(eq(schema.debtPayments.id, paymentId))
    .get();
  if (!row || row.debtUserId !== userId) return;
  await deleteUpload(row.payment.proofFile);
  await db.delete(schema.debtPayments).where(eq(schema.debtPayments.id, paymentId)).run();
  await refreshStatus(row.debtId);
}

/** Reminders a few days before a debt's due date. Call alongside generateNotifications. */
export async function generateDebtReminders(userId: string, home: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  const rows = (await db
    .select()
    .from(schema.debts)
    .where(and(eq(schema.debts.userId, userId)))
    .all())
    .filter((d) => d.dueDate && d.status !== "paid");
  for (const d of rows) {
    const daysLeft = differenceInCalendarDays(parseISO(d.dueDate!), parseISO(today));
    const remindDaysBefore = 3;
    if (daysLeft > remindDaysBefore) continue;
    const remaining = Math.max(0, d.amount - await paidAmount(d.id));
    const verb = d.direction === "owe" ? "you owe" : "owes you";
    const when = daysLeft < 0 ? `was due ${-daysLeft} day(s) ago` : daysLeft === 0 ? "is due today" : `is due in ${daysLeft} day(s)`;
    await notify(userId, {
      kind: "debt",
      title: `${d.person} ${when}`,
      body: `${formatMoney(remaining, home)} ${verb}`,
      href: `/debts/${d.id}`,
      dedupeKey: `debt:${d.id}:${d.dueDate}:${daysLeft <= 0 ? "due" : "soon"}`,
    });
  }
}
