import Link from "next/link";
import { queries, type Transaction, type BudgetRow, type Category } from "@/lib/queries";
import { supabaseServer, USER_ID } from "@/lib/supabase";
import { zar, zarRound, pct, longDate } from "@/lib/format";
import {
  resolveReviewTarget,
  autoLogOlderDays,
  getOrCreateDraftReview,
  topUsedCategories,
} from "@/lib/review";
import { ReviewRow } from "./ReviewRow";
import { LockInFooter } from "./LockInFooter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SpiritMood = "calm" | "watchful" | "frazzled";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isReviewable(t: Transaction): boolean {
  return t.status === "Completed" && t.tx_type !== "Transfer";
}

function niceLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestISO = yest.toISOString().slice(0, 10);
  if (iso === today) return "today";
  if (iso === yestISO) return "yesterday";
  return longDate(iso).toLowerCase();
}

function getPageMood(paceDelta: number): {
  mood: SpiritMood;
  title: string;
  body: string;
  eyebrow: string;
  glow: string;
  chip: string;
} {
  if (paceDelta > 10) {
    return {
      mood: "frazzled",
      title: "The sky is a little loud.",
      body: "Money's moving faster than the month. Keep the visuals dreamy, but keep the decisions sharp.",
      eyebrow: "Over pace",
      glow: "from-[#fb7185]/80 via-[#f59e0b]/45 to-[#fbcfe8]/60",
      chip: "border-rose-200/70 bg-rose-100/75 text-rose-950",
    };
  }
  if (paceDelta < -6) {
    return {
      mood: "calm",
      title: "The energy is steady.",
      body: "You're carrying a little slack in the month, which means this is a good time to stay intentional rather than reactive.",
      eyebrow: "Under pace",
      glow: "from-[#86efac]/70 via-[#a7f3d0]/40 to-[#bfdbfe]/55",
      chip: "border-emerald-200/70 bg-emerald-100/75 text-emerald-950",
    };
  }
  return {
    mood: "watchful",
    title: "The month is listening.",
    body: "Nothing looks dramatic yet. This is the sweet spot for a clean little lock-in before today starts asking for things.",
    eyebrow: "On track",
    glow: "from-[#c4b5fd]/75 via-[#f5d0fe]/40 to-[#fde68a]/55",
    chip: "border-violet-200/70 bg-violet-100/75 text-violet-950",
  };
}

function getCategoryAura(name: string | null | undefined): {
  orb: string;
  wash: string;
  chip: string;
  icon: string;
} {
  const key = (name ?? "").toLowerCase();

  if (key.includes("grocer") || key.includes("food") || key.includes("dining") || key.includes("restaurant")) {
    return {
      orb: "from-[#fb923c] via-[#f97316] to-[#facc15]",
      wash: "from-orange-100/80 via-white/30 to-amber-100/70",
      chip: "border-orange-200/60 bg-orange-100/75 text-orange-950",
      icon: "cup",
    };
  }
  if (key.includes("transport") || key.includes("fuel") || key.includes("travel")) {
    return {
      orb: "from-[#60a5fa] via-[#38bdf8] to-[#22d3ee]",
      wash: "from-sky-100/80 via-white/30 to-cyan-100/70",
      chip: "border-sky-200/60 bg-sky-100/75 text-sky-950",
      icon: "path",
    };
  }
  if (key.includes("shopping") || key.includes("clothes") || key.includes("beauty")) {
    return {
      orb: "from-[#f472b6] via-[#e879f9] to-[#c084fc]",
      wash: "from-pink-100/80 via-white/30 to-fuchsia-100/70",
      chip: "border-fuchsia-200/60 bg-fuchsia-100/75 text-fuchsia-950",
      icon: "spark",
    };
  }
  if (key.includes("home") || key.includes("rent") || key.includes("utilities")) {
    return {
      orb: "from-[#94a3b8] via-[#cbd5e1] to-[#f8fafc]",
      wash: "from-slate-100/80 via-white/40 to-stone-100/70",
      chip: "border-slate-200/70 bg-slate-100/75 text-slate-950",
      icon: "home",
    };
  }
  if (key.includes("sub") || key.includes("netflix") || key.includes("spotify")) {
    return {
      orb: "from-[#818cf8] via-[#a78bfa] to-[#f0abfc]",
      wash: "from-indigo-100/80 via-white/30 to-fuchsia-100/70",
      chip: "border-indigo-200/60 bg-indigo-100/75 text-indigo-950",
      icon: "ring",
    };
  }
  return {
    orb: "from-[#2dd4bf] via-[#93c5fd] to-[#d8b4fe]",
    wash: "from-teal-100/80 via-white/30 to-violet-100/70",
    chip: "border-teal-200/60 bg-teal-100/75 text-teal-950",
    icon: "moon",
  };
}

