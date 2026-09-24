"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { TrashIcon as Trash2 } from "@phosphor-icons/react/ssr";
import type { TxRow } from "@/lib/transactions";
import { deleteTransaction, setTransactionCategory } from "@/app/actions/data";
import { formatMoney } from "@/lib/money";
import { InstitutionIcon } from "./institution-icon";
import { CategoryIcon } from "@/components/category-icon";

type Category = { id: string; name: string; kind: "income" | "expense"; icon: string | null };

export function TxList({ rows, categories, compact }: { rows: TxRow[]; categories?: Category[]; compact?: boolean }) {
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-line">
      {rows.map((t, i) => {
        const showDate = !compact && t.date !== rows[i - 1]?.date;
        const sign = t.type === "expense" ? "−" : t.type === "income" ? "+" : "";
        const splitTotal = t.splits.reduce((s, x) => s + x.amount, 0);
        return (
          <li key={t.id}>
            {showDate && (
              <div className="pb-1 pt-3 text-xs font-medium text-muted">{format(new Date(t.date + "T00:00:00"), "EEEE, MMM d")}</div>
            )}
            <div className="flex items-center gap-3 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink" aria-hidden>
                <CategoryIcon name={t.type === "transfer" ? "__transfer" : t.category?.name} icon={t.category?.icon} size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {t.type === "transfer" ? `${t.account.name} → ${t.toAccount?.name ?? "?"}` : t.payee || t.note || t.category?.name || "Untitled"}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {t.type !== "transfer" && (
                    <span className="inline-flex items-center gap-1">
                      <InstitutionIcon institution={t.account.institution} name={t.account.name} color={t.account.color} size={14} />
                      {t.account.name}
                    </span>
                  )}
                  {compact && <span>{format(new Date(t.date + "T00:00:00"), "MMM d")}</span>}
                  {t.type !== "transfer" &&
                    (categories ? (
                      <span className="inline-flex items-center gap-1">
                        {editing === t.id ? (
                          <select
                            className="rounded-md border border-line bg-surface px-1 py-0.5 text-xs text-ink-2"
                            aria-label="Category"
                            autoFocus
                            defaultValue={t.categoryId ?? ""}
                            onBlur={() => setEditing(null)}
                            onChange={(e) => {
                              setEditing(null);
                              start(() => setTransactionCategory(t.id, e.target.value || null));
                            }}
                          >
                            <option value="">Uncategorized</option>
                            {categories
                              .filter((c) => c.kind === t.type)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            className="rounded-md border border-line px-1.5 py-0.5 hover:bg-surface-2"
                            onClick={() => setEditing(t.id)}
                            title="Change category"
                          >
                            {t.category?.name ?? "Uncategorized"} ▾
                          </button>
                        )}
                        {t.categorySource !== "user" && t.categoryId && (
                          <span className="chip" title="Picked automatically from your past entries. Change it to teach the app.">
                            auto
                          </span>
                        )}
                      </span>
                    ) : (
                      t.category && <span>{t.category.name}</span>
                    ))}
                  {splitTotal > 0 && (
                    <span className="chip">
                      your share {formatMoney(t.amount - splitTotal, t.account.currency)}
                    </span>
                  )}
                  {t.loggedBy && t.account.householdId && <span className="chip">by {t.loggedBy.split(" ")[0]}</span>}
                </div>
              </div>
              <div className={`tabular text-right text-sm font-medium ${t.type === "income" ? "text-good" : ""}`}>
                {sign}
                {formatMoney(t.amount, t.account.currency)}
              </div>
              {!compact && (
                <form action={deleteTransaction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-bad"
                    aria-label="Delete transaction"
                    onClick={(e) => {
                      if (!confirm("Delete this transaction?")) e.preventDefault();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
