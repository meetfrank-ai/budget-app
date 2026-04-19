export function InsightBanner({ insight }: { insight: string }) {
  if (!insight) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-5 py-[0.9rem] flex gap-3.5 items-start">
      <span className="text-[10px] uppercase tracking-[1.5px] font-medium bg-[var(--color-brand-50)] text-[var(--color-brand-800)] px-2.5 py-1 rounded-full whitespace-nowrap mt-0.5">
        Coach
      </span>
      <div className="text-[12.5px] leading-[1.55] text-[var(--color-text-primary)] whitespace-pre-wrap">
        {insight}
      </div>
    </div>
  );
}
