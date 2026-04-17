import Link from "next/link";
import { queries } from "@/lib/queries";
import { supabaseServer, USER_ID } from "@/lib/supabase";
import { zarRound, longDate, pct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function latestLockedReview() {
  const sb = supabaseServer();
  // Skip the auto-log / auto-approve system-generated rows.
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

export default async function OverviewPage() {
  const dr = await latestLockedReview();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "long" });
  const budget = await queries.monthBudget(year, month);

  const totalPlanned = budget.reduce((s, b) => s + b.planned, 0);
  const totalActual = budget.reduce((s, b) => s + b.actual_net, 0);
  const monthPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = now.getDate();
  const paceDelta = monthPct - (dayOfMonth / daysInMonth) * 100;
  const canaries = budget.filter((b) => b.pct_used != null && b.pct_used >= 100 && b.planned > 0);

  if (!dr) {
    return (
      <div className="px-4 md:px-8 py-10 md:py-12 max-w-2xl">
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Overview</div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">No review yet</h1>
        <p className="text-sm text-[var(--color-muted)] mt-4">
          Lock in a review on the{" "}
          <Link href="/" className="underline">Your day</Link> page to see the overview.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Overview</div>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">
        {longDate(dr.review_date)}
      </h1>

      {/* Roast */}
      {dr.roast && (
        <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-6">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{dr.roast}</div>
        </div>
      )}

      {/* Month stats — condensed */}
      <div className="mt-6 grid grid-cols-3 gap-3">
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
      </div>

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

      {/* CTA: review the budget */}
      <div className="mt-8 flex items-center justify-center">
        <Link
          href="/budget"
          className="px-5 py-3 rounded-xl bg-[var(--color-ink)] text-white text-sm font-medium hover:opacity-90"
        >
          Review {monthName}'s budget →
        </Link>
      </div>
    </div>
  );
}
