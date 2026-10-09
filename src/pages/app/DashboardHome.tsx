/**
 * Seller dashboard home — `/app`.
 *
 * Answers three questions in order: what needs me right now, how is the
 * money doing, and how do I get more orders (the shop link).
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Copy, ExternalLink, Plus } from "lucide-react";

import { AppShell } from "@/components/safesale/AppShell";
import { AnimatedNumber } from "@/components/safesale/AnimatedNumber";
import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useMyListings } from "@/hooks/useMyListings";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useToast } from "@/hooks/useToast";
import type { ApiOrderStatus, SellerOrderRow } from "@/lib/api";
import { formatNGN, formatRelative } from "@/lib/format";
import { displayUrl, shopUrl } from "@/lib/links";
import type { EscrowStatus } from "@/lib/types";

/** Money held for this seller: paid but not yet released or refunded. */
const HELD: ReadonlySet<ApiOrderStatus> = new Set<ApiOrderStatus>(["paid", "shipped", "delivered", "disputed"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardHome() {
  useSeoMeta({ title: "Home — SafeSale" });

  const [seller] = useCurrentSeller();
  const { orders, isLoading } = useSellerOrders();
  const { listings } = useMyListings();

  const [weekAgo] = useState(() => Date.now() - WEEK_MS);
  const stats = useMemo(() => {
    const cutoff = weekAgo;
    let heldNGN = 0;
    let heldCount = 0;
    let paidOutWeekNGN = 0;
    for (const o of orders) {
      if (HELD.has(o.status)) {
        heldNGN += o.amountNGN;
        heldCount += 1;
      }
      const releasedAt = o.releasedAt ?? o.updatedAt;
      if (o.status === "completed" && new Date(releasedAt).getTime() >= cutoff) paidOutWeekNGN += o.amountNGN;
    }
    return { heldNGN, heldCount, paidOutWeekNGN };
  }, [orders, weekAgo]);

  const needsAction = useMemo(
    () =>
      orders
        .filter((o) => o.status === "paid" || o.status === "disputed")
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [orders],
  );
  const toShip = needsAction.filter((o) => o.status === "paid").length;
  const firstName = (seller?.name ?? "").split(" ")[0] || "there";

  const summary =
    needsAction.length === 0
      ? "Nothing needs you right now."
      : toShip > 0
        ? `${toShip} order${toShip === 1 ? " is" : "s are"} paid and waiting to be shipped.`
        : "A buyer has reported a problem. Please respond.";

  return (
    <AppShell
      title="Home"
      action={
        <Button asChild size="sm">
          <Link to="/app/listings">
            <Plus /> New listing
          </Link>
        </Button>
      }
    >
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h2 className="text-h1 text-ink">
          {greeting()}, {firstName}
        </h2>
        <p className="mt-1 text-body">{summary}</p>
      </motion.div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ShopLinkCard handle={seller?.handle} />
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Held in escrow" value={stats.heldNGN} money note={`${stats.heldCount} order${stats.heldCount === 1 ? "" : "s"}`} />
          <Stat label="Paid out this week" value={stats.paidOutWeekNGN} money note="To your bank" />
        </div>
      </div>

      <Section
        title="Needs your action"
        link={{ to: "/app/orders", label: "All orders" }}
        className="mt-8"
      >
        {isLoading ? (
          <RowSkeleton />
        ) : needsAction.length === 0 ? (
          <p className="px-5 py-8 text-center text-body">You're all caught up. New paid orders appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {needsAction.slice(0, 6).map((o) => (
              <OrderRow key={o.orderToken} order={o} cta={o.status === "paid" ? "Ship order" : "Respond"} />
            ))}
          </ul>
        )}
      </Section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Section title="Recent orders" link={{ to: "/app/orders", label: "View all" }}>
          {isLoading ? (
            <RowSkeleton />
          ) : orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-body">No orders yet. Share your shop link to get your first sale.</p>
          ) : (
            <ul className="divide-y divide-line">
              {orders.slice(0, 5).map((o) => (
                <OrderRow key={o.orderToken} order={o} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Your listings" link={{ to: "/app/listings", label: "Manage" }}>
          {listings.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-body">Add your first product. It takes about two minutes.</p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/app/listings">
                  <Plus /> New listing
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {listings.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <Link to={`/buy/${l.id}`} className="group block">
                    <div className="aspect-square overflow-hidden rounded-md bg-canvas-soft">
                      <ListingThumb image={l.images[0]} alt={l.title} size={300} fill />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-ink group-hover:underline">{l.title}</p>
                    <p className="text-sm text-mute tabular-nums">
                      {formatNGN(l.priceNGN)} · {l.inStock === 0 ? "Sold out" : `${l.inStock} left`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}

function ShopLinkCard({ handle }: { handle?: string }) {
  const { toast } = useToast();
  const url = handle ? shopUrl(handle) : null;
  return (
    <div className="flex flex-col justify-between gap-6 rounded-xl bg-forest p-6 text-canvas">
      <div>
        <p className="text-sm font-medium text-mint">Your shop link</p>
        <p className="mt-2 text-h3 break-all text-canvas">{url ? displayUrl(url) : "Finish setting up your shop"}</p>
        <p className="mt-1 text-sm text-canvas/70">Put it in your bio, status and DMs. Every order is protected.</p>
      </div>
      {url && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="mint"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(url).then(() => toast({ title: "Shop link copied" }))}
          >
            <Copy /> Copy link
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-canvas hover:bg-canvas/10 hover:text-canvas">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Open shop
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note, money }: { label: string; value: number; note: string; money?: boolean }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-canvas p-5">
      <p className="text-sm text-mute">{label}</p>
      <div className="mt-4">
        <AnimatedNumber
          value={value}
          format={money ? (n) => formatNGN(Math.round(n)) : undefined}
          className="block text-h1 text-ink tabular-nums"
        />
        <p className="mt-1 text-sm text-mute">{note}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  link,
  className,
  children,
}: {
  title: string;
  link?: { to: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 text-ink">{title}</h3>
        {link && (
          <Link to={link.to} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            {link.label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-xl bg-canvas">{children}</div>
    </section>
  );
}

function OrderRow({ order, cta }: { order: SellerOrderRow; cta?: string }) {
  return (
    <li>
      <Link
        to={`/app/orders/${order.orderToken}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-canvas-soft"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-canvas-soft">
          <ListingThumb image={order.listing.images[0]} alt="" size={44} fill />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{order.listing.title}</p>
          <p className="truncate text-sm text-mute">
            {order.buyerName} · {formatRelative(order.createdAt)}
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="font-semibold text-ink tabular-nums">{formatNGN(order.amountNGN)}</p>
          <EscrowStatusPill status={order.status as EscrowStatus} size="sm" className="mt-1" />
        </div>
        {cta && (
          <span className="hidden shrink-0 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-mint md:inline">
            {cta}
          </span>
        )}
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
