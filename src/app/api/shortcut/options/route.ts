import { NextResponse } from "next/server";
import { quickOptions } from "@/lib/quick-log";
import { kindFrom, withApiUser } from "@/lib/shortcut-api";
import { iconText } from "@/lib/category-icons";

/** Everything a shortcut needs to build its menus, most-used first. */
export function GET(req: Request) {
  return withApiUser(req, async (user) => {
    const { categories, accounts } = await quickOptions(user.id, kindFrom(req));
    return NextResponse.json({
      categories: categories.map((c) => `${iconText(c.icon)} ${c.name}`.trim()),
      accounts: accounts.map((a) => a.name),
      currency: user.homeCurrency,
    });
  });
}
