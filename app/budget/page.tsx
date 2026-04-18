import Link from "next/link";
import { queries } from "@/lib/queries";
import { zar, zarRound, pct, monthLabel } from "@/lib/format";
import { generateBudgetCommentary } from "@/lib/roast";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function barTone(pctUsed: number | null): "ok" | "warn" | "over" {
  if (pctUsed == null) return "ok";
  if (pctUsed >= 100) return "over";
  if (pctUsed >= 80) return "warn";
  return "ok";
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = parseInt(params.y ?? String(now.getFullYear()));
  const month = parseInt(params.m ?? String(now.getMonth() + 1));

  const rows = await queries.monthBudget(year, month);

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual_net, 0);
  const totalRemaining = totalPlanned - totalActual;

  // AI commentary — only for the current month (historical months get a blank slate)
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const commentary = isCurrentMonth
    ? await generateBudgetCommentary({
        budget: rows,
        monthName: monthLabel(year, month),
        daysInMonth: new Date(year, month, 0).getDate(),
        dayOfMonth: now.getDate(),
      })
    : null;

  const prevLink = `/budget?y=${month === 1 ? year - 1 : year}&m=${month === 1 ? 12 : month - 1}`;
  const nextLink = `/budget?y=${month === 12 ? year + 1 : year}&m=${month === 12 ? 1 : month + 1}`;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Budget</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{monthLabel(year, month)}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={prevLink} className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
            ← Prev
          </Link>
          <Link href={nextLink} className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
            Next →
          </Link>
        </div>
      </div>

      {/* Commentary — current month only */}
      {commentary && (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 mb-6">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{commentary}</div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Planned</div>
          <div className="mono text-2xl font-medium mt-2">{zarRound(totalPlanned)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Actual (net)</div>
          <div className="mono text-2xl font-medium mt-2">{zarRound(totalActual)}</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">
            {pct((totalActual / totalPlanned) * 100)} of plan
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Remaining</div>
          <div className={`mono text-2xl font-medium mt-2 ${totalRemaining < 0 ? "text-[var(--color-neg)]" : "text-[var(--color-pos)]"}`}>
            {zarRound(totalRemaining)}
          </div>
        </div>
      </div>

      {/* Category list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-5 py-3 font-normal">Category</th>
              <th className="px-5 py-3 font-normal text-right">Planned</th>
              <th className="px-5 py-3 font-normal text-right">Actual</th>
              <th className="px-5 py-3 font-normal text-right">Remaining</th>
              <th className="px-5 py-3 font-normal w-48">Burn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r) => {
              const remaining = r.planned - r.actual_net;
              const tone = barTone(r.pct_used);
              const fillPct = Math.min(100, r.pct_used ?? 0);
              return (
                <tr key={r.category_id}>
                  <td className="px-5 py-3 font-medium">{r.category_name}</td>
                  <td className="px-5 py-3 text-right mono text-[var(--color-muted)]">{zarRound(r.planned)}</td>
                  <td className={`px-5 py-3 text-right mono ${tone === "over" ? "text-[var(--color-neg)]" : ""}`}>
                    {zarRound(r.actual_net)}
                    {r.actual_refund > 0 && (
                      <span className="text-xs text-[var(--color-muted)] ml-1">(−{zarRound(r.actual_refund)} refund)</span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-right mono ${remaining < 0 ? "text-[var(--color-neg)]" : "text-[var(--color-muted)]"}`}>
                    {zarRound(remaining)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="bar-track flex-1">
                        <div className={`bar-fill ${tone}`} style={{ width: `${fillPct}%` }} />
                      </div>
                      <div className="mono text-xs text-[var(--color-muted)] w-10 text-right">
                        {pct(r.pct_used)}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
