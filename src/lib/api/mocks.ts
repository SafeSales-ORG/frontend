/**
 * Mock implementation of the SafeSale API, backed by the reactive
 * `marketStore`.
 *
 * Every call reads/writes the persistent, cross-tab store, so the mock
 * behaves like a real backend for the demo: orders persist across reloads,
 * the seller dashboard updates the instant a buyer acts, escrow earnings
 * move Locked → Available on completion, and disputes flow end-to-end.
 *
 * Payment is modelled as a Naira bank transfer (Nomba rail) — no crypto,
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
  AuthResponse,
  CreateListingRequest,
  CreateListingResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateSellerRequest,
  CreateSellerResponse,
  GetDisputesResponse,
  GetOrderResponse,
  GetSellerOrdersResponse,
  GetShopResponse,
  MarketplaceListing,
  GoogleAuthRequest,
  GoogleAuthResponse,
  LoginRequest,
  MeResponse,
  MockListingHint,
  OpenDisputeRequest,
  RegisterRequest,
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
  GetMySellerResponse,
  ApiSeller,
  UpdateShopProfileRequest,
  SellerPayout,
  DisputeParty,
  DisputeThreadMessage,
  AdminOverview,
  AdminOrderRow,
  AdminSellerRow,
  AdminRefund,
  ApiOrderStatus,
  GetDisputeThreadResponse,
  PostDisputeMessageRequest,
} from "./types";
import { ApiError } from "./errors";
import { waitingOn } from "@/lib/disputeThread";
import {
  generateOrderToken,
  marketIsoIn,
  marketNow,
  marketStore,
  type OrderEnvelope,
} from "@/lib/store/marketStore";
import { getSession } from "@/lib/auth/session";
import { bankNameFromCode } from "@/lib/nigeria";

/* Demo payout accounts — kept in this browser, last 4 digits only. */
const DEMO_PAYOUTS_KEY = "safesale:demo:payouts";

function readDemoPayouts(): Record<string, SellerPayout> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_PAYOUTS_KEY) ?? "{}") as Record<string, SellerPayout>;
  } catch {
    return {};
  }
}

function saveDemoPayout(sellerId: string, bankCode: string, accountNumber: string): void {
  const all = readDemoPayouts();
  all[sellerId] = {
    bankCode,
    bankName: bankCode ? bankNameFromCode(bankCode) : null,
    accountName: "Demo Account Holder",
    accountNumberLast4: accountNumber.slice(-4),
  };
  try {
    localStorage.setItem(DEMO_PAYOUTS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — demo only */
  }
}

/** The seller record for the signed-in demo user, or a 401/404 ApiError. */
function demoSessionSeller() {
  const session = getSession();
  if (!session) throw new ApiError("UNAUTHORIZED", "Not signed in.", 401);
  const seller = session.user.nostrNpub ? marketStore.getSellerByNpub(session.user.nostrNpub) : undefined;
  if (!seller) throw new ApiError("NOT_FOUND", "Seller profile not found.", 404);
  return seller;
}

/* ------------------------------ mock auth ----------------------------- */

/**
 * Deterministic pseudo-`npub` for demo mode. Same seed (email or Google id)
 * always yields the same key, so a seller who signs back in re-finds their
 * shop. This is NOT a real Nostr key — the backend mints the real one; the
 * mock only needs a stable identifier.
 */
function mockNpubFromSeed(seed: string): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `npub1mock${clean.slice(0, 24).padEnd(24, "0")}`;
}

