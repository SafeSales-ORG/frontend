import { cn } from "@/lib/utils";
import type { EscrowStatus } from "@/lib/types";

/**
 * The one mapping from escrow status to label + colour (DESIGN.md →
 * "Escrow status language"). Use it everywhere a status is shown.
 */
type Tone = "neutral" | "brand" | "info" | "warning" | "muted";

const STATUS: Record<EscrowStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: "Awaiting payment", tone: "neutral" },
  paid: { label: "Held in escrow", tone: "brand" },
  shipped: { label: "Shipped", tone: "info" },
  delivered: { label: "Delivered", tone: "info" },
  completed: { label: "Paid out", tone: "brand" },
  released: { label: "Paid out", tone: "brand" },
  disputed: { label: "In dispute", tone: "warning" },
  resolved: { label: "Resolved", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  expired: { label: "Expired", tone: "muted" },
};

const TONE: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-canvas-sunken text-body", dot: "bg-body" },
  brand: { pill: "bg-brand-pale text-brand-ink", dot: "bg-brand" },
  info: { pill: "bg-info-pale text-info", dot: "bg-info" },
  warning: { pill: "bg-warning-pale text-warning", dot: "bg-warning" },
  muted: { pill: "bg-canvas-sunken text-mute", dot: "bg-mute" },
};

interface PillProps {
  status: EscrowStatus;
  className?: string;
  size?: "sm" | "md";
  /** Kept for call-site compatibility; badges always use a dot now. */
  withIcon?: boolean;
}

export function EscrowStatusPill({ status, className, size = "md" }: PillProps) {
  const { label, tone } = STATUS[status];
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        t.pill,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} aria-hidden />
      {label}
    </span>
  );
}
