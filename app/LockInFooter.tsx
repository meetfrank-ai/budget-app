"use client";

import { useTransition } from "react";
import { lockInAction } from "./actions";

export function LockInFooter({ date }: { date: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      {/* Inline footer (desktop) */}
      <form
        action={(fd) => {
          fd.set("date", date);
          startTransition(() => lockInAction(fd));
        }}
        className="hidden md:block mt-8"
      >
        <button
          type="submit"
          disabled={pending}
          className="w-full py-4 rounded-xl bg-[var(--color-ink)] text-white font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Locking in…" : "Lock in the day"}
        </button>
      </form>

      {/* Sticky footer (mobile) — sits above the tab bar via safe-area padding */}
      <form
        action={(fd) => {
          fd.set("date", date);
          startTransition(() => lockInAction(fd));
        }}
        className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+56px)] inset-x-0 px-4 pb-3 pt-3 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent z-20"
      >
        <button
          type="submit"
          disabled={pending}
          className="w-full py-4 rounded-xl bg-[var(--color-ink)] text-white font-medium active:opacity-80 disabled:opacity-50 shadow-lg shadow-black/10"
        >
          {pending ? "Locking in…" : "Lock in the day"}
        </button>
      </form>
    </>
  );
}
