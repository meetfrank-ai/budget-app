/**
 * Morning review nudge — runs at 05:59 UTC (07:59 SAST) via Render Cron Job.
 *
 * Pipeline:
 *  1. runSync()                    — pull new Gmail transactions, parse, categorise (incl. AI fallback).
 *  2. Build yesterday's spend context.
 *  3. Generate the friend-tone daily roast.
 *  4. Upsert daily_reviews row (so /home reads the same roast, no double-gen).
 *  5. Send a Telegram message with an inline button → review URL. Fallback to email.
 *
 * Env vars:
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID
 *  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN  (sync)
 *  - ANTHROPIC_API_KEY                                              (roast + AI categorisation)
 *  - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID                           (primary notification)
 *  - RESEND_API_KEY, REVIEW_TO_EMAIL                                (fallback notification)
 *  - REVIEW_APP_URL                                                  — https://budget-app-5arn.onrender.com
 *  - LOOKBACK_DAYS                                                   — optional, defaults to 7
 */
import { runSync } from "./sync.mjs";
import { generateDailyRoast } from "./roast.mjs";
import { sendNotification } from "./notify.mjs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_USER_ID,
  REVIEW_APP_URL = "https://budget-app-5arn.onrender.com",
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID })) {
  if (!v) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

function yesterdayISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function sbSelect(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`select ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpsert(table, row, onConflict) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("on_conflict", onConflict);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([row]),
  });
  if (!res.ok) throw new Error(`upsert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchYesterdayContext(date) {
  // Pending transactions for yesterday (Completed, non-Transfer, not yet reviewed)
  const pending = await sbSelect("transactions", {
    user_id: `eq.${SUPABASE_USER_ID}`,
    occurred_on: `eq.${date}`,
    reviewed_at: "is.null",
    status: "eq.Completed",
    tx_type: "neq.Transfer",
    select: "id,description,amount_zar,tx_type,category_id",
  });
  // All of yesterday's reviewable transactions (for the roast — includes already-reviewed)
  const yday = await sbSelect("transactions", {
    user_id: `eq.${SUPABASE_USER_ID}`,
    occurred_on: `eq.${date}`,
    status: "eq.Completed",
    tx_type: "neq.Transfer",
    select: "id,description,amount_zar,tx_type,category_id",
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const budget = await sbSelect("v_month_budget", {
    user_id: `eq.${SUPABASE_USER_ID}`,
    year: `eq.${year}`,
    month: `eq.${month}`,
    select: "category_id,category_name,planned,actual_spend,actual_refund,actual_net,pct_used,category_kind",
  });

  return { pending, yday, budget };
}

function buildRoastContext({ date, yday, budget }) {
  const daySpend = yday.reduce(
    (s, t) => s + Number(t.amount_zar) * (t.tx_type === "Refund" ? -1 : 1),
    0
  );

  const dayDeltaByCat = {};
  for (const t of yday) {
    if (!t.category_id) continue;
    const sign = t.tx_type === "Refund" ? -1 : 1;
    dayDeltaByCat[t.category_id] = (dayDeltaByCat[t.category_id] ?? 0) + Number(t.amount_zar) * sign;
  }
  const movedYesterday = budget
    .filter((b) => dayDeltaByCat[b.category_id] != null)
    .map((b) => ({
      name: b.category_name,
      dayDelta: dayDeltaByCat[b.category_id],
      row: {
        actual_net: Number(b.actual_net),
        planned: Number(b.planned),
        pct_used: b.pct_used == null ? null : Number(b.pct_used),
      },
    }))
    .sort((a, b) => b.dayDelta - a.dayDelta);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const monthActual = budget.reduce((s, b) => s + Number(b.actual_net), 0);
  const monthPlanned = budget.reduce((s, b) => s + Number(b.planned), 0);

  return {
    reviewDate: date,
    daySpend,
    dayCount: yday.length,
    monthPlanned,
    monthActual,
    daysInMonth,
    dayOfMonth: now.getUTCDate(),
    movedYesterday,
  };
}

function tgEscape(s) {
  // Telegram Markdown V1 — escape the special chars we care about.
  return String(s).replace(/([_*`\[])/g, "\\$1");
}

async function main() {
  // 1. Pull Gmail → Supabase first so the count we send is current.
  try {
    const r = await runSync();
    console.log(`[morning] sync: parsed=${r.parsed} inserted=${r.inserted} aiInferred=${r.aiInferred ?? 0} skipped=${r.skipped} errors=${r.errors}`);
  } catch (e) {
    console.error("[morning] sync failed, continuing with stale Supabase state:", e.message);
  }

  const date = yesterdayISO();
  const { pending, yday, budget } = await fetchYesterdayContext(date);
  console.log(`[morning] yesterday=${date} reviewable=${yday.length} pending=${pending.length}`);

  if (yday.length === 0) {
    console.log("[morning] nothing happened yesterday, no notification sent.");
    return;
  }

  // 2. Generate the roast and cache it on daily_reviews so /home reads it.
  const ctx = buildRoastContext({ date, yday, budget });
  const roast = await generateDailyRoast(ctx);
  console.log(`[morning] roast: ${roast}`);

  await sbUpsert(
    "daily_reviews",
    {
      user_id: SUPABASE_USER_ID,
      review_date: date,
      total_zar: ctx.daySpend,
      transaction_count: yday.length,
      roast,
      completed_at: null,
    },
    "user_id,review_date"
  );

  // 3. Send the notification.
  const reviewWord = pending.length === 1 ? "transaction" : "transactions";
  const dayLabel = pending.length === 0 ? "(all already reviewed)" : `${pending.length} ${reviewWord} to confirm`;
  const totalLine = `*R${Math.round(ctx.daySpend).toLocaleString()}* across ${yday.length} ${yday.length === 1 ? "transaction" : "transactions"}`;

  const telegramText = [
    `Good morning.`,
    ``,
    `Yesterday: ${totalLine}.`,
    ``,
    tgEscape(roast),
    ``,
    `_${dayLabel}_`,
  ].join("\n");

  const telegramReplyMarkup = {
    inline_keyboard: [[{ text: "Lock in yesterday →", url: REVIEW_APP_URL }]],
  };

  const emailSubject = roast.length > 90 ? `${roast.slice(0, 87).trim()}…` : roast;
  const emailHtml = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      <p style="margin:0 0 12px 0;font-size:15px;line-height:1.55"><strong>Yesterday:</strong> R${Math.round(ctx.daySpend).toLocaleString()} across ${yday.length} ${yday.length === 1 ? "transaction" : "transactions"}.</p>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55">${roast}</p>
      <p style="margin:0 0 16px 0">
        <a href="${REVIEW_APP_URL}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:500;font-size:14px">Lock in yesterday →</a>
      </p>
      <p style="margin:0;color:#94a3b8;font-size:12px">${dayLabel}</p>
    </div>
  `;

  const channel = await sendNotification({
    telegramText,
    telegramReplyMarkup,
    emailSubject,
    emailHtml,
  });
  console.log(`[morning] notification sent via ${channel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
