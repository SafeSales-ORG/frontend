import { motion } from "motion/react";
import { Check } from "lucide-react";

import type { ApiOrderStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = ["Payment held", "Shipped", "Delivered", "Paid out"] as const;

/** How many steps are complete for a status (disputes/refunds stop after payment). */
function completed(status: ApiOrderStatus): number {
  switch (status) {
    case "pending_payment":
      return 0;
    case "paid":
    case "disputed":
    case "refunded":
      return 1;
    case "shipped":
      return 2;
    case "delivered":
      return 3;
    case "completed":
      return 4;
    default:
      return 0;
  }
}

/** Four-step order tracker with an animated fill. `tone="dark"` sits on forest. */
export function OrderProgress({ status, tone = "light" }: { status: ApiOrderStatus; tone?: "light" | "dark" }) {
  const done = completed(status);
  const fill = Math.max(0, Math.min(1, (done - 1) / (STEPS.length - 1)));
  const dark = tone === "dark";

  return (
    <div className="relative" aria-label={`Order progress: ${done} of ${STEPS.length} steps done`}>
      <div className={cn("absolute top-4 right-4 left-4 h-0.5 rounded-full", dark ? "bg-canvas/15" : "bg-line")} />
      <motion.div
        className={cn("absolute top-4 left-4 h-0.5 rounded-full", dark ? "bg-mint" : "bg-brand")}
        initial={{ width: 0 }}
        animate={{ width: `calc((100% - 2rem) * ${fill})` }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0, 0, 1] }}
      />
      <ol className="relative grid grid-cols-4">
        {STEPS.map((label, i) => {
          const isDone = i < done;
          const isCurrent = i === done && status !== "disputed" && status !== "refunded";
          return (
            <motion.li
              key={label}
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors",
                  isDone
                    ? dark
                      ? "bg-mint text-forest"
                      : "bg-brand text-brand-foreground"
                    : isCurrent
                      ? dark
                        ? "bg-forest text-mint ring-2 ring-mint"
                        : "bg-canvas text-brand ring-2 ring-brand"
                      : dark
                        ? "bg-forest text-canvas/50 ring-1 ring-canvas/20"
                        : "bg-canvas text-mute ring-1 ring-line-strong",
                )}
              >
                {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "mt-2 text-xs font-medium",
                  dark ? (isDone || isCurrent ? "text-canvas" : "text-canvas/50") : isDone || isCurrent ? "text-ink" : "text-mute",
                )}
              >
                {label}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
