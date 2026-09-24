// Pure math, safe to import from client components.

export type PayoffResult =
  | { ok: true; months: number; totalInterest: number; totalPaid: number; schedule: { month: number; interest: number; principal: number; balance: number }[] }
  | { ok: false; reason: string; minPayment: number };

/**
 * Months to clear `balance` paying `payment` each month at `apr` percent
 * (interest compounded monthly). All values in major units.
 */
export function payoff(balance: number, apr: number, payment: number): PayoffResult {
  const r = apr / 100 / 12;
  const firstInterest = balance * r;
  if (payment <= firstInterest) {
    return { ok: false, reason: "The payment doesn't cover the monthly interest, so the balance never goes down.", minPayment: Math.ceil(firstInterest * 100 + 1) / 100 };
  }
  const schedule: { month: number; interest: number; principal: number; balance: number }[] = [];
  let b = balance;
  let totalInterest = 0;
  for (let m = 1; b > 0.005 && m <= 1200; m++) {
    const interest = Math.round(b * r * 100) / 100;
    const pay = Math.min(payment, b + interest);
    const principal = pay - interest;
    b = Math.max(0, Math.round((b - principal) * 100) / 100);
    totalInterest += interest;
    schedule.push({ month: m, interest, principal, balance: b });
  }
  return { ok: true, months: schedule.length, totalInterest, totalPaid: balance + totalInterest, schedule };
}
