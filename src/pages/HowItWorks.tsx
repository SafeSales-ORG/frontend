import { useSeoMeta } from "@unhead/react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { ClosingCta, PageHero, SectionHeading } from "@/components/safesale/Marketing";
import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import type { EscrowStatus } from "@/lib/types";

export default function HowItWorks() {
  useSeoMeta({
    title: "How SafeSale works",
    description: "Where the buyer's money is at every step, who acts next, and what happens if something goes wrong.",
  });

  return (
    <MarketingLayout>
      <PageHero
        title="Where the money is, at every step."
        lead="SafeSale holds the buyer's payment between the moment they pay and the moment they confirm their order arrived. Here is exactly what happens in between."
      />
      <MoneyJourney />
      <Disputes />
      <ClosingCta title="Ready to take your first safe order?" lead="It takes about two minutes to set up a shop." />
    </MarketingLayout>
  );
}

const JOURNEY: { status: EscrowStatus; title: string; who: string; body: string }[] = [
  {
    status: "pending_payment",
    title: "The buyer checks out",
    who: "Buyer",
    body: "They enter delivery details and get bank details for this order only. No account needed.",
  },
  {
    status: "paid",
    title: "SafeSale receives the payment",
    who: "SafeSale",
    body: "We confirm the transfer and hold the money. The seller is told to ship; nobody can move the money yet.",
  },
  {
    status: "shipped",
    title: "The seller ships",
    who: "Seller",
    body: "They mark the order shipped, with a tracking number if they have one. A 7-day clock starts.",
  },
  {
    status: "delivered",
    title: "The buyer checks the item",
    who: "Buyer",
    body: "From their order link they confirm it arrived as described, or report a problem.",
  },
  {
    status: "released",
    title: "The seller is paid",
    who: "SafeSale",
    body: "When the buyer releases — or 7 days after shipping with no problem reported — we pay the seller's bank account.",
  },
];

function MoneyJourney() {
  return (
    <section id="protection" className="scroll-mt-20 bg-canvas">
      <div className="container py-16 md:py-24">
        <SectionHeading title="One order, start to finish" />
        <ol className="mt-12 divide-y divide-line rounded-lg border border-line">
          {JOURNEY.map((step, i) => (
            <li key={step.status} className="grid gap-3 p-5 sm:grid-cols-[48px_1fr_auto] sm:items-start sm:gap-6 sm:p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-pale text-sm font-semibold text-brand-ink tabular-nums">
                {i + 1}
              </span>
              <div>
                <h3 className="text-h3 text-ink">{step.title}</h3>
                <p className="mt-1 max-w-2xl text-body">{step.body}</p>
                <p className="mt-2 text-sm text-mute">Done by: {step.who}</p>
              </div>
              <EscrowStatusPill status={step.status} className="justify-self-start" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Disputes() {
  const steps = [
    {
      title: "Someone reports a problem",
      body: "The buyer uses “Report a problem” on their order page before releasing payment. The 7-day clock stops and the money is frozen.",
    },
    {
      title: "Both sides explain",
      body: "The buyer describes what's wrong and adds photos. The seller replies with their side and their own evidence.",
    },
    {
      title: "A mediator decides",
      body: "A SafeSale mediator reviews everything and chooses one outcome: refund the buyer, pay the seller, or split the amount.",
    },
    {
      title: "The money moves",
      body: "The seller's share is paid out automatically. A buyer refund is sent to the account the buyer gives the mediator.",
    },
  ];

  return (
    <section id="dispute" className="scroll-mt-20 bg-canvas-soft">
      <div className="container grid gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <SectionHeading
            title="If something goes wrong"
            lead="Wrong item, damaged, or never arrived. Disputes follow the same four steps every time."
          />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-sm text-mute">Possible outcomes:</span>
            <EscrowStatusPill status="refunded" />
            <EscrowStatusPill status="released" />
          </div>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-lg bg-canvas p-5 sm:p-6">
              <p className="text-sm font-medium text-brand tabular-nums">Step {i + 1}</p>
              <h3 className="mt-1 text-h3 text-ink">{s.title}</h3>
              <p className="mt-2 text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
