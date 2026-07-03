/**
 * Mock implementation of the SafeSale API, backed by the reactive
 * `marketStore`.
 *
 * Every call reads/writes the persistent, cross-tab store, so the mock
 * behaves like a real backend for the demo: orders persist across reloads,
 * the seller dashboard updates the instant a buyer acts, escrow earnings
 * move Locked → Available on completion, and disputes flow end-to-end.
 *
 * Payment is modelled as a Naira bank transfer (MavaPay rail) — no crypto,
 * no sats. Lifecycle emails are sent by the real backend (Resend), so the
 * mock does not send any.
 *
 * Shapes returned here match `./types.ts` (the real backend contract) so a
 * single env-var flip (`VITE_API_URL` + `VITE_DEMO_MODE=false`) swaps in the
 * real backend with no component changes.
 */

import type {
  AdminDisputeRow,
  ApiDispute,
  ApiListing,
  ApiOrder,
  CreateListingRequest,
  CreateListingResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateSellerRequest,
  CreateSellerResponse,
  GetDisputesResponse,
  GetOrderResponse,
  GetSellerOrdersResponse,
  MockListingHint,
  OpenDisputeRequest,
  OpenDisputeResponse,
  PayInDetails,
  ReleaseOrderResponse,
  ResolveDisputeRequest,
  ResolveDisputeResponse,
  RespondToDisputeRequest,
  RespondToDisputeResponse,
  SellerOrderRow,
  ShipOrderRequest,
  ShipOrderResponse,
  SimulatePaymentResponse,
  UpdatePayoutRequest,
} from "./types";
import { ApiError } from "./errors";
import {
  generateOrderToken,
  marketIsoIn,
  marketNow,
  marketStore,
  type OrderEnvelope,
} from "@/lib/store/marketStore";

/* --------------------- listing-hint session bridge -------------------- */

/**
 * Register a listing the buyer flow discovered (e.g. published to Nostr by
 * the seller) but which isn't already in the store, so `createOrder` can
 * resolve it. The real backend ignores the hint — its DB already has the
 * listing.
 */
