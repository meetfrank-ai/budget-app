"use client";

import { useTransition } from "react";
import { lockInAction } from "./actions";

export function LockInFooter({ date }: { date: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        fd.set("date", date);
        startTransition(() => lockInAction(fd));
      }}
      className="mt-8"
    >
      <button
        type="submit"
        disabled={pending}
        className="w-full py-4 rounded-xl bg-[var(--color-ink)] text-white font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Locking in…" : "Lock in the day"}
      </button>
    </form>
  );
}
