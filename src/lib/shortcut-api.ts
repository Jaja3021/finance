import "server-only";
import { NextResponse } from "next/server";
import { userFromApiRequest } from "./api-tokens";

export const unauthorized = () =>
  NextResponse.json(
    { ok: false, title: "Not connected", message: "API key missing or revoked. Create one in the app: Settings → Phone shortcuts." },
    { status: 401 },
  );

export function withApiUser<T>(req: Request, fn: (user: NonNullable<ReturnType<typeof userFromApiRequest>>) => Promise<T> | T) {
  const user = userFromApiRequest(req);
  if (!user) return unauthorized();
  return fn(user);
}

export const kindFrom = (req: Request) => (new URL(req.url).searchParams.get("type") === "income" ? "income" : "expense");
