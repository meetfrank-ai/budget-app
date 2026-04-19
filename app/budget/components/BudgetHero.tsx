import Link from "next/link";
import { zarRound } from "@/lib/format";
import { shiftMonth } from "@/lib/budget-adapter";

export function BudgetHero({
  month,
  monthLabel,
  planned,
  actual,
  daysInMonth,
  dayOfMonth,
}: {
  month: string;
  monthLabel: string;
  planned: number;
  actual: number;
  daysInMonth: number;
  dayOfMonth: number;
}) {
  const biggest = Math.max(actual, planned, 1);
  const fillPct = (Math.min(actual, planned) / biggest) * 100;
  const spillPct = (Math.max(0, actual - planned) / biggest) * 100;
  const tickPct = (dayOfMonth / daysInMonth) * 100;

  const over = actual - planned;
  const pctOfPlan = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const isOver = over > 0;
  const pillText = isOver
    ? `▲ ${zarRound(over)} over · ${pctOfPlan}%`
    : `▼ ${zarRound(-over)} under · ${pctOfPlan}%`;
  const pillCls = isOver
    ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
    : "bg-[rgba(59,109,17,0.10)] text-[var(--color-success)]";

  const prevHref = `/budget?month=${shiftMonth(month, -1)}`;
  const nextHref = `/budget?month=${shiftMonth(month, 1)}`;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] mb-2.5 px-5 py-[1.1rem] relative">
      <div className="grid grid-cols-[auto_1fr_auto] gap-6 items-center">
        {/* Left: month title + day label */}
        <div>
          <div className="text-[16px] font-medium tracking-[-0.01em] text-[var(--color-text-primary)]">
            {monthLabel}
          </div>
          <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)] mt-0.5">
            Day {dayOfMonth} of {daysInMonth}
          </div>
        </div>

        {/* Middle: overflow bar */}
        <div className="relative pt-3">
          <span
            className="absolute -top-1 text-[9px] uppercase tracking-[1px] font-medium text-[var(--color-text-secondary)] -translate-x-1/2"
            style={{ left: `${tickPct}%` }}
          >
            Today
          </span>
          <div className="relative h-[22px] bg-[var(--color-brand-50)] rounded-[5px]">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--color-brand-400)] rounded-l-[5px]"
              style={{ width: `${fillPct}%`, borderTopRightRadius: spillPct > 0 ? 0 : 5, borderBottomRightRadius: spillPct > 0 ? 0 : 5 }}
            />
            {spillPct > 0 && (
              <div
                className="absolute -top-[3px] -bottom-[3px] bg-[var(--color-danger)] rounded-r-[5px]"
                style={{ left: `${fillPct}%`, width: `${spillPct}%` }}
              />
            )}
            <div
              className="absolute -top-2 -bottom-2 w-[1.5px] bg-[var(--color-text-primary)] opacity-45"
              style={{ left: `${tickPct}%` }}
            />
          </div>
        </div>

        {/* Right: amount + over/under pill + prev/next arrows */}
        <div className="text-right">
          <div className="flex items-center justify-end gap-2 mb-1">
            <Link
              href={prevHref}
              aria-label="Previous month"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand-400)] hover:text-[var(--color-brand-400)] transition-colors"
            >
              ‹
            </Link>
            <Link
              href={nextHref}
              aria-label="Next month"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand-400)] hover:text-[var(--color-brand-400)] transition-colors"
            >
              ›
            </Link>
          </div>
          <div className="mono text-[22px] font-medium tracking-[-0.02em] text-[var(--color-text-primary)]">
            {zarRound(actual)}
          </div>
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.3px] px-2 py-[3px] rounded-full ${pillCls}`}>
              {pillText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
