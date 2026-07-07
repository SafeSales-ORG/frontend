/**
 * `useSellerOrders` — the logged-in seller's order feed.
 *
 * Backed by `GET /api/orders/seller/:npub` (see `apiClient.getSellerOrders`).
 * Returns a TanStack Query result whose `data` is the array of
 * `SellerOrderRow` (each row already joined with its listing + dispute,
 * matching the backend's `include: { listing: true, dispute: true }`).
 *
 * Identity: pulled from `useCurrentSeller()`. If the seller hasn't
 * completed onboarding the query is disabled and returns `data:
 * undefined`. The dashboard handles that as the "not signed up yet"
 * state — same surface as an empty seller.
 *
 * Polling: 15s. The dashboard is the seller's main monitoring surface;
 * they should see new payment-locked orders appear without refreshing.
 * Stops polling on tab hidden via TanStack's default
 * `refetchIntervalInBackground: false`.
 */

import { useQuery } from "@tanstack/react-query";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { apiClient, type SellerOrderRow } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";

export interface UseSellerOrdersResult {
  /** All orders for this seller, newest first. Empty array when none. */
  orders: SellerOrderRow[];
  /** True while the first fetch is in flight (no data yet). */
  isLoading: boolean;
  /** True if a follow-up fetch is in flight (background refresh). */
  isFetching: boolean;
  /** Last error (if any). */
  error: unknown;
  /** Manual refresh trigger — e.g. after `shipOrder`. */
  refetch: () => void;
}

export function useSellerOrders(): UseSellerOrdersResult {
  const [seller] = useCurrentSeller();
  const npub = seller?.npub;

  const query = useQuery<{ orders: SellerOrderRow[]; _endpointMissing?: boolean }>({
    queryKey: ["safesale", "seller-orders", npub ?? ""],
    enabled: !!npub,
    queryFn: async () => {
      try {
        return await apiClient.getSellerOrders(npub as string);
      } catch (err) {
        // The backend has no `GET /api/orders/seller/:npub` route yet, so it
        // 404s. Treat that as an empty feed so the dashboard renders its
        // "no orders yet" state instead of an error, and flag it so we stop
        // polling (no 15s console-spam). Self-heals once the backend adds the
        // route (see PROGRESS.md backend handoff).
        if (err instanceof ApiError && err.status === 404) {
          return { orders: [], _endpointMissing: true };
        }
        throw err;
      }
    },
    // Poll every 15s for new orders, but stop once we know the route is missing.
    refetchInterval: (query) =>
      query.state.data?._endpointMissing ? false : 15_000,
    staleTime: 10_000,
  });

  return {
    orders: query.data?.orders ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