function categoryNames(ids: string[], categories: Category[]) {
  return ids
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

/** Latest user-locked review (skip backfill/auto-log rows). */
async function latestLockedReview() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("daily_reviews")
    .select("review_date, completed_at, total_zar, transaction_count, roast")
    .eq("user_id", USER_ID)
    .not("completed_at", "is", null)
    .not("roast", "ilike", "Auto-%")
    .order("review_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export default async function HomePage() {
  const targetDate = await resolveReviewTarget();
  await autoLogOlderDays(targetDate);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dayTx, categories, draftOrLocked, topCatIds, budget] = await Promise.all([
    queries.transactions({ since: targetDate, until: targetDate, limit: 200 }),
    queries.categories(),
    getOrCreateDraftReview(targetDate),
    topUsedCategories(3),
    queries.monthBudget(year, month),
  ]);

  const reviewable = dayTx
    .filter(isReviewable)
    .sort((a, b) => (a.occurred_time ?? "").localeCompare(b.occurred_time ?? ""));

  if (draftOrLocked.isLocked) {
    return <OverviewState />;
  }

  const total = reviewable.reduce(
    (s, t) => s + t.amount_zar * (t.tx_type === "Refund" ? -1 : 1),
    0
  );
  const totalPlanned = budget.reduce((s, b) => s + b.planned, 0);
  const totalActual = budget.reduce((s, b) => s + b.actual_net, 0);
  const remaining = totalPlanned - totalActual;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const paceDelta = monthPct - (dayOfMonth / daysInMonth) * 100;
  const mood = getPageMood(paceDelta);
  const topNames = categoryNames(topCatIds, categories);
  const canaries = budget
    .filter((b) => b.pct_used != null && b.pct_used >= 80 && b.planned > 0)
    .slice(0, 3);

  if (reviewable.length === 0) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-5xl">
        <HeroPanel
          eyebrow={`Review ${niceLabel(targetDate)}`}
          title="A quiet page."
          body={`Nothing to review on ${longDate(targetDate)}. The ritual is empty for now, so the only thing to do is enjoy the calm.`}
          mood={mood.mood}
          accentClass={mood.glow}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Next sync"
              value="20:00"
              note="The inbox sweep will refresh this screen."
            />
            <MetricCard
              label="Month remaining"
              value={zarRound(remaining)}
              note={`${daysInMonth - dayOfMonth} days left`}
              tone={remaining < 0 ? "neg" : "pos"}
            />
          </div>
        </HeroPanel>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl">
      <HeroPanel
        eyebrow={`Review ${niceLabel(targetDate)}`}
        title={mood.title}
        body={mood.body}
        mood={mood.mood}
        accentClass={mood.glow}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Yesterday's total"
            value={zar(total, { compact: reviewable.length > 6 })}
            note={`${reviewable.length} transactions to look at`}
          />
          <MetricCard
            label="Month remaining"
            value={zarRound(remaining)}
            note={`${daysInMonth - dayOfMonth} days left in the month`}
            tone={remaining < 0 ? "neg" : "pos"}
          />
          <MetricCard
            label="Pace"
            value={`${paceDelta > 0 ? "+" : ""}${pct(paceDelta)}`}
            note={paceDelta > 5 ? "running warm" : paceDelta < -5 ? "comfortable" : "steady"}
            tone={paceDelta > 5 ? "neg" : paceDelta < -5 ? "pos" : "neutral"}
          />
          <MetricCard
            label="Most likely buckets"
            value={topNames.slice(0, 2).join(" · ") || "Open"}
            note={topNames[2] ? `${topNames[2]} is close behind` : "Suggestions adapt to recent history"}
          />
        </div>
      </HeroPanel>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <ReadingCard
          eyebrow="Today's reading"
          title="A soft nudge before you seal it."
          body={
            draftOrLocked.roast ??
            "Your daily commentary will appear here once the draft review is generated."
          }
        />

        <RitualPanel className="relative overflow-hidden">
          <div className={cx("absolute inset-x-10 top-0 h-28 rounded-full blur-3xl opacity-70 bg-gradient-to-r", mood.glow)} />
          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
              Constellations to watch
            </div>
            <div className="mt-4 space-y-3">
              {canaries.length > 0 ? (
                canaries.map((row) => {
                  const aura = getCategoryAura(row.category_name);
                  return (
                    <div
                      key={row.category_id}
                      className={cx(
                        "rounded-[22px] border px-4 py-3 backdrop-blur-sm",
                        "border-white/65 bg-white/55"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryGlyph icon={aura.icon} orbClass={aura.orb} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900">
                              {row.category_name}
                            </div>
                            <div className="text-xs text-[var(--color-muted)]">
                              {pct(row.pct_used)} of plan used
                            </div>
                          </div>
                        </div>
                        <div className="mono text-right text-xs text-slate-900">
                          {zarRound(row.actual_net)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[22px] border border-white/65 bg-white/55 px-4 py-5 text-sm text-[var(--color-muted)]">
                  No categories are flashing yet. The month still feels spacious.
                </div>
              )}
            </div>
          </div>
        </RitualPanel>
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
              Ritual ledger
            </div>
            <h2 className="mt-2 text-3xl leading-none tracking-tight text-slate-950 [font-family:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]">
              The transactions waiting for your eye
            </h2>
          </div>
          <div className={cx("hidden rounded-full border px-3 py-1.5 text-xs md:inline-flex", mood.chip)}>
            {mood.eyebrow}
          </div>
        </div>

        <div className="mt-5 rounded-[32px] border border-white/65 bg-white/40 p-3 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl md:p-4">
          <ul className="space-y-3">
            {reviewable.map((t) => (
              <ReviewRow
                key={t.id}
                tx={t}
                topCategoryIds={topCatIds}
                categories={categories}
              />
            ))}
          </ul>
        </div>
      </section>

      <LockInFooter date={targetDate} />
    </div>
  );
}

async function OverviewState() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dr, budget] = await Promise.all([
    latestLockedReview(),
    queries.monthBudget(year, month),
  ]);

  if (!dr) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-5xl">
        <HeroPanel
          eyebrow="Overview"
          title="No review has landed yet."
          body="Once you lock in a day, this page becomes the illustrated summary of where the money actually landed."
          mood="watchful"
          accentClass="from-[#c4b5fd]/75 via-[#f5d0fe]/40 to-[#fde68a]/55"
        >
          <MetricCard label="State" value="Waiting" note="Come back after the first lock-in." />
        </HeroPanel>
      </div>
    );
  }

  const dayTx = await queries.transactions({ since: dr.review_date, until: dr.review_date, limit: 200 });
  const reviewable = dayTx.filter(isReviewable);
  const affectedIds = new Set<string>(
    reviewable.map((t) => t.category_id).filter((id): id is string => !!id)
  );
  const affected = budget
    .filter((b) => affectedIds.has(b.category_id))
    .sort((a, b) => (b.pct_used ?? 0) - (a.pct_used ?? 0));

  const totalPlanned = budget.reduce((s, b) => s + b.planned, 0);
  const totalActual = budget.reduce((s, b) => s + b.actual_net, 0);
  const monthPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = now.getDate();
  const paceDelta = monthPct - (dayOfMonth / daysInMonth) * 100;
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "long" });
  const mood = getPageMood(paceDelta);

  const dayLabel = niceLabel(dr.review_date);
  const daySpend = Number(dr.total_zar ?? 0);
  const dayCount = dr.transaction_count ?? 0;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl">
      <HeroPanel
        eyebrow="Overview"
        title={`${dayLabel.replace(/^\w/, (c) => c.toUpperCase())} is sealed.`}
        body="The review is locked, the tone is set, and the rest of the month can now be read against what yesterday actually changed."
        mood={mood.mood}
        accentClass={mood.glow}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={`Spent ${dayLabel}`}
            value={zarRound(daySpend)}
            note={`${dayCount} transactions`}
          />
          <MetricCard
            label="Spent this month"
            value={zarRound(totalActual)}
            note={`of ${zarRound(totalPlanned)}`}
          />
          <MetricCard
            label="Month pace"
            value={`${paceDelta > 0 ? "+" : ""}${pct(paceDelta)}`}
            note={paceDelta > 5 ? "ahead of the month" : paceDelta < -5 ? "below pace" : "balanced"}
            tone={paceDelta > 5 ? "neg" : paceDelta < -5 ? "pos" : "neutral"}
          />
          <MetricCard
            label="Remaining"
            value={zarRound(totalPlanned - totalActual)}
            note={`${daysInMonth - dayOfMonth} days left`}
            tone={totalPlanned - totalActual < 0 ? "neg" : "pos"}
          />
        </div>
      </HeroPanel>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ReadingCard
          eyebrow="Roast"
          title="Your oracle card for the day."
          body={dr.roast ?? "No commentary saved for this review."}
        />

        <RitualPanel>
          <div className="inline-flex items-center rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Where it landed
          </div>
          <div className="mt-4 space-y-3">
            {affected.length > 0 ? (
              affected.map((row) => <AffectedCategoryRow key={row.category_id} row={row} />)
            ) : (
              <div className="rounded-[22px] border border-white/65 bg-white/55 px-4 py-5 text-sm text-[var(--color-muted)]">
                Nothing category-specific lit up from this day.
              </div>
            )}
          </div>
        </RitualPanel>
      </div>

      <div className="mt-8 flex items-center justify-center">
        <Link
          href="/budget"
          className="inline-flex items-center rounded-full border border-slate-900/10 bg-slate-950 px-6 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-18px_rgba(15,23,42,0.7)] transition hover:-translate-y-0.5"
        >
          Review {monthName}'s budget
        </Link>
      </div>
    </div>
  );
}

