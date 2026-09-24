"use client";

import { useEffect, useRef, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { DownloadSimpleIcon as Download, FileXlsIcon as FileSpreadsheet, PrinterIcon as Printer, ShareNetworkIcon as Share2, LinkIcon as Link2 } from "@phosphor-icons/react/ssr";

/** Top-bar share / export menu. */
export function ShareMenu() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const from = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const to = format(new Date(), "yyyy-MM-dd");
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-2";

  async function shareLink() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote("Link copied");
        setTimeout(() => setNote(null), 1500);
      }
    } catch {}
  }

  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Share or export" aria-expanded={open} title="Share or export">
        <Share2 size={19} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2" style={{ boxShadow: "var(--shadow-lg)" }} role="menu">
          <a role="menuitem" className={item} href={`/api/export/statement?from=${from}&to=${to}`} onClick={() => setOpen(false)}>
            <FileSpreadsheet size={17} className="text-ink-2" /> Export this month (CSV)
          </a>
          <a role="menuitem" className={item} href="/reports?tab=statement">
            <FileSpreadsheet size={17} className="text-ink-2" /> Custom date range…
          </a>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              setTimeout(() => window.print(), 50);
            }}
          >
            <Printer size={17} className="text-ink-2" /> Print / save page as PDF
          </button>
          <a role="menuitem" className={item} href="/api/export/backup" onClick={() => setOpen(false)}>
            <Download size={17} className="text-ink-2" /> Download full backup
          </a>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className={item} onClick={shareLink}>
            <Link2 size={17} className="text-ink-2" /> {note ?? "Share link to this page"}
          </button>
        </div>
      )}
    </div>
  );
}
