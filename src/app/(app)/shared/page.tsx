import { and, eq, inArray } from "drizzle-orm";
import { format, parseISO } from "date-fns";
import { CheckIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { householdIdsFor } from "@/lib/access";
import { formatMoney } from "@/lib/money";
import { leaveHousehold, settleSplit } from "@/app/actions/data";
import { PageHeader, Empty } from "@/components/ui";
import { HouseholdForms } from "@/components/simple-forms";

export default async function SharedPage() {
  const user = await requireUser();

  // Split expenses: who owes the user what.
  const splits = await db
    .select({ split: schema.splits, tx: schema.transactions, currency: schema.accounts.currency })
    .from(schema.splits)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.splits.transactionId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(eq(schema.transactions.userId, user.id))
    .orderBy(schema.transactions.date)
    .all();
  type Person = { open: typeof splits; settled: number; owed: Map<string, number> };
  const byPerson = new Map<string, Person>();
  for (const s of splits) {
    const key = s.split.person.trim();
    const p: Person = byPerson.get(key.toLowerCase()) ?? { open: [], settled: 0, owed: new Map() };
    if (s.split.settled) p.settled++;
    else {
      p.open.push(s);
      p.owed.set(s.currency, (p.owed.get(s.currency) ?? 0) + s.split.amount);
    }
    byPerson.set(key.toLowerCase(), p);
  }
  const people = [...byPerson.entries()].sort((a, b) => b[1].open.length - a[1].open.length);

  const hhIds = await householdIdsFor(user.id);
  const households = hhIds.length ? await db.select().from(schema.households).where(inArray(schema.households.id, hhIds)).all() : [];
  const members = hhIds.length
    ? await db
        .select({ householdId: schema.householdMembers.householdId, name: schema.users.name, id: schema.users.id })
        .from(schema.householdMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
        .where(inArray(schema.householdMembers.householdId, hhIds))
        .all()
    : [];
  const sharedAccounts = hhIds.length
    ? await db.select().from(schema.accounts).where(and(inArray(schema.accounts.householdId, hhIds), eq(schema.accounts.archived, false))).all()
    : [];

  return (
    <div>
      <PageHeader title="Shared money" description="Split expenses with friends, and share accounts with your household." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="card">
          <h2 className="card-title mb-3">Who owes you</h2>
          {people.length === 0 ? (
            <Empty title="No split expenses yet">When adding an expense, use “Split with others”, or tell the assistant “split dinner 1200 with Ana”.</Empty>
          ) : (
            <ul className="space-y-4">
              {people.map(([k, p]) => (
                <li key={k} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.open[0]?.split.person ?? k}</span>
                    <span className="tabular text-sm">
                      {p.owed.size === 0 ? (
                        <span className="inline-flex items-center gap-1 text-good">
                          <CheckIcon size={14} weight="bold" aria-hidden /> All settled
                        </span>
                      ) : (
                        [...p.owed].map(([c, v]) => formatMoney(v, c)).join(" + ")
                      )}
                    </span>
                  </div>
                  {p.open.length > 0 && (
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {p.open.map((s) => (
                        <li key={s.split.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 truncate text-ink-2">
                            {format(parseISO(s.tx.date), "MMM d")} · {s.tx.payee || s.tx.note || "Expense"} ({formatMoney(s.tx.amount, s.currency)} total)
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="tabular">{formatMoney(s.split.amount, s.currency)}</span>
                            <form action={settleSplit}>
                              <input type="hidden" name="id" value={s.split.id} />
                              <button className="btn-ghost px-2 py-0.5 text-xs">Paid back</button>
                            </form>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.settled > 0 && <p className="mt-1 text-xs text-muted">{p.settled} settled earlier</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {households.map((h) => (
            <section key={h.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <UsersThreeIcon size={18} weight="fill" className="text-link" aria-hidden /> {h.name}
                  </h2>
                  <p className="text-sm text-muted">
                    Invite code <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{h.inviteCode}</span>
                  </p>
                </div>
                <form action={leaveHousehold}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="text-xs text-muted hover:text-bad">Leave</button>
                </form>
              </div>
              <div className="mt-3 text-sm">
                <div className="text-xs text-muted">Members</div>
                <div>{members.filter((m) => m.householdId === h.id).map((m) => (m.id === user.id ? `${m.name} (you)` : m.name)).join(", ")}</div>
              </div>
              <div className="mt-3 text-sm">
                <div className="text-xs text-muted">Shared accounts</div>
                {sharedAccounts.filter((a) => a.householdId === h.id).length === 0 ? (
                  <p className="text-muted">None yet. Open an account on the Accounts page and choose “Share with household”.</p>
                ) : (
                  <ul>
                    {sharedAccounts
                      .filter((a) => a.householdId === h.id)
                      .map((a) => (
                        <li key={a.id}>{a.name}</li>
                      ))}
                  </ul>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">Everyone in the household can log to shared accounts. Balances refresh for everyone within about 20 seconds.</p>
            </section>
          ))}
          <section className="card">
            <h2 className="card-title mb-3">{households.length ? "Another household" : "Family or shared budget"}</h2>
            <HouseholdForms />
          </section>
        </div>
      </div>
    </div>
  );
}
