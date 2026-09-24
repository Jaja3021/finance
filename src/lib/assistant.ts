import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseMessage, resolveAccount } from "./ai";
import { createTransaction } from "./transactions";
import { toMinor, formatMoney } from "./money";
import { convertMinor, ensureRates } from "./fx";
import { iconText } from "./category-icons";

export type Recorded = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  account: string;
  toAccount: string | null;
  category: string | null;
  categoryAuto: boolean;
  date: string;
  payee: string | null;
  splitWith: string[];
};

export type AssistantReply = {
  reply: string;
  recorded: Recorded[];
  errors: string[];
  engine: "ai" | "rules";
};

/** Parses a plain-language message and records the transactions it describes. */
export async function recordFromText(user: { id: string; homeCurrency: string }, text: string): Promise<AssistantReply> {
  const message = text.trim().slice(0, 1000);
  if (!message) return { reply: "Type or say something like “paid credit card 5k yesterday”.", recorded: [], errors: [], engine: "rules" };

  db.insert(schema.chatMessages).values({ userId: user.id, role: "user", content: message }).run();
  const { drafts, reply, engine } = await parseMessage({ userId: user.id, homeCurrency: user.homeCurrency }, message);
  const categories = db.select().from(schema.categories).where(eq(schema.categories.userId, user.id)).all();

  const recorded: Recorded[] = [];
  const errors: string[] = [];
  for (const d of drafts) {
    try {
      if (!(d.amount > 0)) throw new Error("Missing amount");
      const account = resolveAccount(user.id, d.accountName, d.type);
      if (!account) throw new Error("Add an account first");
      const to = d.type === "transfer" ? resolveAccount(user.id, d.toAccountName, "transfer", account.id) : null;
      if (d.type === "transfer" && !to) throw new Error("Couldn't tell which account the money went to");

      // "$20" on a peso account: convert at today's rate.
      let amount = toMinor(d.amount, d.currency ?? account.currency);
      if (d.currency && d.currency !== account.currency) {
        await ensureRates([d.currency], account.currency);
        const c = convertMinor(amount, d.currency, account.currency, d.date);
        if (c === null) throw new Error(`No ${d.currency}→${account.currency} rate`);
        amount = c;
      }
      const cat = d.categoryName
        ? categories.find((c) => c.name.toLowerCase() === d.categoryName!.toLowerCase() && c.kind === (d.type === "income" ? "income" : "expense"))
        : undefined;
      const tx = await createTransaction(user.id, {
        accountId: account.id,
        type: d.type,
        amount,
        date: d.date,
        categoryId: cat?.id ?? null,
        categorySource: cat ? "ai" : undefined,
        payee: d.payee,
        note: d.note,
        toAccountId: to?.id ?? null,
        splits: d.splitWith.map((s) => ({ person: s.person, amount: toMinor(s.amount, account.currency) })),
      });
      const finalCat = categories.find((c) => c.id === tx.categoryId);
      recorded.push({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        currency: account.currency,
        account: account.name,
        toAccount: to?.name ?? null,
        category: finalCat ? `${iconText(finalCat.icon)} ${finalCat.name}`.trim() : null,
        categoryAuto: tx.categorySource !== "user",
        date: tx.date,
        payee: tx.payee,
        splitWith: d.splitWith.map((s) => s.person),
      });
    } catch (err) {
      errors.push(`${d.payee ?? d.type} ${d.amount}: ${(err as Error).message}`);
    }
  }

  const summary = recorded.length
    ? recorded
        .map((r) =>
          r.type === "transfer"
            ? `${formatMoney(r.amount, r.currency)} ${r.account} → ${r.toAccount}`
            : `${formatMoney(r.amount, r.currency)} ${r.payee ?? r.type}`,
        )
        .join(", ")
    : "";
  const finalReply = recorded.length ? `${reply} ${summary}.`.replace("..", ".") : reply;
  db.insert(schema.chatMessages).values({ userId: user.id, role: "assistant", content: finalReply }).run();
  return { reply: finalReply, recorded, errors, engine };
}
