/**
 * SafeSale API DTOs.
 *
 * Mirrors the shapes returned by the SafeSale backend on
 * `origin/backend` (Fastify + Prisma + Postgres). Specifically:
 *
 *   - `prisma/schema.prisma`  — the `Order`, `Listing`, `Seller`,
 *     `Dispute` models + `EscrowStatus`/`DisputeStatus` enums.
 *   - `src/routes/orders.ts`   — POST /api/orders, GET /api/orders/:token,
 *                                ship | release | dispute
 *   - `src/routes/listings.ts` — POST /api/listings, GET /api/listings/:id
 *   - `src/routes/sellers.ts`  — POST /api/sellers, GET /api/sellers/:handle
 *
 * Keep this file in lockstep with that schema. When the backend evolves,
 * update it here in the same PR — the build will catch every consumer.
 *
 * Buyer-slice endpoints are typed in full. Seller and admin endpoints
 * are added as those flows are wired (currently just enough to make the
 * checkout → buyer-order flow work end-to-end).
 */

/* --------------------------------- enums ------------------------------- */

/** Mirrors prisma `EscrowStatus`. 7 values, no aliases. */
export type ApiOrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "delivered"
  | "completed"
  | "disputed"
  | "refunded";

/** Mirrors prisma `DisputeStatus`. */
export type ApiDisputeStatus =
  | "direct_resolution"
  | "escalated"
  | "evidence_requested"
  | "mediating"
  | "resolved";

/* -------------------------------- entities ----------------------------- */

/** A listing image as stored in `Listing.images` (Json field). */
export interface ApiListingImage {
  url?: string;
  /** Deterministic seed used by `ProductImage` when no URL is present. */
  seed?: string;
  alt?: string;
}

/** Subset of `Seller` returned by `GET /api/orders/:token` (no payout details). */
export interface ApiSeller {
  id: string;
  npub: string;
  pubkey: string;
  handle: string;
  name: string;
  location: string;
  category: string;
  bio?: string | null;
  verified: boolean;
  /** Shop avatar / profile image URL (https). */
  avatarUrl?: string | null;
  createdAt: string;
}

/** Subset of `Listing` returned by `GET /api/orders/:token`. */
export interface ApiListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceNGN: number;
  images: ApiListingImage[];
  category: string;
  variants?: string[] | null;
  inStock: number;
  delivery?: string | null;
  /** Delivery fee in NGN, shown to the buyer before payment. 0 = free. */
  deliveryFee?: number;
  active: boolean;
  nostrEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `Order` row from the backend. Mirrors prisma `Order` (Nomba rail).
 * Payment is a Naira bank transfer via Nomba — there is no crypto,
 * no sats, and no bearer token held server-side.
 */
export interface ApiOrder {
  id: string;
  shortId: string;
  /**
   * URL-safe secret. This is the buyer's only credential — possession
   * of the token IS the auth. Present in the URL at /order/:token.
   */
  orderToken: string;

  listingId: string;
  sellerId: string;

  /** Bech32 of the buyer's one-time Nostr key (order identity / DM target). */
  buyerNpub: string;
  /** Hex form of the same key. */
  buyerPubkey: string;

  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  buyerCity: string;
  buyerAddress?: string | null;
  contactMethod?: "phone" | "email" | null;

  variant?: string | null;

  /** Item subtotal in NGN (before delivery). */
  itemNGN?: number;
  /** Delivery fee locked into escrow alongside the item. */
  deliveryFee?: number;
  /** Total NGN locked in escrow (item + delivery). */
  amountNGN: number;

  status: ApiOrderStatus;

  /** Nomba transaction reference, set once the pay-in webhook confirms. */
  nombaPaymentRef?: string | null;

  trackingNumber?: string | null;
  carrier?: string | null;

  shippedAt?: string | null;
  releasedAt?: string | null;
  refundedAt?: string | null;

  /** 7 days after `shippedAt` — silent-buyer auto-release deadline. */
  autoReleaseAt?: string | null;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
}

/** One piece of dispute evidence (an uploaded image), tagged by uploader. */
export interface ApiDisputeEvidence {
  url: string;
  by: "buyer" | "seller";
  at: string;
}

