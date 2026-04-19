import type { BudgetCategory } from "@/lib/budget-adapter";
import { zarRound } from "@/lib/format";

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_COLORS = ["#534AB7", "#7F77DD", "#AFA9EC", "#CECBF6"];
const OTHERS_COLOR = "#EEEDFE";

type Segment = {
  key: string;
  name: string;
  amount: number;
  pct: number;
  color: string;
  border?: string;
};

function buildSegments(categories: BudgetCategory[], totalActual: number): Segment[] {
  const positive = categories.filter((c) => c.actual > 0);
  const sorted = [...positive].sort((a, b) => b.actual - a.actual);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const restTotal = rest.reduce((s, c) => s + c.actual, 0);

  const segs: Segment[] = top.map((c, i) => ({
    key: c.id,
    name: c.name,
    amount: c.actual,
    pct: totalActual > 0 ? (c.actual / totalActual) * 100 : 0,
    color: SEGMENT_COLORS[i],
  }));
  if (restTotal > 0) {
    segs.push({
      key: "__others",
      name: "All others",
      amount: restTotal,
      pct: totalActual > 0 ? (restTotal / totalActual) * 100 : 0,
      color: OTHERS_COLOR,
      border: "var(--color-border)",
    });
  }
  return segs;
}

export function SpendingDonut({
  categories,
  totalActual,
}: {
  categories: BudgetCategory[];
  totalActual: number;
}) {
  const segments = buildSegments(categories, totalActual);

  let accumulated = 0;
  const svgSegments = segments.map((s) => {
    const length = (s.pct / 100) * CIRCUMFERENCE;
    const el = {
      ...s,
      dashArray: `${length} ${CIRCUMFERENCE - length}`,
      dashOffset: -accumulated,
    };
    accumulated += length;
    return el;
  });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[1.1rem]">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
          Spending by category
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 160 160" className="w-[150px] h-[150px]" xmlns="http://www.w3.org/2000/svg">
          <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--color-brand-50)" strokeWidth="22" />
          {svgSegments.map((s) => (
            <circle
              key={s.key}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth="22"
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.dashOffset}
              transform="rotate(-90 80 80)"
            />
          ))}
          <text x="80" y="75" textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)" letterSpacing="1">
            SPENT
          </text>
          <text x="80" y="93" textAnchor="middle" fontSize="15" fill="var(--color-text-primary)" fontWeight="500" fontFamily="var(--font-mono)">
            {zarRound(totalActual)}
          </text>
        </svg>

        <div className="w-full flex flex-col gap-1.5 mt-1">
          {segments.map((s) => (
            <div key={s.key} className="flex justify-between items-center text-[11px]">
              <div className="flex items-center gap-[7px]">
                <span
                  className="w-2 h-2 rounded-[2px] shrink-0"
                  style={{ background: s.color, border: s.border ? `0.5px solid ${s.border}` : undefined }}
                />
                <span className="text-[var(--color-text-primary)]">{s.name}</span>
              </div>
              <span className="mono text-[var(--color-text-secondary)]">{Math.round(s.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
