import Link from "next/link";
import { queries, type Transaction, type BudgetRow } from "@/lib/queries";
import { supabaseServer, USER_ID } from "@/lib/supabase";
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

/** Latest user-locked review (skip backfill/auto-log rows). */
async function latestLockedReview() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("daily_reviews")
    .select("review_date, completed_at, total_zar, transaction_count, roast")
    .eq("user_id", USER_ID)
    .not("completed_at", "is", null)
    .not("roast", "ilike", "Auto-%")
    .order("review_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
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

  // ─── LOCKED STATE: show overview for the most recent locked review ───
  if (draftOrLocked.isLocked) {
    return <OverviewState />;
  }

  // ─── REVIEW STATE: transactions + lock-in ───
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

  const total = reviewable.reduce(
    (s, t) => s + t.amount_zar * (t.tx_type === "Refund" ? -1 : 1),
    0
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
        Review {niceLabel(targetDate)}
      </div>

      <div className="mt-2 text-sm text-[var(--color-muted)]">
        <span className="mono text-[var(--color-ink)]">{reviewable.length} transactions</span>
        {" · "}
        <span className="mono text-[var(--color-ink)]">{zar(total)}</span>
      </div>

      <section className="mt-6">
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

// ─── Overview state (shown when target day is locked) ─────────────────────

async function OverviewState() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dr, budget, categories] = await Promise.all([
    latestLockedReview(),
    queries.monthBudget(year, month),
    queries.categories(),
  ]);

  if (!dr) {
    return (
      <div className="px-4 md:px-8 py-10 md:py-12 max-w-2xl">
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Overview</div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">No review yet</h1>
        <p className="text-sm text-[var(--color-muted)] mt-4">
          Nothing locked in. Come back after the evening sync.
        </p>
      </div>
    );
  }

  // Transactions from the locked day (for affected-categories breakdown)
  const dayTx = await queries.transactions({ since: dr.review_date, until: dr.review_date, limit: 200 });
  const reviewable = dayTx.filter(isReviewable);

  const affectedIds = new Set<string>(
    reviewable.map((t) => t.category_id).filter((id): id is string => !!id)
  );
  const affected = budget
    .filter((b) => affectedIds.has(b.category_id))
    .sort((a, b) => (b.pct_used ?? 0) - (a.pct_used ?? 0));

  const totalPlanned = budget.reduce((s, b) => s + b.planned, 0);
  const totalActual = budget.reduce((s, b) => s + b.actual_net, 0);
  const monthPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = now.getDate();
  const paceDelta = monthPct - (dayOfMonth / daysInMonth) * 100;
  const canaries = budget.filter((b) => b.pct_used != null && b.pct_used >= 100 && b.planned > 0);
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "long" });

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Overview</div>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">
        {niceLabel(dr.review_date).replace(/^\w/, (c) => c.toUpperCase())}, locked in
      </h1>

      {/* Roast */}
      {dr.roast && (
        <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{dr.roast}</div>
        </div>
      )}

      {/* Affected categories — where this locked day lands in the month */}
      {affected.length > 0 && (
        <section className="mt-6">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">
            Where it landed
          </div>
          <ul className="space-y-2">
            {affected.map((c) => <AffectedCategoryRow key={c.category_id} row={c} />)}
          </ul>
        </section>
      )}

      {/* Month summary */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Spent</div>
          <div className="mono text-lg font-medium mt-1">{zarRound(totalActual)}</div>
          <div className="text-xs text-[var(--color-muted)] mt-0.5">of {zarRound(totalPlanned)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Remaining</div>
          <div className={`mono text-lg font-medium mt-1 ${totalPlanned - totalActual < 0 ? "text-[var(--color-neg)]" : "text-[var(--color-pos)]"}`}>
            {zarRound(totalPlanned - totalActual)}
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-0.5">{daysInMonth - dayOfMonth} days left</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Pace</div>
          <div className={`mono text-lg font-medium mt-1 ${paceDelta > 5 ? "text-[var(--color-neg)]" : paceDelta < -5 ? "text-[var(--color-pos)]" : ""}`}>
            {paceDelta > 0 ? "+" : ""}{pct(paceDelta)}
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-0.5">
            {paceDelta > 5 ? "ahead" : paceDelta < -5 ? "under" : "on track"}
          </div>
        </div>
      </section>

      {canaries.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-neg)]/30 bg-red-50/40 p-4">
          <div className="text-sm font-medium text-[var(--color-neg)] mb-1">
            {canaries.length} over budget
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            {canaries.slice(0, 3).map((c) => c.category_name).join(" · ")}
            {canaries.length > 3 ? ` · +${canaries.length - 3} more` : ""}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-8 flex items-center justify-center">
        <Link
          href="/budget"
          className="px-5 py-3 rounded-xl bg-[var(--color-ink)] text-white text-sm font-medium active:opacity-80"
        >
          Review {monthName}'s budget →
        </Link>
      </div>

      <p className="mt-6 text-xs text-[var(--color-muted)] text-center">
        Next review appears tomorrow morning.
      </p>
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
