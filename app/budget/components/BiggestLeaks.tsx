"use client";

import type { BudgetCategory } from "@/lib/budget-adapter";
import { zarRound } from "@/lib/format";

function focusCategory(id: string) {
  window.dispatchEvent(new CustomEvent("budget:focus-category", { detail: { id } }));
}

export function BiggestLeaks({ categories }: { categories: BudgetCategory[] }) {
  const leaks = categories
    .filter((c) => c.planned > 0 && c.actual > c.planned)
    .map((c) => ({
      ...c,
      over: c.actual - c.planned,
      pct: Math.round((c.actual / c.planned) * 100),
    }))
    .sort((a, b) => b.over - a.over)
    .slice(0, 4);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[1.1rem]">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
          Biggest leaks
        </div>
        <div className="text-[11px] text-[var(--color-text-tertiary)]">over plan</div>
      </div>

      {leaks.length === 0 ? (
        <div className="text-[13px] text-[var(--color-text-secondary)] py-6 text-center">
          Nothing over plan — nice.
        </div>
      ) : (
        <div>
          {leaks.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => focusCategory(c.id)}
              className={`w-full flex justify-between items-center py-[9px] text-left hover:bg-[var(--color-surface-alt)] rounded px-1 -mx-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                i < leaks.length - 1 ? "border-b border-[var(--color-border)]" : ""
              } ${i === 0 ? "pt-0" : ""}`}
            >
              <div>
                <div className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  {c.name}
                </div>
                <div className="text-[10px] mt-0.5 tracking-[0.5px] text-[var(--color-danger)]">
                  {c.pct}% of plan
                </div>
              </div>
              <div className="mono text-[13px] font-medium text-[var(--color-danger)] text-right">
                −{zarRound(c.over)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
