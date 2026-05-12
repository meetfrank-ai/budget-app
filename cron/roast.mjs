/**
 * Daily roast generator for the morning cron. Port of lib/roast.ts so the cron
 * can pre-bake the roast for the morning notification AND cache it on the
 * daily_reviews row (which /home reads). One roast per day, shared between
 * channels.
 */

const MODEL = "claude-haiku-4-5";

const fmt = (n) => `R${Math.round(n).toLocaleString()}`;

function templatedFallback(ctx) {
  const moved = (ctx.movedYesterday ?? []).slice().sort((a, b) => b.dayDelta - a.dayDelta);
  if (moved.length === 0) return "Quiet day. Nothing moved.";
  const top = moved[0];
  const parts = [`${top.name} took ${fmt(top.dayDelta)} yesterday — now at ${top.row.pct_used}% of plan.`];
  if (moved.length > 1) {
    parts.push(`Also: ${moved.slice(1, 3).map((m) => `${m.name} ${fmt(m.dayDelta)}`).join(" · ")}.`);
  }
  return parts.join(" ");
}

function buildPrompt(ctx) {
  const pctThrough = Math.round((ctx.dayOfMonth / ctx.daysInMonth) * 100);
  const pctSpent = ctx.monthPlanned > 0 ? Math.round((ctx.monthActual / ctx.monthPlanned) * 100) : 0;
  const paceDelta = pctSpent - pctThrough;

  const movedLines = (ctx.movedYesterday ?? [])
    .slice()
    .sort((a, b) => b.dayDelta - a.dayDelta)
    .map(
      (m) =>
        `- ${m.name}: spent ${fmt(m.dayDelta)} yesterday → now ${fmt(m.row.actual_net)} of ${fmt(m.row.planned)} (${m.row.pct_used}%)`
    )
    .join("\n");

  return (
    `Yesterday (${ctx.reviewDate}): ${fmt(ctx.daySpend)} across ${ctx.dayCount} transactions.\n\n` +
    `Categories that moved yesterday:\n${movedLines || "(none — quiet day)"}\n\n` +
    `Monthly pace: ${pctSpent}% spent at ${pctThrough}% through the month (delta ${paceDelta >= 0 ? "+" : ""}${paceDelta}pts).\n\n` +
    `Write the 2–3 sentence summary now. Focus on what moved.`
  );
}

export async function generateDailyRoast(ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return templatedFallback(ctx);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 250,
        system:
          "You are Lynette's dry, observant finance friend reviewing yesterday's spending. " +
          "Write 2–3 sentences MAX. Lead with the categories that moved yesterday — name them, give the rand amount, " +
          "and call out anything that crossed its monthly plan. " +
          "Only mention monthly pace if the spent vs. through-month delta is greater than 10 points. " +
          "Tongue-in-cheek but never mean. Specific, not generic. No emoji. No warnings. ZAR currency (R).",
        messages: [{ role: "user", content: buildPrompt(ctx) }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (text) return text.trim();
    return templatedFallback(ctx);
  } catch (e) {
    console.error("[roast] generation failed, using fallback:", e.message);
    return templatedFallback(ctx);
  }
}
