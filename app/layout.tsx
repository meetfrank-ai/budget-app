import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Budget",
  description: "Personal budget",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Budget",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

const nav = [
  { href: "/", label: "Your day" },
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-dvh md:flex">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-56 shrink-0 border-r border-[var(--color-border)] bg-white">
            <div className="px-5 py-5 border-b border-[var(--color-border)]">
              <div className="text-sm font-semibold tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">Lynette · 2026</div>
            </div>
            <nav className="p-3 space-y-0.5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block px-3 py-2 text-sm rounded hover:bg-[var(--color-bg)] text-[var(--color-ink)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Mobile top bar */}
          <header className="md:hidden border-b border-[var(--color-border)] bg-white sticky top-0 z-10">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-muted)]">Lynette</div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden pb-44 md:pb-0">{children}</main>

          {/* Mobile bottom tab bar — respects iPhone home indicator */}
          <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-white/95 backdrop-blur z-10 pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-3">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-2 py-3 text-xs text-center text-[var(--color-ink)] active:bg-[var(--color-bg)]"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </body>
    </html>
  );
}
