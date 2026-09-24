"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createDebt,
  updateDebt,
  deleteDebt,
  addPayment,
  deletePayment,
  addDebtProof,
  type NewDebt,
  type NewPayment,
} from "@/lib/debts";
import { parseAmount, toMinor } from "@/lib/money";
import { saveUpload } from "@/lib/uploads";
import type { PaymentMethod } from "@/db/schema";
import { PAYMENT_METHODS } from "@/db/schema";
import type { FormState } from "./auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh() {
  revalidatePath("/debts");
  revalidatePath("/", "layout");
}

function readMethod(f: FormData): PaymentMethod {
  const m = str(f, "paymentMethod");
  return (PAYMENT_METHODS as readonly string[]).includes(m) ? (m as PaymentMethod) : "cash";
}

function readDebtInput(f: FormData, currency: string): NewDebt {
  const amount = parseAmount(str(f, "amount"));
  if (!amount) throw new Error("Enter an amount, e.g. 500 or 2k");
  return {
    person: str(f, "person"),
    direction: str(f, "direction") === "owed" ? "owed" : "owe",
    amount: toMinor(amount, currency),
    date: str(f, "date"),
    time: str(f, "time") || null,
    dueDate: str(f, "dueDate") || null,
    paymentMethod: readMethod(f),
    paymentMethodOther: str(f, "paymentMethodOther") || null,
    note: str(f, "note") || null,
  };
}

export async function addDebt(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  let input: NewDebt;
  try {
    input = readDebtInput(f, user.homeCurrency);
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    const debt = createDebt(user.id, input);
    const proofFile = f.get("proof");
    if (proofFile instanceof File && proofFile.size > 0) {
      const saved = await saveUpload(proofFile);
      if (saved) addDebtProof(user.id, debt.id, saved.file, saved.contentType);
      else return { error: "Debt saved, but that file isn't a supported image (JPG, PNG, WEBP, HEIC)." };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh();
  return { ok: "Debt added" };
}

export async function editDebt(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(f, "id");
  let input: NewDebt;
  try {
    input = readDebtInput(f, user.homeCurrency);
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    updateDebt(user.id, id, input);
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh();
  return { ok: "Saved" };
}

export async function removeDebt(f: FormData) {
  const user = await requireUser();
  deleteDebt(user.id, str(f, "id"));
  refresh();
}

/** Same as removeDebt, but for the detail page: sends the user back to the list. */
export async function removeDebtAndRedirect(f: FormData) {
  const user = await requireUser();
  deleteDebt(user.id, str(f, "id"));
  refresh();
  redirect("/debts");
}

export async function addDebtPayment(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const debtId = str(f, "debtId");
  const amount = parseAmount(str(f, "amount"));
  if (!amount) return { error: "Enter a payment amount" };
  const input: NewPayment = {
    amount: toMinor(amount, user.homeCurrency),
    date: str(f, "date"),
    paymentMethod: readMethod(f),
    paymentMethodOther: str(f, "paymentMethodOther") || null,
    note: str(f, "note") || null,
  };
  try {
    const proofFile = f.get("proof");
    if (proofFile instanceof File && proofFile.size > 0) {
      const saved = await saveUpload(proofFile);
      if (saved) input.proofFile = saved.file;
    }
    addPayment(user.id, debtId, input);
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh();
  return { ok: "Payment logged" };
}

export async function removeDebtPayment(f: FormData) {
  const user = await requireUser();
  deletePayment(user.id, str(f, "id"));
  refresh();
}
