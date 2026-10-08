import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSellerCta } from "@/hooks/useSellerCta";
import { cn } from "@/lib/utils";

/** Section title + optional lead paragraph used on marketing pages. */
export function SectionHeading({ title, lead, className }: { title: string; lead?: string; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2 className="text-h1 text-ink sm:text-display-lg">{title}</h2>
      {lead && <p className="mt-4 text-lg text-body">{lead}</p>}
    </div>
  );
}

/** Page-level hero for secondary marketing pages. */
export function PageHero({ title, lead }: { title: string; lead: string }) {
  return (
    <section className="bg-canvas-soft">
      <div className="container py-16 md:py-24">
        <h1 className="max-w-3xl text-display-md text-ink sm:text-display-xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-body">{lead}</p>
      </div>
    </section>
  );
}

/** Dark closing band with the session-aware seller CTA. */
export function ClosingCta({ title, lead }: { title: string; lead: string }) {
  const cta = useSellerCta();
  return (
    <section className="bg-canvas">
      <div className="container py-16 md:py-24">
        <div className="flex flex-col items-start justify-between gap-8 rounded-xl bg-ink p-8 sm:p-12 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 className="text-h1 text-canvas">{title}</h2>
            <p className="mt-3 text-lg text-canvas-sunken/80">{lead}</p>
          </div>
          <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
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
