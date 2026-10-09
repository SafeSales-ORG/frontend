import { useMemo, useState } from "react";
import { motion } from "motion/react";

import type { SellerOrderRow } from "@/lib/api";
import { formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

/** Paid orders per day over the last 7 days, as growing bars. */
export function WeekChart({ orders, now }: { orders: SellerOrderRow[]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const days = useMemo(() => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - 6 * DAY_MS;
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start + i * DAY_MS);
      return {
        label: date.toLocaleDateString("en-NG", { weekday: "short" }),
        date: date.toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
        count: 0,
        amount: 0,
      };
    });
    for (const o of orders) {
      if (o.status === "pending_payment") continue;
      const idx = Math.floor((new Date(o.createdAt).getTime() - start) / DAY_MS);
      if (idx >= 0 && idx < 7) {
        buckets[idx].count += 1;
        buckets[idx].amount += o.amountNGN;
      }
    }
    return buckets;
  }, [orders, now]);

  const max = Math.max(1, ...days.map((d) => d.amount));
  const weekTotal = days.reduce((sum, d) => sum + d.amount, 0);
  const weekCount = days.reduce((sum, d) => sum + d.count, 0);
  const shown = hover !== null ? days[hover] : null;

  return (
    <div className="flex h-full flex-col rounded-xl bg-canvas p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-h3 text-ink">This week</h3>
          <p className="mt-1 text-sm text-body">
            {shown
              ? `${shown.date}: ${shown.count} order${shown.count === 1 ? "" : "s"}`
              : `${weekCount} paid order${weekCount === 1 ? "" : "s"} in the last 7 days`}
          </p>
        </div>
        <p className="text-h2 text-ink tabular-nums">{formatNGN(shown ? shown.amount : weekTotal)}</p>
      </div>

      <div className="mt-6 flex flex-1 items-end gap-2" role="img" aria-label={`Sales over the last 7 days, ${formatNGN(weekTotal)} total`}>
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            className="group flex h-full min-h-28 flex-1 flex-col items-center justify-end gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${d.date}: ${d.count} orders, ${formatNGN(d.amount)}`}
          >
            <div className="flex w-full flex-1 items-end">
              <motion.div
                className={cn(
                  "w-full rounded-md transition-colors",
                  d.amount > 0 ? (hover === i ? "bg-forest" : "bg-brand") : "bg-canvas-sunken",
                )}
                initial={{ height: 0 }}
                animate={{ height: d.amount > 0 ? `${Math.max(8, (d.amount / max) * 100)}%` : "6px" }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: [0.2, 0, 0, 1] }}
              />
            </div>
            <span className={cn("text-xs", i === 6 ? "font-semibold text-ink" : "text-mute")}>{d.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