/** A `Dispute` row, nullable on the order envelope. */
export interface ApiDispute {
  id: string;
  orderId: string;
  reason: string;
  summary?: string | null;
  openedBy: "buyer" | "seller";
  priority: "low" | "medium" | "high";
  status: ApiDisputeStatus;
  directResolutionUntil?: string | null;
  evidenceDueAt?: string | null;
  isReturn: boolean;
  /** Photo evidence references (Blossom URLs), tagged by uploader. */
  evidence?: ApiDisputeEvidence[];
  /** The seller's written response to the dispute. */
  sellerResponse?: string | null;
  /** Photo evidence references (Blossom URLs etc.). Shape evolves with the dispute flow. */
  returnEvidence?: unknown;
  /** Final outcome JSON, populated only when `status === 'resolved'`. */
  resolution?: unknown;
  createdAt: string;
  resolvedAt?: string | null;
}

/* ------------------------- request / response shapes ------------------- */

/**
 * Subset of an `ApiListing` that the mock client can use to register a
 * newly-discovered listing in its in-memory store. Only relevant when
 * the listing didn't come from a fixture — e.g. it was just published
 * to Nostr by the seller and the buyer found it via the relay. The
 * real backend ignores this field; on Postgres the listing already
 * exists (the seller's POST /api/listings created it). This is the
 * "bridge" that lets the mock pretend it has a backend DB without
 * forcing the buyer flow to know which world it's in.
 */
export interface MockListingHint {
  /** Same as CreateOrderRequest.listingId; carried for clarity. */
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceNGN: number;
  /** Mix of URL-based and seed-based images is fine. */
  images: ApiListingImage[];
  category: string;
  variants?: string[] | null;
  inStock?: number;
  delivery?: string | null;
  deliveryFee?: number;
  /** Optional seller-side display info for the mock seller stub. */
  seller?: {
    name?: string;
    handle?: string;
    location?: string;
    verified?: boolean;
  };
}

/**
 * `POST /api/orders` request body. Field names match the Zod schema in
 * `backend/src/routes/orders.ts::CreateOrderSchema`.
 *
 * The optional `_listingHint` field is **mock-only** and is stripped
 * by the real HTTP client before serialization. See `MockListingHint`
 * for why it exists.
 */
export interface CreateOrderRequest {
  /** cuid from `GET /api/listings/:id`. */
  listingId: string;
  /** Bech32 of the buyer's one-time Nostr key (generated in browser). */
  buyerNpub: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  buyerCity: string;
  buyerAddress?: string;
  contactMethod?: "phone" | "email";
  variant?: string;

  /** @internal — mock-only. The HTTP client strips this. */
  _listingHint?: MockListingHint;
}

/**
 * Nomba pay-in bank details the buyer transfers Naira to. Returned by
 * `POST /api/orders` under `payIn` (null if the Nomba quote failed —
 * see `payInError`). Mirrors the quote shape in `routes/orders.ts`.
 */
export interface PayInDetails {
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  /** Total to transfer, in kobo (NGN × 100). */
  totalAmountKobo: number;
  /**
   * When the pay-in account expires (ISO). The real backend's virtual-account
   * response doesn't include one, so this is optional — the checkout UI falls
   * back to a client-side placeholder when it's absent.
   */
  expiresAt?: string;
}

/**
 * `POST /api/orders` response body — flat, no nested `order`. Mirrors
 * the explicit return statement in `routes/orders.ts`.
 */
export interface CreateOrderResponse {
  orderToken: string;
  shortId: string;
  amountNGN: number;
  /** Bank-transfer details, or null if the Nomba quote failed. */
  payIn: PayInDetails | null;
  /** Set when `payIn` is null — the reason the quote could not be created. */
  payInError?: string | null;
}

/**
 * `GET /api/orders/:token` response — the envelope this page is built
 * around. Buyer Order Page, Seller Orders, and Admin Dispute Detail
 * all rely on this shape.
 */
export interface GetOrderResponse {
  order: ApiOrder;
  listing: ApiListing;
  seller: ApiSeller;
  /** Null when no dispute has been opened on this order. */
  dispute: ApiDispute | null;
}