function mockUserId(seed: string): string {
  return `usr_${seed.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
}

/** Opaque demo token — the real backend issues a signed JWT. */
function mockToken(userId: string): string {
  return `mock.${btoa(userId)}`;
}

function mockSession(email: string, seed: string): AuthResponse {
  const npub = mockNpubFromSeed(seed);
  return {
    token: mockToken(mockUserId(seed)),
    user: { id: mockUserId(seed), email, nostrNpub: npub },
  };
}

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
      createdAt: marketNow(),
    }
  );
}

/* ------------------------------ public API ----------------------------- */

/* ---------------------------- admin helpers ---------------------------- */

const ADMIN_HELD = new Set<ApiOrderStatus>(["paid", "shipped", "delivered", "disputed"]);

function adminOrderRow(e: ReturnType<typeof marketStore.allOrders>[number]): AdminOrderRow {
  return {
    ...e.order,
    seller: { id: e.seller.id, name: e.seller.name, handle: e.seller.handle },
    listingTitle: e.listing.title,
    disputeId: e.dispute?.id ?? null,
  };
}

/** Demo refunds: every decided dispute that sent money back to the buyer. */
function adminRefundsFromStore(): AdminRefund[] {
  return marketStore
    .allOrders()
    .filter((e) => (e.order.settlement?.buyerRefundNGN ?? 0) > 0)
    .map((e) => {
      const paid = marketStore.refundPaid(e.order.orderToken);
      return {
        id: "ref_" + e.order.orderToken.slice(0, 10),
        status: paid ? "succeeded" : "manual",
        amountNGN: e.order.settlement!.buyerRefundNGN,
        reference: paid?.reference ?? null,
        createdAt: e.order.refundedAt ?? e.order.updatedAt,
        paidAt: paid?.at ?? null,
        order: {
          shortId: e.order.shortId,
          orderToken: e.order.orderToken,
          buyerName: e.order.buyerName,
          buyerPhone: e.order.buyerPhone || null,
          buyerEmail: e.order.buyerEmail ?? null,
          sellerName: e.seller.name,
          disputeId: e.dispute?.id ?? null,
        },
      };
    });
}

/* --------------------------- dispute threads -------------------------- */

function formatNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

function caseMessage(
  role: DisputeThreadMessage["authorRole"],
  name: string,
  content: string,
  extra: Partial<DisputeThreadMessage> = {},
): DisputeThreadMessage {
  return {
    id: "msg_" + Math.random().toString(36).slice(2, 10),
    authorRole: role,
    authorName: name,
    content,
    attachments: [],
    requestFrom: null,
    createdAt: marketNow(),
    ...extra,
  };
}

function findDispute(disputeId: string) {
  const env = marketStore.allOrders().find((e) => e.dispute?.id === disputeId);
  if (!env || !env.dispute) throw new ApiError("DISPUTE_NOT_FOUND", "Dispute not found.", 404);
  return env as typeof env & { dispute: ApiDispute };
}

function authorName(role: DisputeParty, env: ReturnType<typeof findDispute>): string {
  return role === "buyer" ? env.order.buyerName : role === "seller" ? env.seller.name : "SafeSale mediator";
}

export const mockApi = {
  /** DEMO mock for POST /api/auth/register. Any valid email/password works. */
  async register(req: RegisterRequest): Promise<AuthResponse> {
    return mockSession(req.email, `email:${req.email}`);
  },

  /**
   * DEMO mock for POST /api/auth/login. In demo mode we accept any password
   * (there is no password store) and return a stable session for the email.
   */
  async login(req: LoginRequest): Promise<AuthResponse> {
    return mockSession(req.email, `email:${req.email}`);
  },

  /**
   * DEMO mock for GET /api/auth/me. Reflects the persisted demo session and
   * attaches the seller record if one exists for this user's npub.
   */
  async getMe(): Promise<MeResponse> {
    const session = getSession();
    if (!session) {
      throw new ApiError("UNAUTHORIZED", "Not signed in.", 401);
    }
    const { user } = session;
    const seller = user.nostrNpub
      ? marketStore.getSellerByNpub(user.nostrNpub)
      : null;
    return {
      user: {
        id: user.id,
        email: user.email,
        authProvider: "EMAIL",
        emailVerified: false,
        nostrNpub: user.nostrNpub,
        createdAt: marketNow(),
        seller: seller
          ? {
              id: seller.id,
              handle: seller.handle,
              name: seller.name,
              npub: seller.npub,
            }
          : null,
      },
    };
  },

  /**
   * DEMO mock for POST /api/auth/google. There is no real Google token to
   * verify in demo mode, so we key a stable session off the Google account
   * id (or email). Same account → same session → same shop.
   */
  async googleAuth(req: GoogleAuthRequest): Promise<GoogleAuthResponse> {
    const seed = `google:${req.googleId || req.email}`;
    return mockSession(req.email, seed);
  },

  async createSeller(req: CreateSellerRequest): Promise<CreateSellerResponse> {
    const existing = marketStore.getSellerByNpub(req.npub);
    if (existing) {
      // Returning the existing record is friendlier than a hard 409 for a
      // demo (re-opening a shop on the same key just signs you back in).
      return { seller: existing };
    }
    saveDemoPayout(`seller_${req.npub.slice(5, 21)}`, req.bankCode, req.bankAccountNumber);
    const seller = marketStore.upsertSeller({
      id: `seller_${req.npub.slice(5, 21)}`,
      npub: req.npub,
      pubkey: `pk_${req.npub.slice(5, 21)}`,
      handle: req.handle.toLowerCase(),
      name: req.name,
      location: req.location ?? "Nigeria",
      category: req.category ?? "General",
      bio: req.bio ?? null,
      verified: false,
      avatarUrl: req.avatarUrl ?? null,
      createdAt: marketNow(),
    });
    return { seller };
  },

  async updatePayout(req: UpdatePayoutRequest): Promise<void> {
    const seller = demoSessionSeller();
    const current = readDemoPayouts()[seller.id];
    saveDemoPayout(
      seller.id,
      req.bankCode ?? current?.bankCode ?? "",
      req.bankAccountNumber ?? `000000${current?.accountNumberLast4 ?? "0000"}`,
    );
  },

  async updateShopProfile(req: UpdateShopProfileRequest): Promise<{ seller: ApiSeller }> {
    const current = demoSessionSeller();
    const seller = marketStore.upsertSeller({
      ...current,
      ...(req.name !== undefined && { name: req.name }),
      ...(req.bio !== undefined && { bio: req.bio }),
      ...(req.delivery !== undefined && { delivery: req.delivery }),
      ...(req.avatar !== undefined && { avatarUrl: req.avatar }),
    });
    return { seller };
  },

  async getMySeller(): Promise<GetMySellerResponse> {
    const seller = demoSessionSeller();
    const payout = readDemoPayouts()[seller.id] ?? {
      bankCode: "",
      bankName: null,
      accountName: null,
      accountNumberLast4: "",
    };
    return { seller, payout };
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

  /** Demo: no server — the compressed data URL is the image. */
  async uploadImage(dataUrl: string): Promise<string> {
    return dataUrl;
  },

  async getMarketplace(): Promise<{ listings: MarketplaceListing[] }> {
    const listings = marketStore
      .listAllListings()
      .filter((l) => l.active !== false && l.inStock > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 60)
      .flatMap((l) => {
        const seller = marketStore.getSellerById(l.sellerId);
        return seller ? [{ ...l, seller }] : [];
      });
    return { listings };
  },

  async getMyListings(): Promise<{ listings: ApiListing[] }> {
    const session = getSession();
    if (!session) throw new ApiError("UNAUTHORIZED", "Not signed in.", 401);
    const seller = session.user.nostrNpub ? marketStore.getSellerByNpub(session.user.nostrNpub) : undefined;
    if (!seller) return { listings: [] };
    const listings = marketStore
      .listingsForSeller(seller.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { listings };
  },

  async getShop(handle: string): Promise<GetShopResponse | null> {
    const wanted = handle.toLowerCase();
    const seller = Object.values(marketStore.getSnapshot().sellersByNpub).find(
      (s) => s.handle.toLowerCase() === wanted,
    );
    if (!seller) return null;
    const listings = marketStore.listingsForSeller(seller.id).filter((l) => l.active !== false);
    return { seller, listings };
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
      paymentRef: null,
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
   * Nomba webhook would do on the real backend. Idempotent. Decrements
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

  /* ---------------------------- admin console --------------------------- */

  async getAdminOverview(): Promise<AdminOverview> {
    const all = marketStore.allOrders();
    const weekAgo = Date.now() - 7 * 86_400_000;
    const byStatus: AdminOverview["ordersByStatus"] = {};
    for (const e of all) byStatus[e.order.status] = (byStatus[e.order.status] ?? 0) + 1;
    const held = all.filter((e) => ADMIN_HELD.has(e.order.status)).reduce((n, e) => n + e.order.amountNGN, 0);
    const paidOutWeek = all
      .filter((e) => e.order.status === "completed" && new Date(e.order.releasedAt ?? e.order.updatedAt).getTime() >= weekAgo)
      .reduce((n, e) => n + (e.order.settlement?.sellerReleaseNGN ?? e.order.amountNGN), 0);
    const sellerIds = new Set(all.map((e) => e.seller.id));
    const shops = Object.values(marketStore.getSnapshot().sellersById).filter((s) => sellerIds.has(s.id) || !s.id.startsWith("sel_"));
    const refunds = adminRefundsFromStore().filter((r) => r.status !== "succeeded");
    return {
      heldNGN: held,
      paidOutWeekNGN: paidOutWeek,
      ordersByStatus: byStatus,
      totalOrders: all.length,
      sellers: shops.length,
      newSellersWeek: shops.filter((s) => new Date(s.createdAt).getTime() >= weekAgo).length,
      activeListings: marketStore.listAllListings().filter((l) => l.active !== false && l.inStock > 0).length,
      openDisputes: marketStore.disputes().length,
      refundsToPay: { count: refunds.length, amountNGN: refunds.reduce((n, r) => n + r.amountNGN, 0) },
      failedPayouts: 0,
      recentOrders: all.slice(0, 8).map(adminOrderRow),
    };
  },

  async getAdminOrders(params?: { status?: ApiOrderStatus; q?: string }): Promise<{ orders: AdminOrderRow[] }> {
    const q = params?.q?.trim().toLowerCase();
    const orders = marketStore
      .allOrders()
      .filter((e) => !params?.status || e.order.status === params.status)
      .filter(
        (e) =>
          !q ||
          [e.order.shortId, e.order.buyerName, e.seller.name, e.seller.handle, e.listing.title].some((v) =>
            v.toLowerCase().includes(q),
          ),
      )
      .map(adminOrderRow);
    return { orders };
  },

  async getAdminSellers(): Promise<{ sellers: AdminSellerRow[] }> {
    const all = marketStore.allOrders();
    const sellers = Object.values(marketStore.getSnapshot().sellersById).map((s) => {
      const mine = all.filter((e) => e.seller.id === s.id);
      return {
        id: s.id,
        name: s.name,
        handle: s.handle,
        email: null,
        verified: !!s.verified,
        bankName: null,
        accountNumberLast4: "",
        listings: marketStore.listingsForSeller(s.id).length,
        orders: mine.length,
        heldNGN: mine.filter((e) => ADMIN_HELD.has(e.order.status)).reduce((n, e) => n + e.order.amountNGN, 0),
        paidOutNGN: mine
          .filter((e) => e.order.status === "completed")
          .reduce((n, e) => n + (e.order.settlement?.sellerReleaseNGN ?? e.order.amountNGN), 0),
        disputes: mine.filter((e) => e.order.status === "disputed").length,
        createdAt: s.createdAt,
      };
    });
    sellers.sort((a, b) => b.orders - a.orders || b.createdAt.localeCompare(a.createdAt));
    return { sellers };
  },

  async getAdminRefunds(): Promise<{ refunds: AdminRefund[] }> {
    return { refunds: adminRefundsFromStore() };
  },

  async markRefundPaid(id: string, reference: string): Promise<{ ok: true }> {
    const refund = adminRefundsFromStore().find((r) => r.id === id);
    if (!refund) throw new ApiError("NOT_FOUND", "Refund not found.", 404);
    if (refund.status === "succeeded") throw new ApiError("CONFLICT", "This refund was already recorded as paid.", 409);
    marketStore.markRefundPaid(refund.order.orderToken, reference);
    if (refund.order.disputeId) {
      marketStore.addCaseMessages(refund.order.disputeId, [
        caseMessage("system", "SafeSale", `SafeSale sent the buyer's refund of ${formatNaira(refund.amountNGN)}.`),
      ]);
    }
    return { ok: true };
  },

  /**
   * Demo: there are no credentials to tell people apart, so the page says who
   * is looking (`as`). The real backend decides from the session / buyer link.
   */
  async getDisputeThread(
    disputeId: string,
    opts?: { buyerToken?: string; as?: DisputeParty },
  ): Promise<GetDisputeThreadResponse> {
    const env = findDispute(disputeId);
    const messages = marketStore.caseThread(disputeId);
    return {
      viewer: opts?.buyerToken ? "buyer" : (opts?.as ?? "seller"),
      dispute: env.dispute,
      waitingOn: waitingOn(env.dispute.status === "resolved", messages),
      messages,
    };
  },

  async postDisputeMessage(
    disputeId: string,
    req: PostDisputeMessageRequest,
    opts?: { buyerToken?: string; as?: DisputeParty },
  ): Promise<{ message: DisputeThreadMessage }> {
    const env = findDispute(disputeId);
    if (env.dispute.status === "resolved") throw new ApiError("DISPUTE_ALREADY_RESOLVED", "This case is closed.", 409);
    const role: DisputeParty = opts?.buyerToken ? "buyer" : (opts?.as ?? "seller");
    const requestFrom = role === "mediator" ? (req.requestFrom ?? null) : null;
    const message = caseMessage(role, authorName(role, env), req.content.trim(), {
      attachments: req.attachments ?? [],
      requestFrom,
    });
    marketStore.addCaseMessages(disputeId, [message]);

    const next = waitingOn(false, marketStore.caseThread(disputeId));
    let dispute: ApiDispute = env.dispute;
    if (requestFrom) {
      dispute = { ...dispute, status: "evidence_requested", evidenceDueAt: marketIsoIn(48 * 60 * 60 * 1000) };
    } else if (role === "mediator" && dispute.status !== "evidence_requested") {
      dispute = { ...dispute, status: "mediating" };
    } else if (dispute.status === "evidence_requested" && next.length === 1 && next[0] === "mediator") {
      dispute = { ...dispute, status: "mediating", evidenceDueAt: null };
    }
    if (role !== "mediator" && message.attachments.length) {
      const at = message.createdAt;
      dispute = {
        ...dispute,
        evidence: [...(dispute.evidence ?? []), ...message.attachments.map((url) => ({ url, by: role, at }))],
      };
    }
    if (dispute !== env.dispute) marketStore.patchEnvelope(env.order.orderToken, { dispute });
    return { message };
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
    const opener: DisputeParty = req.openedBy;
    marketStore.addCaseMessages(dispute.id, [
      caseMessage(
        "system",
        "SafeSale",
        `The ${opener} reported a problem. ${formatNaira(env.order.amountNGN)} stays held by SafeSale until a mediator decides. Everyone in this case can see these messages.`,
      ),
      caseMessage(opener, opener === "buyer" ? env.order.buyerName : env.seller.name, req.summary ? `${req.reason}\n\n${req.summary}` : req.reason, {
        attachments: req.evidence ?? [],
      }),
    ]);
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
      autoReleaseAt: marketIsoIn(7 * 24 * 60 * 60 * 1000),
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
    marketStore.addCaseMessages(disputeId, [
      caseMessage("seller", env.seller.name, req.message, { attachments: req.evidence ?? [] }),
    ]);
    return { order: updated.order, dispute: updatedDispute };
  },

  async getDisputes(): Promise<GetDisputesResponse> {
    const rows: AdminDisputeRow[] = marketStore.disputes().map((env) => {
      const msgs = marketStore.caseThread(env.dispute!.id);
      return {
        order: env.order,
        listing: env.listing,
        seller: env.seller,
        dispute: env.dispute!,
        thread: {
          count: msgs.filter((m) => m.authorRole !== "system").length,
          lastAt: msgs.at(-1)?.createdAt ?? null,
          lastFrom: msgs.at(-1)?.authorRole ?? null,
          waitingOn: waitingOn(false, msgs),
        },
      };
    });
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
        settlement: { outcome: req.outcome, buyerRefundNGN, sellerReleaseNGN },
      },
      dispute: updatedDispute,
    })!;

    const parts = [
      buyerRefundNGN > 0 && `${formatNaira(buyerRefundNGN)} back to the buyer`,
      sellerReleaseNGN > 0 && `${formatNaira(sellerReleaseNGN)} to the seller`,
    ].filter(Boolean);
    const decided = { refund_buyer: "refund the buyer in full", release_seller: "pay the seller in full", split: "split the money" }[req.outcome];
    marketStore.addCaseMessages(disputeId, [
      caseMessage("mediator", "SafeSale mediator", req.rationale),
      caseMessage("system", "SafeSale", `Case closed. The mediator decided to ${decided}: ${parts.join(" and ")}.`),
    ]);
    return { order: updated.order, dispute: updatedDispute };
  },
};
