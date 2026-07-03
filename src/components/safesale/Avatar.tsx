import { cn } from "@/lib/utils";
import { hashStr } from "@/lib/seeded";
import { sanitizeUrl } from "@/lib/utils";

interface Props {
  seed: string;
  name?: string;
  size?: number;
  className?: string;
  /** Optional avatar image URL. When present + https, renders the image;
   *  otherwise falls back to the deterministic initials gradient. */
  src?: string | null;
}

const palette = [
  ["#10b981", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#0ea5e9", "#0369a1"],
  ["#8b5cf6", "#6d28d9"],
  ["#ef4444", "#b91c1c"],
  ["#14b8a6", "#0f766e"],
  ["#f97316", "#c2410c"],
];

export function Avatar({ seed, name, size = 40, className, src }: Props) {
  const safeSrc = src ? sanitizeUrl(src) : undefined;
  if (safeSrc) {
    return (
      <img
        src={safeSrc}
        alt={name ?? ""}
        loading="lazy"
        className={cn("shrink-0 select-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const h = hashStr(seed);
  const [a, b] = palette[h % palette.length];
  const initial = (name?.trim()?.[0] ?? seed[0] ?? "?").toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
