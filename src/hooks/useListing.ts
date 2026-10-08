/**
 * `useListing(id)` — fetch a SafeSale product listing by id via the API
 * client (real backend, or the in-memory mock in demo mode).
 *
 * Returns `null` when the listing doesn't exist; `PublicListing.tsx`
 * renders that as an honest "listing not found" state.
 */

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { marketStore } from "@/lib/store/marketStore";
import type { ApiListing } from "@/lib/api/types";

export interface ListingDetails {
  /** The UUID from the `d` tag — same as the URL slug. */
  id: string;
  /** Hex pubkey of the seller (event author). */
  sellerPubkey: string;
  title: string;
  summary?: string;
  /** Long-form Markdown description from the event content. */
  description: string;
  /** Image URLs (`image` tags). At least one. */
  images: string[];
  /** Price in NGN (integer naira). */
  priceNGN: number;
  /** From the `stock` tag. `out` → 0; missing → 1 per NIP.md. */
  inStock: number;
  category?: string;
  /** Free-form `t` tags. */
  tags: string[];
  /** Optional `delivery` tag (joined). */
  delivery?: string;
  /** Delivery fee in NGN (0 = free), known before payment. */
  deliveryFee?: number;
  /** Unix seconds — `published_at` tag or `created_at` of the event. */
  publishedAt: number;
  /**
   * @deprecated Always `false` now. Kept on the type so consumers don't
   * have to change shape; the fixture-fallback path was removed in the
   * 4-day demo bug-fix sprint. Remove this field in the post-submission
   * refactor pass.
   */
  fromFixture: boolean;
  /** Seller display info, populated when resolved from the market store. */
  sellerName?: string;
  sellerHandle?: string;
  sellerVerified?: boolean;
  sellerAvatarUrl?: string | null;
  /** Market-store seller id (for reputation lookup), when resolved from store. */
  sellerStoreId?: string;
}

/**
 * Convert a market-store `ApiListing` into the `ListingDetails` shape the
 * buyer pages render. Seed-based images become the `safesale://` placeholder
 * that `PublicListing` already knows how to draw; URL images pass through.
 */
function toListingDetails(listing: ApiListing): ListingDetails {
  const images = listing.images
    .map((img) =>
      img.url
        ? img.url
        : img.seed
          ? `safesale://fixture-image/${img.seed}`
          : "",
    )
    .filter(Boolean);
  const seller = marketStore.getSellerById(listing.sellerId);
  return {
    id: listing.id,
    sellerPubkey: seller?.pubkey ?? listing.sellerId,
    title: listing.title,
    summary: undefined,
    description: listing.description,
    images: images.length ? images : [`safesale://fixture-image/${listing.id}`],
    priceNGN: listing.priceNGN,
    inStock: listing.inStock,
    category: listing.category,
    tags: listing.variants ?? [],
    delivery: listing.delivery ?? undefined,
    deliveryFee: listing.deliveryFee ?? 0,
    publishedAt: Math.floor(new Date(listing.createdAt).getTime() / 1000),
    fromFixture: false,
    sellerName: seller?.name,
    sellerHandle: seller?.handle,
    sellerVerified: seller?.verified,
    sellerAvatarUrl: seller?.avatarUrl ?? null,
    sellerStoreId: listing.sellerId,
  };
}

/* --------------------------------- hook -------------------------------- */

export function useListing(id: string | undefined) {
  return useQuery<ListingDetails | null>({
    queryKey: ["safesale", "listing", id ?? ""],
    queryFn: async () => {
      if (!id) return null;

      try {
        const res = await apiClient.getListing(id);
        return res?.listing ? toListingDetails(res.listing) : null;
      } catch {
        return null;
      }
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
}
