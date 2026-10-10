import { useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Plus } from "lucide-react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { ClosingCta, SectionHeading } from "@/components/safesale/Marketing";
import { Reveal } from "@/components/safesale/Reveal";
import { LiveOrderCard } from "@/components/landing/LiveOrderCard";
import { HowItWorksStepper } from "@/components/landing/HowItWorksStepper";
import { Button } from "@/components/ui/button";
import { useSellerCta } from "@/hooks/useSellerCta";
import { cn } from "@/lib/utils";

export default function Landing() {
  useSeoMeta({
    title: "SafeSale — Escrow for social-commerce sellers",
    description:
      "Share one link. Buyers pay in Naira, SafeSale holds the money, and the seller is paid when the buyer confirms delivery.",
  });

  return (
    <MarketingLayout>
      <Hero />
      <HowItWorks />
      <Protection />
      <WhenThingsGoWrong />
      <Faq />
      <ClosingCta
        title="Let buyers pay you without the fear."
        lead="Set up your shop and share your first link today."
      />
    </MarketingLayout>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  const cta = useSellerCta();
  return (
    <section className="overflow-hidden bg-mint">
      <div className="container grid grid-cols-1 items-center gap-12 pt-14 pb-16 md:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-24">
        <motion.div
          className="min-w-0 max-w-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        >
          <h1 className="text-display-md text-forest sm:text-display-xl xl:text-display-2xl">Sell online. Get paid safely.</h1>
          <p className="mt-6 text-lg leading-7 text-forest/80">
            SafeSale holds your buyer's payment until they confirm delivery. Share one link on
            Instagram, WhatsApp or TikTok — buyers pay by bank transfer, no account needed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to={cta.to}>
                {cta.label}
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="w-full text-forest hover:bg-forest/10 hover:text-forest sm:w-auto"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-forest/70">
            Buying from a seller who uses SafeSale? Open the link they sent you.
          </p>
        </motion.div>

        <motion.div
          className="relative mx-auto w-full max-w-xl pb-52 sm:pb-24"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.2, 0, 0, 1] }}
        >
          <img
            src="/hero-seller.png"
            alt="A seller packing an order at her desk"
            width={1402}
            height={1122}
            className="aspect-[5/4] w-full rounded-xl object-cover"
          />
          <LiveOrderCard className="absolute right-3 bottom-0 left-3 sm:right-auto sm:left-[-24px] sm:w-[340px]" />
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------ How it works ------------------------------ */

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-canvas-soft">
      <div className="container py-16 md:py-24">
        <Reveal>
          <SectionHeading
            title="How it works"
            lead="SafeSale sits between buyer and seller, so neither has to trust a stranger first."
          />
        </Reveal>
        <Reveal delay={0.1} className="mt-12">
          <HowItWorksStepper />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- Protection ------------------------------- */

const PROTECTION = [
  {
    title: "If you're buying",
    points: [
      "Your money goes to SafeSale, not straight to a stranger.",
      "The seller is only paid after you confirm the item arrived.",
      "Something wrong? Report it before you release and the money stays frozen.",
      "No account needed — your private order link is all you use.",
    ],
  },
  {
    title: "If you're selling",
    points: [
      "Buyers who were afraid to pay first will now pay.",
      "You only ship once the money is confirmed and held.",
      "If a buyer goes quiet, you're paid automatically after 7 days.",
      "Payouts go to the bank account you verified at sign-up.",
    ],
  },
];

function Protection() {
  return (
    <section className="bg-canvas">
      <div className="container py-16 md:py-24">
        <Reveal>
          <SectionHeading title="Protection on both sides" />
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {PROTECTION.map((c, i) => {
            const dark = i === 1;
            return (
              <Reveal key={c.title} delay={i * 0.08}>
                <div className={cn("h-full rounded-xl p-6 sm:p-8", dark ? "bg-forest" : "bg-mint-soft")}>
                  <h3 className={cn("text-h2", dark ? "text-mint" : "text-forest")}>{c.title}</h3>
                  <ul className="mt-6 space-y-4">
                    {c.points.map((p) => (
                      <li key={p} className={cn("flex gap-3", dark ? "text-canvas" : "text-forest")}>
                        <Check
                          className={cn("mt-1 h-4 w-4 shrink-0", dark ? "text-mint" : "text-brand")}
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- When things go wrong -------------------------- */

const RULES = [
  {
    title: "The money freezes",
    body: "Reporting a problem stops the payout clock. Neither side can move the money while it's open.",
  },
  {
    title: "Both sides show evidence",
    body: "The buyer and seller each add photos and explain what happened, in one place.",
  },
  {
    title: "A person decides",
    body: "A SafeSale mediator reviews the evidence and refunds the buyer, pays the seller, or splits it.",
  },
];

function WhenThingsGoWrong() {
  return (
    <section className="bg-canvas-soft">
      <div className="container py-16 md:py-24">
        <Reveal>
          <SectionHeading
            title="When something goes wrong"
            lead="Wrong item, damaged, or never arrived — this is what happens."
          />
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {RULES.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.08}>
              <div className="border-t-2 border-forest pt-5">
                <p className="text-sm font-semibold text-brand tabular-nums">0{i + 1}</p>
                <h3 className="mt-2 text-h3 text-ink">{r.title}</h3>
                <p className="mt-2 text-body">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

const FAQ_ITEMS = [
  {
    q: "Do I need an account to buy?",
    a: "No. At checkout you get the account details to pay into and a private link to your order. Keep the link — it's how you confirm delivery or report a problem.",
  },
  {
    q: "Who holds the money while I wait?",
    a: "SafeSale does, through our payment partner. The seller can see the payment has arrived, but can't touch it until it's released.",
  },
  {
    q: "When does the seller get paid?",
    a: "As soon as the buyer confirms delivery. If the buyer does nothing, the payment is released automatically 7 days after the seller marks the order shipped — unless a problem has been reported.",
  },
  {
    q: "What if my item is wrong or never arrives?",
    a: "Use “Report a problem” on your order page before releasing payment. The money stays frozen while a SafeSale mediator reviews what both of you send.",
  },
  {
    q: "Where can I use SafeSale?",
    a: "Anywhere you can share a link — Instagram, WhatsApp, TikTok, X, Telegram, Facebook or your own website.",
  },
  {
    q: "How do sellers receive payouts?",
    a: "Straight to the Nigerian bank account added during sign-up. We check the account name with the bank before saving it.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-canvas">
      <div className="container grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <SectionHeading title="Questions" lead="Straight answers about how your money is handled." />
        </Reveal>
        <div className="divide-y divide-line border-y border-line">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold text-ink"
                >
                  {item.q}
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas-soft"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
                    >
                      <p className="pr-12 pb-5 text-body">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
