import { eq } from "drizzle-orm";
import { format, getDate, getDaysInMonth } from "date-fns";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { budgetStatus } from "@/lib/engagement";
import { formatMoney, toMajor } from "@/lib/money";
import { deleteBudget } from "@/app/actions/data";
import { PageHeader, Meter, StatusLabel, Empty } from "@/components/ui";
import { BudgetForm, CategoryForm } from "@/components/simple-forms";
import { CategoryIcon } from "@/components/category-icon";

export default async function BudgetsPage(props: PageProps<"/budgets">) {
  const user = await requireUser();
  const { edit } = await props.searchParams;
  const home = user.homeCurrency;
  const budgets = await budgetStatus(user.id, home);
  const categories = db.select().from(schema.categories).where(eq(schema.categories.userId, user.id)).orderBy(schema.categories.name).all();
  const editing = budgets.find((b) => b.id === edit);
  const now = new Date();
  const daysLeft = getDaysInMonth(now) - getDate(now) + 1;
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div>
      <PageHeader
        title="Budgets"
        description={`${format(now, "MMMM")} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. You get an alert when a category nears or passes its limit.`}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
        <section className="card">
          {budgets.length === 0 ? (
            <Empty title="No budgets yet">Set a monthly limit for the categories you want to watch.</Empty>
          ) : (
            <>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted">Total budgeted</div>
                  <div className="text-xl font-semibold tabular">
                    {formatMoney(totalSpent, home)} <span className="text-sm font-normal text-muted">of {formatMoney(totalLimit, home)}</span>
                  </div>
                </div>
                <StatusLabel ratio={totalLimit ? totalSpent / totalLimit : 0} />
              </div>
              <ul className="space-y-4">
                {budgets.map((b) => {
                  const left = b.limit - b.spent;
                  return (
                    <li key={b.id}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <CategoryIcon name={b.categoryName} icon={b.icon} size={18} tile />
                          {b.categoryName}
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusLabel ratio={b.ratio} alertAt={b.alertAt} />
                          <span className="tabular">{formatMoney(b.spent, home)} / {formatMoney(b.limit, home)}</span>
                        </span>
                      </div>
                      <Meter ratio={b.ratio} alertAt={b.alertAt} />
                      <div className="mt-1 flex justify-between text-xs text-muted">
                        <span>
                          {left >= 0
                            ? `${formatMoney(left, home)} left · about ${formatMoney(Math.floor(left / daysLeft), home)}/day`
                            : `${formatMoney(-left, home)} over`}
                        </span>
                        <span className="flex gap-3">
                          <a className="text-link" href={`/budgets?edit=${b.id}`}>Edit</a>
                          <form action={deleteBudget}>
                            <input type="hidden" name="id" value={b.id} />
                            <button className="hover:text-bad">Delete</button>
                          </form>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
        <div className="space-y-5">
          <section className="card">
            <h2 className="card-title mb-3">{editing ? `Edit ${editing.categoryName}` : "Set a budget"}</h2>
            <BudgetForm
              categories={categories}
              currency={home}
              initial={editing ? { categoryId: editing.categoryId, limit: String(toMajor(editing.limit, home)), alertAt: editing.alertAt } : undefined}
            />
          </section>
          <section className="card">
            <h2 className="card-title mb-3">Custom categories</h2>
            <CategoryForm />
          </section>
        </div>
      </div>
    </div>
  );
}
