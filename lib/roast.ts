import Anthropic from "@anthropic-ai/sdk";
import type { BudgetRow } from "./queries";

type RoastContext = {
  reviewDate: string;
  daySpend: number;
  dayCount: number;
  monthPlanned: number;
  monthActual: number;
  daysInMonth: number;
  dayOfMonth: number;
  topCategories: BudgetRow[];      // desc by actual_net
  overBudget: BudgetRow[];         // pct_used >= 100
  underBudget: BudgetRow[];        // pct_used < 50, planned > 500
};

const MODEL = "claude-haiku-4-5";

/**
 * Ask Claude for a dry, honest summary of the day + month position.
 * Falls back to a templated message if ANTHROPIC_API_KEY isn't set so the flow
 * still demonstrates end-to-end without blocking on credentials.
 */
export async function generateRoast(ctx: RoastContext): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return templatedFallback(ctx);
  }

  const client = new Anthropic({ apiKey: key });

  const prompt = buildPrompt(ctx);
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "You are Lynette's dry, observant finance friend. You've just seen her review today's spending and the monthly budget state. " +
        "Write 3–5 sentences: honest, specific, tongue-in-cheek but never mean. Call out what looks good AND what's concerning. " +
        "Use her actual numbers. No emoji. No generic praise. No warnings. Plain prose. South African Rand (R).",
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    if (block.type === "text") return block.text.trim();
    return templatedFallback(ctx);
  } catch (e) {
    console.error("roast failed, using fallback", e);
    return templatedFallback(ctx);
  }
}

function buildPrompt(ctx: RoastContext): string {
  const pctThrough = Math.round((ctx.dayOfMonth / ctx.daysInMonth) * 100);
  const pctSpent = ctx.monthPlanned > 0 ? Math.round((ctx.monthActual / ctx.monthPlanned) * 100) : 0;
  const paceDelta = pctSpent - pctThrough;

  const top = ctx.topCategories
    .slice(0, 3)
    .map((b) => `${b.category_name}: R${Math.round(b.actual_net).toLocaleString()} of R${Math.round(b.planned).toLocaleString()} plan (${b.pct_used}%)`)
    .join("; ");
  const over = ctx.overBudget
    .map((b) => `${b.category_name} at ${b.pct_used}% (R${Math.round(b.actual_net).toLocaleString()} of R${Math.round(b.planned).toLocaleString()})`)
    .join("; ") || "none";
  const under = ctx.underBudget
    .map((b) => `${b.category_name} at ${b.pct_used}%`)
    .join(", ") || "none";

  return (
    `Today (${ctx.reviewDate}): R${ctx.daySpend.toFixed(2)} across ${ctx.dayCount} transactions.\n` +
    `Month position: R${Math.round(ctx.monthActual).toLocaleString()} spent of R${Math.round(ctx.monthPlanned).toLocaleString()} plan (${pctSpent}% spent, ${pctThrough}% through the month — pace delta ${paceDelta >= 0 ? "+" : ""}${paceDelta}%).\n` +
    `Top categories this month: ${top}\n` +
    `Categories over 100%: ${over}\n` +
    `Categories tracking low (<50%): ${under}\n` +
    `\nWrite the 3–5 sentence summary now.`
  );
}

function templatedFallback(ctx: RoastContext): string {
  const pctThrough = Math.round((ctx.dayOfMonth / ctx.daysInMonth) * 100);
  const pctSpent = ctx.monthPlanned > 0 ? Math.round((ctx.monthActual / ctx.monthPlanned) * 100) : 0;
  const paceDelta = pctSpent - pctThrough;
  const fmt = (n: number) => `R${Math.round(n).toLocaleString()}`;

  const parts: string[] = [];

  if (ctx.dayCount === 0) {
    parts.push(`Quiet day — nothing hit the cards.`);
  } else {
    parts.push(`${fmt(ctx.daySpend)} today across ${ctx.dayCount} transactions.`);
  }

  if (paceDelta > 10) {
    parts.push(`April is ${pctSpent}% spent but we're only ${pctThrough}% through the month — you're running hot by ${Math.abs(paceDelta)} points.`);
  } else if (paceDelta < -10) {
    parts.push(`${pctSpent}% of April's plan used at day ${ctx.dayOfMonth} of ${ctx.daysInMonth}. Pace looks calm.`);
  } else {
    parts.push(`${pctSpent}% of April spent at ${pctThrough}% through the month. Right on pace.`);
  }

  if (ctx.overBudget.length > 0) {
    const worst = ctx.overBudget[0];
    parts.push(`${worst.category_name} has already blown past its plan at ${worst.pct_used}%.`);
  } else {
    parts.push(`Nothing's over 100% yet — category discipline is holding.`);
  }

  if (ctx.underBudget.length > 0) {
    const names = ctx.underBudget.slice(0, 2).map((b) => b.category_name).join(" and ");
    parts.push(`${names} tracking low this month — either it's a slow month or the plan has room to tighten.`);
  }

  parts.push(
    `\n\n(Templated summary — add ANTHROPIC_API_KEY to .env.local for the real roast.)`
  );

  return parts.join(" ");
}