function registerHint(hint: MockListingHint): ApiListing {
  const now = marketNow();
  const listing: ApiListing = {
    id: hint.id,
    sellerId: hint.sellerId,
    title: hint.title,
    description: hint.description,
    priceNGN: hint.priceNGN,
    images: hint.images,
    category: hint.category,
    variants: hint.variants ?? null,
    inStock: hint.inStock ?? 1,
    delivery: hint.delivery ?? null,
    deliveryFee: hint.deliveryFee ?? 0,
    active: true,
    nostrEventId: null,
    createdAt: now,
    updatedAt: now,
  };
  marketStore.upsertListing(listing);

  // Synthesize a seller stub if we don't recognise this seller id.
  if (!marketStore.getSellerById(hint.sellerId) && hint.seller) {
    marketStore.upsertSeller({
      id: hint.sellerId,
      npub: hint.sellerId.startsWith("npub")
        ? hint.sellerId
        : `npub1hint${hint.sellerId.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
      pubkey: hint.sellerId,
      handle: hint.seller.handle ?? hint.sellerId.slice(0, 12),
      name: hint.seller.name ?? "Seller",
      location: hint.seller.location ?? "Nigeria",
      category: hint.category,
      bio: null,
      verified: hint.seller.verified ?? false,
      lnAddress: null,
      createdAt: now,
    });
  }
  return listing;
}

function sellerForListing(listing: ApiListing) {
  return (
    marketStore.getSellerById(listing.sellerId) ?? {
      id: listing.sellerId,
      npub: `npub1unknown${listing.sellerId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`,
      pubkey: listing.sellerId,
      handle: "seller",
      name: "Seller",
      location: "Nigeria",
      category: listing.category,
      bio: null,
      verified: false,
      lnAddress: null,
      createdAt: marketNow(),
    }
  );
}

/* ------------------------------ public API ----------------------------- */

export const mockApi = {
  async createSeller(req: CreateSellerRequest): Promise<CreateSellerResponse> {
    const existing = marketStore.getSellerByNpub(req.npub);
    if (existing) {
      // Returning the existing record is friendlier than a hard 409 for a
      // demo (re-opening a shop on the same key just signs you back in).
      return { seller: existing };
    }
    const seller = marketStore.upsertSeller({
      id: `seller_${req.npub.slice(5, 21)}`,
      npub: req.npub,
      pubkey: `pk_${req.npub.slice(5, 21)}`,
      handle: req.handle.toLowerCase(),
      name: req.name,
      location: req.location,
      category: req.category,
      bio: req.bio ?? null,
      verified: false,
      lnAddress: req.lnAddress ?? null,
      avatarUrl: req.avatarUrl ?? null,
      createdAt: marketNow(),
    });
    return { seller };
  },

  async updatePayout(
    _sellerId: string,
    _req: UpdatePayoutRequest,
  ): Promise<void> {
    // Demo: payout preference is reflected via the local seller record
    // (`useCurrentSeller`), which the Earnings page updates directly. There's
    // no separate persistence to do here, so this is a no-op.
    return;
  },

  async createListing(
    req: CreateListingRequest,
  ): Promise<CreateListingResponse> {
    const seller = marketStore.getSellerByNpub(req.sellerNpub);
    if (!seller) {
      throw new ApiError(
        "SELLER_NOT_FOUND",
        "Seller npub does not match any registered seller.",
        400,
      );
    }
    const id = `lst_${Math.random().toString(36).slice(2, 14)}`;
    const now = marketNow();
    const listing = marketStore.upsertListing({
      id,
      sellerId: seller.id,
      title: req.title,
      description: req.description,
      priceNGN: req.priceNGN,
      images: req.images,
      category: req.category,
      variants: req.variants ?? null,
      inStock: req.inStock ?? 1,
      delivery: req.delivery ?? null,
      deliveryFee: req.deliveryFee ?? 0,
      active: true,
      nostrEventId: null,
      createdAt: now,
      updatedAt: now,
    });
    return { listing };
  },

  /** Update a listing (edit / out-of-stock). Mock-only convenience. */
  async updateListing(
    id: string,
    patch: Partial<ApiListing>,
  ): Promise<CreateListingResponse> {
    const updated = marketStore.updateListing(id, patch);
    if (!updated) {
      throw new ApiError("LISTING_NOT_FOUND", `No listing "${id}".`, 404);
    }
    return { listing: updated };
  },

  /** Read a single listing — used by the buyer pages in demo mode. */
  async getListing(id: string): Promise<{ listing: ApiListing } | null> {
    const listing = marketStore.getListing(id);
    return listing ? { listing } : null;
  },

  async getSellerOrders(npub: string): Promise<GetSellerOrdersResponse> {
    const seller = marketStore.getSellerByNpub(npub);
    const ids = [seller?.id, npub, seller?.pubkey].filter(Boolean) as string[];
    const rows: SellerOrderRow[] = marketStore
      .ordersForSeller(ids)
      .map((env) => ({
        ...env.order,
        listing: env.listing,
        dispute: env.dispute,
      }));
    return { orders: rows };
  },

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
    // Only materialise a hinted listing when we don't already have it.
    // Seller-created listings already live in the store with the correct
    // seller link; re-registering the hint would overwrite that link with
    // the hint's pubkey-based sellerId and spawn a duplicate "Seller"
    // record — detaching the listing from the seller's dashboard and
    // showing a generated name to the buyer. Skip it when the listing
    // already exists.
    if (
      req._listingHint &&
      req._listingHint.id === req.listingId &&
      !marketStore.getListing(req.listingId)
    ) {
      registerHint(req._listingHint);
    }

    const listing = marketStore.getListing(req.listingId);
    if (!listing) {
      throw new ApiError(
        "LISTING_NOT_FOUND",
        `No listing with id "${req.listingId}".`,
        404,
      );
    }
    if (listing.inStock <= 0) {
      throw new ApiError(
        "OUT_OF_STOCK",
        "This item is out of stock.",
        409,
      );
    }

    const token = generateOrderToken();
    const shortId = "SS-" + Math.floor(Math.random() * 9000 + 1000).toString();
    const expiresAt = marketIsoIn(24 * 60 * 60 * 1000);
    const seller = sellerForListing(listing);
    const now = marketNow();
    const totalNGN = listing.priceNGN + (listing.deliveryFee ?? 0);

    const order: ApiOrder = {
      id: "ord_" + token.slice(0, 10),
      shortId,
      orderToken: token,
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerNpub: req.buyerNpub,
      buyerPubkey: `buyer-pk-${token.slice(0, 8)}`,
      buyerName: req.buyerName,
      buyerPhone: req.buyerPhone,
      buyerEmail: req.buyerEmail ?? null,
      buyerCity: req.buyerCity,
      buyerAddress: req.buyerAddress ?? null,
      contactMethod: req.contactMethod ?? "phone",
      variant: req.variant ?? null,
      // Escrow locks item + delivery so the buyer knows (and is protected
      // for) the full cost up front — no post-payment delivery surprises.
      itemNGN: listing.priceNGN,
      deliveryFee: listing.deliveryFee ?? 0,
      amountNGN: totalNGN,
      status: "pending_payment",
      mavapayPaymentRef: null,
      trackingNumber: null,
      carrier: null,
      shippedAt: null,
      releasedAt: null,
      refundedAt: null,
      autoReleaseAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };

    const env: OrderEnvelope = { order, listing, seller, dispute: null };
    marketStore.putOrder(env);

    const payIn: PayInDetails = {
      bankName: "Wema Bank",
      bankAccountNumber:
        "01" + Math.floor(Math.random() * 1e9).toString().padStart(8, "0").slice(0, 8),
      bankAccountName: `SafeSale Escrow / ${shortId}`,
      totalAmountKobo: totalNGN * 100,
      expiresAt,
    };

    return {
      orderToken: token,
      shortId,
      amountNGN: totalNGN,
      payIn,
      payInError: null,
    };
  },

  /**
   * Confirm the buyer's bank transfer → lock escrow. This is what the
   * MavaPay webhook would do on the real backend. Idempotent. Decrements
   * stock.
   */
  async confirmPayment(token: string): Promise<SimulatePaymentResponse> {
    const env = marketStore.getOrder(token);
    if (!env) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (env.order.status !== "pending_payment") {
      return { order: env.order, alreadyPaid: true }; // idempotent
    }
    // Decrement stock now that the sale is real.
    const stock = Math.max(0, env.listing.inStock - 1);
    marketStore.updateListing(env.listing.id, { inStock: stock });

    const next = marketStore.patchOrder(token, { status: "paid" });
    const fresh = next ?? marketStore.getOrder(token)!;
    return { order: fresh.order };
  },

  async getOrder(token: string): Promise<GetOrderResponse> {
    const env = marketStore.getOrder(token);
    if (!env) {
      throw new ApiError(
        "ORDER_NOT_FOUND",
        "We couldn't find that order link.",
        404,
      );
    }
    return env;
  },

  async releaseOrder(token: string): Promise<ReleaseOrderResponse> {
    const env = marketStore.getOrder(token);
    if (!env) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const { order } = env;
    if (order.status === "completed") {
      throw new ApiError(
        "ORDER_ALREADY_RELEASED",
        "This order has already been released.",
        409,
      );
    }
    if (!["shipped", "delivered", "paid"].includes(order.status)) {
      throw new ApiError(
        "ORDER_NOT_RELEASABLE",
        `Cannot release an order in status "${order.status}".`,
        409,
      );
    }
    const updated = marketStore.patchOrder(token, {
      status: "completed",
      releasedAt: marketNow(),
    })!;
    return {
      order: updated.order,
      txRef: `release-${updated.order.shortId}`,
    };
  },

  async openDispute(
    token: string,
    req: OpenDisputeRequest,
  ): Promise<OpenDisputeResponse> {
    const env = marketStore.getOrder(token);
    if (!env) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (env.dispute) {
      throw new ApiError(
        "DISPUTE_ALREADY_OPEN",
        "A dispute is already open for this order.",
        409,
      );
    }
    const openedAt = marketNow();
    const dispute: ApiDispute = {
      id: "dsp_" + token.slice(0, 6),
      orderId: env.order.id,
      reason: req.reason,
      summary: req.summary ?? null,
      openedBy: req.openedBy,
      priority: "medium",
      // Disputes go straight to the mediator queue for the demo so the
      // admin dashboard always has something actionable to show.
      status: "escalated",
      directResolutionUntil: marketIsoIn(72 * 60 * 60 * 1000),
      evidenceDueAt: null,
      isReturn: false,
      evidence: (req.evidence ?? []).map((url) => ({
        url,
        by: req.openedBy,
        at: openedAt,
      })),
      sellerResponse: null,
      returnEvidence: null,
      resolution: null,
      createdAt: openedAt,
      resolvedAt: null,
    };
    const updated = marketStore.patchEnvelope(token, {
      order: { ...env.order, status: "disputed", updatedAt: marketNow() },
      dispute,
    })!;
    return { order: updated.order, dispute };
  },

  async shipOrder(
    token: string,
    req: ShipOrderRequest,
  ): Promise<ShipOrderResponse> {
    const env = marketStore.getOrder(token);
    if (!env) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (env.order.status !== "paid") {
      throw new ApiError(
        "INVALID_REQUEST",
        `Cannot ship an order in status "${env.order.status}".`,
        409,
      );
    }
    const shippedAt = marketNow();
    const updated = marketStore.patchOrder(token, {
      status: "shipped",
      shippedAt,
      // Auto-release 3 days after shipment if the buyer takes no action.
      autoReleaseAt: marketIsoIn(3 * 24 * 60 * 60 * 1000),
      trackingNumber: req.trackingNumber ?? null,
      carrier: req.carrier ?? null,
    })!;
    return { order: updated.order };
  },

  /** Buyer marks the order delivered (shipped → delivered). Mock-only. */
  async deliverOrder(token: string): Promise<ShipOrderResponse> {
    const env = marketStore.getOrder(token);
    if (!env) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (env.order.status !== "shipped") {
      throw new ApiError(
        "INVALID_REQUEST",
        `Cannot mark delivered from "${env.order.status}".`,
        409,
      );
    }
    const updated = marketStore.patchOrder(token, { status: "delivered" })!;
    return { order: updated.order };
  },

  async respondToDispute(
    disputeId: string,
    req: RespondToDisputeRequest,
  ): Promise<RespondToDisputeResponse> {
    const env = marketStore
      .disputes()
      .find((e) => e.dispute?.id === disputeId);
    if (!env || !env.dispute) {
      throw new ApiError(
        "DISPUTE_NOT_FOUND",
        "No open dispute found for this id.",
        404,
      );
    }
    if (env.dispute.status === "resolved") {
      throw new ApiError(
        "DISPUTE_ALREADY_RESOLVED",
        "This dispute has already been resolved.",
        409,
      );
    }
    const at = marketNow();
    // Append the seller's counter-evidence to the shared evidence list.
    const sellerEvidence = (req.evidence ?? []).map((url) => ({
      url,
      by: "seller" as const,
      at,
    }));
    const updatedDispute: ApiDispute = {
      ...env.dispute,
      sellerResponse: req.message,
      evidence: [...(env.dispute.evidence ?? []), ...sellerEvidence],
      // A seller reply moves the case into active mediation.
      status: "mediating",
    };
    const updated = marketStore.patchEnvelope(env.order.orderToken, {
      order: { ...env.order, updatedAt: at },
      dispute: updatedDispute,
    })!;
    return { order: updated.order, dispute: updatedDispute };
  },

  async getDisputes(): Promise<GetDisputesResponse> {
    const rows: AdminDisputeRow[] = marketStore.disputes().map((env) => ({
      order: env.order,
      listing: env.listing,
      seller: env.seller,
      dispute: env.dispute!,
    }));
    return { disputes: rows };
  },

  async resolveDispute(
    disputeId: string,
    req: ResolveDisputeRequest,
  ): Promise<ResolveDisputeResponse> {
    const env = marketStore
      .disputes()
      .find((e) => e.dispute?.id === disputeId);
    if (!env || !env.dispute) {
      throw new ApiError(
        "DISPUTE_NOT_FOUND",
        "No open dispute found for this id.",
        404,
      );
    }
    const orderToken = env.order.orderToken;

    const amount = env.order.amountNGN;
    const buyerShare =
      req.outcome === "refund_buyer"
        ? 100
        : req.outcome === "release_seller"
          ? 0
          : Math.min(100, Math.max(0, req.splitPct ?? 50));
    const buyerRefundNGN = Math.round((amount * buyerShare) / 100);
    const sellerReleaseNGN = amount - buyerRefundNGN;
    const resolvedAt = marketNow();
    const nextStatus = req.outcome === "refund_buyer" ? "refunded" : "completed";

    const updatedDispute: ApiDispute = {
      ...env.dispute,
      status: "resolved",
      resolvedAt,
      resolution: {
        outcome: req.outcome,
        buyerRefundNGN,
        sellerReleaseNGN,
        reasoning: req.rationale,
        mediator: "SafeSale mediator",
        resolvedAt,
      },
    };

    const updated = marketStore.patchEnvelope(orderToken, {
      order: {
        ...env.order,
        status: nextStatus,
        refundedAt:
          req.outcome === "refund_buyer" ? resolvedAt : env.order.refundedAt,
        releasedAt:
          req.outcome === "refund_buyer" ? env.order.releasedAt : resolvedAt,
        updatedAt: resolvedAt,
      },
      dispute: updatedDispute,
    })!;

    return { order: updated.order, dispute: updatedDispute };
  },
};