/**
 * `POST /api/orders/:token/simulate-payment` response. DEMO-only on the
 * backend — marks an order paid without a real bank transfer so the
 * escrow flow can be walked on a demo link.
 */
export interface SimulatePaymentResponse {
  order: ApiOrder;
  alreadyPaid?: boolean;
}

/**
 * `POST /api/orders/:token/release` response.
 *
 * Release takes no request body — possession of the `orderToken` in the
 * URL is the buyer's authority. The backend triggers the Nomba payout
 * to the seller's bank and flips the order to `completed`.
 */
export interface ReleaseOrderResponse {
  order: ApiOrder;
  /** Backend-generated reference for receipts (e.g. "release-<id>"). */
  txRef: string;
}

/** `POST /api/orders/:token/ship` — seller-side. */
export interface ShipOrderRequest {
  trackingNumber?: string;
  carrier?: string;
}

export interface ShipOrderResponse {
  order: ApiOrder;
}

/** `POST /api/orders/:token/dispute` */
export interface OpenDisputeRequest {
  reason: string;
  summary?: string;
  openedBy: "buyer" | "seller";
  /** Uploaded evidence image URLs (Blossom), from the dispute form. */
  evidence?: string[];
}

export interface OpenDisputeResponse {
  order: ApiOrder;
  dispute: ApiDispute;
}

/* ----------------------------- admin / mediator ----------------------- */

/**
 * Mediator resolution outcome.
 *   - refund_buyer    → full refund, order → refunded
 *   - release_seller  → full release, order → completed
 *   - split           → buyer gets `splitPct`%, seller the rest; order → completed
 */
export type DisputeOutcome = "refund_buyer" | "release_seller" | "split";

/**
 * One row in the admin dispute queue — the full order context joined to
 * its open dispute. Mirrors what `GET /api/admin/disputes` would return
 * once the backend ships it; for the hackathon demo it's served by the
 * mock client from the in-memory order store.
 */
export interface AdminDisputeRow {
  order: ApiOrder;
  listing: ApiListing;
  seller: ApiSeller;
  dispute: ApiDispute;
}

export interface GetDisputesResponse {
  disputes: AdminDisputeRow[];
}

/** `POST /api/admin/disputes/:id/resolve` request body. */
export interface ResolveDisputeRequest {
  outcome: DisputeOutcome;
  /** Buyer's share 0–100, only meaningful when `outcome === "split"`. */
  splitPct?: number;
  /** Public rationale — published in the mediator's signed resolution. */
  rationale: string;
}

export interface ResolveDisputeResponse {
  order: ApiOrder;
  dispute: ApiDispute;
}

/**
 * `POST /api/disputes/:id/respond` — the seller's reply to a dispute the
 * buyer opened. Sends their stance + a written message (and optional
 * counter-evidence photos) to the mediator and buyer. Does NOT resolve
 * the dispute — only a mediator can do that via the admin resolve route.
 */
export interface RespondToDisputeRequest {
  /**
   * The seller's position:
   *   - explain → "I'd like to explain" (no refund offered)
   *   - partial → offering a partial refund
   *   - full    → accepting a full refund
   *   - counter → disputing / countering the buyer's claim
   */
  stance: "explain" | "partial" | "full" | "counter";
  /** Free-text message both the buyer and the mediator will read. */
  message: string;
  /** Optional counter-evidence image URLs (Blossom). */
  evidence?: string[];
}

export interface RespondToDisputeResponse {
  order: ApiOrder;
  dispute: ApiDispute;
}

/* --------------------------- seller endpoints -------------------------- */

/**
 * `POST /api/sellers` request body. Field names/minima match the backend's
 * `CreateSellerSchema` (Zod), verified against the deployed backend:
 *   - handle: 3–30 chars, `^[a-z0-9_]+$` (lowercase, digits, underscore only)
 *   - name: 2–140 chars
 *   - bankCode: 3–10 chars (NIBSS code, e.g. "058")
 *   - bankAccountNumber: 9–10 digits (`^\d{9,10}$`)
 * The backend derives the account holder name via a Nomba lookup, so it is
 * NOT sent. `location`/`category`/`bio`/`avatarUrl` are demo-mock extras the
 * real backend silently strips (it has no columns for them).
 */
