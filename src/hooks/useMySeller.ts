import { useQuery } from "@tanstack/react-query";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { apiClient } from "@/lib/api";

export const MY_SELLER_KEY = ["safesale", "my-seller"] as const;

/** The signed-in seller's own profile + payout account (`GET /api/sellers/me`). */
export function useMySeller() {
  const [seller] = useCurrentSeller();
  return useQuery({ queryKey: MY_SELLER_KEY, queryFn: () => apiClient.getMySeller(), enabled: !!seller });
}
