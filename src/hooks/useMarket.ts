/**
 * Live React bindings over the market store. These use
 * `useSyncExternalStore`, so any component that calls them re-renders the
 * instant the store changes — in this tab or another (cross-tab `storage`
 * sync is handled inside the store).
 *
 * Use these for surfaces that must feel alive (seller dashboard, earnings,
 * order pages, listings). The TanStack-Query-backed `apiClient` hooks still
 * work and stay fresh via `<MarketSync />`; these are the lower-latency,
 * zero-config path when you just need the current state.
 */

import { useCallback, useSyncExternalStore } from "react";

import {
  computeEarnings,
  marketStore,
  type ChatMessage,
  type MarketState,
  type OrderEnvelope,
  type SellerEarnings,
  type StoreReview,
} from "@/lib/store/marketStore";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { nip19 } from "nostr-tools";

/** Subscribe to the whole market state. */
export function useMarketState(): MarketState {
  return useSyncExternalStore(
    marketStore.subscribe,
    marketStore.getSnapshot,
    marketStore.getSnapshot,
  );
}

function npubToHex(npub: string): string | undefined {
  try {
    const d = nip19.decode(npub);
    return d.type === "npub" ? (d.data as string) : undefined;
  } catch {
    return undefined;
  }
}

/** All identifiers that could refer to the logged-in seller's orders. */
function sellerIdentifiers(seller: {
  id: string;
  npub: string;
} | null): string[] {
  if (!seller) return [];
  const ids = [seller.id, seller.npub];
  const hex = npubToHex(seller.npub);
  if (hex) ids.push(hex);
  // The store seller may have its own id; resolve via npub too.
  const stored = marketStore.getSellerByNpub(seller.npub);
  if (stored) ids.push(stored.id, stored.pubkey);
  return ids;
}

/** The logged-in seller's orders, live + newest first. */
export function useSellerOrdersLive(): OrderEnvelope[] {
  const [seller] = useCurrentSeller();
  useMarketState(); // re-render on any store change
  return marketStore.ordersForSeller(sellerIdentifiers(seller));
}

/** The logged-in seller's listings, live. */
export function useSellerListingsLive() {
  const [seller] = useCurrentSeller();
  const state = useMarketState();
  if (!seller) return [];
  const stored = marketStore.getSellerByNpub(seller.npub);
  const sellerIds = new Set(
    [seller.id, stored?.id].filter(Boolean) as string[],
  );
  return Object.values(state.listings)
    .filter((l) => sellerIds.has(l.sellerId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/** Live earnings for the logged-in seller (locked / available / paid out). */
export function useSellerEarningsLive(): SellerEarnings {
  const [seller] = useCurrentSeller();
  useMarketState();
  const orders = marketStore.ordersForSeller(sellerIdentifiers(seller));
  const stored = seller ? marketStore.getSellerByNpub(seller.npub) : undefined;
  const payouts = stored ? marketStore.payoutsForSeller(stored.id) : [];
  return computeEarnings(orders, payouts);
}

/** Live open-dispute queue (for the mediator/admin surface). */
export function useDisputesLive(): OrderEnvelope[] {
  useMarketState();
  return marketStore.disputes();
}

/** A single order envelope, live. */
export function useOrderLive(token: string | undefined): OrderEnvelope | undefined {
  useMarketState();
  return token ? marketStore.getOrder(token) : undefined;
}

/** Live chat thread for an order. */
export function useMessagesLive(token: string | undefined): ChatMessage[] {
  useMarketState();
  return token ? marketStore.messagesForOrder(token) : [];
}

/** Live reviews for the logged-in seller. */
export function useSellerReviewsLive(): StoreReview[] {
  const [seller] = useCurrentSeller();
  useMarketState();
  const stored = seller ? marketStore.getSellerByNpub(seller.npub) : undefined;
  const id = stored?.id ?? seller?.id;
  return id ? marketStore.reviewsForSeller(id) : [];
}

/** Live reputation (rating / review count / completed) for any seller id. */
export function useSellerReputationLive(sellerId: string | undefined) {
  useMarketState();
  return sellerId
    ? marketStore.sellerReputation(sellerId)
    : { rating: 0, reviewCount: 0, completedOrders: 0 };
}

/** The review for a given order, live (so the form swaps to a thank-you). */
export function useReviewForOrderLive(
  token: string | undefined,
): StoreReview | undefined {
  useMarketState();
  return token ? marketStore.reviewForOrder(token) : undefined;
}

/** Imperative helper to record a cash-out for the current seller. */
export function useCashOut() {
  const [seller] = useCurrentSeller();
  return useCallback(
    (amountNGN: number) => {
      const stored = seller ? marketStore.getSellerByNpub(seller.npub) : undefined;
      const id = stored?.id ?? seller?.id;
      if (!id) return;
      marketStore.recordPayout({
        id: `pay_${Math.random().toString(36).slice(2, 10)}`,
        sellerId: id,
        amountNGN,
        at: new Date().toISOString(),
      });
    },
    [seller],
  );
}
