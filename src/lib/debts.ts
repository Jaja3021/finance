import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { db, schema } from "@/db";
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
export function paidAmount(debtId: string): number {
  const rows = db.select({ amount: schema.debtPayments.amount }).from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).all();
  return rows.reduce((s, r) => s + r.amount, 0);
}

function statusFor(amount: number, paid: number): (typeof schema.DEBT_STATUSES)[number] {
  if (paid <= 0) return "pending";
  if (paid >= amount) return "paid";
  return "partial";
}

function refreshStatus(debtId: string) {
  const debt = db.select().from(schema.debts).where(eq(schema.debts.id, debtId)).get();
  if (!debt) return;
  const status = statusFor(debt.amount, paidAmount(debtId));
  if (status !== debt.status) db.update(schema.debts).set({ status }).where(eq(schema.debts.id, debtId)).run();
}

export type DebtWithProgress = Debt & { paid: number; remaining: number; proofs: { id: string; file: string }[] };

export function listDebts(userId: string, direction?: "owe" | "owed"): DebtWithProgress[] {
  const rows = db
    .select()
    .from(schema.debts)
    .where(direction ? and(eq(schema.debts.userId, userId), eq(schema.debts.direction, direction)) : eq(schema.debts.userId, userId))
    .orderBy(desc(schema.debts.status), schema.debts.dueDate, desc(schema.debts.createdAt))
    .all();
  return rows.map((d) => {
    const paid = paidAmount(d.id);
    const proofs = db.select({ id: schema.debtProofs.id, file: schema.debtProofs.file }).from(schema.debtProofs).where(eq(schema.debtProofs.debtId, d.id)).all();
    return { ...d, paid, remaining: Math.max(0, d.amount - paid), proofs };
  });
}

export function getDebt(userId: string, debtId: string): (DebtWithProgress & { payments: DebtPayment[] }) | null {
  const debt = db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) return null;
  const payments = db.select().from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).orderBy(desc(schema.debtPayments.date), desc(schema.debtPayments.createdAt)).all();
  const proofs = db.select({ id: schema.debtProofs.id, file: schema.debtProofs.file }).from(schema.debtProofs).where(eq(schema.debtProofs.debtId, debtId)).all();
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { ...debt, payments, proofs, paid, remaining: Math.max(0, debt.amount - paid) };
}

export type DebtTotals = { owe: number; owed: number; net: number };

/** Totals count only the remaining (unpaid) balance of each debt. */
export function debtTotals(userId: string): DebtTotals {
  const rows = db.select().from(schema.debts).where(eq(schema.debts.userId, userId)).all();
  let owe = 0;
  let owed = 0;
  for (const d of rows) {
    const remaining = Math.max(0, d.amount - paidAmount(d.id));
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

export function createDebt(userId: string, input: NewDebt) {
  if (!input.person.trim()) throw new Error("Enter who the debt is with");
  if (!(input.amount > 0)) throw new Error("Enter an amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Invalid date");
  return db
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

export function updateDebt(userId: string, debtId: string, input: NewDebt) {
  if (!input.person.trim()) throw new Error("Enter who the debt is with");
  if (!(input.amount > 0)) throw new Error("Enter an amount");
  const existing = db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!existing) throw new Error("Debt not found");
  db.update(schema.debts)
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
  refreshStatus(debtId);
}

export function deleteDebt(userId: string, debtId: string) {
  const debt = db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) return;
  for (const p of db.select().from(schema.debtProofs).where(eq(schema.debtProofs.debtId, debtId)).all()) deleteUpload(p.file);
  for (const p of db.select({ proofFile: schema.debtPayments.proofFile }).from(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).all()) deleteUpload(p.proofFile);
  db.delete(schema.debts).where(eq(schema.debts.id, debtId)).run(); // cascades payments + proofs
}

export function addDebtProof(userId: string, debtId: string, file: string, contentType: string) {
  const debt = db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) throw new Error("Debt not found");
  db.insert(schema.debtProofs).values({ debtId, file, contentType }).run();
}

export type NewPayment = { amount: number; date: string; paymentMethod: PaymentMethod; paymentMethodOther?: string | null; note?: string | null; proofFile?: string | null };

export function addPayment(userId: string, debtId: string, input: NewPayment) {
  const debt = db.select().from(schema.debts).where(and(eq(schema.debts.id, debtId), eq(schema.debts.userId, userId))).get();
  if (!debt) throw new Error("Debt not found");
  if (!(input.amount > 0)) throw new Error("Enter a payment amount");
  const remaining = Math.max(0, debt.amount - paidAmount(debtId));
  if (input.amount > remaining + 100) {
    // Allow tiny rounding overage (1 minor unit slack isn't worth blocking); anything bigger is likely a typo.
    throw new Error(`That's more than the ${formatMoney(remaining, "PHP")} remaining`);
  }
  const payment = db
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
  refreshStatus(debtId);
  return payment;
}

export function deletePayment(userId: string, paymentId: string) {
  const row = db
    .select({ payment: schema.debtPayments, debtUserId: schema.debts.userId, debtId: schema.debts.id })
    .from(schema.debtPayments)
    .innerJoin(schema.debts, eq(schema.debts.id, schema.debtPayments.debtId))
    .where(eq(schema.debtPayments.id, paymentId))
    .get();
  if (!row || row.debtUserId !== userId) return;
  deleteUpload(row.payment.proofFile);
  db.delete(schema.debtPayments).where(eq(schema.debtPayments.id, paymentId)).run();
  refreshStatus(row.debtId);
}

/** Reminders a few days before a debt's due date. Call alongside generateNotifications. */
export function generateDebtReminders(userId: string, home: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  const rows = db
    .select()
    .from(schema.debts)
    .where(and(eq(schema.debts.userId, userId)))
    .all()
    .filter((d) => d.dueDate && d.status !== "paid");
  for (const d of rows) {
    const daysLeft = differenceInCalendarDays(parseISO(d.dueDate!), parseISO(today));
    const remindDaysBefore = 3;
    if (daysLeft > remindDaysBefore) continue;
    const remaining = Math.max(0, d.amount - paidAmount(d.id));
    const verb = d.direction === "owe" ? "you owe" : "owes you";
    const when = daysLeft < 0 ? `was due ${-daysLeft} day(s) ago` : daysLeft === 0 ? "is due today" : `is due in ${daysLeft} day(s)`;
    notify(userId, {
      kind: "debt",
      title: `${d.person} ${when}`,
      body: `${formatMoney(remaining, home)} ${verb}`,
      href: `/debts/${d.id}`,
      dedupeKey: `debt:${d.id}:${d.dueDate}:${daysLeft <= 0 ? "due" : "soon"}`,
    });
  }
}
