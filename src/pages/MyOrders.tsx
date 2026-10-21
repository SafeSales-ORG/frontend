import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ClipboardText, Package, Trash } from "@phosphor-icons/react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSavedOrders } from "@/hooks/useSavedOrders";
import { formatNGN, formatRelative } from "@/lib/format";
import { savedOrders, tokenFromOrderLink } from "@/lib/savedOrders";
import { sanitizeUrl } from "@/lib/utils";

/** Buyers have no account: their orders on this device, plus a way back in with a link. */
export default function MyOrders() {
  useSeoMeta({ title: "My orders — SafeSale" });
  const orders = useSavedOrders();
  const navigate = useNavigate();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openPasted = () => {
    const token = tokenFromOrderLink(pasted);
    if (!token) {
      setError("That doesn't look like a SafeSale order link. It should contain /order/ followed by a long code.");
      return;
    }
    navigate(`/order/${token}`);
  };

  return (
    <MarketingLayout>
      <section className="bg-mint">
        <div className="container py-12 md:py-16">
          <h1 className="text-display-md text-forest">My orders</h1>
          <p className="mt-3 max-w-xl text-lg text-forest/80">
            Orders you placed or opened on this phone or computer. No account needed.
          </p>
        </div>
      </section>

      <div className="container max-w-3xl space-y-8 py-10">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl bg-canvas-soft p-10 text-center">
            <BrandIcon icon={Package} tone="pale" size="lg" />
            <p className="mt-4 font-semibold text-ink">No orders on this device yet</p>
            <p className="mt-1 max-w-sm text-sm text-body">
              When you buy something, it shows up here. Ordered on another phone? Paste your order link below.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {orders.map((o) => {
                const img = o.image ? sanitizeUrl(o.image) : undefined;
                return (
                  <motion.li
                    key={o.token}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="group flex items-center gap-3 rounded-2xl bg-canvas-soft p-3 pr-2 transition-colors hover:bg-canvas-sunken"
                  >
                    <Link to={`/order/${o.token}`} className="flex min-w-0 flex-1 items-center gap-4">
                      {img ? (
                        <img src={img} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-canvas text-mute">
                          <Package size={24} weight="duotone" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{o.title}</span>
                        <span className="block text-sm text-mute">
                          {o.shortId} · {formatNGN(o.amountNGN)} · saved {formatRelative(o.savedAt)}
                        </span>
                      </span>
                      <ArrowRight size={18} weight="bold" className="shrink-0 text-mute transition-transform group-hover:translate-x-0.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => savedOrders.remove(o.token)}
                      aria-label={`Remove ${o.shortId} from this device`}
                      title="Remove from this device (the order itself isn't affected)"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute hover:bg-canvas hover:text-negative"
                    >
                      <Trash size={16} />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        <section className="rounded-3xl border border-line p-6">
          <div className="flex items-center gap-3">
            <BrandIcon icon={ClipboardText} tone="neutral" size="sm" />
            <h2 className="font-semibold text-ink">Have an order link?</h2>
          </div>
          <p className="mt-2 text-sm text-body">
            Paste the link you saved (from WhatsApp, email or your notes) to open the order on this device.
          </p>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              openPasted();
            }}
          >
            <Input
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setError(null);
              }}
              placeholder="https://…/order/…"
              aria-label="Order link"
              aria-invalid={!!error}
              className="flex-1"
            />
            <Button type="submit" disabled={!pasted.trim()}>
              Open order
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {error}
            </p>
          )}
          <p className="mt-4 text-sm text-mute">
            Can't find it? Search your WhatsApp or email for "SafeSale order". That's where it went if you used the save buttons after paying.
          </p>
        </section>
      </div>
    </MarketingLayout>
  );
}
