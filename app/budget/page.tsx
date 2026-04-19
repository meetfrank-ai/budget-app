import { getBudget } from "@/lib/budget-adapter";
import { GreetingRow } from "./components/GreetingRow";
import { BudgetHero } from "./components/BudgetHero";
import { StatChipGrid } from "./components/StatChipGrid";
import { CashFlowChart } from "./components/CashFlowChart";
import { SpendingDonut } from "./components/SpendingDonut";
import { BiggestLeaks } from "./components/BiggestLeaks";
import { CategoryTable } from "./components/CategoryTable";
import { InsightBanner } from "./components/InsightBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIRST_NAME = "Lynette";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const budget = await getBudget(month);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 md:px-10 md:py-8">
      <GreetingRow firstName={FIRST_NAME} monthLabel={budget.monthLabel} />

      <BudgetHero
        month={budget.month}
        monthLabel={budget.monthLabel}
        planned={budget.planned}
        actual={budget.actual}
        daysInMonth={budget.daysInMonth}
        dayOfMonth={budget.dayOfMonth}
      />

      <StatChipGrid
        planned={budget.planned}
        actual={budget.actual}
        daysInMonth={budget.daysInMonth}
        dayOfMonth={budget.dayOfMonth}
        month={budget.month}
      />

      <div className="grid gap-2.5 mb-2.5 md:grid-cols-[1.7fr_1fr]">
        <CashFlowChart
          dailyTotals={budget.dailyTotals}
          planned={budget.planned}
          daysInMonth={budget.daysInMonth}
          dayOfMonth={budget.dayOfMonth}
          month={budget.month}
        />
        <SpendingDonut categories={budget.categories} totalActual={budget.actual} />
      </div>

      <div className="grid gap-2.5 mb-2.5 md:grid-cols-[1fr_1.7fr]">
        <BiggestLeaks categories={budget.categories} />
        <CategoryTable categories={budget.categories} />
      </div>

      <InsightBanner insight={budget.insight} />
    </div>
  );
}
