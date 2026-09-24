import "server-only";
import type { NextRequest } from "next/server";

// Relying-party settings derived from the request, so it works on localhost
// and on whatever domain the app is deployed to. Override with WEBAUTHN_ORIGIN.
export function rp(req: NextRequest) {
  const origin = process.env.WEBAUTHN_ORIGIN ?? req.nextUrl.origin;
  return { origin, rpID: new URL(origin).hostname, rpName: "Cash Hey" };
}

export const CHALLENGE_COOKIE = "ft_webauthn_challenge";
export const challengeCookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/webauthn",
  maxAge: 300,
};

export const b64 = {
  encode: (u: Uint8Array) => Buffer.from(u).toString("base64url"),
  decode: (s: string) => new Uint8Array(Buffer.from(s, "base64url")),
};
