import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LockForm } from "./lock-form";

export default async function LockPage() {
  const user = await getSessionUser();
  if (!user) redirect("/session-expired");
  if (!user.pinHash) redirect("/");
  const hasBiometric = !!db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).get();
  return (
    <AuthShell title={`Hi, ${user.name.split(" ")[0]}`} subtitle="The app is locked. Enter your PIN to continue.">
      <LockForm hasBiometric={hasBiometric} />
    </AuthShell>
  );
}
