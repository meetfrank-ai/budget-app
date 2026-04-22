"use client";

import { useState, useTransition } from "react";
import {
  setShareAction,
  splitTransactionAction,
  unsplitTransactionAction,
} from "../actions";
import type { Transaction } from "@/lib/queries";
import { zar, shortDate } from "@/lib/format";

export function TransactionRow({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isRefund = tx.tx_type === "Refund";
  const isDeclined = tx.status === "Declined";
  const isSplitParent = tx.is_split;
  const isSplitChild = tx.linked_to_id != null && !tx.is_split;

  const rowBg = isDeclined
    ? "bg-red-50/40"
    : tx.tx_type === "Transfer"
      ? "bg-slate-50"
      : isSplitParent
        ? "bg-amber-50/40"
        : "";

  function submit(action: (fd: FormData) => Promise<unknown>, fd: FormData) {
    startTransition(() => {
      action(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <tr className={`${rowBg} ${pending ? "opacity-50" : ""}`}>
        <td className="px-4 py-2.5 mono text-xs text-[var(--color-muted)] whitespace-nowrap">
          {shortDate(tx.occurred_on)}
        </td>
        <td className="px-4 py-2.5">
          <div className="font-medium break-words">{tx.description}</div>
          <div className="text-xs text-[var(--color-muted)] flex flex-wrap gap-x-2">
            <span>
              {tx.tx_type}
              {isDeclined ? " · Declined" : ""}
            </span>
            {isSplitParent && <span className="text-amber-700">· split parent (hidden from budget)</span>}
            {isSplitChild && <span>· split child</span>}
            {tx.shared_with && (
              <span className="text-[var(--color-ink)]">
                · {tx.shared_with} {tx.shared_pct != null ? `${tx.shared_pct}%` : ""}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs">
          {tx.category_name ?? <span className="text-[var(--color-warn)]">—</span>}
        </td>
        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">
          {tx.account_name}
        </td>
        <td
          className={`px-4 py-2.5 text-right mono whitespace-nowrap ${
            isDeclined
              ? "line-through text-[var(--color-muted)]"
              : isRefund
                ? "text-[var(--color-pos)]"
                : ""
          }`}
        >
          {isRefund ? "−" : ""}
          {zar(tx.amount_zar)}
        </td>
        <td className="px-2 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] bg-white hover:text-[var(--color-ink)]"
            aria-label="Edit transaction"
          >
            {open ? "Close" : "Edit"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-white">
          <td colSpan={6} className="px-4 py-4 border-t border-[var(--color-border)]">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Split panel */}
              {!isSplitChild && (
                <div className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">
                    {isSplitParent ? "Split" : "Split across months"}
                  </div>
                  {isSplitParent ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData();
                        fd.set("transaction_id", tx.id);
                        submit(unsplitTransactionAction, fd);
                      }}
                    >
                      <p className="text-xs text-[var(--color-muted)] mb-3">
                        This transaction is currently split — children carry the monthly amounts into the budget.
                      </p>
                      <button
                        type="submit"
                        disabled={pending}
                        className="text-xs px-3 py-1.5 rounded border border-[var(--color-border)] bg-white hover:text-[var(--color-ink)]"
                      >
                        Unsplit (delete children)
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget as HTMLFormElement);
                        fd.set("transaction_id", tx.id);
                        submit(splitTransactionAction, fd);
                      }}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-muted)] w-24">Months</label>
                        <input
                          type="number"
                          name="months"
                          defaultValue={12}
                          min={2}
                          max={48}
                          required
                          className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm mono"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-muted)] w-24">Start month</label>
                        <input
                          type="month"
                          name="start_ym"
                          required
                          className="rounded border border-[var(--color-border)] px-2 py-1 text-sm mono"
                        />
                      </div>
                      <div className="text-xs text-[var(--color-muted)] pt-1">
                        Amount divides evenly across months. The original stays in place but is hidden from budget totals.
                      </div>
                      <button
                        type="submit"
                        disabled={pending}
                        className="mt-2 text-xs px-3 py-1.5 rounded bg-[var(--color-ink)] text-white"
                      >
                        Split {zar(tx.amount_zar)}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Share panel */}
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">
                  Shared with someone
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget as HTMLFormElement);
                    fd.set("transaction_id", tx.id);
                    submit(setShareAction, fd);
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--color-muted)] w-24">With</label>
                    <input
                      type="text"
                      name="shared_with"
                      defaultValue={tx.shared_with ?? "Jac"}
                      placeholder="Jac"
                      className="flex-1 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--color-muted)] w-24">Their share</label>
                    <input
                      type="number"
                      name="shared_pct"
                      defaultValue={tx.shared_pct ?? 50}
                      min={0}
                      max={100}
                      step={1}
                      className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm mono"
                    />
                    <span className="text-xs text-[var(--color-muted)]">%</span>
                  </div>
                  <div className="text-xs text-[var(--color-muted)] pt-1">
                    Spend stays on your books. This is a note so you can see what was for both of you.
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--color-ink)] text-white"
                    >
                      Save
                    </button>
                    {tx.shared_with && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("transaction_id", tx.id);
                          fd.set("shared_with", "");
                          fd.set("shared_pct", "");
                          submit(setShareAction, fd);
                        }}
                        className="text-xs px-3 py-1.5 rounded border border-[var(--color-border)] bg-white"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
