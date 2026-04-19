import type { DailyTotal } from "@/lib/budget-adapter";
import { zarRound } from "@/lib/format";

const X_MIN = 40;
const X_MAX = 760;
const Y_BASE = 240;
const Y_TOP = 20;
const Y_RANGE = Y_BASE - Y_TOP; // 220

function xForDay(day: number, daysInMonth: number): number {
  return X_MIN + (day / daysInMonth) * (X_MAX - X_MIN);
}

function yForAmount(amount: number, planned: number): number {
  const scale = 1.2 * Math.max(planned, 1);
  return Y_BASE - (amount / scale) * Y_RANGE;
}

function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
}

function kLabel(n: number): string {
  if (n === 0) return "R0";
  const k = n / 1000;
  return k === Math.round(k) ? `R${k}k` : `R${k.toFixed(1)}k`;
}

export function CashFlowChart({
  dailyTotals,
  planned,
  daysInMonth,
  dayOfMonth,
  month,
}: {
  dailyTotals: DailyTotal[];
  planned: number;
  daysInMonth: number;
  dayOfMonth: number;
  month: string;
}) {
  const todayCum = dailyTotals.length > 0 ? dailyTotals[dailyTotals.length - 1].cumulative : 0;
  const paceExpected = (planned / daysInMonth) * dayOfMonth;
  const variance = todayCum - paceExpected;

  // Area + line path through (day 0, 0) then each cumulative point
  const points: Array<[number, number]> = [[xForDay(0, daysInMonth), Y_BASE]];
  for (const d of dailyTotals) {
    points.push([xForDay(d.day, daysInMonth), yForAmount(d.cumulative, planned)]);
  }

  const linePath = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
  const lastPt = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPt[0]} ${Y_BASE} L ${points[0][0]} ${Y_BASE} Z`;

  const paceEndY = yForAmount(planned, planned);
  const mid = Math.round(daysInMonth / 2);
  const short = monthShort(month);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[1.1rem]">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
          Cash flow
        </div>
        <div className="text-[11px] text-[var(--color-text-tertiary)]">
          {Math.abs(variance) < 200 ? (
            <span>on pace</span>
          ) : (
            <span className={variance > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
              {zarRound(Math.abs(variance))} {variance > 0 ? "ahead of pace" : "behind pace"}
            </span>
          )}
        </div>
      </div>

      <svg viewBox="0 0 800 260" className="w-full h-auto block mt-1" xmlns="http://www.w3.org/2000/svg">
        {/* Baseline */}
        <line x1={X_MIN} y1={Y_BASE} x2={X_MAX} y2={Y_BASE} stroke="var(--color-border)" strokeWidth="1" />
        {/* Mid gridline */}
        <line
          x1={X_MIN}
          y1={yForAmount(planned / 2, planned)}
          x2={X_MAX}
          y2={yForAmount(planned / 2, planned)}
          stroke="var(--color-border)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />
        {/* Planned gridline */}
        <line
          x1={X_MIN}
          y1={paceEndY}
          x2={X_MAX}
          y2={paceEndY}
          stroke="var(--color-border)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />

        {/* Y axis labels */}
        <text x={X_MIN - 6} y={Y_BASE + 4} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
          R0
        </text>
        <text
          x={X_MIN - 6}
          y={yForAmount(planned / 2, planned) + 4}
          textAnchor="end"
          fontSize="10"
          fill="var(--color-text-tertiary)"
          fontFamily="var(--font-mono)"
        >
          {kLabel(planned / 2)}
        </text>
        <text x={X_MIN - 6} y={paceEndY + 4} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
          {kLabel(planned)}
        </text>

        {/* X axis labels */}
        <text x={X_MIN} y={258} textAnchor="start" fontSize="10" fill="var(--color-text-tertiary)">
          {short} 1
        </text>
        <text x={(X_MIN + X_MAX) / 2} y={258} textAnchor="middle" fontSize="10" fill="var(--color-text-tertiary)">
          {short} {mid}
        </text>
        <text x={X_MAX} y={258} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)">
          {short} {daysInMonth}
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="var(--color-brand-400)" opacity="0.15" />

        {/* Pace line */}
        <line
          x1={X_MIN}
          y1={Y_BASE}
          x2={X_MAX}
          y2={paceEndY}
          stroke="var(--color-text-tertiary)"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.6"
        />

        {/* Actual line */}
        <path d={linePath} stroke="var(--color-brand-400)" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* Today marker + label */}
        {dailyTotals.length > 0 && (
          <>
            <circle cx={lastPt[0]} cy={lastPt[1]} r="8" fill="var(--color-brand-400)" opacity="0.22" />
            <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill="var(--color-brand-400)" />
            <text x={lastPt[0]} y={lastPt[1] - 14} textAnchor="middle" fontSize="10" fill="var(--color-text-primary)" fontWeight="500">
              Today
            </text>
          </>
        )}

        {/* Legend */}
        <g transform="translate(600, 20)">
          <rect x="0" y="0" width="12" height="2.5" fill="var(--color-brand-400)" />
          <text x="16" y="5" fontSize="10" fill="var(--color-text-secondary)">
            Actual
          </text>
          <line x1="70" y1="1.25" x2="82" y2="1.25" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeDasharray="3 2" />
          <text x="86" y="5" fontSize="10" fill="var(--color-text-secondary)">
            Pace
          </text>
        </g>
      </svg>
    </div>
  );
}
