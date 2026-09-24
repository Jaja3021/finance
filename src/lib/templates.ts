import type { AccountType } from "@/db/schema";
import { LOGO_FILES } from "./logos.generated";

// One-tap account templates. Philippine banks and e-wallets by default; add
// your own entries here (the key is stored as `accounts.institution`).
export type AccountTemplate = {
  key: string;
  name: string;
  type: AccountType;
  currency: string;
  color: string;
  group: "Banks" | "Digital banks" | "E-wallets" | "Credit cards" | "Other";
};

export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  { key: "bdo", name: "BDO Savings", type: "bank", currency: "PHP", color: "#1a3d8f", group: "Banks" },
  { key: "bpi", name: "BPI Savings", type: "bank", currency: "PHP", color: "#b11116", group: "Banks" },
  { key: "metrobank", name: "Metrobank Savings", type: "bank", currency: "PHP", color: "#1f4e9c", group: "Banks" },
  { key: "landbank", name: "Landbank Savings", type: "bank", currency: "PHP", color: "#138a36", group: "Banks" },
  { key: "pnb", name: "PNB Savings", type: "bank", currency: "PHP", color: "#0b3a74", group: "Banks" },
  { key: "securitybank", name: "Security Bank", type: "bank", currency: "PHP", color: "#0a8f5a", group: "Banks" },
  { key: "unionbank", name: "UnionBank", type: "bank", currency: "PHP", color: "#f07c00", group: "Banks" },
  { key: "rcbc", name: "RCBC Savings", type: "bank", currency: "PHP", color: "#1b4f9b", group: "Banks" },
  { key: "chinabank", name: "China Bank Savings", type: "bank", currency: "PHP", color: "#c8102e", group: "Banks" },
  { key: "eastwest", name: "EastWest Savings", type: "bank", currency: "PHP", color: "#6a1b9a", group: "Banks" },
  { key: "bdo-usd", name: "BDO Dollar Savings", type: "bank", currency: "USD", color: "#1a3d8f", group: "Banks" },
  { key: "gotyme", name: "GoTyme Bank", type: "bank", currency: "PHP", color: "#00b3b0", group: "Digital banks" },
  { key: "mayabank", name: "Maya Savings", type: "bank", currency: "PHP", color: "#00a86b", group: "Digital banks" },
  { key: "cimb", name: "CIMB Bank PH", type: "bank", currency: "PHP", color: "#b5121b", group: "Digital banks" },
  { key: "tonik", name: "Tonik", type: "bank", currency: "PHP", color: "#7b2ff7", group: "Digital banks" },
  { key: "seabank", name: "MariBank (SeaBank)", type: "bank", currency: "PHP", color: "#ee4d2d", group: "Digital banks" },
  { key: "gcash", name: "GCash", type: "ewallet", currency: "PHP", color: "#0070e0", group: "E-wallets" },
  { key: "maya", name: "Maya Wallet", type: "ewallet", currency: "PHP", color: "#00a86b", group: "E-wallets" },
  { key: "grabpay", name: "GrabPay", type: "ewallet", currency: "PHP", color: "#00b14f", group: "E-wallets" },
  { key: "shopeepay", name: "ShopeePay", type: "ewallet", currency: "PHP", color: "#ee4d2d", group: "E-wallets" },
  { key: "coinsph", name: "Coins.ph", type: "ewallet", currency: "PHP", color: "#2f6fed", group: "E-wallets" },
  { key: "paypal", name: "PayPal", type: "ewallet", currency: "USD", color: "#003087", group: "E-wallets" },
  { key: "bdo-cc", name: "BDO Credit Card", type: "credit_card", currency: "PHP", color: "#1a3d8f", group: "Credit cards" },
  { key: "bpi-cc", name: "BPI Credit Card", type: "credit_card", currency: "PHP", color: "#b11116", group: "Credit cards" },
  { key: "metrobank-cc", name: "Metrobank Credit Card", type: "credit_card", currency: "PHP", color: "#1f4e9c", group: "Credit cards" },
  { key: "securitybank-cc", name: "Security Bank Credit Card", type: "credit_card", currency: "PHP", color: "#0a8f5a", group: "Credit cards" },
  { key: "rcbc-cc", name: "RCBC Credit Card", type: "credit_card", currency: "PHP", color: "#1b4f9b", group: "Credit cards" },
  { key: "cash", name: "Cash Wallet", type: "cash", currency: "PHP", color: "#4b5563", group: "Other" },
  { key: "pagibig", name: "Pag-IBIG Loan", type: "loan", currency: "PHP", color: "#1e3a8a", group: "Other" },
  { key: "sss-loan", name: "SSS Loan", type: "loan", currency: "PHP", color: "#1d4ed8", group: "Other" },
];

// Variants share their bank's logo: "bdo-cc" and "bdo-usd" use "bdo".
const LOGO_ALIASES: Record<string, string> = { mayabank: "maya", "sss-loan": "sss" };

/** Path of the institution's logo in /public, or null (the UI shows a monogram). */
export function logoFor(institution: string | null | undefined): string | null {
  if (!institution) return null;
  const key = LOGO_ALIASES[institution] ?? institution;
  return LOGO_FILES[key] ?? LOGO_FILES[key.split("-")[0]] ?? null;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-wallet",
  credit_card: "Credit card",
  loan: "Loan",
  other: "Other",
};
