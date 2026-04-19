import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Budget",
  description: "Personal budget",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
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
  themeColor: "#F4EEE4",
};

const nav = [
  { href: "/", label: "Your day" },
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="min-h-dvh md:flex">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="px-5 py-5 border-b border-[var(--color-border)]">
              <div className="text-sm font-semibold tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">Lynette · 2026</div>
            </div>
            <nav className="p-3 space-y-0.5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block px-3 py-2 text-sm rounded-lg hover:bg-[var(--color-bg)] text-[var(--color-ink)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Mobile top bar */}
          <header className="md:hidden border-b border-[var(--color-border)] bg-[var(--color-card)] sticky top-0 z-10">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-muted)]">Lynette</div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden pb-44 md:pb-0">{children}</main>

          {/* Mobile bottom tab bar — respects iPhone home indicator */}
          <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur z-10 pb-[env(safe-area-inset-bottom)]">
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
