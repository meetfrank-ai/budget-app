import Link from "next/link";
import { queries, type BudgetRow } from "@/lib/queries";
import { zarRound, pct, monthLabel } from "@/lib/format";
import { generateBudgetCommentary } from "@/lib/roast";
import { BudgetCategoryCard } from "./BudgetCategoryCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SortKey = "name" | "planned" | "actual" | "remaining" | "burn";
type SortDir = "asc" | "desc";

const VALID_SORTS: SortKey[] = ["name", "planned", "actual", "remaining", "burn"];

function sortRows(rows: BudgetRow[], key: SortKey, dir: SortDir): BudgetRow[] {
  const out = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.category_name.localeCompare(b.category_name);
        break;
      case "planned":
        cmp = a.planned - b.planned;
        break;
      case "actual":
        cmp = a.actual_net - b.actual_net;
        break;
      case "remaining":
        cmp = a.planned - a.actual_net - (b.planned - b.actual_net);
        break;
      case "burn":
        cmp = (a.pct_used ?? 0) - (b.pct_used ?? 0);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return out;
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = parseInt(params.y ?? String(now.getFullYear()));
  const month = parseInt(params.m ?? String(now.getMonth() + 1));

  const sortKey: SortKey = (VALID_SORTS.includes(params.sort as SortKey)
    ? params.sort
    : "planned") as SortKey;
  const sortDir: SortDir = params.dir === "asc" ? "asc" : "desc";

  const [rowsRaw, monthTransactions] = await Promise.all([
    queries.monthBudget(year, month),
    queries.transactions({ year, month, limit: 500 }),
  ]);

  const rows = sortRows(rowsRaw, sortKey, sortDir);

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual_net, 0);
  const totalRemaining = totalPlanned - totalActual;
  const spentPctNum = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const commentary = isCurrentMonth
    ? await generateBudgetCommentary({
        budget: rows,
        monthName: monthLabel(year, month),
        daysInMonth: new Date(year, month, 0).getDate(),
        dayOfMonth: now.getDate(),
      })
    : null;

  const buildHref = (overrides: Partial<{ y: number; m: number; sort: SortKey; dir: SortDir }>) => {
    const q = new URLSearchParams();
    q.set("y", String(overrides.y ?? year));
    q.set("m", String(overrides.m ?? month));
    q.set("sort", overrides.sort ?? sortKey);
    q.set("dir", overrides.dir ?? sortDir);
    return `/budget?${q.toString()}`;
  };

  const prevLink = buildHref({
    y: month === 1 ? year - 1 : year,
    m: month === 1 ? 12 : month - 1,
  });
  const nextLink = buildHref({
    y: month === 12 ? year + 1 : year,
    m: month === 12 ? 1 : month + 1,
  });

  const sortHref = (key: SortKey): string => {
    const nextDir: SortDir = sortKey === key ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    return buildHref({ sort: key, dir: nextDir });
  };

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

      {/* Summary pills — above commentary */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        <SummaryCard label="Planned" value={zarRound(totalPlanned)} />
        <SummaryCard
          label="Actual"
          value={zarRound(totalActual)}
          note={`${pct(spentPctNum)} of plan`}
        />
        <SummaryCard
          label="Remaining"
          value={zarRound(totalRemaining)}
          tone={totalRemaining < 0 ? "neg" : "pos"}
        />
      </div>

      {/* Commentary — current month only */}
      {commentary && (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 md:p-5 mb-6">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{commentary}</div>
        </div>
      )}

      {/* Category list with sort headers */}
      <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
        {/* Desktop sort header row */}
        <div className="hidden md:grid md:grid-cols-[1fr_104px_104px_104px_1fr_16px] md:items-center md:gap-4 px-5 py-2.5 bg-[var(--color-bg)] text-xs uppercase tracking-wide text-[var(--color-muted)] border-b border-[var(--color-border)]">
          <SortHeader label="Category" active={sortKey === "name"} dir={sortDir} href={sortHref("name")} />
          <SortHeader label="Planned" align="right" active={sortKey === "planned"} dir={sortDir} href={sortHref("planned")} />
          <SortHeader label="Actual" align="right" active={sortKey === "actual"} dir={sortDir} href={sortHref("actual")} />
          <SortHeader label="Remaining" align="right" active={sortKey === "remaining"} dir={sortDir} href={sortHref("remaining")} />
          <SortHeader label="Burn" active={sortKey === "burn"} dir={sortDir} href={sortHref("burn")} />
          <span />
        </div>

        {/* Mobile sort pill bar */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <MobileSortPill label="Name" active={sortKey === "name"} dir={sortDir} href={sortHref("name")} />
          <MobileSortPill label="Planned" active={sortKey === "planned"} dir={sortDir} href={sortHref("planned")} />
          <MobileSortPill label="Actual" active={sortKey === "actual"} dir={sortDir} href={sortHref("actual")} />
          <MobileSortPill label="Remaining" active={sortKey === "remaining"} dir={sortDir} href={sortHref("remaining")} />
          <MobileSortPill label="Burn" active={sortKey === "burn"} dir={sortDir} href={sortHref("burn")} />
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <BudgetCategoryCard key={r.category_id} row={r} transactions={monthTransactions} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  href,
  active,
  dir,
  align = "left",
}: {
  label: string;
  href: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
}) {
  const arrow = active ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 font-normal hover:text-[var(--color-ink)] ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-[var(--color-ink)]" : ""}`}
    >
      {label}
      {arrow && <span className="text-[10px]">{arrow}</span>}
    </Link>
  );
}

function MobileSortPill({
  label,
  href,
  active,
  dir,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: SortDir;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition ${
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
          : "border-[var(--color-border)] bg-white text-[var(--color-muted)]"
      }`}
    >
      {label} {active && (dir === "desc" ? "↓" : "↑")}
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "pos" | "neg";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-white p-3 md:p-5">
      <div className="truncate text-[10px] md:text-xs uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </div>
      <div
        className={`mono mt-1 md:mt-2 truncate text-base md:text-2xl font-medium tabular-nums ${
          tone === "neg" ? "text-[var(--color-neg)]" : tone === "pos" ? "text-[var(--color-pos)]" : ""
        }`}
      >
        {value}
      </div>
      {note && (
        <div className="mt-1 truncate text-[10px] md:text-xs text-[var(--color-muted)]">{note}</div>
      )}
    </div>
  );
}
