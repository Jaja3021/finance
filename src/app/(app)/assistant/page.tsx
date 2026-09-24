import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/assistant-chat";

export default async function AssistantPage() {
  const user = await requireUser();
  const history = db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.userId, user.id))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(30)
    .all()
    .reverse()
    .map((m) => ({ id: m.id, role: m.role, content: m.content }));
  return (
    <div>
      <PageHeader title="Assistant" description="Type or speak transactions in plain language. They're recorded right away, with an undo." />
      <AssistantChat history={history} aiOn={aiEnabled()} />
    </div>
  );
}
