/**
 * SafeSale market store — the single, reactive source of truth for the
 * demo's mock marketplace.
 *
 * Everything the UI shows about sellers, listings, orders, disputes and
 * payouts lives here. It is:
 *
 *   - **Persistent**   — serialised to localStorage on every mutation, so
 *     a refresh (or reopening the buyer's order link days later) keeps the
 *     world intact for the session.
 *   - **Reactive**     — a tiny pub/sub backs `useSyncExternalStore`, so
 *     any view re-renders the instant the data changes.
 *   - **Cross-tab**    — a `storage` listener reloads + re-notifies when
 *     another tab writes, so the seller dashboard in one tab updates the
 *     moment a buyer acts in another (and vice-versa).
 *
 * The `apiClient` mock (`src/lib/api/mocks.ts`) is a thin adapter over this
 * store, so existing components keep working unchanged while gaining live
 * persistence + sync. New live surfaces (dashboard, earnings, order pages)
 * read the store directly through the hooks in `src/hooks/useMarket.ts`.
 *
 * Per project guidance: we seed a browsable **product catalog** (those are
 * products, not activity) but **no orders or disputes** — the demo shows
 * only live, in-session activity.
 */

import type {
  ApiDispute,
  ApiListing,
  ApiListingImage,
  ApiOrder,
  ApiOrderStatus,
  ApiSeller,
} from "@/lib/api/types";
import { listings as fixtureListings, sellers as fixtureSellers } from "@/lib/mock";

/* ------------------------------- model -------------------------------- */

export interface OrderEnvelope {
  order: ApiOrder;
  listing: ApiListing;
  seller: ApiSeller;
  dispute: ApiDispute | null;
}

export interface Payout {
  id: string;
  sellerId: string;
  amountNGN: number;
  at: string;
}

/** A buyer's review of a completed order. */
export interface StoreReview {
  id: string;
  orderToken: string;
  sellerId: string;
  buyerName: string;
  rating: number; // 1-5
  text: string;
  productTitle: string;
  createdAt: string;
}

/** One message in a per-order buyer↔seller thread. */
export interface ChatMessage {
  id: string;
  orderToken: string;
  from: "buyer" | "seller" | "system";
  text: string;
  at: string;
}

export interface MarketState {
  /** Sellers keyed by their backend id (cuid / mock id). */
  sellersById: Record<string, ApiSeller>;
  /** Sellers keyed by npub — the dashboard queries this way. */
  sellersByNpub: Record<string, ApiSeller>;
  /** Listings keyed by listing id. */
  listings: Record<string, ApiListing>;
  /** Orders keyed by orderToken — the buyer's secret credential. */
  orders: Record<string, OrderEnvelope>;
  /** Recorded cash-outs (available → paid). */
  payouts: Payout[];
  /** Buyer reviews, newest first by convention. */
  reviews: StoreReview[];
  /** Per-order chat threads, keyed by orderToken. */
  messages: Record<string, ChatMessage[]>;
}

// v3: discards pre-fix demo data (corrupted seller links / seed images) and
// adds reviews + chat. Bumping the key gives every browser a clean start.
const STORAGE_KEY = "safesale:market:v3";


/* --------------------------- time helpers ----------------------------- */

function nowIso(): string {
  return new Date().toISOString();
}
function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/* ------------------------- fixture → api shape ------------------------ */

const UNSPLASH = "?auto=format&fit=crop&w=800&q=70";

/** Real product photos for the seeded catalog so the marketplace looks alive. */
const REAL_LISTING_IMAGES: Record<string, string[]> = {
  cmph7pvyr0002lk1cgz14mckh: [
    `https://images.unsplash.com/photo-1576871337622-98d48d1cf531${UNSPLASH}`,
  ],
  lst_jacket01: [
    `https://images.unsplash.com/photo-1543076447-215ad9ba6923${UNSPLASH}`,
    `https://images.unsplash.com/photo-1551537482-f2075a1d41f2${UNSPLASH}`,
  ],
  lst_sneakers02: [
    `https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a${UNSPLASH}`,
    `https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb${UNSPLASH}`,
  ],
  lst_bag03: [
    `https://images.unsplash.com/photo-1584917865442-de89df76afd3${UNSPLASH}`,
    `https://images.unsplash.com/photo-1591561954557-26941169b49e${UNSPLASH}`,
  ],
  lst_dress04: [
    `https://images.unsplash.com/photo-1595777457583-95e059d581b8${UNSPLASH}`,
  ],
  lst_watch05: [
    `https://images.unsplash.com/photo-1523275335684-37898b6baf30${UNSPLASH}`,
  ],
  lst_serum06: [
    `https://images.unsplash.com/photo-1620916566398-39f1143ab7be${UNSPLASH}`,
  ],
};

