import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { readUpload } from "@/lib/uploads";
import { db, schema } from "@/db";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Serves a proof/receipt photo, only to the user who owns it. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const user = await requireUser();
  const { file } = await ctx.params;
  if (!/^[\w-]+\.\w+$/.test(file)) return new Response("Not found", { status: 404 });

  const ownsReceipt = await db
    .select({ id: schema.receipts.id })
    .from(schema.receipts)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.receipts.transactionId))
    .where(and(eq(schema.receipts.file, file), eq(schema.transactions.userId, user.id)))
    .get();
  const ownsDebtProof = await db
    .select({ id: schema.debtProofs.id })
    .from(schema.debtProofs)
    .innerJoin(schema.debts, eq(schema.debts.id, schema.debtProofs.debtId))
    .where(and(eq(schema.debtProofs.file, file), eq(schema.debts.userId, user.id)))
    .get();
  const ownsPaymentProof = await db
    .select({ id: schema.debtPayments.id })
    .from(schema.debtPayments)
    .innerJoin(schema.debts, eq(schema.debts.id, schema.debtPayments.debtId))
    .where(and(eq(schema.debtPayments.proofFile, file), eq(schema.debts.userId, user.id)))
    .get();
  if (!ownsReceipt && !ownsDebtProof && !ownsPaymentProof) return new Response("Not found", { status: 404 });

  const ext = file.split(".").pop() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const bytes = await readUpload(file);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as BodyInit, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" },
  });
}
