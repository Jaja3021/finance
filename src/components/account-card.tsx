import { formatMoney } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/lib/templates";
import { InstitutionIcon } from "./institution-icon";
import { AccountEditor } from "./account-editor";

// Used when an account has no brand color (custom accounts).
const FALLBACK: Record<string, string> = {
  cash: "#10b981",
  ewallet: "#0ea5e9",
  bank: "#6366f1",
  other: "#8b5cf6",
  credit_card: "#f97316",
  loan: "#e11d48",
};

/** Lightens (amt > 0) or darkens (amt < 0) a #rrggbb color. */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const [r, g, b] = [f(n >> 16), f((n >> 8) & 255), f(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

type Props = {
  account: {
    id: string;
    name: string;
    type: string;
    institution: string | null;
    currency: string;
    color: string | null;
    balance: number;
    balanceHome: number | null;
    creditLimit: number | null;
    interestRate: number | null;
    householdId: string | null;
    openingBalance: number;
  };
  debt: boolean;
  homeCurrency: string;
  sharedBy: string | null;
  editable: boolean;
  households: { id: string; name: string }[];
};

export function AccountCard({ account: a, debt, homeCurrency, sharedBy, editable, households }: Props) {
  const base = a.color && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : (FALLBACK[a.type] ?? FALLBACK.other);
  const owed = debt ? Math.max(0, -a.balance) : 0;
  const util = debt && a.creditLimit ? Math.min(1, owed / a.creditLimit) : null;
  const subtitle = [ACCOUNT_TYPE_LABELS[a.type as keyof typeof ACCOUNT_TYPE_LABELS] ?? a.type, a.currency, a.interestRate != null ? `${a.interestRate}% APR` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="relative overflow-hidden rounded-2xl p-4 text-white shadow-md"
      style={{ background: `linear-gradient(135deg, ${shade(base, 0.12)} 0%, ${base} 55%, ${shade(base, -0.28)} 100%)` }}
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" aria-hidden />
      <span className="pointer-events-none absolute -bottom-12 right-8 h-24 w-24 rounded-full bg-white/5" aria-hidden />

      <div className="relative flex items-start gap-2.5">
        <InstitutionIcon institution={a.institution} name={a.name} color={shade(base, -0.2)} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{a.name}</div>
          <div className="truncate text-[11px] text-white/75">{subtitle}</div>
        </div>
        {editable && (
          <AccountEditor
            account={{ id: a.id, name: a.name, currency: a.currency, openingBalance: a.openingBalance, householdId: a.householdId, interestRate: a.interestRate, debt }}
            households={households}
            buttonClassName="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
          />
        )}
      </div>

      <div className="relative mt-6">
        <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">{debt ? "Owed" : "Balance"}</div>
        <div className="tabular text-xl font-semibold">{debt ? formatMoney(owed, a.currency) : formatMoney(a.balance, a.currency)}</div>
        {a.currency !== homeCurrency && a.balanceHome !== null && (
          <div className="tabular text-[11px] text-white/75">≈ {formatMoney(Math.abs(a.balanceHome), homeCurrency)}</div>
        )}
      </div>

      {util !== null && (
        <div className="relative mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.round(util * 100)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-white/80">
            {Math.round(util * 100)}% of {formatMoney(a.creditLimit!, a.currency)} limit used
          </div>
        </div>
      )}

      {a.householdId && (
        <div className="relative mt-3 inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[11px]">Shared{sharedBy && ` by ${sharedBy}`}</div>
      )}
    </article>
  );
}
