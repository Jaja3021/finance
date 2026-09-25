"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { recordFromText, type AssistantReply } from "@/lib/assistant";

export type { AssistantReply, Recorded } from "@/lib/assistant";

export async function sendToAssistant(text: string): Promise<AssistantReply> {
  const user = await requireUser();
  const reply = await recordFromText(user, text);
  revalidatePath("/", "layout");
  return reply;
}

export async function undoRecorded(ids: string[]) {
  const user = await requireUser();
  if (!ids.length) return;
  await db.delete(schema.transactions)
    .where(and(eq(schema.transactions.userId, user.id), inArray(schema.transactions.id, ids)))
    .run();
  await db.insert(schema.chatMessages).values({ userId: user.id, role: "assistant", content: "Undone." }).run();
  revalidatePath("/", "layout");
}