function HeroPanel({
  eyebrow,
  title,
  body,
  mood,
  accentClass,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  mood: SpiritMood;
  accentClass: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/70 bg-white/45 p-6 shadow-[0_32px_100px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl md:p-8">
      <div className={cx("absolute -left-16 top-0 h-52 w-52 rounded-full bg-gradient-to-br opacity-75 blur-3xl", accentClass)} />
      <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/40 via-white/10 to-transparent blur-3xl" />
      <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
        <div>
          <div className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            {eyebrow}
          </div>
          <h1 className="mt-4 max-w-2xl text-4xl leading-[0.95] tracking-tight text-slate-950 sm:text-5xl [font-family:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            {body}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-[28px] border border-white/70 bg-white/55 px-5 py-4 backdrop-blur-md">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                State of the sky
              </div>
              <div className="mt-2 text-2xl tracking-tight text-slate-950 [font-family:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]">
                Daily guidance
              </div>
            </div>
            <SpiritGlyph mood={mood} className="h-24 w-24" />
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function RitualPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[32px] border border-white/70 bg-white/42 p-5 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl md:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "pos" | "neg";
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/60 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</div>
      <div
        className={cx(
          "mt-2 text-2xl leading-none tracking-tight text-slate-950 [font-family:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]",
          tone === "pos" && "text-emerald-800",
          tone === "neg" && "text-rose-800"
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-600">{note}</div>
    </div>
  );
}

function ReadingCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <RitualPanel className="relative overflow-hidden">
      <div className="absolute inset-x-10 top-0 h-28 rounded-full bg-gradient-to-r from-[#f0abfc]/40 via-[#93c5fd]/20 to-[#fde68a]/40 blur-3xl" />
      <div className="relative">
        <div className="inline-flex items-center rounded-full border border-white/75 bg-white/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          {eyebrow}
        </div>
        <h2 className="mt-4 text-3xl leading-none tracking-tight text-slate-950 [font-family:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]">
          {title}
        </h2>
        <div className="mt-5 rounded-[28px] border border-white/70 bg-white/60 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Oracle card</div>
            <div className="h-px w-16 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          </div>
          <div className="text-sm leading-7 whitespace-pre-wrap text-slate-700">{body}</div>
        </div>
      </div>
    </RitualPanel>
  );
}

function SpiritGlyph({
  mood,
  className,
}: {
  mood: SpiritMood;
  className?: string;
}) {
  const fill =
    mood === "frazzled"
      ? "from-[#fb7185] via-[#f59e0b] to-[#fbcfe8]"
      : mood === "calm"
      ? "from-[#86efac] via-[#67e8f9] to-[#c4b5fd]"
      : "from-[#c4b5fd] via-[#f0abfc] to-[#fde68a]";

  return (
    <div className={cx("relative rounded-full", className)}>
      <div className={cx("absolute inset-0 rounded-full bg-gradient-to-br opacity-70 blur-xl", fill)} />
      <svg viewBox="0 0 120 120" className="relative h-full w-full">
        <defs>
          <linearGradient id="spirit-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="36" fill="url(#spirit-fill)" stroke="rgba(148,163,184,0.45)" strokeWidth="1.5" />
        <circle cx="46" cy="52" r="3.5" fill="#0f172a" />
        <circle cx="74" cy="52" r="3.5" fill="#0f172a" />
        {mood === "frazzled" ? (
          <path d="M42 78c6-7 30-7 36 0" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
        ) : mood === "calm" ? (
          <path d="M44 74c6 8 26 8 32 0" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
        ) : (
          <path d="M45 75c5 4 25 4 30 0" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
        )}
        <path d="M60 14l4 11 12 4-12 4-4 11-4-11-12-4 12-4 4-11Z" fill="#fde68a" opacity="0.9" />
        <path d="M93 31l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5 2.5-7Z" fill="#e9d5ff" opacity="0.9" />
        <path d="M27 33l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" fill="#bae6fd" opacity="0.9" />
      </svg>
    </div>
  );
}

function CategoryGlyph({
  icon,
  orbClass,
}: {
  icon: string;
  orbClass: string;
}) {
  return (
    <div className={cx("flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]", orbClass)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-900" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {icon === "cup" && (
          <>
            <path d="M7 7h7a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V7Z" />
            <path d="M16 9h1a2 2 0 1 1 0 4h-1" />
            <path d="M8 18h7" />
          </>
        )}
        {icon === "path" && (
          <>
            <path d="M5 18c3-7 5-12 9-12 2.5 0 4 1.5 5 4" />
            <path d="M13 16c1.5-2 3-3 6-3" />
            <circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="19" cy="10" r="1.5" fill="currentColor" stroke="none" />
          </>
        )}
        {icon === "spark" && (
          <>
            <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
            <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
          </>
        )}
        {icon === "home" && (
          <>
            <path d="M5 11.5 12 6l7 5.5" />
            <path d="M7 10.5V19h10v-8.5" />
          </>
        )}
        {icon === "ring" && (
          <>
            <circle cx="12" cy="12" r="6" />
            <path d="M12 3v3" />
            <path d="M21 12h-3" />
          </>
        )}
        {icon === "moon" && (
          <>
            <path d="M15.5 4.5A7.5 7.5 0 1 0 19.5 16 6.7 6.7 0 1 1 15.5 4.5Z" />
          </>
        )}
      </svg>
    </div>
  );
}

function AffectedCategoryRow({ row }: { row: BudgetRow }) {
  const catPct = row.planned > 0 ? Math.min(100, (row.actual_net / row.planned) * 100) : 0;
  const tone = row.pct_used == null
    ? "ok"
    : row.pct_used >= 100
    ? "over"
    : row.pct_used >= 80
    ? "warn"
    : "ok";
  const remaining = row.planned - row.actual_net;
  const aura = getCategoryAura(row.category_name);

  return (
    <div className="rounded-[24px] border border-white/65 bg-white/55 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CategoryGlyph icon={aura.icon} orbClass={aura.orb} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900">{row.category_name}</div>
            <div className="text-xs text-slate-500">
              {remaining >= 0 ? `${zarRound(remaining)} left` : `${zarRound(-remaining)} over`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-xs text-slate-900">
            {zarRound(row.actual_net)}
            <span className="text-slate-400"> / {zarRound(row.planned)}</span>
          </div>
          <div
            className={cx(
              "mt-1 text-xs",
              tone === "over"
                ? "text-rose-700"
                : tone === "warn"
                ? "text-amber-700"
                : "text-slate-500"
            )}
          >
            {pct(row.pct_used)}
          </div>
        </div>
      </div>
      <div className="mt-3 bar-track h-2.5 bg-white/70">
        <div className={`bar-fill ${tone}`} style={{ width: `${catPct}%` }} />
      </div>
    </div>
  );
}
