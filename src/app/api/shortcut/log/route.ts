import { NextResponse } from "next/server";
import { quickLog } from "@/lib/quick-log";
import { recordFromText } from "@/lib/assistant";
import { formatMoney } from "@/lib/money";
import { withApiUser } from "@/lib/shortcut-api";

/**
 * Logs one transaction from a phone shortcut.
 *   { "amount": "250", "category": "Food", "account": "GCash", "note": "Jollibee" }
 * or, for dictation / Siri:
 *   { "text": "lunch 250 gcash" }
 * Always answers with { ok, title, message, notification } so the shortcut
 * can show the result in a notification.
 */
export function POST(req: Request) {
  return withApiUser(req, async (user) => {
    let body: Record<string, unknown> = {};
    try {
      body = req.headers.get("content-type")?.includes("application/json")
        ? await req.json()
        : Object.fromEntries(await req.formData());
    } catch {}
    const s = (k: string) => (body[k] === undefined || body[k] === null ? null : String(body[k]));

    try {
      if (s("text")) {
        const r = await recordFromText(user, s("text")!);
        if (!r.recorded.length) throw new Error(r.errors[0] ?? r.reply);
        const title = r.recorded
          .map((t) => `${t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}${formatMoney(t.amount, t.currency)} ${t.type === "transfer" ? `${t.account} → ${t.toAccount}` : t.account}`)
          .join(", ");
        return NextResponse.json({ ok: true, title, message: r.reply, notification: `${title}\n${r.reply}` });
      }
      const receipt = await quickLog(user, {
        amount: s("amount") ?? "",
        category: s("category"),
        account: s("account"),
        note: s("note"),
        type: s("type") === "income" ? "income" : "expense",
        date: s("date"),
      });
      return NextResponse.json({ ...receipt, notification: `${receipt.title}\n${receipt.message}` });
    } catch (err) {
      const message = (err as Error).message;
      return NextResponse.json({ ok: false, title: "Couldn't log it", message, notification: `Couldn't log it\n${message}` }, { status: 400 });
    }
  });
}
