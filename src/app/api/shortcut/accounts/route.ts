import { NextResponse } from "next/server";
import { quickOptions } from "@/lib/quick-log";
import { kindFrom, withApiUser } from "@/lib/shortcut-api";

/** A plain list for “Choose from List”, e.g. ["GCash", "MariBank", …]. */
export function GET(req: Request) {
  return withApiUser(req, async (user) => NextResponse.json((await quickOptions(user.id, kindFrom(req))).accounts.map((a) => a.name)));
}
