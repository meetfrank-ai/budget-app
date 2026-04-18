/**
 * A small face that reacts to the day's vibe.
 *  - calm:  on track
 *  - relaxed: under pace (smug pleased smile)
 *  - anxious: significantly over pace
 *
 * Pure SVG. No deps. Sized via the className prop (default 64px).
 */
type Mood = "calm" | "relaxed" | "anxious";

export function Mascot({ mood = "calm", className = "w-16 h-16" }: { mood?: Mood; className?: string }) {
  const fills = {
    calm:    { bg: "#fde68a", stroke: "#92400e" },  // warm amber
    relaxed: { bg: "#bbf7d0", stroke: "#065f46" },  // mint green
    anxious: { bg: "#fecaca", stroke: "#991b1b" },  // soft red
  }[mood];

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* head */}
      <circle cx="32" cy="32" r="28" fill={fills.bg} stroke={fills.stroke} strokeWidth="2" />

      {/* eyes */}
      {mood === "anxious" ? (
        <>
          <circle cx="22" cy="28" r="3.5" fill={fills.stroke} />
          <circle cx="42" cy="28" r="3.5" fill={fills.stroke} />
        </>
      ) : mood === "relaxed" ? (
        <>
          <path d="M18 28 Q22 24 26 28" stroke={fills.stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M38 28 Q42 24 46 28" stroke={fills.stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="22" cy="28" r="2.5" fill={fills.stroke} />
          <circle cx="42" cy="28" r="2.5" fill={fills.stroke} />
        </>
      )}

      {/* mouth */}
      {mood === "anxious" ? (
        <line x1="24" y1="44" x2="40" y2="44" stroke={fills.stroke} strokeWidth="2" strokeLinecap="round" />
      ) : mood === "relaxed" ? (
        <path d="M22 40 Q32 50 42 40" stroke={fills.stroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M24 42 Q32 47 40 42" stroke={fills.stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
      )}

      {/* cheek blush — only on relaxed */}
      {mood === "relaxed" && (
        <>
          <circle cx="18" cy="38" r="3" fill="#fda4af" opacity="0.6" />
          <circle cx="46" cy="38" r="3" fill="#fda4af" opacity="0.6" />
        </>
      )}
    </svg>
  );
}

export function moodFor(paceDelta: number): Mood {
  if (paceDelta > 15) return "anxious";
  if (paceDelta < -10) return "relaxed";
  return "calm";
}
