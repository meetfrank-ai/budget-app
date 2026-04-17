/**
 * Morning review nudge — runs at 08:00 SAST (06:00 UTC) via Render Cron Job.
 * If yesterday has unreviewed transactions, emails Lynette a link to lock in.
 *
 * Env vars:
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID
 *  - RESEND_API_KEY          — sender auth
 *  - REVIEW_TO_EMAIL         — where to send the nudge
 *  - REVIEW_FROM_EMAIL       — sender, e.g. "Budget <onboarding@resend.dev>"
 *  - REVIEW_APP_URL          — https://budget-app-5arn.onrender.com
 *
 * Exits 0 on success OR "nothing to review" (no notification needed).
 * Exits 1 on real failure so Render's dashboard shows the error.
 */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_USER_ID,
  RESEND_API_KEY,
  REVIEW_TO_EMAIL,
  REVIEW_FROM_EMAIL = "Budget <onboarding@resend.dev>",
  REVIEW_APP_URL = "https://budget-app-5arn.onrender.com",
} = process.env;

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_USER_ID,
  RESEND_API_KEY,
  REVIEW_TO_EMAIL,
})) {
  if (!v) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

function yesterdayISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function countPending(date) {
  const q = new URLSearchParams({
    user_id: `eq.${SUPABASE_USER_ID}`,
    occurred_on: `eq.${date}`,
    reviewed_at: "is.null",
    status: "eq.Completed",
    tx_type: "neq.Transfer",
    select: "id",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${q}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
  }
  // PostgREST returns Content-Range: `0-N/total` when `count` is requested
  const range = res.headers.get("content-range") ?? "";
  const total = parseInt(range.split("/").pop() ?? "0", 10);
  return Number.isFinite(total) ? total : 0;
}

async function sendEmail({ subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REVIEW_FROM_EMAIL,
      to: REVIEW_TO_EMAIL,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const date = yesterdayISO();
  const pending = await countPending(date);

  console.log(`yesterday=${date} pending=${pending}`);

  if (pending === 0) {
    console.log("nothing to review, no email sent.");
    return;
  }

  const subject = `${pending} transactions waiting for review`;
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:18px;margin:0 0 8px 0">Good morning.</h1>
      <p style="margin:0 0 16px 0;color:#64748b;font-size:14px">
        ${pending} ${pending === 1 ? "transaction" : "transactions"} from yesterday
        are waiting for a quick review.
      </p>
      <p style="margin:0 0 24px 0">
        <a href="${REVIEW_APP_URL}"
           style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:500;font-size:14px">
          Lock in yesterday →
        </a>
      </p>
      <p style="margin:0;color:#94a3b8;font-size:12px">
        Takes 30 seconds. If the roast's honest, it means the app's working.
      </p>
    </div>
  `;

  await sendEmail({ subject, html });
  console.log(`email sent to ${REVIEW_TO_EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
