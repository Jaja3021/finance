import { runScheduledJobs } from "@/lib/scheduler";

// Vercel Cron (see vercel.json) calls this once a day, standing in for the
// in-process scheduler that only runs with a long-lived local server.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  await runScheduledJobs();
  return Response.json({ ok: true });
}
