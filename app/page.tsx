import Link from "next/link";
import { queries, type Transaction, type BudgetRow } from "@/lib/queries";
import { zar, zarRound, pct, longDate } from "@/lib/format";
import {
  resolveReviewTarget,
  autoLogOlderDays,
  getOrCreateDraftReview,
  topUsedCategories,
} from "@/lib/review";
import { ReviewRow } from "./ReviewRow";
import { LockInFooter } from "./LockInFooter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isReviewable(t: Transaction): boolean {
  return t.status === "Completed" && t.tx_type !== "Transfer";
}

function niceLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestISO = yest.toISOString().slice(0, 10);
  if (iso === today) return "today";
  if (iso === yestISO) return "yesterday";
  return longDate(iso).toLowerCase();
}

export default async function HomePage() {
  const targetDate = await resolveReviewTarget();
  await autoLogOlderDays(targetDate);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dayTx, categories, draftOrLocked, topCatIds, budget] = await Promise.all([
    queries.transactions({ since: targetDate, until: targetDate, limit: 200 }),
    queries.categories(),
    getOrCreateDraftReview(targetDate),
    topUsedCategories(3),
    queries.monthBudget(year, month),
  ]);

  const reviewable = dayTx
    .filter(isReviewable)
    .sort((a, b) => (a.occurred_time ?? "").localeCompare(b.occurred_time ?? ""));
  const total = reviewable.reduce(
    (s, t) => s + t.amount_zar * (t.tx_type === "Refund" ? -1 : 1),
    0
  );

  // Already locked — empty state, point at overview.
  if (draftOrLocked.isLocked) {
    return (
      <div className="px-4 md:px-8 py-10 md:py-12 max-w-2xl">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <div className="text-[var(--color-pos)] text-3xl mb-2">✓</div>
          <div className="text-lg font-medium">{niceLabel(targetDate).replace(/^\w/, (c) => c.toUpperCase())} is locked in.</div>
          <div className="mt-4">
            <Link
              href="/overview"
              className="inline-block px-4 py-2 rounded-lg bg-[var(--color-ink)] text-white text-sm font-medium hover:opacity-90"
            >
              See your overview →
            </Link>
          </div>
          <div className="mt-3 text-xs text-[var(--color-muted)]">
            The next review appears tomorrow morning.
          </div>
        </div>
      </div>
    );
  }

  // No transactions on target day.
  if (reviewable.length === 0) {
    return (
      <div className="px-4 md:px-8 py-10 md:py-12 max-w-2xl">
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Review {niceLabel(targetDate)}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">No transactions</h1>
        <p className="text-sm text-[var(--color-muted)] mt-4">
          Nothing to review on {longDate(targetDate)}. Next sync at 20:00.
        </p>
      </div>
    );
  }

  // Affected categories: month-state snapshot for every category touched today.
  const affectedIds = new Set<string>(
    reviewable.map((t) => t.category_id).filter((id): id is string => !!id)
  );
  const affected = budget
    .filter((b) => affectedIds.has(b.category_id))
    .sort((a, b) => (b.pct_used ?? 0) - (a.pct_used ?? 0));

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        Review {niceLabel(targetDate)}
      </div>

      {/* Stat line */}
      <div className="mt-2 text-sm text-[var(--color-muted)]">
        <span className="mono text-[var(--color-ink)]">{reviewable.length} transactions</span>
        {" · "}
        <span className="mono text-[var(--color-ink)]">{zar(total)}</span>
      </div>

      {/* Affected categories — where this day lands in your month */}
      {affected.length > 0 && (
        <section className="mt-5">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">
            Where this lands
          </div>
          <ul className="space-y-2">
            {affected.map((c) => <AffectedCategoryRow key={c.category_id} row={c} />)}
          </ul>
        </section>
      )}

      {/* Transaction list */}
      <section className="mt-6">
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">
          Transactions
        </div>
        <ul className="space-y-2">
          {reviewable.map((t) => (
            <ReviewRow
              key={t.id}
              tx={t}
              topCategoryIds={topCatIds}
              categories={categories}
            />
          ))}
        </ul>
      </section>

      <LockInFooter date={targetDate} />
    </div>
  );
}

function AffectedCategoryRow({ row }: { row: BudgetRow }) {
  const catPct = row.planned > 0 ? Math.min(100, (row.actual_net / row.planned) * 100) : 0;
  const tone = row.pct_used == null
    ? "ok"
    : row.pct_used >= 100
    ? "over"
    : row.pct_used >= 80
    ? "warn"
    : "ok";
  const remaining = row.planned - row.actual_net;
  return (
    <li className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{row.category_name}</span>
        <span className="mono text-xs">
          <span className={tone === "over" ? "text-[var(--color-neg)]" : ""}>
            {zarRound(row.actual_net)}
          </span>
          <span className="text-[var(--color-muted)]"> / {zarRound(row.planned)}</span>
          <span className={`ml-2 ${tone === "over" ? "text-[var(--color-neg)]" : tone === "warn" ? "text-[var(--color-warn)]" : "text-[var(--color-muted)]"}`}>
            {pct(row.pct_used)}
          </span>
        </span>
      </div>
      <div className="mt-1.5 bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${catPct}%` }} />
      </div>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        {remaining >= 0 ? `${zarRound(remaining)} left` : `${zarRound(-remaining)} over`}
      </div>
    </li>
  );
}
