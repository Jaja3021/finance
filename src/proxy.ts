import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  UNLOCK_COOKIE,
  signUnlock,
  unlockCookieOptions,
  verifySession,
  verifyUnlock,
} from "@/lib/session";

// Optimistic checks only: redirect signed-out users to /login and locked
// sessions to /lock, and slide the PIN unlock window forward on activity.
// Real authorization happens in requireUser() on every page and action.

const PUBLIC = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Phone shortcuts authenticate with an API key inside the route, not a cookie.
  if (pathname.startsWith("/api/shortcut/") || pathname === "/api/cron" || pathname === "/session-expired") return NextResponse.next();
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isPublic) return NextResponse.redirect(new URL("/", req.url));
  if (!session.pin) return NextResponse.next();

  const unlock = await verifyUnlock(req.cookies.get(UNLOCK_COOKIE)?.value, session.uid);
  if (!unlock) {
    if (pathname.startsWith("/lock") || pathname.startsWith("/api/webauthn")) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Locked" }, { status: 423 });
    return NextResponse.redirect(new URL("/lock", req.url));
  }
  if (pathname.startsWith("/lock")) return NextResponse.redirect(new URL("/", req.url));

  // Background polling shouldn't keep the app unlocked forever.
  const res = NextResponse.next();
  if (req.headers.get("x-background") !== "1") {
    res.cookies.set(UNLOCK_COOKIE, await signUnlock(unlock), unlockCookieOptions);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|sw.js|logos/|brand/|app-icon/).*)"],
};
