import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { BookmarkSimple, Check, Copy, DeviceMobile, EnvelopeSimple, Export, LinkSimple } from "@phosphor-icons/react";

import { WhatsAppMark } from "@/components/listings/BrandMarks";
import { useToast } from "@/hooks/useToast";
import { displayUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * The buyer has no account: this link is their only way back to the order.
 * Give them several one-tap ways to keep it, and show when they've done it.
 */
export function SaveOrderLink({
  link,
  shortId,
  title,
  email,
}: {
  link: string;
  shortId: string;
  title: string;
  /** Pre-fills "Email it to me" (opens the buyer's own mail app). */
  email?: string;
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const message = `My SafeSale order ${shortId} (${title}). Track it, confirm delivery or report a problem here:\n${link}`;
  const done = (how: string) => setSaved(how);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      done("Copied");
    } catch {
      toast({ title: "Couldn't copy", description: "Press and hold the link to copy it." });
    }
  };

  const open = (url: string, how: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    done(how);
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-canvas" aria-label="Save your order link">
      <div className="flex items-start gap-3 bg-forest px-5 py-4 text-canvas">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-forest">
          <BookmarkSimple size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Save your order link</p>
          <p className="text-sm text-canvas/75">
            You don't have an account, so this link is how you get back to your order to confirm delivery or report a problem.
          </p>
        </div>
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-forest"
            >
              <Check size={12} weight="bold" /> Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2 rounded-2xl bg-canvas-soft p-1.5 pl-4">
          <LinkSimple size={18} className="shrink-0 text-mute" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink select-all">{displayUrl(link)}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex h-10 w-24 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-forest text-sm font-semibold text-mint transition-transform active:scale-95"
          >
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className={cn("grid gap-2", canShare ? "grid-cols-3" : "grid-cols-2")}>
          <SaveButton
            label="Send to my WhatsApp"
            onClick={() => open(`https://wa.me/?text=${encodeURIComponent(message)}`, "WhatsApp")}
            icon={
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366]">
                <WhatsAppMark className="h-5 w-5 text-white" />
              </span>
            }
          />
          <SaveButton
            label="Email it to me"
            onClick={() => {
              const subject = `Your SafeSale order ${shortId}`;
              window.location.href = `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
              done("Email");
            }}
            icon={
              <span className="grid h-9 w-9 place-items-center rounded-full bg-info-pale text-info">
                <EnvelopeSimple size={18} weight="fill" />
              </span>
            }
          />
          {canShare && (
            <SaveButton
              label="Save to phone"
              onClick={async () => {
                try {
                  await navigator.share({ title: `SafeSale order ${shortId}`, text: message, url: link });
                  done("Shared");
                } catch {
                  // Cancelled.
                }
              }}
              icon={
                <span className="grid h-9 w-9 place-items-center rounded-full bg-canvas-sunken text-forest">
                  <Export size={18} weight="bold" />
                </span>
              }
            />
          )}
        </div>

        <p className="flex items-start gap-2 text-sm text-mute">
          <DeviceMobile size={16} className="mt-0.5 shrink-0" />
          <span>
            We've also kept it on this device under{" "}
            <Link to="/my-orders" className="font-semibold text-brand hover:underline">
              My orders
            </Link>
            .
          </span>
        </p>
      </div>
    </section>
  );
}

function SaveButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="flex flex-col items-center gap-2 rounded-2xl bg-canvas-soft px-2 py-3 text-center text-xs font-medium text-ink transition-colors hover:bg-canvas-sunken"
    >
      {icon}
      {label}
    </motion.button>
  );
}
