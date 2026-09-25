import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { quickOptions } from "@/lib/quick-log";
import { QuickFlow } from "@/components/quick-flow";

export const metadata: Metadata = { title: "Log expense" };

// Full-screen three-tap logger. Opened from the home-screen icon's
// "Log expense" shortcut, or the + button in the app.
export default async function QuickPage(props: PageProps<"/quick">) {
  const user = await requireUser();
  const { type } = await props.searchParams;
  return (
    <QuickFlow
      kind={type === "income" ? "income" : "expense"}
      expense={await quickOptions(user.id, "expense")}
      income={await quickOptions(user.id, "income")}
      currency={user.homeCurrency}
    />
  );
}
