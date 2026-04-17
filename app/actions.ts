"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, USER_ID } from "@/lib/supabase";

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
  await sb
    .from("daily_reviews")
    .update({ completed_at: now })
    .eq("user_id", USER_ID)
    .eq("review_date", date)
    .is("completed_at", null);

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
