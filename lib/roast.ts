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
  topCategories: BudgetRow[];     // desc by actual_net (whole month)
  overBudget: BudgetRow[];        // pct_used >= 100
  underBudget: BudgetRow[];       // pct_used < 50, planned > 500
  /** Categories actually touched yesterday with their per-day delta + month state. */
  movedYesterday?: Array<{ name: string; dayDelta: number; row: BudgetRow }>;
};

const MODEL = "claude-haiku-4-5";

/**
 * Daily roast — punchy 2-3 sentences, leads with what moved yesterday.
 * Falls back to a templated message if ANTHROPIC_API_KEY isn't set.
 */
export async function generateRoast(ctx: RoastContext): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return templatedFallback(ctx);

  const client = new Anthropic({ apiKey: key });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 250,
      system:
        "You are Lynette's dry, observant finance friend reviewing yesterday's spending. " +
        "Write 2–3 sentences MAX. Lead with the categories that moved yesterday — name them, give the rand amount, " +
        "and call out anything that crossed its monthly plan. " +
        "Only mention monthly pace if the spent vs. through-month delta is greater than 10 points. " +
        "Tongue-in-cheek but never mean. Specific, not generic. No emoji. No warnings. ZAR currency (R).",
      messages: [{ role: "user", content: buildDailyPrompt(ctx) }],
    });
    const block = res.content[0];
    if (block.type === "text") return block.text.trim();
    return templatedFallback(ctx);
  } catch (e) {
    console.error("daily roast failed, using fallback", e);
    return templatedFallback(ctx);
  }
}

/**
 * Budget-tab commentary — longer (4–6 sentences), strategic, surveys the
 * whole month not just yesterday. Generated fresh on every /budget visit.
 */
export async function generateBudgetCommentary(args: {
  budget: BudgetRow[];
  monthName: string;
  daysInMonth: number;
  dayOfMonth: number;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  const monthActual = args.budget.reduce((s, b) => s + b.actual_net, 0);
  const monthPlanned = args.budget.reduce((s, b) => s + b.planned, 0);
  const pctSpent = monthPlanned > 0 ? Math.round((monthActual / monthPlanned) * 100) : 0;
  const pctThrough = Math.round((args.dayOfMonth / args.daysInMonth) * 100);

  if (!key) return budgetTemplatedFallback(args.monthName, pctSpent, pctThrough);

  const top = [...args.budget]
    .filter((b) => b.actual_net > 0)
    .sort((a, b) => b.actual_net - a.actual_net)
    .slice(0, 5);
  const over = args.budget.filter((b) => (b.pct_used ?? 0) >= 100 && b.planned > 0);
  const under = args.budget.filter((b) => (b.pct_used ?? 100) < 50 && b.planned >= 500);
  const fmt = (n: number) => `R${Math.round(n).toLocaleString()}`;

  const prompt =
    `${args.monthName} budget review (day ${args.dayOfMonth} of ${args.daysInMonth}, ${pctThrough}% through).\n` +
    `Total: ${fmt(monthActual)} spent of ${fmt(monthPlanned)} plan (${pctSpent}%). Pace delta ${pctSpent - pctThrough}pts.\n\n` +
    `Top spend categories:\n${top.map((b) => `- ${b.category_name}: ${fmt(b.actual_net)} of ${fmt(b.planned)} (${b.pct_used}%)`).join("\n")}\n\n` +
    `Over plan: ${over.map((b) => `${b.category_name} ${b.pct_used}%`).join(", ") || "none"}\n` +
    `Tracking low (<50%): ${under.map((b) => `${b.category_name} ${b.pct_used}%`).join(", ") || "none"}\n\n` +
    `Write the 4–6 sentence commentary now.`;

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 90,
      system:
        "You are Lynette's sassy-as-hell finance friend. " +
        "Write EXACTLY 2 sentences, under 40 words total. " +
        "Pick the ONE thing that matters most (worst overrun, silent leak, or surprise win) and say it. " +
        "Sharp, blunt, a little mean. No equivocating, no 'consider', no hedging. No emoji. ZAR (R).",
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    if (block.type === "text") return block.text.trim();
    return budgetTemplatedFallback(args.monthName, pctSpent, pctThrough);
  } catch (e) {
    console.error("budget commentary failed, using fallback", e);
    return budgetTemplatedFallback(args.monthName, pctSpent, pctThrough);
  }
}

function buildDailyPrompt(ctx: RoastContext): string {
  const fmt = (n: number) => `R${Math.round(n).toLocaleString()}`;
  const pctThrough = Math.round((ctx.dayOfMonth / ctx.daysInMonth) * 100);
  const pctSpent = ctx.monthPlanned > 0 ? Math.round((ctx.monthActual / ctx.monthPlanned) * 100) : 0;
  const paceDelta = pctSpent - pctThrough;

  const movedLines = (ctx.movedYesterday ?? [])
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

function templatedFallback(ctx: RoastContext): string {
  const fmt = (n: number) => `R${Math.round(n).toLocaleString()}`;
  const moved = (ctx.movedYesterday ?? []).sort((a, b) => b.dayDelta - a.dayDelta);
  const parts: string[] = [];
  if (moved.length > 0) {
    const top = moved[0];
    parts.push(`${top.name} took ${fmt(top.dayDelta)} yesterday — now at ${top.row.pct_used}% of plan.`);
    if (moved.length > 1) {
      parts.push(`Also touched: ${moved.slice(1, 3).map((m) => `${m.name} ${fmt(m.dayDelta)}`).join(" · ")}.`);
    }
  } else {
    parts.push(`Quiet day — nothing to roast.`);
  }
  parts.push(`(Templated — set ANTHROPIC_API_KEY for the real roast.)`);
  return parts.join(" ");
}

function budgetTemplatedFallback(monthName: string, pctSpent: number, pctThrough: number): string {
  const delta = pctSpent - pctThrough;
  if (Math.abs(delta) < 5) return `${monthName} is tracking on plan: ${pctSpent}% spent at ${pctThrough}% through.`;
  if (delta > 0) return `${monthName} is running hot — ${pctSpent}% of plan used at ${pctThrough}% through (over pace by ${delta}pts).`;
  return `${monthName} is well under pace — only ${pctSpent}% spent at ${pctThrough}% through.`;
}