/** Delivery fees (NGN) for the seeded catalog — so the marketplace shows
 *  real, known-before-payment shipping costs. */
const SEED_DELIVERY_FEE: Record<string, number> = {
  cmph7pvyr0002lk1cgz14mckh: 3000,
  lst_jacket01: 3000,
  lst_sneakers02: 3500,
  lst_bag03: 3500,
  lst_dress04: 2500,
  lst_watch05: 2000,
  lst_serum06: 1500,
};

/** Real-looking shop avatars for the seeded sellers. */
const REAL_SELLER_AVATARS: Record<string, string> = {
  seller_amaka: `https://images.unsplash.com/photo-1494790108377-be9c29b29330${UNSPLASH}`,
  seller_ade: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d${UNSPLASH}`,
  seller_zee: `https://images.unsplash.com/photo-1438761681033-6461ffad8d80${UNSPLASH}`,
};

function fixtureSellerToApi(id: string): ApiSeller {
  const s = fixtureSellers.find((x) => x.id === id);
  const base = s ?? fixtureSellers[0];
  return {
    id: base.id,
    npub: `npub1seed${base.id.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
    pubkey: `seed-pubkey-${base.id}`,
    handle: base.handle,
    name: base.name,
    location: base.location,
    category: base.category,
    bio: base.bio ?? null,
    verified: base.verified,
    lnAddress: null,
    avatarUrl: REAL_SELLER_AVATARS[base.id] ?? null,
    createdAt: base.joinedAt,
  };
}

function fixtureListingToApi(l: (typeof fixtureListings)[number]): ApiListing {
  const real = REAL_LISTING_IMAGES[l.id];
  const images: ApiListingImage[] = real
    ? real.map((url, i) => ({ url, alt: l.images[i]?.label ?? l.title }))
    : l.images.map((img) => ({ seed: img.seed, alt: img.label }));
  return {
    id: l.id,
    sellerId: l.sellerId,
    title: l.title,
    description: l.description,
    priceNGN: l.priceNGN,
    images,
    category: l.category,
    variants: l.variants ?? null,
    inStock: l.inStock,
    delivery: l.delivery,
    deliveryFee: SEED_DELIVERY_FEE[l.id] ?? 0,
    active: l.active,
    nostrEventId: null,
    createdAt: l.createdAt,
    updatedAt: l.createdAt,
  };
}

/** Build the initial state: catalog seeded, no orders/disputes. */
function seedState(): MarketState {
  const sellersById: Record<string, ApiSeller> = {};
  const sellersByNpub: Record<string, ApiSeller> = {};
  for (const s of fixtureSellers) {
    const api = fixtureSellerToApi(s.id);
    sellersById[api.id] = api;
    sellersByNpub[api.npub] = api;
  }
  const listings: Record<string, ApiListing> = {};
  for (const l of fixtureListings) {
    listings[l.id] = fixtureListingToApi(l);
  }
  return {
    sellersById,
    sellersByNpub,
    listings,
    orders: {},
    payouts: [],
    reviews: [],
    messages: {},
  };
}

/* ------------------------- persistence layer -------------------------- */

function load(): MarketState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedState();
      save(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<MarketState>;
    // Merge seeded catalog under any persisted overrides so newly-added
    // fixture products show up without wiping a returning session's data.
    const seeded = seedState();
    return {
      sellersById: { ...seeded.sellersById, ...(parsed.sellersById ?? {}) },
      sellersByNpub: { ...seeded.sellersByNpub, ...(parsed.sellersByNpub ?? {}) },
      listings: { ...seeded.listings, ...(parsed.listings ?? {}) },
      orders: parsed.orders ?? {},
      payouts: parsed.payouts ?? [],
      reviews: parsed.reviews ?? [],
      messages: parsed.messages ?? {},
    };
  } catch {
    return seedState();
  }
}

function save(state: MarketState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Quota exceeded (usually too many/large base64 demo images) or storage
    // disabled. We keep running in-memory, but warn loudly so this isn't a
    // silent data-loss-on-reload mystery. Images are downscaled on upload to
    // stay within budget; if this fires, reduce image count/size.
    console.warn(
      "[marketStore] Could not persist to localStorage — changes will be lost on reload.",
      err,
    );
  }
}

/* ----------------------------- the store ------------------------------ */

let state: MarketState = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Replace state immutably, persist, and notify subscribers. */
function commit(next: MarketState) {
  state = next;
  save(state);
  emit();
}

// Cross-tab sync: when another tab writes, reload and notify ours.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = load();
    emit();
  });
}

export const marketStore = {
  /* ---- subscription API (for useSyncExternalStore) ---- */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): MarketState {
    return state;
  },

  /* ---------------------------- sellers --------------------------- */

  getSellerByNpub(npub: string): ApiSeller | undefined {
    return state.sellersByNpub[npub];
  },
  getSellerById(id: string): ApiSeller | undefined {
    return state.sellersById[id];
  },
  upsertSeller(seller: ApiSeller): ApiSeller {
    commit({
      ...state,
      sellersById: { ...state.sellersById, [seller.id]: seller },
      sellersByNpub: { ...state.sellersByNpub, [seller.npub]: seller },
    });
    return seller;
  },

  /* ---------------------------- listings -------------------------- */

  getListing(id: string): ApiListing | undefined {
    return state.listings[id];
  },
  listAllListings(): ApiListing[] {
    return Object.values(state.listings).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },
  listingsForSeller(sellerId: string): ApiListing[] {
    return this.listAllListings().filter((l) => l.sellerId === sellerId);
  },
  upsertListing(listing: ApiListing): ApiListing {
    commit({ ...state, listings: { ...state.listings, [listing.id]: listing } });
    return listing;
  },
  updateListing(id: string, patch: Partial<ApiListing>): ApiListing | undefined {
    const cur = state.listings[id];
    if (!cur) return undefined;
    const next: ApiListing = { ...cur, ...patch, id: cur.id, updatedAt: nowIso() };
    commit({ ...state, listings: { ...state.listings, [id]: next } });
    return next;
  },
  setListingStock(id: string, inStock: number): ApiListing | undefined {
    return this.updateListing(id, { inStock });
  },

  /* ----------------------------- orders --------------------------- */

  getOrder(token: string): OrderEnvelope | undefined {
    return state.orders[token];
  },
  putOrder(env: OrderEnvelope): void {
    commit({ ...state, orders: { ...state.orders, [env.order.orderToken]: env } });
  },
  /** Patch an order envelope's order fields and persist. */
  patchOrder(token: string, patch: Partial<ApiOrder>): OrderEnvelope | undefined {
    const env = state.orders[token];
    if (!env) return undefined;
    const next: OrderEnvelope = {
      ...env,
      order: { ...env.order, ...patch, updatedAt: nowIso() },
    };
    commit({ ...state, orders: { ...state.orders, [token]: next } });
    return next;
  },
  patchEnvelope(token: string, patch: Partial<OrderEnvelope>): OrderEnvelope | undefined {
    const env = state.orders[token];
    if (!env) return undefined;
    const next: OrderEnvelope = { ...env, ...patch };
    commit({ ...state, orders: { ...state.orders, [token]: next } });
    return next;
  },
  allOrders(): OrderEnvelope[] {
    return Object.values(state.orders).sort(
      (a, b) =>
        new Date(b.order.createdAt).getTime() -
        new Date(a.order.createdAt).getTime(),
    );
  },
  ordersForSeller(identifiers: string[]): OrderEnvelope[] {
    const ids = new Set(identifiers.filter(Boolean));
    return this.allOrders().filter(
      (env) =>
        ids.has(env.order.sellerId) ||
        ids.has(env.seller.pubkey) ||
        ids.has(env.seller.npub),
    );
  },
  disputes(): OrderEnvelope[] {
    return this.allOrders().filter(
      (env) => env.dispute && env.dispute.status !== "resolved",
    );
  },

  /* ----------------------------- payouts -------------------------- */

  recordPayout(p: Payout): void {
    commit({ ...state, payouts: [p, ...state.payouts] });
  },
  payoutsForSeller(sellerId: string): Payout[] {
    return state.payouts.filter((p) => p.sellerId === sellerId);
  },

  /* ----------------------------- reviews -------------------------- */

  addReview(r: StoreReview): void {
    commit({ ...state, reviews: [r, ...state.reviews] });
  },
  reviewsForSeller(sellerId: string): StoreReview[] {
    return state.reviews.filter((r) => r.sellerId === sellerId);
  },
  reviewForOrder(orderToken: string): StoreReview | undefined {
    return state.reviews.find((r) => r.orderToken === orderToken);
  },
  /** Aggregate reputation for a seller: avg rating, review count, completed. */
  sellerReputation(sellerId: string): {
    rating: number;
    reviewCount: number;
    completedOrders: number;
  } {
    const revs = state.reviews.filter((r) => r.sellerId === sellerId);
    const reviewCount = revs.length;
    const rating = reviewCount
      ? revs.reduce((s, r) => s + r.rating, 0) / reviewCount
      : 0;
    const completedOrders = Object.values(state.orders).filter(
      (e) => e.order.sellerId === sellerId && e.order.status === "completed",
    ).length;
    return { rating, reviewCount, completedOrders };
  },

  /* ------------------------------ chat ---------------------------- */

  messagesForOrder(orderToken: string): ChatMessage[] {
    return state.messages[orderToken] ?? [];
  },
  addMessage(msg: ChatMessage): void {
    const thread = state.messages[msg.orderToken] ?? [];
    commit({
      ...state,
      messages: { ...state.messages, [msg.orderToken]: [...thread, msg] },
    });
  },

  /* -------------------------- dispute evidence -------------------- */

  addDisputeEvidence(
    orderToken: string,
    evidence: { url: string; by: "buyer" | "seller"; at: string },
  ): void {
    const env = state.orders[orderToken];
    if (!env || !env.dispute) return;
    const next: OrderEnvelope = {
      ...env,
      dispute: {
        ...env.dispute,
        evidence: [...(env.dispute.evidence ?? []), evidence],
      },
    };
    commit({ ...state, orders: { ...state.orders, [orderToken]: next } });
  },
  setSellerDisputeResponse(orderToken: string, response: string): void {
    const env = state.orders[orderToken];
    if (!env || !env.dispute) return;
    const next: OrderEnvelope = {
      ...env,
      dispute: { ...env.dispute, sellerResponse: response },
    };
    commit({ ...state, orders: { ...state.orders, [orderToken]: next } });
  },

  /* ----------------------- testing / reset ------------------------ */

  /** Wipe all live activity (orders/disputes/payouts) but keep the catalog. */
  resetActivity(): void {
    const seeded = seedState();
    commit({
      ...state,
      orders: {},
      payouts: [],
      // keep current sellers, ensure seeded catalog present
      listings: { ...seeded.listings, ...state.listings },
    });
  },
};

/* ------------------------- derived selectors -------------------------- */

/**
 * Earnings statuses. Locked = money in escrow the seller can't touch yet.
 * Available = released/completed and not yet cashed out.
 */
const LOCKED_STATUSES: ApiOrderStatus[] = [
  "paid",
  "shipped",
  "delivered",
  "disputed",
];

export interface SellerEarnings {
  lockedNGN: number;
  availableNGN: number;
  paidOutNGN: number;
  /** completed earnings before subtracting payouts */
  releasedNGN: number;
  thisMonthNGN: number;
}

export function computeEarnings(
  orders: OrderEnvelope[],
  payouts: Payout[],
): SellerEarnings {
  let lockedNGN = 0,
    releasedNGN = 0,
    thisMonthNGN = 0;

  const monthStart = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  })();

  for (const { order } of orders) {
    if (LOCKED_STATUSES.includes(order.status)) {
      lockedNGN += order.amountNGN;
    }
    if (order.status === "completed") {
      releasedNGN += order.amountNGN;
      const released = order.releasedAt ? new Date(order.releasedAt).getTime() : 0;
      if (released >= monthStart) thisMonthNGN += order.amountNGN;
    }
  }

  const paidOutNGN = payouts.reduce((s, p) => s + p.amountNGN, 0);

  return {
    lockedNGN,
    releasedNGN,
    availableNGN: Math.max(0, releasedNGN - paidOutNGN),
    paidOutNGN,
    thisMonthNGN,
  };
}

/* ------------------------- order-status labels ------------------------ */

/** Human label for each backend status, demo-facing. */
export const STATUS_LABEL: Record<ApiOrderStatus, string> = {
  pending_payment: "Pending payment",
  paid: "Paid · to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
};

/* ----------------------------- token gen ------------------------------ */

/** 22 base32 chars ≈ 110 bits — unguessable order token. */
export function generateOrderToken(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const rnd = new Uint32Array(22);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rnd);
    for (let i = 0; i < 22; i++) s += alphabet[rnd[i] % alphabet.length];
  } else {
    for (let i = 0; i < 22; i++)
      s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export { nowIso as marketNow, isoIn as marketIsoIn };
