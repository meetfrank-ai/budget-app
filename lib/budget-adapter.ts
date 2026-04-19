import { queries, type Transaction } from "./queries";
import { generateBudgetCommentary } from "./roast";
import { monthLabel } from "./format";

export type Budget = {
  month: string;              // "YYYY-MM"
  monthLabel: string;         // "April 2026"
  daysInMonth: number;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  planned: number;
  actual: number;
  categories: BudgetCategory[];
  dailyTotals: DailyTotal[];
  insight: string;
};

export type BudgetCategory = {
  id: string;
  name: string;
  planned: number;
  actual: number;
  transactions: BudgetTx[];
};

export type BudgetTx = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
};

export type DailyTotal = {
  day: number;
  cumulative: number;
};

export function parseMonth(monthStr: string | undefined): {
  year: number;
  month: number;
  iso: string;
} {
  const now = new Date();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    return { year: y, month: m, iso: monthStr };
  }
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, iso: `${year}-${String(month).padStart(2, "0")}` };
}

export function shiftMonth(monthStr: string, delta: number): string {
  const { year, month } = parseMonth(monthStr);
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function netSigned(tx: Transaction): number {
  return Number(tx.amount_zar) * (tx.tx_type === "Refund" ? -1 : 1);
}

export async function getBudget(monthStr: string | undefined): Promise<Budget> {
  const { year, month, iso } = parseMonth(monthStr);

  const [rows, monthTransactions] = await Promise.all([
    queries.monthBudget(year, month),
    queries.transactions({ year, month, limit: 1000 }),
  ]);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;

  // Group completed, non-transfer transactions by category for the expand drawer.
  const byCategory = new Map<string, Transaction[]>();
  for (const tx of monthTransactions) {
    if (tx.status !== "Completed" || tx.tx_type === "Transfer") continue;
    const key = tx.category_id ?? "__uncategorised";
    const bucket = byCategory.get(key) ?? [];
    bucket.push(tx);
    byCategory.set(key, bucket);
  }

  const categories: BudgetCategory[] = rows.map((row) => {
    const txs = (byCategory.get(row.category_id) ?? [])
      .slice()
      .sort((a, b) => {
        if (a.occurred_on !== b.occurred_on) return b.occurred_on.localeCompare(a.occurred_on);
        return (b.occurred_time ?? "").localeCompare(a.occurred_time ?? "");
      })
      .map((t) => ({
        id: t.id,
        date: t.occurred_on,
        merchant: t.description,
        amount: netSigned(t),
      }));
    return {
      id: row.category_id,
      name: row.category_name,
      planned: row.planned,
      actual: row.actual_net,
      transactions: txs,
    };
  });

  // Daily cumulative net spend from day 1 up to today (or last day of month if historical).
  const dayNet = new Array<number>(daysInMonth + 2).fill(0);
  for (const tx of monthTransactions) {
    if (tx.status !== "Completed" || tx.tx_type === "Transfer") continue;
    const day = parseInt(tx.occurred_on.slice(8, 10));
    if (day < 1 || day > daysInMonth) continue;
    dayNet[day] += netSigned(tx);
  }
  const dailyTotals: DailyTotal[] = [];
  let cum = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    cum += dayNet[d];
    dailyTotals.push({ day: d, cumulative: cum });
  }

  const totalPlanned = categories.reduce((s, c) => s + c.planned, 0);
  const totalActual = categories.reduce((s, c) => s + c.actual, 0);

  const insight = isCurrentMonth
    ? await generateBudgetCommentary({
        budget: rows,
        monthName: monthLabel(year, month),
        daysInMonth,
        dayOfMonth,
      })
    : "";

  return {
    month: iso,
    monthLabel: monthLabel(year, month),
    daysInMonth,
    dayOfMonth,
    isCurrentMonth,
    planned: totalPlanned,
    actual: totalActual,
    categories,
    dailyTotals,
    insight,
  };
}
