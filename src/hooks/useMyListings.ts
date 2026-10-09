import { useQuery } from "@tanstack/react-query";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { apiClient } from "@/lib/api";
import type { ApiListing } from "@/lib/api/types";

export const MY_LISTINGS_KEY = ["safesale", "my-listings"] as const;

/**
 * The signed-in seller's listings from the API (`GET /api/listings/mine`;
 * the in-browser store in demo mode). Invalidate MY_LISTINGS_KEY after
 * creating or editing a listing.
 */
export function useMyListings(): { listings: ApiListing[]; isLoading: boolean } {
  const [seller] = useCurrentSeller();
  const query = useQuery({
    queryKey: [...MY_LISTINGS_KEY, seller?.id ?? ""],
    queryFn: () => apiClient.getMyListings(),
    enabled: !!seller,
    staleTime: 30_000,
  });
  return { listings: query.data?.listings ?? [], isLoading: query.isLoading };
}
