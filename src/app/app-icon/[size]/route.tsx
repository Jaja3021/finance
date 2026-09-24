import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { LOGO_SRC } from "@/lib/brand";

// Home-screen / install icons, drawn from the same image as the in-app logo:
// /app-icon/192, /app-icon/512… Square, because iOS and Android apply their
// own icon mask.
const SIZES = new Set([96, 180, 192, 512]);
const logo = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", LOGO_SRC)).toString("base64")}`;

export async function GET(_: Request, ctx: { params: Promise<{ size: string }> }) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} width={size} height={size} alt="" />
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
