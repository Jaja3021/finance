import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, UNLOCK_COOKIE } from "@/lib/session";

// A signed session whose user no longer exists (deleted account, reset or
// restored database). Clear the cookies so the proxy stops treating the
// browser as signed in; otherwise /login and / would redirect to each other.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(UNLOCK_COOKIE);
  return res;
}
