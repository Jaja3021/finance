"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { seedCategories } from "@/lib/categorize";
import { getSessionUser, requireUser } from "@/lib/auth";
import {
  SESSION_COOKIE,
  UNLOCK_COOKIE,
  sessionCookieOptions,
  signSession,
  signUnlock,
  unlockCookieOptions,
} from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

async function startSession(user: { id: string; pinHash: string | null; lockAfterMinutes: number }) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession({ uid: user.id, pin: !!user.pinHash }), sessionCookieOptions);
  // Just proved identity with the password, so start unlocked.
  if (user.pinHash) {
    jar.set(UNLOCK_COOKIE, await signUnlock({ uid: user.id, mins: user.lockAfterMinutes }), unlockCookieOptions);
  }
}

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  homeCurrency: z.string().length(3),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, homeCurrency } = parsed.data;
  if (await db.select().from(schema.users).where(eq(schema.users.email, email)).get()) {
    return { error: "An account with that email already exists" };
  }
  const user = await db
    .insert(schema.users)
    .values({ name, email, homeCurrency, passwordHash: await bcrypt.hash(password, 12) })
    .returning()
    .get();
  await seedCategories(user.id);
  await startSession(user);
  redirect("/accounts?welcome=1");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Wrong email or password" };
  }
  await startSession(user);
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(UNLOCK_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------------ PIN lock

const failures = new Map<string, number>();
const MAX_PIN_ATTEMPTS = 5;

export async function unlockWithPin(_: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/session-expired");
  if (!user.pinHash) redirect("/");
  const pin = String(form.get("pin") ?? "");
  if (!(await bcrypt.compare(pin, user.pinHash))) {
    const n = (failures.get(user.id) ?? 0) + 1;
    failures.set(user.id, n);
    if (n >= MAX_PIN_ATTEMPTS) {
      failures.delete(user.id);
      // Too many wrong PINs: require the full password again.
      await logout();
    }
    return { error: `Wrong PIN. ${MAX_PIN_ATTEMPTS - n} attempt(s) left before you're signed out.` };
  }
  failures.delete(user.id);
  (await cookies()).set(UNLOCK_COOKIE, await signUnlock({ uid: user.id, mins: user.lockAfterMinutes }), unlockCookieOptions);
  redirect("/");
}

export async function lockNow() {
  (await cookies()).delete(UNLOCK_COOKIE);
  redirect("/lock");
}

export async function setPin(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const pin = String(form.get("pin") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const minutes = Math.min(120, Math.max(1, Number(form.get("minutes") ?? 5)));
  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN must be 4 to 8 digits" };
  if (pin !== confirm) return { error: "PINs don't match" };
  const updated = await db
    .update(schema.users)
    .set({ pinHash: await bcrypt.hash(pin, 10), lockAfterMinutes: minutes })
    .where(eq(schema.users.id, user.id))
    .returning()
    .get();
  await startSession(updated);
  return { ok: "PIN lock is on" };
}

export async function removePin(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const password = String(form.get("password") ?? "");
  if (!(await bcrypt.compare(password, user.passwordHash))) return { error: "Wrong password" };
  await db.update(schema.users).set({ pinHash: null }).where(eq(schema.users.id, user.id)).run();
  await db.delete(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).run();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession({ uid: user.id, pin: false }), sessionCookieOptions);
  jar.delete(UNLOCK_COOKIE);
  return { ok: "PIN lock is off" };
}
