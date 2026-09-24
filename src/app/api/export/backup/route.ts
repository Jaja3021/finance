import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { exportUserData } from "@/lib/backup";

export async function GET() {
  const user = await requireUser();
  return new Response(JSON.stringify(exportUserData(user.id), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cash-hey-backup-${format(new Date(), "yyyy-MM-dd")}.json"`,
    },
  });
}
