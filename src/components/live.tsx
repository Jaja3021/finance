"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon as Bell, CalendarCheckIcon, TargetIcon, FireIcon, TrophyIcon, HandshakeIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

const KIND_ICONS: Record<string, Icon> = {
  bill: CalendarCheckIcon,
  budget: TargetIcon,
  streak: FireIcon,
  badge: TrophyIcon,
  debt: HandshakeIcon,
};

// Background requests don't count as activity for the PIN idle timer.
const bg = { headers: { "x-background": "1" } };

/** Re-renders the page when data visible to this user changes elsewhere. */
export function LiveSync({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/sync", bg);
        if (res.status === 423) return window.location.reload();
        const { v } = await res.json();
        if (last.current !== null && v !== last.current && !stop) router.refresh();
        last.current = v;
      } catch {}
    }
    void poll();
    const id = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [router, intervalMs]);
  return null;
}

/** Locks the screen after the configured idle time, even with no navigation. */
export function IdleLock({ minutes }: { minutes: number | null }) {
  useEffect(() => {
    if (!minutes) return;
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => window.location.assign(new URL("/lock", window.location.href)), minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}

type Item = { id: string; kind: string; title: string; body: string; href: string | null; readAt: number | null; createdAt: number };

/** Bell with unread count; also raises OS notifications if the user allowed them. */
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications", bg);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Item[] };
        const fresh = data.items.filter((n) => !n.readAt && seen.current && !seen.current.has(n.id));
        if (fresh.length && "Notification" in window && Notification.permission === "granted") {
          for (const n of fresh.slice(0, 3)) new Notification(n.title, { body: n.body, tag: n.id });
        }
        seen.current = new Set(data.items.map((n) => n.id));
        setItems(data.items);
      } catch {}
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const unread = items.filter((n) => !n.readAt).length;
  async function markAll() {
    await fetch("/api/notifications", { method: "POST", body: "{}" });
    setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? Date.now() })));
  }

  return (
    <div className="relative">
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-bg">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-link" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {items.map((n) => {
              const Icon = KIND_ICONS[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <a href={n.href ?? "#"} className={`flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-2 ${n.readAt ? "opacity-60" : ""}`}>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-link">
                      <Icon size={15} weight="bold" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      <div className="text-xs text-muted">{n.body}</div>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
