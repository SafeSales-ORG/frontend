import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Banknote, Clock, Lock, Shirt, Truck } from "lucide-react";

import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import type { EscrowStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGES: {
  status: EscrowStatus;
  Icon: typeof Lock;
  message: string;
  tone: "neutral" | "mint";
}[] = [
  { status: "pending_payment", Icon: Clock, message: "Waiting for the buyer's ₦28,500", tone: "neutral" },
  { status: "paid", Icon: Lock, message: "₦28,500 is held by SafeSale", tone: "mint" },
  { status: "shipped", Icon: Truck, message: "Shipped with GIG Logistics", tone: "mint" },
  { status: "released", Icon: Banknote, message: "₦28,500 paid to the seller's bank", tone: "mint" },
];

const STEP_MS = 2600;

/**
 * Example order that plays through its life: awaiting payment → held →
 * shipped → paid out. Pauses on hover; shows a single still frame when the
 * visitor prefers reduced motion.
 */
export function LiveOrderCard({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(reduceMotion ? 1 : 0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduceMotion || paused) return;
    const id = window.setInterval(() => setStage((s) => (s + 1) % STAGES.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, paused]);

  const current = STAGES[stage];

  return (
    <figure
      className={className}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="rounded-xl bg-canvas p-5 shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-mute">Order SS-7KQ2MD</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current.status}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
            >
              <EscrowStatusPill status={current.status} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand-pale text-brand">
            <Shirt className="h-5 w-5" aria-hidden />
          </div>
          <p className="font-semibold text-ink">Ankara two-piece set</p>
        </div>

        <div
          className={cn(
            "mt-4 overflow-hidden rounded-lg px-4 py-3 transition-colors duration-300",
            current.tone === "mint" ? "bg-brand-pale text-brand-ink" : "bg-canvas-soft text-body",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={current.status}
              className="flex items-center gap-3 text-sm font-medium"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            >
              <current.Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="tabular-nums">{current.message}</span>
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress through the four stages */}
        <div className="mt-5 grid grid-cols-4 gap-1.5" aria-hidden>
          {STAGES.map((s, i) => (
            <div key={s.status} className="h-1.5 overflow-hidden rounded-full bg-canvas-sunken">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={false}
                animate={{ width: i <= stage ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-mute">
          <span>Buyer pays</span>
          <span>Seller is paid</span>
        </div>
      </div>
      <figcaption className="sr-only">
        Example order moving from awaiting payment, to held by SafeSale, to shipped, to paid out.
      </figcaption>
    </figure>
  );
}
