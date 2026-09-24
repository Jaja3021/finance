// Token helpers shared by the proxy and server code. No database access here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ft_session";
export const UNLOCK_COOKIE = "ft_unlock";
const SESSION_DAYS = 30;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export type SessionClaims = { uid: string; pin: boolean };
export type UnlockClaims = { uid: string; mins: number };

export async function signSession(claims: SessionClaims) {
  return new SignJWT({ ...claims, t: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

// The unlock token proves the PIN was entered recently. It slides forward on
// every request (see proxy.ts) and expires after `mins` of inactivity.
export async function signUnlock(claims: UnlockClaims) {
  return new SignJWT({ ...claims, t: "unlock" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${claims.mins}m`)
    .sign(key());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.t !== "session" || typeof payload.uid !== "string") return null;
    return { uid: payload.uid, pin: payload.pin === true };
  } catch {
    return null;
  }
}

export async function verifyUnlock(
  token: string | undefined,
  uid: string,
): Promise<UnlockClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.t !== "unlock" || payload.uid !== uid) return null;
    return { uid, mins: Number(payload.mins) || 5 };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

// No maxAge: the browser drops it when closed, so the app is locked again.
export const unlockCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
