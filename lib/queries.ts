import { supabaseServer, USER_ID } from "./supabase";

/**
 * Typed data access helpers. All queries are single-user (filter by USER_ID
 * server-side); RLS policies are in place for the eventual multi-user cut-over.
 */

const MONTHLY_INCOME_ZAR = 50_000;

export type Transaction = {
  id: string;
  occurred_on: string;
  occurred_time: string | null;
  description: string;
  category_id: string | null;
  category_name: string | null;
  amount_zar: number;
  currency: string;
  original_amount: number | null;
  tx_type: string;
  status: string;
  account_id: string | null;
  account_name: string | null;
  bank: string;
  notes: string | null;
  is_subscription: boolean;
  reviewed_at: string | null;
  is_split: boolean;
  linked_to_id: string | null;
  shared_with: string | null;
  shared_pct: number | null;
};

export type DailyReview = {
  review_date: string;
  completed_at: string;
  total_zar: number | null;
  transaction_count: number | null;
  roast: string | null;
};

export type CategoryKind = "personal" | "business";

export type BudgetRow = {
  category_id: string;
  category_name: string;
  category_kind: CategoryKind;
  planned: number;
  actual_spend: number;
  actual_refund: number;
  actual_net: number;
  pct_used: number | null;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
  kind: CategoryKind;
};
export type Subscription = {
  id: string;
  display_name: string;
  amount_zar: number;
  cadence: string;
  annualised_zar: number;
  status: string;
  last_charged: string;
  next_expected: string | null;
  charges_count: number;
  category_name: string | null;
  account_name: string | null;
  detection_source: string;
  notes: string;
  kind: "subscription" | "debit_order";
  cadence_locked: boolean;
};

async function fetchTransactions(opts?: {
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD (inclusive)
  limit?: number;
  year?: number;
  month?: number;
  uncategorisedOnly?: boolean;
  unreviewedOnly?: boolean;
}): Promise<Transaction[]> {
  const sb = supabaseServer();
  let q = sb
    .from("transactions")
    .select(
      "id, occurred_on, occurred_time, description, category_id, amount_zar, currency, original_amount, tx_type, status, account_id, bank, notes, is_subscription, reviewed_at, is_split, linked_to_id, shared_with, shared_pct, categories(name), accounts(display_name)"
    )
    .eq("user_id", USER_ID)
    .order("occurred_on", { ascending: false })
    .order("occurred_time", { ascending: false });

  if (opts?.since) q = q.gte("occurred_on", opts.since);
  if (opts?.until) q = q.lte("occurred_on", opts.until);
  if (opts?.unreviewedOnly) q = q.is("reviewed_at", null).eq("status", "Completed").neq("tx_type", "Transfer");
  if (opts?.year && opts?.month) {
    const start = `${opts.year}-${String(opts.month).padStart(2, "0")}-01`;
    const next = opts.month === 12 ? `${opts.year + 1}-01-01` : `${opts.year}-${String(opts.month + 1).padStart(2, "0")}-01`;
    q = q.gte("occurred_on", start).lt("occurred_on", next);
  }
  if (opts?.uncategorisedOnly) q = q.is("category_id", null).eq("status", "Completed");
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    category_name: r.categories?.name ?? null,
    account_name: r.accounts?.display_name ?? null,
    amount_zar: Number(r.amount_zar),
    original_amount: r.original_amount ? Number(r.original_amount) : null,
    is_split: !!r.is_split,
    linked_to_id: r.linked_to_id ?? null,
    shared_with: r.shared_with ?? null,
    shared_pct: r.shared_pct == null ? null : Number(r.shared_pct),
  }));
}

