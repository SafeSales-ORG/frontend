import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const TONES = {
  mint: "bg-mint text-forest",
  pale: "bg-brand-pale text-brand",
  forest: "bg-forest text-mint",
  warning: "bg-warning-pale text-warning",
  info: "bg-info-pale text-info",
  negative: "bg-negative-pale text-negative",
  neutral: "bg-canvas-sunken text-body",
} as const;

const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg", icon: 18 },
  md: { box: "h-11 w-11 rounded-xl", icon: 24 },
  lg: { box: "h-14 w-14 rounded-2xl", icon: 30 },
} as const;

/** A duotone Phosphor icon on a tinted tile — for features, statuses and empty states. */
export function BrandIcon({
  icon: Icon,
  tone = "mint",
  size = "md",
  className,
}: {
  icon: Icon;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", s.box, TONES[tone], className)} aria-hidden>
      <Icon size={s.icon} weight="duotone" />
    </span>
  );
}
