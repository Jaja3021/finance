import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { accessibleAccounts } from "@/lib/access";
import { listTransactions } from "@/lib/transactions";
import { PageHeader, Empty } from "@/components/ui";
import { TxForm } from "@/components/tx-form";
import { TxList } from "@/components/tx-list";

export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const accounts = await accessibleAccounts(user.id);
  const categories = await db.select().from(schema.categories).where(eq(schema.categories.userId, user.id)).orderBy(schema.categories.name).all();
  const filter = { q: q("q"), accountId: q("account"), categoryId: q("category"), from: q("from"), to: q("to") };
  const limit = Math.min(2000, Math.max(100, Number(q("limit")) || 100));
  const rows = await listTransactions(user.id, { ...filter, limit: limit + 1 });
  const more = rows.length > limit;
  if (more) rows.pop();
  const moreHref = `/transactions?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v) as [string, string][]), limit: String(limit + 100) })}`;
  const filtered = Object.values(filter).some(Boolean);

  return (
    <div>
      <PageHeader title="Transactions" description="Categories are picked automatically from your history. Change one to teach the app." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
        <section className="card order-2 xl:order-1">
          <form className="mb-3 flex flex-wrap gap-2 [&>*]:min-w-0" role="search">
            <input className="input min-w-[10rem] flex-[2_1_10rem]" name="q" defaultValue={filter.q} placeholder="Search" aria-label="Search" />
            <select className="input flex-[1_1_9rem]" name="account" defaultValue={filter.accountId ?? ""} aria-label="Account">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select className="input flex-[1_1_9rem]" name="category" defaultValue={filter.categoryId ?? ""} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex flex-[2_1_18rem] items-center gap-2">
              <input className="input min-w-0" type="date" name="from" defaultValue={filter.from} aria-label="From date" />
              <span className="text-xs text-muted">to</span>
              <input className="input min-w-0" type="date" name="to" defaultValue={filter.to} aria-label="To date" />
            </div>
            <button className="btn-ghost flex-none">Filter</button>
          </form>
          {rows.length ? (
            <>
              <TxList rows={rows} categories={categories} />
              {more && (
                <div className="mt-3 text-center">
                  <a className="btn-ghost" href={moreHref}>
                    Show more
                  </a>
                </div>
              )}
            </>
          ) : (
            <Empty title={filtered ? "Nothing matches these filters" : "No transactions yet"}>
              {filtered ? "Try a wider date range." : "Add one with the form, or type it on the Assistant page."}
            </Empty>
          )}
        </section>
        <section className="card order-1 h-fit xl:sticky xl:top-20 xl:order-2">
          <h2 className="card-title mb-3">Add transaction</h2>
          <TxForm accounts={accounts} categories={categories} />
        </section>
      </div>
    </div>
  );
}
