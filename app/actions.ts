"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer, USER_ID } from "@/lib/supabase";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Change a transaction's category. Does NOT approve — the Lock-in button
 * approves everything on the review date in one go. Optionally creates a rule
 * and back-fills other uncategorised transactions matching the merchant prefix.
 */
export async function changeCategoryAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  const categoryId = formData.get("category_id") as string;
  const description = formData.get("description") as string;
  const createRule = formData.get("create_rule") === "on";
  if (!transactionId || !categoryId) return;

  const sb = supabaseServer();
  await sb
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", transactionId)
    .eq("user_id", USER_ID);

  if (createRule) {
    const rawPrefix = description
      .replace(/^Yoco\s*\*\s*/i, "")
      .split(/\s+/)
      .slice(0, 3)
      .join(" ")
      .toLowerCase();
    const pattern = rawPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await sb.from("category_rules").insert({
      user_id: USER_ID,
      pattern,
      category_id: categoryId,
      priority: 10,
      source: "user_correction",
      example_merchant: description,
      is_active: true,
    });
    await sb
      .from("transactions")
      .update({ category_id: categoryId })
      .eq("user_id", USER_ID)
      .is("category_id", null)
      .ilike("description", `%${rawPrefix}%`);
  }

  revalidatePath("/");
}

/**
 * Lock in the review for a date — approves every reviewable transaction on
 * that date and finalises the daily_reviews row. Single primary action.
 */
export async function lockInAction(formData: FormData) {
  const date = formData.get("date") as string;
  if (!date) return;

  const sb = supabaseServer();

  // Approve every reviewable transaction on this date (even if already approved,
  // idempotent — just updates reviewed_at).
  await sb
    .from("transactions")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("occurred_on", date)
    .eq("status", "Completed")
    .neq("tx_type", "Transfer");

  // Finalise the daily_reviews row. If none exists, create one (shouldn't
  // happen since the page generates a draft on first view).
  const now = new Date().toISOString();
  // Always set completed_at (re-locking after a late-arriving transaction is
  // a real path — see lib/review.ts reopen logic).
  await sb
    .from("daily_reviews")
    .update({ completed_at: now })
    .eq("user_id", USER_ID)
    .eq("review_date", date);

  revalidatePath("/");
  redirect("/");
}

/**
 * Escape hatches for the Transactions page — user wants to re-review or
 * re-categorise after locking.
 */
export async function unapproveAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  if (!transactionId) return;
  const sb = supabaseServer();
  await sb
    .from("transactions")
    .update({ reviewed_at: null })
    .eq("id", transactionId)
    .eq("user_id", USER_ID);
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function toggleSubAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  const current = formData.get("current") === "true";
  if (!transactionId) return;
  const sb = supabaseServer();
  await sb
    .from("transactions")
    .update({ is_subscription: !current })
    .eq("id", transactionId)
    .eq("user_id", USER_ID);
  revalidatePath("/transactions");
}

/**
 * Split a transaction across N consecutive months starting from start_ym
 * ("YYYY-MM"). Amount divides evenly; any remainder lands on the last child
 * to keep the sum exact to the cent. Parent is flagged is_split and excluded
 * from v_month_budget; children carry the spend into their respective months.
 */
export async function splitTransactionAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  const monthsRaw = formData.get("months") as string;
  const startYm = formData.get("start_ym") as string; // "YYYY-MM"
  const months = Math.max(1, Math.min(48, parseInt(monthsRaw || "0", 10)));
  if (!transactionId || !months || !/^\d{4}-\d{2}$/.test(startYm)) return;

  const sb = supabaseServer();
  const { data: parent, error: fetchErr } = await sb
    .from("transactions")
    .select("id, amount_zar, description, tx_type, category_id, account_id, bank, currency, is_split")
    .eq("id", transactionId)
    .eq("user_id", USER_ID)
    .single();
  if (fetchErr || !parent) return;
  if (parent.is_split) return; // already split — must unsplit first

  const total = Number(parent.amount_zar);
  const baseCents = Math.floor((total * 100) / months);
  const perMonth = baseCents / 100;
  const lastMonth = +(total - perMonth * (months - 1)).toFixed(2);

  const [startYear, startMonth] = startYm.split("-").map(Number);
  const children = Array.from({ length: months }, (_, i) => {
    const m0 = (startMonth - 1 + i) % 12;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    const yyyyMm = `${y}-${String(m0 + 1).padStart(2, "0")}`;
    return {
      user_id: USER_ID,
      occurred_on: `${yyyyMm}-01`,
      description: `${parent.description} (split ${i + 1}/${months})`,
      category_id: parent.category_id,
      amount_zar: i === months - 1 ? lastMonth : perMonth,
      currency: parent.currency,
      tx_type: parent.tx_type,
      status: "Completed",
      account_id: parent.account_id,
      bank: parent.bank,
      linked_to_id: parent.id,
      message_id: `split:${parent.id}:${i + 1}`,
      source: "manual",
      reviewed_at: new Date().toISOString(),
    };
  });

  await sb.from("transactions").insert(children);
  await sb
    .from("transactions")
    .update({ is_split: true })
    .eq("id", parent.id)
    .eq("user_id", USER_ID);

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/");
}

/**
 * Reverse a split — delete all children and clear the parent's is_split flag.
 */
export async function unsplitTransactionAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  if (!transactionId) return;
  const sb = supabaseServer();
  await sb
    .from("transactions")
    .delete()
    .eq("user_id", USER_ID)
    .eq("linked_to_id", transactionId);
  await sb
    .from("transactions")
    .update({ is_split: false })
    .eq("id", transactionId)
    .eq("user_id", USER_ID);
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/");
}

/**
 * Tag a transaction as partially for someone else. Purely informational —
 * the amount stays on the user's books in full. Clears both fields when
 * name is empty.
 */
export async function setShareAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string;
  const name = ((formData.get("shared_with") as string) ?? "").trim();
  const pctRaw = formData.get("shared_pct") as string;
  const pct = parseFloat(pctRaw);
  if (!transactionId) return;

  const sb = supabaseServer();
  if (!name) {
    await sb
      .from("transactions")
      .update({ shared_with: null, shared_pct: null })
      .eq("id", transactionId)
      .eq("user_id", USER_ID);
  } else {
    const clamped = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 50;
    await sb
      .from("transactions")
      .update({ shared_with: name, shared_pct: clamped })
      .eq("id", transactionId)
      .eq("user_id", USER_ID);
  }
  revalidatePath("/transactions");
  revalidatePath("/");
}
