import { useSeoMeta } from "@unhead/react";
import { Link, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Logo } from "@/components/safesale/Logo";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/safesale/Avatar";
import { ProductImage } from "@/components/safesale/ProductImage";
import { StarRating } from "@/components/safesale/StarRating";
import { Skeleton } from "@/components/ui/skeleton";

import { useListing, type ListingDetails } from "@/hooks/useListing";
import { useSellerReputationLive } from "@/hooks/useMarket";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn, sanitizeUrl } from "@/lib/utils";
import { hashStr } from "@/lib/seeded";

import { BadgeCheck, ChevronLeft, Lock, Share2, ShieldCheck } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                  Page                                      */
/* -------------------------------------------------------------------------- */

export default function PublicListing() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: listing, isLoading, error } = useListing(id);

  useSeoMeta({
    title: listing ? `${listing.title} — SafeSale` : "Listing — SafeSale",
    description: listing
      ? `${listing.title} · ${formatNGN(listing.priceNGN)} · Pay safely with SafeSale escrow.`
      : undefined,
  });

  if (isLoading) {
    return <PublicListingSkeleton />;
  }

  if (error || !listing) {
    return <ListingNotFound id={id} />;
  }

  return <PublicListingView listing={listing} />;
}

/* -------------------------------------------------------------------------- */
/*                              View (loaded)                                 */
/* -------------------------------------------------------------------------- */

