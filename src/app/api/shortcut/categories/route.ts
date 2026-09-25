import { NextResponse } from "next/server";
import { quickOptions } from "@/lib/quick-log";
import { kindFrom, withApiUser } from "@/lib/shortcut-api";
import { iconText } from "@/lib/category-icons";

/** A plain list for “Choose from List”, e.g. ["🍜 Food & Dining", "🚌 Transport", …]. */
export function GET(req: Request) {
  return withApiUser(req, async (user) =>
    NextResponse.json((await quickOptions(user.id, kindFrom(req))).categories.map((c) => `${iconText(c.icon)} ${c.name}`.trim())),
  );
}
