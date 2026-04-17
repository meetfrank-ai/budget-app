"use client";

import { useState, useTransition } from "react";
import { changeCategoryAction } from "./actions";
import type { Category, Transaction } from "@/lib/queries";
import { zar } from "@/lib/format";

/**
 * A single transaction row in the review list. Tap the category pill to
 * open a bottom-sheet picker showing the 3 most-used categories + "More…".
 * Category change does NOT approve — Lock-in button approves everything.
 */
export function ReviewRow({
  tx,
  topCategoryIds,
  categories,
}: {
  tx: Transaction;
  topCategoryIds: string[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(categoryId: string) {
    const fd = new FormData();
    fd.set("transaction_id", tx.id);
    fd.set("category_id", categoryId);
    fd.set("description", tx.description);
    fd.set("create_rule", "on");
    startTransition(() => {
      changeCategoryAction(fd);
      setOpen(false);
      setShowAll(false);
    });
  }

  const suggested = topCategoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);
  const suggestedIds = new Set(suggested.map((c) => c.id));
  const fallback = tx.category_id
    ? categories.find((c) => c.id === tx.category_id)
    : null;
  const topPills = [...suggested];
  if (fallback && !suggestedIds.has(fallback.id)) topPills.push(fallback);

  return (
    <li className={`rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="mono text-xs text-[var(--color-muted)] shrink-0 w-10">
            {tx.occurred_time ?? ""}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{tx.description}</div>
            <div className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
              {tx.account_name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            disabled={pending}
            className={`text-xs px-2.5 py-1 rounded-full ${
              tx.category_id
                ? "bg-slate-100 border border-[var(--color-border)]"
                : "border border-dashed border-[var(--color-warn)] text-[var(--color-warn)] bg-amber-50"
            }`}
          >
            {tx.category_name ?? "Other"} ↓
          </button>
          <span className="mono text-sm">{zar(tx.amount_zar)}</span>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)] mb-2">
            Change category
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {topPills.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => pick(c.id)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  c.id === tx.category_id
                    ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
                    : "bg-white border-[var(--color-border)] hover:text-[var(--color-ink)]"
                }`}
              >
                {c.name}
              </button>
            ))}
            {!showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs px-2 py-1 rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                More…
              </button>
            )}
          </div>
          {showAll && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--color-border)]">
              {categories
                .filter((c) => !suggestedIds.has(c.id) && c.id !== tx.category_id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={pending}
                    onClick={() => pick(c.id)}
                    className="text-xs px-2 py-1 rounded-full border border-[var(--color-border)] bg-white hover:text-[var(--color-ink)]"
                  >
                    {c.name}
                  </button>
                ))}
            </div>
          )}
          <div className="mt-2 text-xs text-[var(--color-muted)]">
            Future {tx.description.split(" ").slice(0, 2).join(" ")} charges will auto-categorise.
          </div>
        </div>
      )}
    </li>
  );
}
