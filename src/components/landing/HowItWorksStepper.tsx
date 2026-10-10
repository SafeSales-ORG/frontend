import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { BadgeCheck, CheckCircle2, Copy, Link2, Truck } from "lucide-react";

import { cn } from "@/lib/utils";

const STEP_MS = 5000;
const SWIPE_PX = 50;

const STEPS: { title: string; body: string; screen: ReactNode }[] = [
  {
    title: "Share your SafeSale link",
    body: "Add a product in two minutes and paste the link in your bio, story or DMs.",
    screen: <ShareScreen />,
  },
  {
    title: "The buyer pays SafeSale",
    body: "They transfer the exact amount to an account made for their order. No account or app needed.",
    screen: <PayScreen />,
  },
  {
    title: "You ship the order",
    body: "We tell you the money is held. Ship it and add a tracking number if you have one.",
    screen: <ShipScreen />,
  },
  {
    title: "You get paid",
    body: "When the buyer confirms delivery — or 7 days after shipping with no problem reported.",
    screen: <PaidScreen />,
  },
];

/** Steps on the left, a live preview of that step on the right. Swipeable on mobile. */
export function HowItWorksStepper() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(!reduceMotion);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setTimeout(() => {
      setDirection(1);
      setActive((a) => (a + 1) % STEPS.length);
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [active, autoplay]);

  const goTo = (index: number) => {
    setAutoplay(false);
    setDirection(index > active ? 1 : -1);
    setActive((index + STEPS.length) % STEPS.length);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX) goTo(active + 1);
    else if (info.offset.x > SWIPE_PX) goTo(active - 1);
  };

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <ol className="order-2 space-y-2 lg:order-1">
        {STEPS.map((step, i) => {
          const isActive = i === active;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "w-full rounded-lg p-5 text-left transition-colors",
                  isActive ? "bg-canvas" : "hover:bg-canvas/60",
                )}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                      isActive ? "bg-forest text-mint" : "bg-canvas-sunken text-body",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={cn("text-h3", isActive ? "text-ink" : "text-body")}>{step.title}</h3>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.p
                          className="overflow-hidden text-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
                        >
                          <span className="block pt-1.5">{step.body}</span>
                        </motion.p>
                      )}
                    </AnimatePresence>
                    {isActive && autoplay && (
                      <div className="mt-4 h-1 overflow-hidden rounded-full bg-canvas-sunken">
                        <motion.div
                          key={active}
                          className="h-full bg-brand"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="order-1 lg:order-2">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl bg-forest p-5 sm:p-6">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={active}
              custom={direction}
              className="absolute inset-5 flex cursor-grab items-center active:cursor-grabbing sm:inset-6"
              variants={{
                enter: (d: number) => ({ x: d * 60, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -60, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={onDragEnd}
            >
              <div className="w-full">{STEPS[active].screen}</div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-4 flex justify-center gap-2 lg:hidden">
          {STEPS.map((step, i) => (
            <button
              key={step.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Step ${i + 1}: ${step.title}`}
              className="grid h-6 w-6 place-items-center"
            >
              <span className={cn("h-2 rounded-full transition-all", i === active ? "w-6 bg-forest" : "w-2 bg-line-strong")} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Step screens ------------------------------ */

function ScreenCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-canvas p-5 select-none">{children}</div>;
}

function ShareScreen() {
  return (
    <ScreenCard>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-mint font-semibold text-forest">AS</span>
        <div>
          <p className="font-semibold text-ink">adaeze.styles</p>
          <p className="text-sm text-mute">Ankara sets · Lagos · Ships nationwide</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-body">New drop is live. Pay safely with SafeSale:</p>
      <div className="mt-2 flex items-center gap-2 rounded-md bg-brand-pale px-3 py-2.5 text-sm font-medium text-brand-ink">
        <Link2 className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">safesale.app/buy/ankara-set</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {["bg-mint-soft", "bg-brand-pale", "bg-canvas-sunken"].map((c) => (
          <div key={c} className={cn("aspect-square rounded-sm", c)} />
        ))}
      </div>
    </ScreenCard>
  );
}

function PayScreen() {
  const rows = [
    ["Bank", "Wema Bank"],
    ["Account", "8123 456 789"],
    ["Name", "SafeSale / SS-7KQ2MD"],
  ];
  return (
    <ScreenCard>
      <p className="text-sm text-mute">Transfer exactly</p>
      <p className="text-h1 text-ink tabular-nums">₦28,500</p>
      <dl className="mt-4 divide-y divide-line rounded-md border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <dt className="text-mute">{k}</dt>
            <dd className="flex items-center gap-2 font-medium text-ink tabular-nums">
              {v}
              <Copy className="h-3.5 w-3.5 text-mute" aria-hidden />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-body">This account belongs to SafeSale, not the seller.</p>
    </ScreenCard>
  );
}

function ShipScreen() {
  return (
    <ScreenCard>
      <div className="flex items-center gap-2 text-sm font-medium text-brand">
        <BadgeCheck className="h-4 w-4" aria-hidden /> Payment held for SS-7KQ2MD
      </div>
      <p className="mt-2 font-semibold text-ink">Ready to ship to Tolu in Surulere</p>
      <label className="mt-4 block text-sm text-mute">Tracking number (optional)</label>
      <div className="mt-1.5 rounded-md border border-line-strong px-3 py-2.5 text-ink tabular-nums">GIG-48213</div>
      <div className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-forest text-sm font-semibold text-mint">
        <Truck className="h-4 w-4" aria-hidden /> Mark as shipped
      </div>
    </ScreenCard>
  );
}

function PaidScreen() {
  return (
    <ScreenCard>
      <div className="flex flex-col items-center py-4 text-center">
        <motion.span
          className="grid h-14 w-14 place-items-center rounded-full bg-mint text-forest"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
        >
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </motion.span>
        <p className="mt-4 text-sm text-mute">Buyer confirmed delivery</p>
        <p className="mt-1 text-h1 text-ink tabular-nums">₦28,500</p>
        <p className="mt-1 text-body">paid to GTBank ••6789</p>
      </div>
    </ScreenCard>
  );
}
