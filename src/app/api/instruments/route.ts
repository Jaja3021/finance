import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchInstruments } from "@/lib/market";

export async function GET(req: NextRequest) {
  await requireUser();
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const kind = req.nextUrl.searchParams.get("kind") === "crypto" ? "crypto" : "stock";
  return NextResponse.json(await searchInstruments(q, kind));
}
