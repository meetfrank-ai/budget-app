import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  clearAttempts,
  isLockedOut,
  recordFailure,
  signSession,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

async function loginAction(formData: FormData) {
  "use server";
  const pin = (formData.get("pin") as string)?.trim() ?? "";
  const from = (formData.get("from") as string) || "/";
  const ip = await clientIp();

  const lockedFor = isLockedOut(ip);
  if (lockedFor > 0) {
    redirect(`/login?err=locked&from=${encodeURIComponent(from)}`);
  }

  const expected = process.env.APP_PIN;
  const secret = process.env.APP_SESSION_SECRET;
  if (!expected || !secret) {
    redirect("/login?err=config");
  }

  if (pin !== expected) {
    recordFailure(ip);
    redirect(`/login?err=pin&from=${encodeURIComponent(from)}`);
  }

  clearAttempts(ip);
  const token = await signSession(secret!);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  // Prevent open redirects — only allow relative paths back into the app.
  const dest = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  redirect(dest);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; from?: string }>;
}) {
  const { err, from } = await searchParams;
  const message =
    err === "pin"
      ? "Wrong PIN."
      : err === "locked"
        ? "Too many attempts. Try again in 15 minutes."
        : err === "config"
          ? "Server isn't configured. Set APP_PIN and APP_SESSION_SECRET."
          : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-6">
      <form
        action={loginAction}
        className="w-full max-w-xs rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
      >
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Budget</div>
        <h1 className="text-lg font-semibold tracking-tight mt-1 mb-4">Enter PIN</h1>

        <input type="hidden" name="from" value={from ?? "/"} />
        <input
          name="pin"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          autoFocus
          required
          className="w-full text-center text-2xl tracking-[0.5em] mono rounded-lg border border-[var(--color-border)] px-3 py-3 focus:outline-none focus:border-[var(--color-ink)]"
          placeholder="••••"
        />

        {message && (
          <div className="mt-3 text-sm text-[var(--color-neg)]">{message}</div>
        )}

        <button
          type="submit"
          className="mt-4 w-full bg-[var(--color-ink)] text-white rounded-lg py-2.5 text-sm font-medium"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
