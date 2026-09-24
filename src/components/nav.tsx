"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquaresFourIcon as LayoutDashboard, ArrowsLeftRightIcon as ArrowLeftRight, SparkleIcon as Sparkles, WalletIcon as Wallet, TrendUpIcon as TrendingUp, TargetIcon as Target, CalendarCheckIcon as CalendarClock, HandshakeIcon as Handshake, ChartBarIcon as FileBarChart, UsersIcon as Users, TrophyIcon as Trophy, GearSixIcon as Settings, ListIcon as Menu, PlusIcon as Plus } from "@phosphor-icons/react/ssr";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/bills", label: "Bills", icon: CalendarClock },
  { href: "/debts", label: "Debts", icon: Handshake },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/shared", label: "Shared", icon: Users },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE = ["/", "/transactions", "/assistant", "/reports"];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active ? "bg-accent-soft font-semibold text-link" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {active && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />}
            <Icon size={19} weight={active ? "fill" : "regular"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Main"
    >
      {NAV.filter((n) => MOBILE.includes(n.href)).flatMap(({ href, label, icon: Icon }, i) => {
        const item = (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive(path, href) ? "font-semibold text-link" : "text-muted"}`}
          >
            <Icon size={20} aria-hidden />
            {label}
          </Link>
        );
        // The big + in the middle opens the three-tap logger.
        return i === 2
          ? [
              <Link key="/quick" href="/quick" className="flex items-center justify-center" aria-label="Log expense">
                <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg ring-4 ring-bg">
                  <Plus size={28} />
                </span>
              </Link>,
              item,
            ]
          : [item];
      })}
    </nav>
  );
}

export function MobileMenu() {
  const path = usePathname();
  return (
    <details className="relative lg:hidden" key={path}>
      <summary className="icon-btn list-none" aria-label="More pages">
        <Menu size={18} />
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-line bg-surface p-2" style={{ boxShadow: "var(--shadow-lg)" }}>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${isActive(path, href) ? "bg-accent-soft font-semibold text-link" : "text-ink-2 hover:bg-surface-2"}`}
          >
            <Icon size={16} aria-hidden /> {label}
          </Link>
        ))}
      </div>
    </details>
  );
}
