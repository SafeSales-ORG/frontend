import { useSeoMeta } from "@unhead/react";
import { Banknote, Link2, ShieldCheck, Truck } from "lucide-react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { ClosingCta, PageHero, SectionHeading } from "@/components/safesale/Marketing";

export default function ForSellers() {
  useSeoMeta({
    title: "For sellers — SafeSale",
    description: "Let new buyers pay you with confidence. Share one link, ship once the money is held, and get paid to your bank.",
  });

  return (
    <MarketingLayout>
      <PageHero
        title="Sell to people who don't know you yet."
        lead="Most buyers won't pay a stranger first. With SafeSale they don't have to — the money waits with us until they have their order, so they can say yes."
      />
      <Benefits />
      <Setup />
      <ClosingCta title="Set up your shop" lead="You need an email address and a Nigerian bank account." />
    </MarketingLayout>
  );
}

function Benefits() {
  const items = [
    {
      icon: Link2,
      title: "One link, anywhere you sell",
      body: "Put it in your Instagram bio, WhatsApp status, TikTok or DMs. Buyers check out from the link — no app, no account.",
    },
    {
      icon: ShieldCheck,
      title: "Ship only when the money is there",
      body: "You're told when the buyer's payment is confirmed and held. No more sending items on a promise.",
    },
    {
      icon: Truck,
      title: "Quiet buyers can't hold you up",
      body: "If the buyer doesn't confirm or report a problem within 7 days of shipping, the payment is released to you automatically.",
    },
    {
      icon: Banknote,
      title: "Paid to your own bank",
      body: "Payouts go to the account you add at sign-up. We check the account name with the bank before saving it.",
    },
  ];

  return (
    <section className="bg-canvas">
      <div className="container py-16 md:py-24">
        <SectionHeading title="What changes for your business" />
        <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-2">
          {items.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-pale text-brand">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-h3 text-ink">{title}</h3>
                <p className="mt-2 text-body">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Setup() {
  const steps = [
    "Create an account with your email or Google.",
    "Name your shop and add the bank account you want paid into.",
    "Add a product: photos, price, stock and delivery fee.",
    "Copy the link and share it wherever your buyers are.",
  ];

  return (
    <section className="bg-canvas-soft">
      <div className="container grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading title="Getting set up" lead="About two minutes, start to finish." />
        <ol className="divide-y divide-line rounded-lg bg-canvas">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-4 p-5 sm:p-6">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-pale text-sm font-semibold text-brand-ink tabular-nums">
                {i + 1}
              </span>
              <p className="pt-1 text-ink">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
