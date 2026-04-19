import { zarRound } from "@/lib/format";

function monthShortRange(daysLeft: number, daysInMonth: number, dayOfMonth: number, month: string): string {
  if (daysLeft <= 0) return "Month closed";
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, dayOfMonth + 1);
  const end = new Date(y, m - 1, daysInMonth);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function StatChipGrid({
  planned,
  actual,
  daysInMonth,
  dayOfMonth,
  month,
}: {
  planned: number;
  actual: number;
  daysInMonth: number;
  dayOfMonth: number;
  month: string;
}) {
  const safeDay = Math.max(1, dayOfMonth);
  const dailyBurn = actual / safeDay;
  const dailyPace = planned / daysInMonth;
  const paceVariancePct =
    dailyPace > 0 ? Math.round(((dailyBurn - dailyPace) / dailyPace) * 100) : 0;
  const projected = Math.round((dailyBurn * daysInMonth) / 100) * 100;
  const projectedDelta = projected - planned;
  const daysLeft = daysInMonth - dayOfMonth;

  const paceSub: { text: string; tone: "warn" | "ok" | "neutral" } =
    paceVariancePct > 5
      ? { text: `${paceVariancePct}% over pace`, tone: "warn" }
      : paceVariancePct < -5
      ? { text: `${Math.abs(paceVariancePct)}% under pace`, tone: "ok" }
      : { text: "On pace", tone: "neutral" };

  const projectedSub: { text: string; tone: "warn" | "ok" | "neutral" } =
    projectedDelta > 500
      ? { text: `${zarRound(projectedDelta)} over plan`, tone: "warn" }
      : projectedDelta < -500
      ? { text: `${zarRound(-projectedDelta)} under plan`, tone: "ok" }
      : { text: "On plan", tone: "neutral" };

  const range = monthShortRange(daysLeft, daysInMonth, dayOfMonth, month);

  return (
    <div className="grid grid-cols-4 gap-2.5 mb-2.5">
      <StatChip label="Planned" value={zarRound(planned)} sub="monthly" subTone="neutral" />
      <StatChip
        label="Daily burn"
        value={zarRound(Math.round(dailyBurn))}
        sub={paceSub.text}
        subTone={paceSub.tone}
      />
      <StatChip
        label="Days left"
        value={String(Math.max(0, daysLeft))}
        sub={range}
        subTone="brand"
      />
      <StatChip
        label="Projected"
        value={zarRound(projected)}
        sub={projectedSub.text}
        subTone={projectedSub.tone}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub: string;
  subTone: "warn" | "ok" | "neutral" | "brand";
}) {
  const subCls =
    subTone === "warn"
      ? "text-[var(--color-danger)]"
      : subTone === "ok"
      ? "text-[var(--color-success)]"
      : subTone === "brand"
      ? "text-[var(--color-brand-600)]"
      : "text-[var(--color-text-tertiary)]";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)] mb-1">
        {label}
      </div>
      <div className="mono text-[17px] font-medium tracking-[-0.01em] text-[var(--color-text-primary)]">
        {value}
      </div>
      <div className={`text-[10px] mt-0.5 ${subCls}`}>{sub}</div>
    </div>
  );
}
