import type { BudgetCategory } from "@/lib/budget-adapter";
import { zarRound } from "@/lib/format";

function burnColor(pct: number): string {
  if (pct > 100) return "var(--color-danger)";
  if (pct >= 80) return "var(--color-warning)";
  return "var(--color-brand-400)";
}

function pctLabelColor(pct: number): string {
  if (pct > 100) return "var(--color-danger)";
  if (pct >= 80) return "var(--color-warning)";
  return "var(--color-brand-600)";
}

export function CategoryTable({ categories }: { categories: BudgetCategory[] }) {
  const rows = [...categories]
    .map((c) => ({
      ...c,
      pct: c.planned > 0 ? Math.round((c.actual / c.planned) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[1.1rem]">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
          Categories
        </div>
        <div className="text-[11px] text-[var(--color-text-tertiary)]">sorted by burn</div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1.3fr_70px_90px_55px] gap-3 items-center pb-[6px] border-b border-[var(--color-border)] text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
        <span>Category</span>
        <span className="text-right">Spent</span>
        <span>Burn</span>
        <span className="text-right">%</span>
      </div>

      {/* Data rows */}
      {rows.map((r, i) => {
        const fillWidth = Math.min(100, r.pct);
        return (
          <div
            key={r.id}
            className={`grid grid-cols-[1.3fr_70px_90px_55px] gap-3 items-center py-[7px] text-[12px] ${
              i < rows.length - 1 ? "border-b border-[var(--color-border)]" : ""
            }`}
          >
            <span className="font-medium text-[var(--color-text-primary)]">{r.name}</span>
            <span className="mono text-right text-[var(--color-text-primary)]">{zarRound(r.actual)}</span>
            <div className="relative h-[5px] bg-[var(--color-brand-50)] rounded-[3px] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-[3px]"
                style={{ width: `${fillWidth}%`, background: burnColor(r.pct) }}
              />
            </div>
            <span className="mono text-right" style={{ color: pctLabelColor(r.pct) }}>
              {r.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
