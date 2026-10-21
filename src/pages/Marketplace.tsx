/**
 * Marketplace — `/market`. Newest live listings across all shops
 * (`GET /api/listings`), with search and category filters. Buyers need no
 * account: a product opens its buy page.
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Search, ShieldCheck, Store } from "lucide-react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { Avatar } from "@/components/safesale/Avatar";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api";
import type { MarketplaceListing } from "@/lib/api/types";
import { formatNGN } from "@/lib/format";
import { cn, sanitizeUrl } from "@/lib/utils";

export default function Marketplace() {
  useSeoMeta({
    title: "Marketplace — SafeSale",
    description: "Shop from social-commerce sellers. Every purchase is protected by SafeSale escrow.",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["safesale", "marketplace"],
    queryFn: () => apiClient.getMarketplace(),
  });
  const listings = useMemo(() => data?.listings ?? [], [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) if (l.category) set.add(l.category);
    return ["all", ...Array.from(set).sort()];
  }, [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
      if (category !== "all" && l.category !== category) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.seller.name.toLowerCase().includes(q)
      );
    });
  }, [listings, query, category]);

  return (
    <MarketingLayout>
      <section className="bg-mint">
        <div className="container py-12 md:py-16">
          <h1 className="text-display-md text-forest sm:text-display-lg">Shop without the fear.</h1>
          <p className="mt-3 flex items-center gap-2 text-lg text-forest/80">
            <ShieldCheck className="h-5 w-5" aria-hidden />
            Every purchase is held by SafeSale until you confirm it arrived.
          </p>
          <div className="relative mt-8 max-w-2xl">
            <Search className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-mute" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products or shops"
              aria-label="Search products or shops"
              className="h-14 rounded-full border-0 bg-canvas pl-13 text-base shadow-[var(--shadow-float)]"
            />
          </div>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]" role="tablist" aria-label="Categories">
          {categories.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                className={cn(
                  "relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active ? "text-mint" : "bg-canvas text-body hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="market-category"
                    className="absolute inset-0 rounded-full bg-forest"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{c === "all" ? "All" : capitalize(c)}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-mute" aria-live="polite">
          {isLoading ? "Loading products…" : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
        </p>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-square rounded-lg" />
                <Skeleton className="mt-3 h-4 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-lg bg-canvas px-6 py-16 text-center">
            <Store className="mx-auto h-6 w-6 text-mute" aria-hidden />
            <p className="mt-3 text-h3 text-ink">{listings.length === 0 ? "No products yet" : "Nothing matches that"}</p>
            <p className="mt-1 text-body">
              {listings.length === 0 ? "New products from sellers appear here." : "Try another search or category."}
            </p>
          </div>
        ) : (
          <motion.ul layout className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((l, i) => (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.03, ease: [0.2, 0, 0, 1] }}
                  whileHover={{ y: -4 }}
                >
                  <ProductCard listing={l} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
    </MarketingLayout>
  );
}

function ProductCard({ listing }: { listing: MarketplaceListing }) {
  const avatar = sanitizeUrl(listing.seller.avatarUrl);
  return (
    <Link to={`/buy/${listing.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-canvas">
        <ListingThumb
          image={listing.images[0]}
          alt={listing.title}
          size={600}
          fill
          className="transition-transform duration-500 group-hover:scale-105"
        />
        {listing.category && (
          <span className="absolute top-3 left-3 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-medium text-ink">
            {capitalize(listing.category)}
          </span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 font-medium text-ink group-hover:underline">{listing.title}</p>
      <p className="mt-1 font-semibold text-ink tabular-nums">{formatNGN(listing.priceNGN)}</p>
      <div className="mt-2 flex items-center gap-2 text-sm text-mute">
        {avatar ? (
          <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <Avatar seed={listing.seller.npub} name={listing.seller.name} size={20} />
        )}
        <span className="truncate">{listing.seller.name}</span>
      </div>
    </Link>
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
