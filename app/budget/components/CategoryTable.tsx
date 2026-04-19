"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BudgetCategory } from "@/lib/budget-adapter";
import { zarRound, shortDate } from "@/lib/format";

type SortKey = "name" | "actual" | "burn";
type SortDir = "default" | "asc" | "desc";

type RowData = BudgetCategory & { pct: number };

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

function computeRows(categories: BudgetCategory[]): RowData[] {
  return categories.map((c) => ({
    ...c,
    pct: c.planned > 0 ? Math.round((c.actual / c.planned) * 100) : 0,
  }));
}

function sortRows(rows: RowData[], key: SortKey, dir: SortDir): RowData[] {
  if (dir === "default") return [...rows].sort((a, b) => b.pct - a.pct);
  const out = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "actual":
        cmp = a.actual - b.actual;
        break;
      case "burn":
        cmp = a.pct - b.pct;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return out;
}

export function CategoryTable({ categories }: { categories: BudgetCategory[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("burn");
  const [sortDir, setSortDir] = useState<SortDir>("default");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onFocus(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const el = document.getElementById(`cat-row-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashing(id);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashing(null), 600);
    }
    window.addEventListener("budget:focus-category", onFocus as EventListener);
    return () => {
      window.removeEventListener("budget:focus-category", onFocus as EventListener);
    };
  }, []);

  function clickSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    setSortDir((prev) => (prev === "default" ? "asc" : prev === "asc" ? "desc" : "default"));
  }

  const rows = sortRows(computeRows(categories), sortKey, sortDir);
  const sortNote =
    sortDir === "default"
      ? "sorted by burn"
      : `${sortKey === "actual" ? "spent" : sortKey} ${sortDir}`;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[1.1rem]">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)]">
          Categories
        </div>
        <div className="text-[11px] text-[var(--color-text-tertiary)]">{sortNote}</div>
      </div>

      <div className="grid grid-cols-[1.3fr_70px_90px_55px] gap-3 items-center pb-[6px] border-b border-[var(--color-border)]">
        <HeaderBtn label="Category" active={sortKey === "name" && sortDir !== "default"} dir={sortDir} onClick={() => clickSort("name")} />
        <HeaderBtn label="Spent" active={sortKey === "actual" && sortDir !== "default"} dir={sortDir} align="right" onClick={() => clickSort("actual")} />
        <HeaderBtn label="Burn" active={sortKey === "burn" && sortDir !== "default"} dir={sortDir} onClick={() => clickSort("burn")} />
        <HeaderBtn label="%" active={sortKey === "burn" && sortDir !== "default"} dir={sortDir} align="right" onClick={() => clickSort("burn")} />
      </div>

      {rows.map((row, i) => (
        <CategoryRow
          key={row.id}
          row={row}
          isLast={i === rows.length - 1}
          expanded={expanded === row.id}
          flashing={flashing === row.id}
          onToggle={() => setExpanded((prev) => (prev === row.id ? null : row.id))}
          onEscape={() => setExpanded(null)}
        />
      ))}
    </div>
  );
}

function HeaderBtn({
  label,
  active,
  dir,
  align = "left",
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onClick: () => void;
}) {
  const caret = active ? (dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : "") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full font-medium text-[10px] uppercase tracking-[1.5px] hover:text-[var(--color-text-primary)] transition-colors ${
        active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"
      } ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label}
      <span className="text-[9px]">{caret}</span>
    </button>
  );
}

function CategoryRow({
  row,
  isLast,
  expanded,
  flashing,
  onToggle,
  onEscape,
}: {
  row: RowData;
  isLast: boolean;
  expanded: boolean;
  flashing: boolean;
  onToggle: () => void;
  onEscape: () => void;
}) {
  const fillWidth = Math.min(100, row.pct);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEscape();
    }
  }

  return (
    <div
      id={`cat-row-${row.id}`}
      className={`transition-colors duration-300 ${
        flashing ? "bg-[var(--color-brand-50)]" : ""
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={`grid grid-cols-[1.3fr_70px_90px_55px] gap-3 items-center py-[7px] text-[12px] cursor-pointer hover:bg-[var(--color-surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          !isLast && !expanded ? "border-b border-[var(--color-border)]" : ""
        }`}
      >
        <span className="font-medium text-[var(--color-text-primary)] truncate">{row.name}</span>
        <span className="mono text-right text-[var(--color-text-primary)]">
          {zarRound(row.actual)}
        </span>
        <div className="relative h-[5px] bg-[var(--color-brand-50)] rounded-[3px] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-[3px]"
            style={{ width: `${fillWidth}%`, background: burnColor(row.pct) }}
          />
        </div>
        <span className="mono text-right" style={{ color: pctLabelColor(row.pct) }}>
          {row.pct}%
        </span>
      </div>
      {expanded && <ExpandPanel row={row} isLast={isLast} />}
    </div>
  );
}

function ExpandPanel({ row, isLast }: { row: RowData; isLast: boolean }) {
  const byDay = new Map<number, number>();
  for (const tx of row.transactions) {
    if (tx.amount <= 0) continue;
    const day = parseInt(tx.date.slice(8, 10));
    byDay.set(day, (byDay.get(day) ?? 0) + tx.amount);
  }
  const entries = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
  const biggest = entries.reduce(
    (acc, [d, amt]) => (amt > acc.amt ? { day: d, amt } : acc),
    { day: 0, amt: 0 }
  );
  const total = entries.reduce((s, [, a]) => s + a, 0);
  const avg = entries.length > 0 ? total / entries.length : 0;
  const recent = row.transactions.slice(0, 10);

  return (
    <div
      className={`grid md:grid-cols-[6fr_4fr] gap-5 py-3 ${
        !isLast ? "border-b border-[var(--color-border)]" : ""
      }`}
    >
      <div>
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)] mb-2">
          Recent transactions
        </div>
        {recent.length === 0 ? (
          <div className="text-[12px] text-[var(--color-text-tertiary)]">
            No transactions this month.
          </div>
        ) : (
          <ul className="space-y-[3px]">
            {recent.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="mono text-[11px] text-[var(--color-text-tertiary)] shrink-0 w-[46px]">
                    {shortDate(t.date)}
                  </span>
                  <span className="truncate text-[var(--color-text-primary)]">{t.merchant}</span>
                </div>
                <span
                  className={`mono shrink-0 ${
                    t.amount < 0 ? "text-[var(--color-success)]" : "text-[var(--color-text-primary)]"
                  }`}
                >
                  {t.amount < 0 ? "−" : ""}
                  {zarRound(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[1.5px] font-medium text-[var(--color-text-secondary)] mb-2">
          Daily pattern
        </div>
        <MiniSparkline entries={entries} />
        <div className="mt-3 text-[11px] text-[var(--color-text-secondary)] space-y-0.5">
          {biggest.amt > 0 && (
            <div>
              Biggest day:{" "}
              <span className="mono text-[var(--color-text-primary)]">
                {zarRound(biggest.amt)}
              </span>{" "}
              on day {biggest.day}
            </div>
          )}
          <div>
            Avg/day:{" "}
            <span className="mono text-[var(--color-text-primary)]">{zarRound(Math.round(avg))}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={`/budget/plan?category=${row.id}`}
            className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] hover:border-[var(--color-brand-400)] transition-colors"
          >
            Re-plan category
          </Link>
          <Link
            href={`/transactions?category=${row.id}`}
            className="text-[11px] px-3 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] hover:border-[var(--color-brand-400)] transition-colors"
          >
            See all transactions
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniSparkline({ entries }: { entries: Array<[number, number]> }) {
  const W = 200;
  const H = 30;
  if (entries.length === 0) {
    return <div className="h-[30px] text-[11px] text-[var(--color-text-tertiary)]">—</div>;
  }
  const maxAmt = Math.max(...entries.map(([, a]) => a), 1);
  const maxDay = 31;
  const points = entries.map(([d, a]) => [
    (d / maxDay) * W,
    H - (a / maxAmt) * (H - 4) - 2,
  ]);
  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block w-full max-w-[200px]">
      <path d={pathD} stroke="var(--color-brand-400)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    </svg>
  );
}