export const queries = {
  transactions: fetchTransactions,

  async categories(): Promise<Category[]> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("categories")
      .select("id, name, sort_order, color, kind")
      .eq("user_id", USER_ID)
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ ...r, kind: r.kind ?? "personal" }));
  },

  async monthBudget(year: number, month: number): Promise<BudgetRow[]> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("v_month_budget")
      .select("category_id, category_name, category_kind, planned, actual_spend, actual_refund, actual_net, pct_used")
      .eq("user_id", USER_ID)
      .eq("year", year)
      .eq("month", month);
    if (error) throw error;
    return (data ?? [])
      .map((r: any) => ({
        ...r,
        category_kind: (r.category_kind ?? "personal") as CategoryKind,
        planned: Number(r.planned),
        actual_spend: Number(r.actual_spend),
        actual_refund: Number(r.actual_refund),
        actual_net: Number(r.actual_net),
        pct_used: r.pct_used == null ? null : Number(r.pct_used),
      }))
      .sort((a: BudgetRow, b: BudgetRow) => b.planned - a.planned);
  },

  async subscriptions(): Promise<Subscription[]> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("subscriptions")
      .select("id, display_name, amount_zar, cadence, annualised_zar, status, last_charged, next_expected, charges_count, detection_source, notes, kind, cadence_locked, categories(name), accounts(display_name)")
      .eq("user_id", USER_ID)
      .order("annualised_zar", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      category_name: r.categories?.name ?? null,
      account_name: r.accounts?.display_name ?? null,
      amount_zar: Number(r.amount_zar),
      annualised_zar: Number(r.annualised_zar),
    }));
  },

  async subscriptionsSummary() {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("v_subscriptions_summary")
      .select("active_count, unclear_count, cancelled_count, monthly_equiv, annualised_active")
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          active_count: data.active_count,
          unclear_count: data.unclear_count,
          cancelled_count: data.cancelled_count,
          monthly_equiv: Number(data.monthly_equiv),
          annualised_active: Number(data.annualised_active),
        }
      : { active_count: 0, unclear_count: 0, cancelled_count: 0, monthly_equiv: 0, annualised_active: 0 };
  },

  async dailyReview(date: string): Promise<DailyReview | null> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("daily_reviews")
      .select("review_date, completed_at, total_zar, transaction_count, roast")
      .eq("user_id", USER_ID)
      .eq("review_date", date)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async categoryOverage() {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("v_category_overage")
      .select("category_id, category_name, year, month, planned, actual_net, pct_used")
      .eq("user_id", USER_ID);
    if (error) throw error;
    return data ?? [];
  },

  async sharedSummary(year: number, month: number) {
    const sb = supabaseServer();
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data, error } = await sb
      .from("transactions")
      .select("shared_with, shared_pct, amount_zar, tx_type, status")
      .eq("user_id", USER_ID)
      .eq("status", "Completed")
      .neq("tx_type", "Transfer")
      .not("shared_with", "is", null)
      .gte("occurred_on", start)
      .lt("occurred_on", next);
    if (error) throw error;

    const byPerson = new Map<string, { total: number; theirShare: number }>();
    for (const r of data ?? []) {
      const name = (r.shared_with as string).trim();
      if (!name) continue;
      const amount = Number(r.amount_zar) * (r.tx_type === "Refund" ? -1 : 1);
      const pct = r.shared_pct == null ? 0 : Number(r.shared_pct);
      const cur = byPerson.get(name) ?? { total: 0, theirShare: 0 };
      cur.total += amount;
      cur.theirShare += (amount * pct) / 100;
      byPerson.set(name, cur);
    }
    return Array.from(byPerson.entries())
      .map(([name, v]) => ({ name, total: v.total, theirShare: v.theirShare }))
      .sort((a, b) => b.theirShare - a.theirShare);
  },

  async todaySummary(year: number, month: number) {
    const sb = supabaseServer();
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    const [{ count: uncat }, { data: todayTx }, { data: yesterdayTx }, budget] = await Promise.all([
      sb
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", USER_ID)
        .is("category_id", null)
        .eq("status", "Completed"),
      sb
        .from("transactions")
        .select("amount_zar, status, tx_type")
        .eq("user_id", USER_ID)
        .eq("occurred_on", today),
      sb
        .from("transactions")
        .select("amount_zar, status, tx_type")
        .eq("user_id", USER_ID)
        .eq("occurred_on", yesterdayDate),
      queries.monthBudget(year, month),
    ]);

    const sumCompleted = (rows: any[] | null) =>
      (rows ?? [])
        .filter((r) => r.status === "Completed" && r.tx_type !== "Transfer")
        .reduce((s, r) => s + Number(r.amount_zar) * (r.tx_type === "Refund" ? -1 : 1), 0);

    const personalBudget = budget.filter((b) => b.category_kind !== "business");
    const plannedThisMonth = personalBudget.reduce((s, b) => s + b.planned, 0);
    const netThisMonth = personalBudget.reduce((s, b) => s + b.actual_net, 0);

    return {
      uncategorisedCount: uncat ?? 0,
      todaySpend: sumCompleted(todayTx),
      todayCount: (todayTx ?? []).length,
      yesterdaySpend: sumCompleted(yesterdayTx),
      yesterdayCount: (yesterdayTx ?? []).length,
      plannedThisMonth,
      netThisMonth,
      remainingThisMonth: plannedThisMonth - netThisMonth,
      monthlyIncome: MONTHLY_INCOME_ZAR,
    };
  },
};
