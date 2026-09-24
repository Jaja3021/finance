import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  SESSION_COOKIE,
  UNLOCK_COOKIE,
  verifySession,
  verifyUnlock,
} from "./session";

export type CurrentUser = typeof schema.users.$inferSelect;

const hasSessionCookie = async () => Boolean((await cookies()).get(SESSION_COOKIE)?.value);

/** The signed-in user, or null. Does not check the PIN lock. */
export const getSessionUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, claims.uid))
    .get();
  return user ?? null;
});

/**
 * The signed-in, unlocked user. Redirects to /login or /lock otherwise.
 * Every page and server action that touches user data goes through this;
 * proxy.ts only does the cheap optimistic redirect.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const user = await getSessionUser();
  if (!user) redirect((await hasSessionCookie()) ? "/session-expired" : "/login");
  if (user.pinHash) {
    const jar = await cookies();
    const ok = await verifyUnlock(jar.get(UNLOCK_COOKIE)?.value, user.id);
    if (!ok) redirect("/lock");
  }
  return user;
});