function PublicListingView({ listing }: { listing: ListingDetails }) {
  const goBack = useGoBack("/market");
  const [activeImage, setActiveImage] = useState(0);

  const sellerName = listing.sellerName ?? "Seller";
  const sellerAvatarUrl = sanitizeUrl(listing.sellerAvatarUrl);
  const outOfStock = listing.inStock === 0;
  const sellerVerified: boolean = listing.sellerVerified ?? false;
  const reputation = useSellerReputationLive(listing.sellerStoreId);
  const sellerRating = reputation.reviewCount > 0 ? reputation.rating : undefined;
  const sellerReviewCount =
    reputation.reviewCount > 0 ? reputation.reviewCount : undefined;
  const sellerCompletedOrders =
    reputation.completedOrders > 0 ? reputation.completedOrders : undefined;

  const heroImage = listing.images[activeImage] ?? listing.images[0];

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* Sticky header */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas text-body transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Logo />
          <button
            type="button"
            aria-label="Share listing"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas text-body transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => {
              const url = window.location.href;
              if (navigator.share) {
                navigator.share({ title: listing.title, url }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(url);
              }
            }}
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <motion.main
        className="mx-auto max-w-6xl px-4 pt-20 pb-32 sm:px-6 md:pt-24 lg:pb-16"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* ------------------------ Gallery + body ------------------------ */}
          <div className="space-y-8">
            <Gallery
              listing={listing}
              activeIndex={activeImage}
              onSelect={setActiveImage}
              hero={heroImage}
            />

            {/* Description + specs — desktop only (mobile shows compact version inline below) */}
            <div className="hidden space-y-8 md:block">
              <section>
                <h2 className="text-h2 text-ink">
                  About this item
                </h2>
                <p className="mt-3 whitespace-pre-line text-body">
                  {listing.description}
                </p>
              </section>

              <section>
                <h2 className="text-h2 text-ink">
                  Details
                </h2>
                <dl className="mt-3 overflow-hidden rounded-lg border border-line bg-canvas">
                  <SpecRow
                    k="In stock"
                    v={
                      listing.inStock === 0
                        ? "Out of stock"
                        : listing.inStock === 1
                        ? "1 available"
                        : `${listing.inStock} available`
                    }
                  />
                  {listing.category && (
                    <SpecRow k="Category" v={capitalize(listing.category)} />
                  )}
                  {listing.delivery && (
                    <SpecRow k="Delivery" v={listing.delivery} />
                  )}
                  <SpecRow k="Listed" v={formatRelative(epochToIso(listing.publishedAt))} />
                </dl>
              </section>
            </div>
          </div>

          {/* ----------------------------- Info rail ------------------------- */}
          <aside className="space-y-6 lg:sticky lg:top-20 lg:h-min lg:self-start">
            <section className="rounded-lg bg-canvas p-6 sm:p-8">
              {listing.category && (
                <p className="text-sm font-medium text-mute">{capitalize(listing.category)}</p>
              )}
              <h1 className="mt-1 text-h1 text-ink">{listing.title}</h1>
              {listing.summary && <p className="mt-2 text-body">{listing.summary}</p>}

              <dl className="mt-6 space-y-2 border-t border-line pt-5">
                <CostRow label="Item" value={formatNGN(listing.priceNGN)} />
                <CostRow
                  label="Delivery"
                  value={listing.deliveryFee && listing.deliveryFee > 0 ? formatNGN(listing.deliveryFee) : "Free"}
                />
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <dt className="font-semibold text-ink">Total</dt>
                  <dd className="text-h2 text-ink tabular-nums">{formatNGN(listing.priceNGN + (listing.deliveryFee ?? 0))}</dd>
                </div>
              </dl>

              {outOfStock ? (
                <Button size="lg" disabled className="mt-6 hidden w-full md:inline-flex">
                  Out of stock
                </Button>
              ) : (
                <Button asChild size="lg" className="mt-6 hidden w-full md:inline-flex">
                  <Link to={`/checkout/${listing.id}`}>
                    <Lock />
                    Buy with SafeSale
                  </Link>
                </Button>
              )}

              <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                {sellerAvatarUrl ? (
                  <img src={sellerAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <Avatar seed={listing.sellerPubkey} name={sellerName} size={40} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-mute">Sold by</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-ink">{sellerName}</p>
                    {sellerVerified && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
                      </span>
                    )}
                  </div>
                  {sellerRating !== undefined && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-mute">
                      <StarRating rating={sellerRating} size={11} />
                      <span className="tabular-nums">
                        {sellerRating.toFixed(1)}
                        {sellerReviewCount !== undefined && <> · {sellerReviewCount} reviews</>}
                        {sellerCompletedOrders !== undefined && <> · {sellerCompletedOrders} orders</>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <EscrowTrustPanel total={formatNGN(listing.priceNGN + (listing.deliveryFee ?? 0))} />

            {/* Mobile-only inline description (the desktop one lives in the left column) */}
            <section className="rounded-lg bg-canvas p-5 md:hidden">
              <h2 className="text-h3 text-ink">About this item</h2>
              <p className="mt-2 whitespace-pre-line text-body">
                {listing.description}
              </p>
            </section>
          </aside>
        </div>
      </motion.main>

      {/* Sticky mobile bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas shadow-[var(--shadow-float)] md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pb-safe pt-3">
          <div className="flex flex-col">
            <span className="text-xs text-mute">
              Total{listing.deliveryFee ? " incl. delivery" : ""}
            </span>
            <span className="text-h3 text-ink tabular-nums">
              {formatNGN(listing.priceNGN + (listing.deliveryFee ?? 0))}
            </span>
          </div>
          {outOfStock ? (
            <Button disabled className="flex-1">
              Out of stock
            </Button>
          ) : (
            <Button asChild className="flex-1">
              <Link to={`/checkout/${listing.id}`}>
                <Lock />
                Buy with SafeSale
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Gallery                                     */
/* -------------------------------------------------------------------------- */

function Gallery({
  listing,
  activeIndex,
  onSelect,
  hero,
}: {
  listing: ListingDetails;
  activeIndex: number;
  onSelect: (index: number) => void;
  hero: string;
}) {
  return (
    <div>
      {/* Capped on mobile so price + buy peek into view with minimal scroll;
          full ratio on desktop where it sits beside the details rail. */}
      <div className="relative aspect-[4/5] max-h-[44vh] overflow-hidden rounded-lg bg-canvas sm:max-h-[58vh] lg:max-h-none">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={activeIndex}
            className="absolute inset-0 touch-pan-y"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            drag={listing.images.length > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              const n = listing.images.length;
              if (info.offset.x < -50) onSelect((activeIndex + 1) % n);
              else if (info.offset.x > 50) onSelect((activeIndex - 1 + n) % n);
            }}
          >
            <ListingImage src={hero} alt={listing.title} className="pointer-events-none h-full w-full select-none" />
          </motion.div>
        </AnimatePresence>
        {listing.images.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {listing.images.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 rounded-full bg-canvas transition-all", i === activeIndex ? "w-5" : "w-1.5 opacity-60")}
              />
            ))}
          </div>
        )}
      </div>

      {listing.images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {listing.images.map((url, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                type="button"
                key={`${url}-${i}`}
                onClick={() => onSelect(i)}
                aria-label={`Show image ${i + 1}`}
                aria-pressed={isActive}
                className={cn(
                  "h-20 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  isActive
                    ? "border-brand"
                    : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                <ListingImage src={url} alt="" className="h-full w-full" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          ListingImage (URL or seed)                        */
/* -------------------------------------------------------------------------- */

/**
 * Renders either a real https image (after sanitization) or, when the
 * URL is a `safesale://fixture-image/...` placeholder produced by the
 * useListing fixture fallback, an attractive deterministic gradient.
 */
function ListingImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  // Fixture placeholders look like: safesale://fixture-image/<listingId>/<seed>
  if (src.startsWith("safesale://")) {
    const seed = src.replace(/^safesale:\/\/fixture-image\//, "");
    const h = hashStr(seed);
    return (
      <ProductImage
        image={{
          seed,
          hueA: h % 360,
          hueB: (h >> 8) % 360,
          label: "",
        }}
        className={className}
        rounded="rounded-none"
      />
    );
  }
  const safe = sanitizeUrl(src);
  if (!safe) {
    // Defensive: render a neutral surface rather than a broken <img>.
    return (
      <div
        aria-hidden
        className={cn("bg-secondary", className)}
      />
    );
  }
  return (
    <img
      src={safe}
      alt={alt}
      loading="lazy"
      className={cn("object-cover", className)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Trust panel                                   */
/* -------------------------------------------------------------------------- */

function EscrowTrustPanel({ total }: { total: string }) {
  return (
    <section className="rounded-lg bg-brand-pale p-5 text-brand-ink sm:p-6">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <h2 className="font-semibold">Your payment is protected</h2>
          <p className="mt-1 text-sm">
            You pay SafeSale, not the seller. Your <span className="font-semibold tabular-nums">{total}</span>{" "}
            is only released when you confirm the item arrived. If there's a problem, report it first and a
            mediator reviews it before any money moves.
          </p>
          <Link to="/how-it-works" className="mt-3 inline-block text-sm font-semibold underline-offset-4 hover:underline">
            How SafeSale works
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Spec row                                    */
/* -------------------------------------------------------------------------- */

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-body">{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] border-b border-line last:border-b-0">
      <dt className="bg-canvas-soft px-4 py-3 text-sm text-mute">
        {k}
      </dt>
      <dd className="px-4 py-3 text-sm text-ink">{v}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Loading + Not-found                               */
/* -------------------------------------------------------------------------- */

function PublicListingSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-20 sm:px-6 md:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <Skeleton className="aspect-square w-full rounded-2xl lg:aspect-[4/5]" />
        <div className="space-y-6">
          <div className="space-y-4 rounded-2xl border border-border bg-background p-6 sm:p-8">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-10 w-40" />
            <div className="flex items-center gap-3 pt-2">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ListingNotFound({ id }: { id: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 text-center">
      <div className="max-w-md">
        <Logo />
        <p className="mt-8 text-h2 text-ink">
          We couldn't find that listing
        </p>
        <p className="mt-2 text-body">
          {id ? "It may have been removed or the link is incorrect." : "No listing was specified."}
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function epochToIso(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString();
}
