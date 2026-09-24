import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { accessibleAccounts } from "@/lib/access";
import { sqlite } from "@/db";

// A cheap fingerprint of everything visible to this user. Clients poll it
// and re-render only when it changes, so shared accounts stay in sync when
// another household member logs something.
export async function GET() {
  const user = await requireUser();
  const ids = accessibleAccounts(user.id, true).map((a) => a.id);
  if (!ids.length) return NextResponse.json({ v: "0" });
  const ph = ids.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) n, COALESCE(MAX(created_at),0) m, COALESCE(SUM(amount),0) s FROM transactions
       WHERE account_id IN (${ph}) OR to_account_id IN (${ph})`,
    )
    .get(...ids, ...ids) as { n: number; m: number; s: number };
  const acct = sqlite
    .prepare(`SELECT COUNT(*) n, COALESCE(SUM(opening_balance),0) s FROM accounts WHERE id IN (${ph})`)
    .get(...ids) as { n: number; s: number };
  return NextResponse.json({ v: `${row.n}.${row.m}.${row.s}.${acct.n}.${acct.s}` });
}
