import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  const items = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(30)
    .all();
  return NextResponse.json({ items, unread: items.filter((n) => !n.readAt).length });
}

/** Marks notifications read: body { ids?: string[] } (all when omitted). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const n = schema.notifications;
  await db.update(n)
    .set({ readAt: Date.now() })
    .where(and(eq(n.userId, user.id), isNull(n.readAt), ids?.length ? inArray(n.id, ids) : undefined))
    .run();
  return NextResponse.json({ ok: true });
}
