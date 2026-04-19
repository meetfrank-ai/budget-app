import { longDate } from "@/lib/format";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function GreetingRow({
  firstName,
  monthLabel,
}: {
  firstName: string;
  monthLabel: string;
}) {
  const now = new Date();
  const hello = greetingForHour(now.getHours());
  const initial = firstName.slice(0, 1).toUpperCase();
  const dateLine = `${longDate(now)} · ${monthLabel} budget`;

  return (
    <div className="flex items-center justify-between px-1 mb-3">
      <div className="flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-full bg-[var(--color-brand-400)] text-white flex items-center justify-center text-[13px] font-medium">
          {initial}
        </div>
        <div>
          <div className="text-[15px] font-medium tracking-[-0.01em] text-[var(--color-text-primary)]">
            {hello}, {firstName}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-[1px]">{dateLine}</div>
        </div>
      </div>
      <button
        type="button"
        className="bg-[var(--color-brand-400)] hover:bg-[var(--color-brand-600)] text-white rounded-full px-[14px] py-2 text-[12px] font-medium flex items-center gap-1.5 transition-colors"
      >
        <span className="w-[5px] h-[5px] rounded-full bg-white opacity-80" />
        Ask coach
      </button>
    </div>
  );
}
