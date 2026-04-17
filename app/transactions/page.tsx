import Link from "next/link";
import { queries } from "@/lib/queries";
import { zar, shortDate, monthLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; cat?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = parseInt(params.y ?? String(now.getFullYear()));
  const month = parseInt(params.m ?? String(now.getMonth() + 1));
  const categoryFilter = params.cat;

  const all = await queries.transactions({ year, month, limit: 500 });
  const rows = categoryFilter
    ? all.filter((t) => t.category_name === categoryFilter)
    : all;

  const categories = Array.from(new Set(all.map((t) => t.category_name).filter(Boolean))) as string[];
  categories.sort();

  const total = rows
    .filter((r) => r.status === "Completed" && r.tx_type !== "Transfer")
    .reduce((s, r) => s + r.amount_zar * (r.tx_type === "Refund" ? -1 : 1), 0);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Transactions</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{monthLabel(year, month)}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/transactions?y=${month === 1 ? year - 1 : year}&m=${month === 1 ? 12 : month - 1}`} className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
            ← Prev
          </Link>
          <Link href={`/transactions?y=${month === 12 ? year + 1 : year}&m=${month === 12 ? 1 : month + 1}`} className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
            Next →
          </Link>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={`/transactions?y=${year}&m=${month}`}
          className={`px-3 py-1 text-xs rounded-full border ${!categoryFilter ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]" : "bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}
        >
          All ({all.length})
        </Link>
        {categories.map((c) => {
          const count = all.filter((t) => t.category_name === c).length;
          const active = categoryFilter === c;
          return (
            <Link
              key={c}
              href={`/transactions?y=${year}&m=${month}&cat=${encodeURIComponent(c)}`}
              className={`px-3 py-1 text-xs rounded-full border ${active ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]" : "bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}
            >
              {c} ({count})
            </Link>
          );
        })}
      </div>

      <div className="mb-4 text-sm text-[var(--color-muted)]">
        Showing {rows.length} · Total (excluding transfers): <span className="mono text-[var(--color-ink)]">{zar(total)}</span>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-normal">Date</th>
              <th className="px-4 py-3 font-normal">Description</th>
              <th className="px-4 py-3 font-normal">Category</th>
              <th className="px-4 py-3 font-normal">Account</th>
              <th className="px-4 py-3 font-normal text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((t) => (
              <tr key={t.id} className={t.status === "Declined" ? "bg-red-50/40" : t.tx_type === "Transfer" ? "bg-slate-50" : ""}>
                <td className="px-4 py-2.5 mono text-xs text-[var(--color-muted)] whitespace-nowrap">{shortDate(t.occurred_on)}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium truncate max-w-xs">{t.description}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {t.tx_type}
                    {t.status === "Declined" ? " · Declined" : ""}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {t.category_name ?? <span className="text-[var(--color-warn)]">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{t.account_name}</td>
                <td className={`px-4 py-2.5 text-right mono ${t.status === "Declined" ? "line-through text-[var(--color-muted)]" : t.tx_type === "Refund" ? "text-[var(--color-pos)]" : ""}`}>
                  {t.tx_type === "Refund" ? "−" : ""}{zar(t.amount_zar)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
