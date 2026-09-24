import Link from "next/link";
import { LockIcon as Lock, SignOutIcon as LogOut, PlusIcon as Plus } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { lockNow, logout } from "@/app/actions/auth";
import { BottomNav, MobileMenu, SideNav } from "@/components/nav";
import { IdleLock, LiveSync, NotificationBell } from "@/components/live";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareMenu } from "@/components/share-menu";
import { Logo } from "@/components/logo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px]">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col px-5 py-6 lg:flex">
        <Link href="/" className="mb-8 px-1" aria-label="Cash Hey home">
          <Logo size={36} />
        </Link>
        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          <SideNav />
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3" style={{ boxShadow: "var(--shadow)" }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-link" aria-hidden>
            {initials || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
          {user.pinHash && (
            <form action={lockNow}>
              <button className="icon-btn h-8 w-8" aria-label="Lock now" title="Lock now">
                <Lock size={16} />
              </button>
            </form>
          )}
          <form action={logout}>
            <button className="icon-btn h-8 w-8" aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-8 lg:py-5">
          <Link href="/" className="lg:hidden" aria-label="Cash Hey home">
            <Logo size={34} hideTextOnMobile />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href="/quick" className="btn-primary mr-1 max-sm:hidden">
              <Plus size={17} /> Log expense
            </Link>
            <ShareMenu />
            <ThemeToggle />
            <NotificationBell />
            <MobileMenu />
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-2 sm:px-8 lg:pb-12">{children}</main>
      </div>

      <BottomNav />
      <LiveSync />
      <IdleLock minutes={user.pinHash ? user.lockAfterMinutes : null} />
    </div>
  );
}
