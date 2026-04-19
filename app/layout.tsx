import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
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
  themeColor: "#F1EFE8",
};

const nav = [
  { href: "/", label: "Your day" },
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="min-h-dvh md:flex">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="px-5 py-5 border-b border-[var(--color-border)]">
              <div className="text-sm font-medium tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">Lynette · 2026</div>
            </div>
            <nav className="p-3 space-y-0.5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block px-3 py-2 text-sm rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Mobile top bar */}
          <header className="md:hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-medium tracking-tight">Budget</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Lynette</div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden pb-44 md:pb-0">{children}</main>

          {/* Mobile bottom tab bar — respects iPhone home indicator */}
          <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur z-10 pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-3">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-2 py-3 text-xs text-center text-[var(--color-text-primary)] active:bg-[var(--color-surface-alt)]"
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
