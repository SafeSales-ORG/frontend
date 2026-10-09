import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SetupStep {
  label: string;
  done: boolean;
  /** Where to go to complete this step. */
  to?: string;
  cta?: string;
}

/** "Get your first sale" checklist with an animated progress ring. */
export function GettingStarted({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const progress = done / steps.length;

  return (
    <div className="flex h-full flex-col rounded-xl bg-canvas p-6">
      <div className="flex items-center gap-5">
        <ProgressRing progress={progress} label={`${done}/${steps.length}`} />
        <div>
          <h3 className="text-h3 text-ink">Get your first sale</h3>
          <p className="mt-1 text-sm text-body">
            {next ? `Next: ${next.label.toLowerCase()}.` : "You're all set up."}
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((step, i) => (
          <motion.li
            key={step.label}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.07, duration: 0.3 }}
          >
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full",
                step.done ? "bg-forest text-mint" : "border-2 border-line-strong",
              )}
            >
              {step.done && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.25 + i * 0.07 }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </motion.span>
              )}
            </span>
            <span className={cn("flex-1 text-sm", step.done ? "text-mute line-through" : "font-medium text-ink")}>
              {step.label}
            </span>
            {!step.done && step === next && step.to && (
              <Link
                to={step.to}
                className="inline-flex items-center gap-1 rounded-full bg-mint px-3 py-1.5 text-xs font-semibold text-forest hover:bg-mint-soft"
              >
                {step.cta ?? "Start"} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function ProgressRing({ progress, label }: { progress: number; label: string }) {
  const r = 26;
  return (
    <div className="relative grid h-16 w-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-canvas-sunken" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-brand"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: progress }}
          transition={{ duration: 0.9, ease: [0.2, 0, 0, 1], delay: 0.1 }}
        />
      </svg>
      <span className="text-sm font-semibold text-ink tabular-nums">{label}</span>
    </div>
  );
}
