/**
 * Notification channels. One function — sendNotification — picks the channel
 * based on what env vars are set. Telegram is primary; Resend stays as a
 * fallback so a missing TELEGRAM_BOT_TOKEN doesn't silence the morning nudge.
 */

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RESEND_API_KEY, REVIEW_TO_EMAIL, REVIEW_FROM_EMAIL = "Budget <onboarding@resend.dev>" } = process.env;

export async function sendTelegram({ text, replyMarkup }) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
  }
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function sendEmail({ subject, html }) {
  if (!RESEND_API_KEY || !REVIEW_TO_EMAIL) {
    throw new Error("Resend not configured (RESEND_API_KEY / REVIEW_TO_EMAIL)");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REVIEW_FROM_EMAIL, to: REVIEW_TO_EMAIL, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Send via the best available channel. Telegram first, fall back to email.
 * The caller passes both a text-form (for Telegram) and an html/subject-form
 * (for email) so each channel renders well.
 */
export async function sendNotification({ telegramText, telegramReplyMarkup, emailSubject, emailHtml }) {
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    await sendTelegram({ text: telegramText, replyMarkup: telegramReplyMarkup });
    return "telegram";
  }
  if (RESEND_API_KEY && REVIEW_TO_EMAIL) {
    await sendEmail({ subject: emailSubject, html: emailHtml });
    return "email";
  }
  throw new Error("No notification channel configured");
}
