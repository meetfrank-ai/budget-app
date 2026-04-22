import type { BudgetCategory } from "@/lib/budget-adapter";
import { zarRound, shortDate } from "@/lib/format";

export function BusinessSection({ categories }: { categories: BudgetCategory[] }) {
  if (categories.length === 0) return null;

  const total = categories.reduce((s, c) => s + c.actual, 0);
  const hasActivity = categories.some((c) => c.actual !== 0 || c.transactions.length > 0);

  return (
    <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-white">
      <header className="flex items-baseline justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Business</div>
          <h2 className="text-base font-semibold tracking-tight mt-0.5">Frank &amp; Gelato</h2>
        </div>
        <div className="mono text-sm">{zarRound(total)}</div>
      </header>

      {!hasActivity ? (
        <div className="px-5 py-4 text-sm text-[var(--color-muted)]">
          No spend yet this month.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {categories.map((c) => (
            <li key={c.id} className="px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="mono text-sm">{zarRound(c.actual)}</span>
              </div>
              {c.transactions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.transactions.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between text-xs text-[var(--color-muted)] gap-3">
                      <span className="mono shrink-0 w-14">{shortDate(t.date)}</span>
                      <span className="flex-1 break-words">{t.merchant}</span>
                      <span className="mono shrink-0">{zarRound(t.amount)}</span>
                    </li>
                  ))}
                  {c.transactions.length > 6 && (
                    <li className="text-xs text-[var(--color-muted)] pl-14">
                      + {c.transactions.length - 6} more
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
