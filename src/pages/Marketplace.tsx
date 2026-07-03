/**
 * Buyer Marketplace — `/market`.
 *
 * The buyer's browse surface: every live listing in the marketplace, with
 * search + category filter. Buyers don't need an account — they tap a
 * product, land on the public listing, and check out via the secret order
 * link (the product's USP). Sellers reach their own dashboard via "Start
 * selling" / Sign in instead.
 *
 * Reads live from the market store, so a seller publishing a new product
 * (or editing / marking it out of stock) reflects here instantly.
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, Store } from "lucide-react";

import { MarketingLayout } from "@/components/safesale/MarketingLayout";
import { Avatar } from "@/components/safesale/Avatar";
import { ProductImage } from "@/components/safesale/ProductImage";
import { Input } from "@/components/ui/input";
import { useMarketState } from "@/hooks/useMarket";
import { marketStore } from "@/lib/store/marketStore";
import type { ApiListing, ApiListingImage } from "@/lib/api/types";
import { formatNGN } from "@/lib/format";
import { hashStr } from "@/lib/seeded";
import { cn, sanitizeUrl } from "@/lib/utils";

export default function Marketplace() {
  useSeoMeta({
    title: "Marketplace — SafeSale",
    description:
      "Browse social-commerce listings. Pay safely with SafeSale escrow.",
  });

  const state = useMarketState();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const listings = useMemo(
    () =>
      Object.values(state.listings)
        .filter((l) => l.active)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [state.listings],
  );

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
        l.description.toLowerCase().includes(q)
      );
    });
  }, [listings, query, category]);

  return (
    <MarketingLayout>
      <div className="container py-8 sm:py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Marketplace
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Every purchase is protected by SafeSale escrow.
          </p>
        </header>

        {/* Search + categories */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="h-11 pl-10"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium capitalize transition-colors",
                  category === c
                    ? "border-brand bg-brand-soft text-brand-soft-foreground"
                    : "border-border bg-white text-ink-soft hover:text-ink",
                )}
              >
                {c === "all" ? "All categories" : c}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-soft">
              <Store className="h-7 w-7" />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">
              {query || category !== "all"
                ? "No products match your search"
                : "No products listed yet"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
              {query || category !== "all"
                ? "Try a different search or category."
                : "Be the first — open a shop and list something."}
            </p>
            <Link
              to="/onboarding"
              className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
            >
              Start selling
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((l) => (
              <MarketCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </MarketingLayout>
  );
}

function MarketCard({ listing }: { listing: ApiListing }) {
  const seller = marketStore.getSellerById(listing.sellerId);
  const isOut = listing.inStock <= 0;
  return (
    <Link
      to={`/buy/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        <CardImage image={listing.images[0]} alt={listing.title} />
        {isOut && (
          <span className="absolute left-0 top-3 rounded-r-md bg-amber-100/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 shadow-sm">
            Out of stock
          </span>
        )}
        {listing.category && (
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold capitalize text-white">
            {listing.category}
          </span>
        )}
      </div>
      <div className="flex-1 space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-brand">
          {listing.title}
        </p>
        <p className="text-base font-semibold tabular-nums text-ink">
          {formatNGN(listing.priceNGN)}
        </p>
        {seller && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Avatar
              seed={seller.handle}
              name={seller.name}
              size={18}
              src={seller.avatarUrl}
            />
            <p className="truncate text-xs text-ink-soft">{seller.name}</p>
          </div>
        )}
      </div>
    </Link>
  );
}

/** Render a listing's first image: real URL, or a deterministic gradient. */
function CardImage({
  image,
  alt,
}: {
  image: ApiListingImage | undefined;
  alt: string;
}) {
  const url = image?.url ? sanitizeUrl(image.url) : undefined;
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  const seed = image?.seed ?? alt;
  const h = hashStr(seed);
  return (
    <ProductImage
      image={{ seed, hueA: h % 360, hueB: (h >> 8) % 360, label: "" }}
      className="h-full w-full"
      rounded="rounded-none"
    />
  );
}
