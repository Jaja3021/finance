import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { signUnlock, UNLOCK_COOKIE, unlockCookieOptions } from "@/lib/session";
import { b64, CHALLENGE_COOKIE, challengeCookie, rp } from "@/lib/webauthn";

// Unlocks a signed-in (but PIN-locked) session with a registered biometric.

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).all();
  if (!keys.length) return NextResponse.json({ error: "No biometrics registered" }, { status: 404 });
  const options = await generateAuthenticationOptions({
    rpID: rp(req).rpID,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports?.split(",") })),
  });
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, challengeCookie);
  return res;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expectedChallenge = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return NextResponse.json({ error: "Challenge expired, try again" }, { status: 400 });
  const body = await req.json();
  const key = await db
    .select()
    .from(schema.passkeys)
    .where(and(eq(schema.passkeys.id, String(body.id)), eq(schema.passkeys.userId, user.id)))
    .get();
  if (!key) return NextResponse.json({ error: "Unknown device" }, { status: 400 });
  const { origin, rpID } = rp(req);
  try {
    const v = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: key.id, publicKey: b64.decode(key.publicKey), counter: key.counter, transports: key.transports?.split(",") },
    });
    if (!v.verified) return NextResponse.json({ error: "Could not verify" }, { status: 400 });
    await db.update(schema.passkeys).set({ counter: v.authenticationInfo.newCounter }).where(eq(schema.passkeys.id, key.id)).run();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(UNLOCK_COOKIE, await signUnlock({ uid: user.id, mins: user.lockAfterMinutes }), unlockCookieOptions);
    res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/webauthn" });
    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
