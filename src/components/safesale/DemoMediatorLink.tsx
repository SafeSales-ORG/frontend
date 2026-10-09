import { Link } from "react-router-dom";
import { ArrowRight, Scales } from "@phosphor-icons/react";

import { DEMO_MODE } from "@/lib/api/client";

/**
 * Demo only: there is no real mediator on the demo, so let the tester step
 * into the mediator console to decide the case themselves.
 */
export function DemoMediatorLink({ className }: { className?: string }) {
  if (!DEMO_MODE) return null;
  return (
    <Link
      to="/admin"
      className={`group flex items-center gap-3 rounded-2xl bg-forest px-4 py-3 text-canvas transition-colors hover:bg-forest-hover ${className ?? ""}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint text-forest">
        <Scales size={18} weight="fill" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Demo: decide this as the mediator</span>
        <span className="block text-canvas/70">On the live site, a SafeSale mediator does this.</span>
      </span>
      <ArrowRight size={18} weight="bold" className="shrink-0 text-mint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
