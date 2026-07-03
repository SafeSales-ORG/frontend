/**
 * Order escrow status. Aligned with BACKEND.md `OrderStatus` enum.
 * `completed` is a legacy frontend-only synonym for `released`; new code
 * should prefer `released`. Once mocks are fully replaced with backend
 * data the `completed` value will be removed.
 */
export type EscrowStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "delivered"
  | "released"
  | "completed"
  | "disputed"
  | "resolved"
  | "refunded"
  | "expired";

export interface Seller {
  id: string;
  handle: string;
  name: string;
  avatarSeed: string;
  location: string;
  joinedAt: string;
  rating: number;        // 0-5
  reviews: number;
  completedOrders: number;
  responseTimeMins: number;
  verified: boolean;
  bio: string;
  category: string;
  instagram?: string;
  whatsapp?: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceNGN: number;
  images: ProductImage[];
  inStock: number;
  category: string;
  variants?: string[];
  delivery: string;
  views: number;
  saves: number;
  createdAt: string;
  active: boolean;
}

export interface ProductImage {
  seed: string;
  hueA: number;
  hueB: number;
  label: string;
}

export interface Order {
  id: string;
  shortId: string;
  /**
   * Unguessable token used in the public buyer order URL:
   *   safesale.app/order/[orderToken]
   *
   * This is the buyer's entire "account" — they have no login, just this
   * private URL emailed/SMS'd to them after checkout. Must be long &
   * random enough to resist guessing (~22+ chars of base32).
   */
  orderToken: string;
  listingId: string;
  sellerId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  /** "phone" or "email" — how the buyer asked us to send their order link. */
  contactMethod?: "phone" | "email";
  buyerCity: string;
  amountNGN: number;
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
  trackingNumber?: string;
  carrier?: string;
  expiresAt?: string;
  variant?: string;
  notes?: string;
  /**
   * When the 7-day auto-release fires (counted from the moment the seller
   * marked the order as shipped). Protects sellers from buyers who go silent.
   */
  autoReleaseAt?: string;
  protectedUntil: string;
}

export interface Review {
  id: string;
  sellerId: string;
  buyerName: string;
  buyerInitial: string;
  rating: number;
  text: string;
  product: string;
  createdAt: string;
  verified: boolean;
}

export type DisputeStatus =
  /** First 72h after open — buyer & seller can resolve via chat without admin. */
  | "direct_resolution"
  /** 72h passed without agreement — admin auto-takes the case. */
  | "escalated"
  /** Admin asked for more evidence (24h sub-window). */
  | "evidence_requested"
  /** Admin actively reviewing. */
  | "mediating"
  /** Closed — see `resolution`. */
  | "resolved";

export interface Dispute {
  id: string;
  orderId: string;
  reason: string;
  openedBy: "buyer" | "seller";
  openedAt: string;
  status: DisputeStatus;
  priority: "low" | "medium" | "high";
  amountNGN: number;
  summary: string;
  buyerEvidence: number;
  sellerEvidence: number;
  /**
   * Timestamp at which the 72-hour direct-resolution window closes and the
   * dispute auto-escalates to a mediator.
   */
  directResolutionUntil?: string;
  /**
   * Timestamp by which the party who was asked for more evidence must reply.
   */
  evidenceDueAt?: string;
  /** Whether this dispute followed the structured return workflow. */
  isReturn?: boolean;
  /** Structured return-photo evidence (3-photo flow). */
  returnEvidence?: ReturnEvidence;
  resolution?: DisputeResolution;
}

/**
 * The "damaged return" workflow's photo checkpoints.
 * Each set must be timestamped + uploaded before the next stage unlocks.
 */
export interface ReturnEvidence {
  /** Photos buyer uploaded the moment they received the item. */
  receivedByBuyer?: { count: number; at: string };
  /** Photos of the item packed for return + courier receipt. */
  packedForReturn?: { count: number; at: string; trackingNumber?: string };
  /** Photos seller uploaded after the return arrived. */
  receivedBackBySeller?: { count: number; at: string };
}

export interface DisputeResolution {
  outcome: "release" | "refund" | "split";
  buyerRefundNGN: number;
  sellerReleaseNGN: number;
  reasoning: string;
  mediator: string;
  resolvedAt: string;
}

export interface ChatMessage {
  id: string;
  from: "buyer" | "seller" | "system";
  text: string;
  at: string;
  attachment?: { label: string; seed: string };
}

export interface PayoutEntry {
  id: string;
  amountNGN: number;
  status: "completed" | "processing" | "scheduled";
  bankRef: string;
  at: string;
}
