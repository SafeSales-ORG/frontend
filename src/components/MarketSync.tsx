/**
 * `<MarketSync />` — bridges the reactive market store to TanStack Query.
 *
 * The market store is the source of truth for the mock marketplace and
 * notifies on every change (including cross-tab `storage` events). This
 * component subscribes once, near the root, and invalidates the SafeSale
 * query namespace whenever the store changes — so every query-backed
 * surface (buyer order page, seller orders, etc.) refetches from the now-
 * updated mock and re-renders. That's what makes "buyer acts → seller
 * dashboard updates" feel instant without per-view wiring.
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { marketStore } from "@/lib/store/marketStore";

export function MarketSync() {
  const qc = useQueryClient();

  useEffect(() => {
    return marketStore.subscribe(() => {
      // Invalidate the whole SafeSale namespace; queries refetch from the
      // (synchronous, in-memory) mock so this is cheap and immediate.
      qc.invalidateQueries({ queryKey: ["safesale"] });
    });
  }, [qc]);

  return null;
}

export default MarketSync;
