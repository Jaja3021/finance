import { CheckCircleIcon, CircleHalfIcon, CircleIcon } from "@phosphor-icons/react/ssr";
import type { DebtStatus } from "@/db/schema";

// Matches the style of StatusLabel in ui.tsx (text + icon, no fill).
export function DebtStatusBadge({ status }: { status: DebtStatus }) {
  const cls = "inline-flex items-center gap-1 text-xs font-medium";
  if (status === "paid")
    return (
      <span className={`${cls} text-good`}>
        <CheckCircleIcon size={13} weight="fill" aria-hidden /> Paid
      </span>
    );
  if (status === "partial")
    return (
      <span className={`${cls} text-warn`}>
        <CircleHalfIcon size={13} weight="fill" aria-hidden /> Partially paid
      </span>
    );
  return (
    <span className={`${cls} text-ink-2`}>
      <CircleIcon size={13} weight="bold" aria-hidden /> Pending
    </span>
  );
}
