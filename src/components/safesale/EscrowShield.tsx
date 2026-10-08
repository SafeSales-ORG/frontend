import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Your money is held" panel: the amount in escrow and one sentence of context. */
export function EscrowShield({
  amount,
  className,
  caption = "Held by SafeSale until you confirm delivery.",
}: {
  amount: string;
  className?: string;
  caption?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4 rounded-lg bg-brand-pale p-5 text-brand-ink", className)}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium">Held in escrow</p>
        <p className="mt-0.5 text-h1 tabular-nums">{amount}</p>
        <p className="mt-2 text-sm">{caption}</p>
      </div>
    </div>
  );
}
