import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Lock, Shirt } from "lucide-react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
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
      <ClosingCta />
    </MarketingLayout>
  );
}

/** Where "Start selling" goes for the current session. */
function useSellerCta(): { to: string; label: string } {
  const { isAuthed } = useAuth();
  const [seller] = useCurrentSeller();
  if (seller) return { to: "/app", label: "Go to your dashboard" };
  if (isAuthed) return { to: "/onboarding", label: "Finish setting up" };
  return { to: "/onboarding", label: "Start selling" };
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  const cta = useSellerCta();
  return (
    <section className="bg-canvas-soft">
      <div className="container grid grid-cols-1 items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-display-md text-ink sm:text-display-xl">
            Sell online. Get paid safely.
          </h1>
          <p className="mt-5 text-lg leading-7 text-body">
            SafeSale holds your buyer's payment until they confirm delivery.
            Share one link on Instagram, WhatsApp or TikTok — buyers pay by
            bank transfer, no account needed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to={cta.to}>
                {cta.label}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-mute">
            Buying from a seller who uses SafeSale? Open the link they sent you.
          </p>
        </div>
        <OrderPreview />
      </div>
    </section>
  );
}

/** A static example of the buyer's order page, built from the real status components. */
function OrderPreview() {
  const steps = [
    { label: "Payment received", meta: "Mon, 10:42", state: "done" },
    { label: "Held in escrow", meta: "Mon, 10:42", state: "done" },
    { label: "Shipped with GIG Logistics", meta: "Tue, 15:10", state: "current" },
    { label: "Paid out to seller", meta: "After you confirm", state: "upcoming" },
  ] as const;

  return (
    <figure className="mx-auto w-full max-w-md">
      <div className="rounded-xl bg-canvas p-5 shadow-[var(--shadow-float)] sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-pale text-brand">
            <Shirt className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-mute">Order SS-7KQ2MD</p>
            <p className="font-semibold text-ink">Ankara two-piece set</p>
          </div>
          <EscrowStatusPill status="shipped" />
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg bg-brand-pale p-4 text-brand-ink">
          <Lock className="h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold tabular-nums">₦28,500</span> is held by SafeSale until you
            confirm delivery.
          </p>
        </div>

        <ol className="mt-6 space-y-4">
          {steps.map((s, i) => (
            <li key={s.label} className="relative flex gap-3 pl-0">
              {i < steps.length - 1 && (
                <span className="absolute top-5 left-[9px] h-[calc(100%-4px)] w-0.5 bg-line" aria-hidden />
              )}
              <span
                className={cn(
                  "relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                  s.state === "done" && "bg-brand text-brand-foreground",
                  s.state === "current" && "border-2 border-brand bg-canvas",
                  s.state === "upcoming" && "border-2 border-line-strong bg-canvas",
                )}
              >
                {s.state === "done" && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
              </span>
              <div>
                <p className={cn("text-sm font-medium", s.state === "upcoming" ? "text-mute" : "text-ink")}>
                  {s.label}
                </p>
                <p className="text-xs text-mute">{s.meta}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <span className="inline-flex h-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
            I received it
          </span>
          <span className="inline-flex h-10 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink">
            Report a problem
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-mute">
        Example of what the buyer sees after paying
      </figcaption>
    </figure>
  );
}

/* ------------------------------ How it works ------------------------------ */

function HowItWorks() {
  const steps = [
    {
      title: "Share your SafeSale link",
      body: "Add a product in two minutes and paste the link in your bio, story or DM.",
    },
    {
      title: "Buyer pays SafeSale",
      body: "They transfer the exact amount to the account shown at checkout. You're told the moment it lands.",
    },
    {
      title: "You ship the order",
      body: "Add a tracking number if you have one. The buyer can follow the order from their link.",
    },
    {
      title: "You get paid",
      body: "When the buyer confirms delivery, the money goes straight to your bank account.",
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-canvas">
      <div className="container py-16 md:py-24">
        <SectionHeading
          title="How it works"
          lead="SafeSale sits between buyer and seller, so neither has to trust a stranger first."
        />
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-pale text-sm font-semibold text-brand-ink tabular-nums">
                {i + 1}
              </span>
              <h3 className="mt-4 text-h3 text-ink">{s.title}</h3>
              <p className="mt-2 text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------- Protection ------------------------------- */

function Protection() {
  const columns = [
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

  return (
    <section className="bg-canvas-soft">
      <div className="container py-16 md:py-24">
        <SectionHeading title="Protection on both sides" />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {columns.map((c) => (
            <div key={c.title} className="rounded-lg bg-canvas p-6 sm:p-8">
              <h3 className="text-h3 text-ink">{c.title}</h3>
              <ul className="mt-5 space-y-4">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-3 text-body">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- When things go wrong -------------------------- */

function WhenThingsGoWrong() {
  const rules = [
    {
      title: "The money freezes",
      body: "Opening a dispute stops the payout clock. Neither side can move the money while it's open.",
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

  return (
    <section className="bg-canvas">
      <div className="container py-16 md:py-24">
        <SectionHeading
          title="When something goes wrong"
          lead="Wrong item, damaged, or never arrived — this is what happens."
        />
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {rules.map((r) => (
            <div key={r.title} className="border-t-2 border-brand pt-5">
              <h3 className="text-h3 text-ink">{r.title}</h3>
              <p className="mt-2 text-body">{r.body}</p>
            </div>
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
  return (
    <section className="bg-canvas-soft">
      <div className="container grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading title="Questions" lead="Straight answers about how your money is handled." />
        <div className="divide-y divide-line rounded-lg bg-canvas">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group px-5 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-mute transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="-mt-1 pb-5 text-body">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Closing CTA ------------------------------ */

function ClosingCta() {
  const cta = useSellerCta();
  return (
    <section className="bg-canvas">
      <div className="container py-16 md:py-24">
        <div className="flex flex-col items-start justify-between gap-8 rounded-xl bg-ink p-8 sm:p-12 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 className="text-h1 text-canvas">
              Let buyers pay you without the fear.
            </h2>
            <p className="mt-3 text-lg text-canvas-sunken/80">
              Set up your shop and share your first link today.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to={cta.to}>
              {cta.label}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Shared --------------------------------- */

function SectionHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-h1 text-ink sm:text-display-lg">
        {title}
      </h2>
      {lead && <p className="mt-4 text-lg text-body">{lead}</p>}
    </div>
  );
}
