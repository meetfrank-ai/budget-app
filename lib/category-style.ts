/**
 * Category → icon + color map. Used by the new-look home page so every
 * category gets a recognisable pictogram and a soft tinted pill.
 *
 * Uses Tailwind/CSS color tokens and Lucide icon names. Falls back to a
 * neutral chip for any category not explicitly mapped.
 */
import {
  ShoppingBasket,
  Utensils,
  Coffee,
  Wine,
  ShoppingBag,
  Sparkles,
  BookOpen,
  GraduationCap,
  Repeat,
  Code2,
  Heart,
  Shield,
  Zap,
  Car,
  ParkingCircle,
  Home as HomeIcon,
  Plane,
  Gift,
  Package,
  Receipt,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

type Style = {
  icon: LucideIcon;
  /** Tailwind-friendly color names, used for the soft pill bg + accent */
  bg: string;     // pill background, e.g. "bg-emerald-100/70"
  fg: string;     // icon + label color, e.g. "text-emerald-700"
  bar: string;    // gradient pair for the progress bar (linear-gradient)
};

const PALETTE: Record<string, Style> = {
  Groceries:                    { icon: ShoppingBasket, bg: "bg-emerald-100/70", fg: "text-emerald-700", bar: "from-emerald-300 to-emerald-500" },
  "Dining & Takeaways":         { icon: Utensils,       bg: "bg-orange-100/70",  fg: "text-orange-700",  bar: "from-orange-300 to-orange-500" },
  Coffee:                       { icon: Coffee,         bg: "bg-amber-100/70",   fg: "text-amber-800",   bar: "from-amber-300 to-amber-600" },
  "Liquor & Wine":              { icon: Wine,           bg: "bg-purple-100/70",  fg: "text-purple-700",  bar: "from-purple-300 to-purple-500" },
  "Shopping & Clothing":        { icon: ShoppingBag,    bg: "bg-pink-100/70",    fg: "text-pink-700",    bar: "from-pink-300 to-pink-500" },
  "Beauty & Personal":          { icon: Sparkles,       bg: "bg-rose-100/70",    fg: "text-rose-700",    bar: "from-rose-300 to-rose-500" },
  "Entertainment & Books":      { icon: BookOpen,       bg: "bg-indigo-100/70",  fg: "text-indigo-700",  bar: "from-indigo-300 to-indigo-500" },
  "Courses & Education":        { icon: GraduationCap,  bg: "bg-blue-100/70",    fg: "text-blue-700",    bar: "from-blue-300 to-blue-500" },
  "Subscriptions (personal)":   { icon: Repeat,         bg: "bg-violet-100/70",  fg: "text-violet-700",  bar: "from-violet-300 to-violet-500" },
  "Business — Hosting & Tools": { icon: Code2,          bg: "bg-slate-100/70",   fg: "text-slate-700",   bar: "from-slate-400 to-slate-600" },
  "Health & Medical":           { icon: Heart,          bg: "bg-red-100/70",     fg: "text-red-700",     bar: "from-red-300 to-red-500" },
  "Insurance & Medical Aid":    { icon: Shield,         bg: "bg-cyan-100/70",    fg: "text-cyan-700",    bar: "from-cyan-300 to-cyan-500" },
  Utilities:                    { icon: Zap,            bg: "bg-yellow-100/70",  fg: "text-yellow-700",  bar: "from-yellow-300 to-yellow-500" },
  Transport:                    { icon: Car,            bg: "bg-teal-100/70",    fg: "text-teal-700",    bar: "from-teal-300 to-teal-500" },
  Parking:                      { icon: ParkingCircle,  bg: "bg-stone-100/70",   fg: "text-stone-700",   bar: "from-stone-300 to-stone-500" },
  Rent:                         { icon: HomeIcon,       bg: "bg-emerald-100/70", fg: "text-emerald-800", bar: "from-emerald-400 to-emerald-700" },
  "Travel fund":                { icon: Plane,          bg: "bg-sky-100/70",     fg: "text-sky-700",     bar: "from-sky-300 to-sky-500" },
  "Gifts & Personal Payments":  { icon: Gift,           bg: "bg-fuchsia-100/70", fg: "text-fuchsia-700", bar: "from-fuchsia-300 to-fuchsia-500" },
  Shipping:                     { icon: Package,        bg: "bg-amber-100/70",   fg: "text-amber-800",   bar: "from-amber-400 to-amber-600" },
  "Bank Fees":                  { icon: Receipt,        bg: "bg-zinc-100/70",    fg: "text-zinc-700",    bar: "from-zinc-300 to-zinc-500" },
  "Other / Uncategorised":      { icon: HelpCircle,     bg: "bg-stone-100/70",   fg: "text-stone-600",   bar: "from-stone-300 to-stone-500" },
};

const FALLBACK: Style = {
  icon: HelpCircle,
  bg: "bg-stone-100/70",
  fg: "text-stone-600",
  bar: "from-stone-300 to-stone-500",
};

export function styleFor(categoryName: string | null | undefined): Style {
  if (!categoryName) return FALLBACK;
  return PALETTE[categoryName] ?? FALLBACK;
}
