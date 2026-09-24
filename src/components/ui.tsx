import Link from "next/link";
import { CheckIcon, ProhibitIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { formatMoney } from "@/lib/money";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Money({
  value,
  currency,
  className = "",
  sign,
  compact,
  tone,
}: {
  value: number;
  currency: string;
  className?: string;
  sign?: boolean;
  compact?: boolean;
  tone?: "auto" | "none";
}) {
  const color = tone === "auto" ? (value > 0 ? "text-good" : value < 0 ? "text-bad" : "") : "";
  return <span className={`tabular ${color} ${className}`}>{formatMoney(value, currency, { sign, compact })}</span>;
}

/** Stat tile: label · value · optional signed delta. */
export function Stat({
  label,
  value,
  currency,
  delta,
  hint,
}: {
  label: string;
  value: number;
  currency: string;
  delta?: { value: number; label: string } | null;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight">
        <Money value={value} currency={currency} />
      </div>
      {delta && (
        <div className={`text-xs ${delta.value >= 0 ? "text-good" : "text-bad"}`}>
          {delta.value >= 0 ? "▲" : "▼"} <Money value={Math.abs(delta.value)} currency={currency} /> {delta.label}
        </div>
      )}
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-5 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</div>}
      {href && cta && (
        <Link href={href} className="btn-primary mt-5">
          {cta}
        </Link>
      )}
    </div>
  );
}

/** Card heading row: title on the left, an optional link or action on the right. */
export function CardHeader({ title, href, linkLabel, action }: { title: React.ReactNode; href?: string; linkLabel?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="card-title">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="text-sm font-medium text-link hover:underline">
          {linkLabel}
        </Link>
      )}
      {action}
    </div>
  );
}

/** Budget-style meter. Status colors always come with a text label. */
export function Meter({ ratio, alertAt = 0.8 }: { ratio: number; alertAt?: number }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const tone = ratio >= 1 ? "bg-bad" : ratio >= alertAt ? "bg-warn" : "bg-good";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusLabel({ ratio, alertAt = 0.8 }: { ratio: number; alertAt?: number }) {
  const cls = "inline-flex items-center gap-1 text-xs font-medium";
  if (ratio >= 1)
    return (
      <span className={`${cls} text-bad`}>
        <ProhibitIcon size={13} weight="bold" aria-hidden /> Over
      </span>
    );
  if (ratio >= alertAt)
    return (
      <span className={`${cls} text-warn`}>
        <WarningIcon size={13} weight="bold" aria-hidden /> Near limit
      </span>
    );
  return (
    <span className={`${cls} text-good`}>
      <CheckIcon size={13} weight="bold" aria-hidden /> On track
    </span>
  );
}

/** Loading placeholder that keeps the card's title, so the layout never looks empty. */
export function CardSkeleton({ title, note, lines = 3 }: { title: string; note?: string; lines?: number }) {
  return (
    <section className="card" aria-busy="true">
      <div className="mb-4 card-title">{title}</div>
      {note && <p className="mb-3 text-sm text-muted">{note}</p>}
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 animate-pulse rounded-full bg-surface-2" style={{ width: `${90 - i * 18}%` }} />
        ))}
      </div>
    </section>
  );
}
