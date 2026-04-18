import { supabaseServer, USER_ID } from "./supabase";
import { queries, type Transaction } from "./queries";
import { generateRoast } from "./roast";

/**
 * The review surface is anchored to a single target date — by default "yesterday".
 *
 * Rules:
 *  - Target = most recent date strictly before today that has transactions AND
 *    is not locked yet. Falls back to yesterday if no unreviewed day exists.
 *  - Older unreviewed days (strictly older than the target) auto-log silently
 *    so the review never stacks up.
 */

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isReviewable(t: Transaction): boolean {
  return t.status === "Completed" && t.tx_type !== "Transfer";
}

export async function resolveReviewTarget(): Promise<string> {
  // Most recent date (≤ yesterday) that still has any unreviewed transactions.
  // We deliberately ignore daily_reviews lock state here: if a late transaction
  // arrived after she locked in, that day is back in review territory.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const recent = await queries.transactions({
    since: since.toISOString().slice(0, 10),
    until: yesterdayISO(),
    limit: 500,
  });
  const unreviewed = recent.filter((t) => isReviewable(t) && !t.reviewed_at);
  if (unreviewed.length > 0) {
    const dates = Array.from(new Set(unreviewed.map((t) => t.occurred_on))).sort();
    return dates[dates.length - 1]; // most recent
  }
  // Nothing pending → return yesterday so home shows "locked" overview state.
  return yesterdayISO();
}

/**
 * Auto-log any reviewable day strictly older than the target that still has
 * unreviewed transactions. Stamps reviewed_at on those transactions and writes
 * a daily_reviews row with no roast (so it doesn't pollute the overview).
 * Keeps the review surface focused on the single target day.
 */
export async function autoLogOlderDays(targetDate: string): Promise<void> {
  const sb = supabaseServer();

  const { data: olderTxs } = await sb
    .from("transactions")
    .select("occurred_on")
    .eq("user_id", USER_ID)
    .lt("occurred_on", targetDate)
    .is("reviewed_at", null)
    .eq("status", "Completed")
    .neq("tx_type", "Transfer");
  const olderDates = Array.from(new Set((olderTxs ?? []).map((r: any) => r.occurred_on as string)));

  if (olderDates.length === 0) return;

  await sb
    .from("transactions")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .lt("occurred_on", targetDate)
    .is("reviewed_at", null)
    .eq("status", "Completed")
    .neq("tx_type", "Transfer");

  // Create daily_reviews rows for each auto-logged date. Mark completed_at
  // so they count as "locked" but tag the roast so overview skips them.
  const rows = await Promise.all(
    olderDates.map(async (d) => {
      const tx = await queries.transactions({ since: d, until: d, limit: 100 });
      const reviewable = tx.filter(isReviewable);
      const total = reviewable.reduce(
        (s, t) => s + t.amount_zar * (t.tx_type === "Refund" ? -1 : 1),
        0
      );
      return {
        user_id: USER_ID,
        review_date: d,
        completed_at: new Date().toISOString(),
        total_zar: total,
        transaction_count: reviewable.length,
        roast: "Auto-logged — older day bypassed during review.",
      };
    })
  );
  await sb.from("daily_reviews").upsert(rows, { onConflict: "user_id,review_date" });
}

/**
 * Return (and cache) the roast for a target date. If a draft row exists, reuse
 * its roast. Otherwise generate fresh via Claude and upsert the draft.
 */
export async function getOrCreateDraftReview(targetDate: string): Promise<{
  roast: string | null;
  isLocked: boolean;
  dailyReview: any;
}> {
  const sb = supabaseServer();

  // Are there pending (unreviewed) transactions for this date right now?
  const { count: pendingCount } = await sb
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID)
    .eq("occurred_on", targetDate)
    .is("reviewed_at", null)
    .eq("status", "Completed")
    .neq("tx_type", "Transfer");
  const hasPending = (pendingCount ?? 0) > 0;

  const { data: existing } = await sb
    .from("daily_reviews")
    .select("review_date, completed_at, total_zar, transaction_count, roast")
    .eq("user_id", USER_ID)
    .eq("review_date", targetDate)
    .maybeSingle();

  // Reopen case: row is locked but a late-arriving transaction has reset the
  // pending count above zero. Clear completed_at + regenerate roast against the
  // refreshed transaction set so the review screen reflects reality.
  if (existing && existing.completed_at && hasPending) {
    await sb
      .from("daily_reviews")
      .update({ completed_at: null, roast: null })
      .eq("user_id", USER_ID)
      .eq("review_date", targetDate);
    // Fall through to the regeneration path below.
  } else if (existing) {
    return {
      roast: existing.roast ?? null,
      isLocked: !!existing.completed_at,
      dailyReview: existing,
    };
  }

  // Build roast context from target date's transactions + current month state.
  const [dayTx, budget] = await Promise.all([
    queries.transactions({ since: targetDate, until: targetDate, limit: 200 }),
    queries.monthBudget(
      parseInt(targetDate.slice(0, 4)),
      parseInt(targetDate.slice(5, 7))
    ),
  ]);
  const reviewable = dayTx.filter(isReviewable);
  const daySpend = reviewable.reduce(
    (s, t) => s + t.amount_zar * (t.tx_type === "Refund" ? -1 : 1),
    0
  );
  const now = new Date();
  const daysInMonth = new Date(
    parseInt(targetDate.slice(0, 4)),
    parseInt(targetDate.slice(5, 7)),
    0
  ).getDate();
  const topCategories = [...budget]
    .filter((b) => b.actual_net > 0)
    .sort((a, b) => b.actual_net - a.actual_net)
    .slice(0, 5);
  const overBudget = budget
    .filter((b) => b.pct_used != null && b.pct_used >= 100 && b.planned > 0)
    .sort((a, b) => (b.pct_used ?? 0) - (a.pct_used ?? 0));
  const underBudget = budget
    .filter((b) => b.pct_used != null && b.pct_used < 50 && b.planned >= 500)
    .sort((a, b) => (a.pct_used ?? 0) - (b.pct_used ?? 0));
  const monthActual = budget.reduce((s, b) => s + b.actual_net, 0);
  const monthPlanned = budget.reduce((s, b) => s + b.planned, 0);

  const roast = await generateRoast({
    reviewDate: targetDate,
    daySpend,
    dayCount: reviewable.length,
    monthPlanned,
    monthActual,
    daysInMonth,
    dayOfMonth: now.getDate(),
    topCategories,
    overBudget,
    underBudget,
  });

  await sb.from("daily_reviews").upsert(
    {
      user_id: USER_ID,
      review_date: targetDate,
      total_zar: daySpend,
      transaction_count: reviewable.length,
      roast,
      completed_at: null,
    },
    { onConflict: "user_id,review_date" }
  );

  return { roast, isLocked: false, dailyReview: null };
}

/** Top-N categories ranked by transaction count over the last 60 days. */
export async function topUsedCategories(limit: number = 3): Promise<string[]> {
  const sb = supabaseServer();
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data } = await sb
    .from("transactions")
    .select("category_id, categories(name)")
    .eq("user_id", USER_ID)
    .gte("occurred_on", since.toISOString().slice(0, 10))
    .not("category_id", "is", null);
  const counts: Record<string, { id: string; name: string; n: number }> = {};
  for (const r of (data ?? []) as any[]) {
    const id = r.category_id;
    const name = r.categories?.name;
    if (!id || !name) continue;
    if (!counts[id]) counts[id] = { id, name, n: 0 };
    counts[id].n += 1;
  }
  return Object.values(counts)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((c) => c.id);
}
