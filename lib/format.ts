export function zar(n: number | string | null | undefined, opts?: { compact?: boolean }): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (opts?.compact && Math.abs(v) >= 1000) {
    return `R${(v / 1000).toFixed(1)}k`;
  }
  return `R${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function zarRound(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return `R${Math.round(v).toLocaleString("en-ZA")}`;
}

export function shortDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

export function longDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

export function pct(n: number | null): string {
  if (n == null) return "–";
  return `${Math.round(n)}%`;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}
