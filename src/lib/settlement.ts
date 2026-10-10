import type { ApiOrder } from "@/lib/api/types";

/**
 * What the seller actually receives for an order. A dispute decision can
 * split the money, so a "completed" order isn't always the full amount.
 */
export function sellerTakeNGN(order: Pick<ApiOrder, "amountNGN" | "status" | "settlement">): number {
  if (order.settlement) return order.settlement.sellerReleaseNGN;
  if (order.status === "refunded") return 0;
  return order.amountNGN;
}

/** True when a mediator divided the money between buyer and seller. */
export function isSplit(order: Pick<ApiOrder, "settlement">): boolean {
  const s = order.settlement;
  return !!s && s.buyerRefundNGN > 0 && s.sellerReleaseNGN > 0;
}
