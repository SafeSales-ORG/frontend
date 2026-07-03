/**
 * `HelpDialog` — a real, functional help/support modal used on both the
 * seller dashboard and the buyer order page. Explains the escrow workflow
 * end-to-end so demo users (and real users) understand what's happening,
 * with a contact-support action.
 */

import { useState } from "react";
import {
  ChevronDown,
  HeadphonesIcon,
  Lock,
  Mail,
  MessageCircle,
  Scale,
  ShieldCheck,
  Truck,
  Undo2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Real support contacts — set these in .env. Sensible fallbacks otherwise. */
const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ||
  "support@safesale.app";
/** Digits only, international format (no +), e.g. 2348012345678. */
const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ||
  "2348000000000";

interface HelpItem {
  icon: React.ComponentType<{ className?: string }>;
  q: string;
  a: string;
}

const HELP_ITEMS: HelpItem[] = [
  {
    icon: ShieldCheck,
    q: "How does SafeSale escrow work?",
    a: "When a buyer pays, the money is locked in escrow — the seller can see it but cannot withdraw it. It's only released to the seller after the buyer confirms they received their item, or automatically after the protection window passes. If something goes wrong, the buyer opens a dispute and the funds stay frozen until it's resolved.",
  },
  {
    icon: Lock,
    q: "When does the seller get paid?",
    a: "Funds move from “Locked” to “Available” the moment the buyer releases payment (or a dispute resolves in the seller's favour). Sellers cash out their available balance to their bank at any time.",
  },
  {
    icon: Truck,
    q: "How do I ship an order?",
    a: "Open the order from your dashboard once it shows as Paid. Add a tracking number and carrier (optional but recommended) and mark it shipped. The buyer is notified instantly and by email, and can then release payment when it arrives.",
  },
  {
    icon: Scale,
    q: "What happens in a dispute?",
    a: "The buyer describes the problem and the funds stay locked. A SafeSale mediator reviews both sides and issues a decision: release to the seller, refund the buyer, or a split. The outcome is final and applied automatically.",
  },
  {
    icon: Undo2,
    q: "How do refunds work?",
    a: "If a dispute resolves in the buyer's favour, the locked funds are refunded and the order is marked Refunded. The buyer is notified by email with the outcome.",
  },
];

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [openItem, setOpenItem] = useState<number | null>(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
            <HeadphonesIcon className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">How SafeSale works</DialogTitle>
          <DialogDescription className="text-center">
            Everything you need to know about buying and selling safely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {HELP_ITEMS.map((item, i) => {
            const isOpen = openItem === i;
            const Icon = item.icon;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-xl border border-border bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenItem(isOpen ? null : i)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-ink-soft transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <p className="border-t border-border bg-surface/40 px-4 py-3 text-sm leading-relaxed text-ink-soft">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-surface/40 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Still need help?</p>
            <p className="text-xs text-ink-soft">
              Our team usually replies within minutes.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="mr-1.5 h-3.5 w-3.5" /> Email us
              </a>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <a
                href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default HelpDialog;
