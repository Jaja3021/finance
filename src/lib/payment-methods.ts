import type { PaymentMethod } from "@/db/schema";

// Plain data, safe to import from Client Components. Kept out of
// src/lib/debts.ts because that module is "server-only" (direct DB access);
// importing anything from it, even a constant, would drag the DB layer
// (better-sqlite3, etc.) into the client bundle.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  gcash: "GCash",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  maya: "Maya",
  other: "Other",
};
