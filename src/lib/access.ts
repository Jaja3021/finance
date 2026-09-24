import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";

const { accounts, householdMembers } = schema;

export function householdIdsFor(userId: string): string[] {
  return db
    .select({ id: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all()
    .map((r) => r.id);
}

/** Accounts the user owns plus accounts shared with any household they belong to. */
export function accessibleAccounts(userId: string, includeArchived = false) {
  const hh = householdIdsFor(userId);
  const visible = hh.length
    ? or(eq(accounts.ownerId, userId), inArray(accounts.householdId, hh))
    : eq(accounts.ownerId, userId);
  return db
    .select()
    .from(accounts)
    .where(includeArchived ? visible : and(visible, eq(accounts.archived, false)))
    .orderBy(accounts.createdAt)
    .all();
}

export function assertAccountAccess(userId: string, accountId: string) {
  const acct = accessibleAccounts(userId, true).find((a) => a.id === accountId);
  if (!acct) throw new Error("Account not found");
  return acct;
}