export interface CreateSellerRequest {
  npub: string;
  handle: string;
  name: string;
  bankCode: string;
  bankAccountNumber: string;
  location?: string;
  category?: string;
  bio?: string;
  /** Shop avatar / profile image URL. */
  avatarUrl?: string;
}

export interface CreateSellerResponse {
  seller: ApiSeller;
}

/**
 * `PATCH /api/sellers/:id/payout` request body. Updates the seller's payout
 * preference — bank details (NGN, via Nomba).
 * The backend requires bankName. When full bank details are supplied it runs 
 * a Nomba Name Enquiry, which needs a valid `bankCode`.
 */
export interface UpdatePayoutRequest {
  /** NIBSS bank code (e.g. "058"). Matches the backend `PUT /api/sellers`. */
  bankCode?: string;
  /** 9–10 digit account number. */
  bankAccountNumber?: string;
}

/* -------------------------- listing endpoints ------------------------- */

/**
 * `POST /api/listings` request body. Field names match
 * `CreateListingSchema` on the backend. Note the image schema requires
 * each image to have *either* a `url` or a `seed` — at least one.
 */
export interface CreateListingRequest {
  sellerNpub: string;
  title: string;
  description: string;
  priceNGN: number;
  images: ApiListingImage[];
  category: string;
  variants?: string[];
  inStock?: number;
  delivery?: string;
  deliveryFee?: number;
}

export interface CreateListingResponse {
  listing: ApiListing;
}

/* --------------- seller dashboard endpoints (read-only) --------------- */

/**
 * `GET /api/orders/seller/:npub` — returns all orders across all of
 * this seller's listings, ordered `createdAt desc`. Powers the seller
 * dashboard KPIs + "Needs your attention" list.
 */
export interface GetSellerOrdersResponse {
  orders: SellerOrderRow[];
}

/**
 * One row on the seller dashboard. Same as `ApiOrder` but joined to
 * the full listing and (optional) dispute so the dashboard renders
 * each row without further roundtrips.
 */
export interface SellerOrderRow extends ApiOrder {
  listing: ApiListing;
  dispute: ApiDispute | null;
}

/* ----------------------------- auth endpoints -------------------------- */

/**
 * The authenticated user, as returned by the backend on register / login /
 * google. Auth is a standard JWT session — no Nostr keys are surfaced to
 * the user. `nostrNpub` is an internal messaging identity the backend mints
 * on signup; the frontend uses it only as the seller's stable key when
 * creating a seller record.
 */
export interface AuthUser {
  id: string;
  email: string;
  /** Backend-minted messaging identity. Internal — never shown to users. */
  nostrNpub: string | null;
}

/**
 * A JWT session envelope. Returned by `POST /api/auth/register`,
 * `POST /api/auth/login` and `POST /api/auth/google`.
 */
export interface AuthSession {
  /** Bearer token to send as `Authorization: Bearer <token>`. */
  token: string;
  user: AuthUser;
}

/** `POST /api/auth/register` — email + password sign-up. */
export interface RegisterRequest {
  email: string;
  password: string;
}

/** `POST /api/auth/login` — email + password sign-in. */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * `POST /api/auth/google` request body. The backend takes the Google
 * account's stable id + verified email (obtained by the frontend from the
 * Google Identity SDK) and returns a JWT session.
 */
export interface GoogleAuthRequest {
  email: string;
  googleId: string;
}

/** All three auth endpoints return the same session envelope. */
export type AuthResponse = AuthSession;
export type GoogleAuthResponse = AuthSession;

/** Seller summary nested under `GET /api/auth/me`. */
export interface MeSeller {
  id: string;
  handle: string;
  name: string;
  npub: string;
}

/** `GET /api/auth/me` — current user + linked seller (if any). */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    authProvider: string;
    emailVerified: boolean;
    nostrNpub: string | null;
    createdAt: string;
    seller: MeSeller | null;
  };
}

