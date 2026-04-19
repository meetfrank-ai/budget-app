"use client";

import { useState } from "react";
import { zar, zarRound, pct, shortDate } from "@/lib/format";
import type { BudgetRow, Transaction } from "@/lib/queries";

function barTone(pctUsed: number | null): "ok" | "warn" | "over" {
  if (pctUsed == null) return "ok";
  if (pctUsed >= 100) return "over";
  if (pctUsed >= 80) return "warn";
  return "ok";
}

export function BudgetCategoryCard({
  row,
  transactions,
}: {
  row: BudgetRow;
  transactions: Transaction[];
}) {
  const [open, setOpen] = useState(false);
  const remaining = row.planned - row.actual_net;
  const tone = barTone(row.pct_used);
  const fillPct = Math.min(100, row.pct_used ?? 0);

  const categoryTx = transactions
    .filter(
      (t) =>
        t.category_id === row.category_id &&
        t.status === "Completed" &&
        t.tx_type !== "Transfer"
    )
    .sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return b.occurred_on.localeCompare(a.occurred_on);
      return (b.occurred_time ?? "").localeCompare(a.occurred_time ?? "");
    });

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 md:px-5 md:py-3 hover:bg-[var(--color-bg)] active:bg-[var(--color-bg)] transition-colors"
        aria-expanded={open}
      >
        {/* Mobile layout */}
        <div className="md:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{row.category_name}</div>
            <div
              className={`mono shrink-0 text-sm font-medium tabular-nums ${
                tone === "over" ? "text-[var(--color-neg)]" : ""
              }`}
            >
              {tone === "over" && remaining < 0 ? `+${zarRound(-remaining)}` : pct(row.pct_used)}
            </div>
            <Chevron open={open} />
          </div>
          <div className="mt-2 bar-track">
            <div className={`bar-fill ${tone}`} style={{ width: `${fillPct}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-muted)] tabular-nums">
            <span className="mono">
              {zarRound(row.actual_net)} of {zarRound(row.planned)}
            </span>
            {categoryTx.length > 0 && <span>{categoryTx.length} tx</span>}
          </div>
        </div>

        {/* Desktop layout — table-like grid */}
        <div className="hidden md:grid md:grid-cols-[1fr_104px_104px_104px_1fr_16px] md:items-center md:gap-4">
          <div className="truncate text-sm font-medium">{row.category_name}</div>
          <div className="mono text-right text-sm text-[var(--color-muted)]">{zarRound(row.planned)}</div>
          <div
            className={`mono text-right text-sm ${tone === "over" ? "text-[var(--color-neg)]" : ""}`}
          >
            {zarRound(row.actual_net)}
            {row.actual_refund > 0 && (
              <span className="ml-1 text-xs text-[var(--color-muted)]">
                (−{zarRound(row.actual_refund)})
              </span>
            )}
          </div>
          <div
            className={`mono text-right text-sm ${
              remaining < 0 ? "text-[var(--color-neg)]" : "text-[var(--color-muted)]"
            }`}
          >
            {zarRound(remaining)}
          </div>
          <div className="flex items-center gap-2">
            <div className="bar-track flex-1">
              <div className={`bar-fill ${tone}`} style={{ width: `${fillPct}%` }} />
            </div>
            <div className="mono w-10 text-right text-xs text-[var(--color-muted)]">
              {pct(row.pct_used)}
            </div>
          </div>
          <Chevron open={open} />
        </div>
      </button>

      {/* Transactions drawer */}
      {open && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          {categoryTx.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 text-center text-xs text-[var(--color-muted)]">
              No transactions in this category this month.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
              {categoryTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 md:px-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{t.description}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      {shortDate(t.occurred_on)}
                      {t.account_name ? ` · ${t.account_name}` : ""}
                    </div>
                  </div>
                  <div
                    className={`mono shrink-0 text-sm tabular-nums ${
                      t.tx_type === "Refund" ? "text-[var(--color-pos)]" : ""
                    }`}
                  >
                    {t.tx_type === "Refund" ? "−" : ""}
                    {zar(t.amount_zar)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={`shrink-0 text-[var(--color-muted)] transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
