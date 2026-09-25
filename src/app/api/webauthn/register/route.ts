import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { b64, CHALLENGE_COOKIE, challengeCookie, rp } from "@/lib/webauthn";

// Registers this device's fingerprint / face / Windows Hello for unlocking.
// Requires an unlocked session and an existing PIN (the PIN stays the fallback).

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user.pinHash) return NextResponse.json({ error: "Set a PIN first" }, { status: 400 });
  const { rpID, rpName } = rp(req);
  const existing = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).all();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports?.split(",") })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
  });
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, challengeCookie);
  return res;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { origin, rpID } = rp(req);
  const expectedChallenge = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return NextResponse.json({ error: "Challenge expired, try again" }, { status: 400 });
  const body = await req.json();
  try {
    const v = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!v.verified) return NextResponse.json({ error: "Could not verify" }, { status: 400 });
    const c = v.registrationInfo.credential;
    await db.insert(schema.passkeys)
      .values({
        id: c.id,
        userId: user.id,
        publicKey: b64.encode(c.publicKey),
        counter: c.counter,
        transports: c.transports?.join(",") ?? null,
        label: String(body.label ?? "This device").slice(0, 60),
      })
      .onConflictDoNothing()
      .run();
    const res = NextResponse.json({ ok: true });
    res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/webauthn" });
    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
