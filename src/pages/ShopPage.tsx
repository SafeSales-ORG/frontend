import { useSeoMeta } from "@unhead/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { BadgeCheck, Share2, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/safesale/Logo";
import { Avatar } from "@/components/safesale/Avatar";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import type { ApiListing } from "@/lib/api/types";
import { formatNGN } from "@/lib/format";
import { shopUrl } from "@/lib/links";
import { sanitizeUrl } from "@/lib/utils";

/** Public shop page at /s/:handle — the link sellers put in their bio. */
export default function ShopPage() {
  const { handle = "" } = useParams<{ handle: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["safesale", "shop", handle],
    queryFn: () => apiClient.getShop(handle),
    enabled: handle.length > 0,
  });

  useSeoMeta({
    title: data ? `${data.seller.name} — SafeSale` : "Shop — SafeSale",
    description: data ? `Shop ${data.seller.name} on SafeSale. Every order is protected by escrow.` : undefined,
  });

  return (
    <div className="min-h-screen bg-canvas-soft">
      <header className="border-b border-line bg-canvas">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" aria-label="SafeSale home">
            <Logo />
          </Link>
          {data && <ShareButton handle={data.seller.handle} name={data.seller.name} />}
        </div>
      </header>

      {isLoading ? (
        <ShopSkeleton />
      ) : !data ? (
        <ShopNotFound />
      ) : (
        <>
          <section className="bg-mint">
            <div className="container flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:py-14">
              {data.seller.avatarUrl ? (
                <img
                  src={sanitizeUrl(data.seller.avatarUrl) ?? undefined}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-canvas"
                />
              ) : (
                <Avatar seed={data.seller.npub} name={data.seller.name} size={80} />
              )}
              <div className="min-w-0">
                <h1 className="text-h1 text-forest sm:text-display-lg">{data.seller.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-forest/80">
                  <span>@{data.seller.handle}</span>
                  {data.seller.verified && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
                      <BadgeCheck className="h-4 w-4" aria-hidden /> Verified seller
                    </span>
                  )}
                </p>
                {data.seller.bio && <p className="mt-3 max-w-2xl text-forest/80">{data.seller.bio}</p>}
              </div>
            </div>
          </section>

          <main className="container py-10">
            <p className="mb-8 flex items-start gap-3 rounded-lg bg-canvas p-4 text-sm text-body">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              Every order here is protected by SafeSale. You pay SafeSale, and {data.seller.name} is only paid
              after you confirm your order arrived.
            </p>

            {data.listings.length === 0 ? (
              <div className="rounded-lg bg-canvas px-6 py-16 text-center">
                <p className="text-h3 text-ink">No products yet</p>
                <p className="mt-2 text-body">Check back soon — this shop hasn't listed anything.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                {data.listings.map((listing, i) => (
                  <motion.li
                    key={listing.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}
                  >
                    <ProductCard listing={listing} />
                  </motion.li>
                ))}
              </ul>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function ProductCard({ listing }: { listing: ApiListing }) {
  const soldOut = listing.inStock === 0;
  return (
    <Link to={`/buy/${listing.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-canvas">
        <ListingThumb
          image={listing.images[0]}
          alt={listing.title}
          size={600} fill className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {soldOut && (
          <span className="absolute top-3 left-3 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-body">
            Sold out
          </span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 font-medium text-ink group-hover:underline">{listing.title}</p>
      <p className="mt-1 font-semibold text-ink tabular-nums">{formatNGN(listing.priceNGN)}</p>
    </Link>
  );
}

function ShareButton({ handle, name }: { handle: string; name: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const url = shopUrl(handle);
        if (navigator.share) {
          navigator.share({ title: name, url }).catch(() => {});
        } else {
          void navigator.clipboard?.writeText(url).then(() => toast({ title: "Shop link copied" }));
        }
      }}
    >
      <Share2 /> Share
    </Button>
  );
}

function ShopSkeleton() {
  return (
    <div className="container py-10">
      <div className="flex items-center gap-6">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ShopNotFound() {
  return (
    <div className="container py-24 text-center">
      <p className="text-h2 text-ink">We couldn't find that shop</p>
      <p className="mt-2 text-body">Check the link, or ask the seller to send it again.</p>
      <Button asChild className="mt-6">
        <Link to="/">Go to SafeSale</Link>
      </Button>
    </div>
  );
}
