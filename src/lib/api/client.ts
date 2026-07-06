/**
 * SafeSale API client.
 *
 * Exposes the same surface (`createOrder`, `getOrder`, ...) regardless
 * of mode. Mode is chosen at module load:
 *
 *   - `VITE_API_URL` set   → real HTTP client → talks to the backend
 *   - `VITE_API_URL` unset → mock client      → in-memory fixtures
 *
 * Components import `apiClient` and never branch on the mode. This is
 * the seam that lets the frontend ship and demo before the backend
 * exists, then drop into the real backend with one env-var flip.
 */

import { httpApi } from "./http";
import { mockApi } from "./mocks";
import type {
  ApiListing,
  CreateListingRequest,
  CreateListingResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateSellerRequest,
  CreateSellerResponse,
  GetDisputesResponse,
  GetOrderResponse,
  GetSellerOrdersResponse,
  GoogleAuthRequest,
  GoogleAuthResponse,
  OpenDisputeRequest,
  OpenDisputeResponse,
  ReleaseOrderResponse,
  ResolveDisputeRequest,
  ResolveDisputeResponse,
  RespondToDisputeRequest,
  RespondToDisputeResponse,
  ShipOrderRequest,
  ShipOrderResponse,
  SimulatePaymentResponse,
  UpdatePayoutRequest,
} from "./types";

export interface ApiClient {
  /**
   * POST /api/auth/google — exchange a Google ID token for a Nostr keypair.
   * The backend verifies the token with Google, creates/fetches an encrypted
   * Nostr keypair for this Google account, and returns the nsec + npub.
   */
  googleAuth(req: GoogleAuthRequest): Promise<GoogleAuthResponse>;
  /** POST /api/sellers — register a new seller from their Nostr identity. */
  createSeller(req: CreateSellerRequest): Promise<CreateSellerResponse>;
  /** PATCH /api/sellers/:id/payout — update the seller's payout details. */
  updatePayout(sellerId: string, req: UpdatePayoutRequest): Promise<void>;
  /** POST /api/listings — seller publishes a new listing. */
  createListing(req: CreateListingRequest): Promise<CreateListingResponse>;
  /** PATCH /api/listings/:id — edit a listing or toggle stock. */
  updateListing(
    id: string,
    patch: Partial<ApiListing>,
  ): Promise<CreateListingResponse>;
  /** GET /api/listings/:id — read a single listing. */
  getListing(id: string): Promise<{ listing: ApiListing } | null>;
  /** GET /api/orders/seller/:npub — seller dashboard orders feed. */
  getSellerOrders(npub: string): Promise<GetSellerOrdersResponse>;
  /** POST /api/orders — buyer initiates a purchase. */
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse>;
  /** POST /api/orders/:token/simulate-payment — DEMO: mark order paid. */
  confirmPayment(token: string): Promise<SimulatePaymentResponse>;
  /** GET /api/orders/:token — buyer order page envelope. */
  getOrder(token: string): Promise<GetOrderResponse>;
  /** POST /api/orders/:token/deliver — buyer marks delivered. */
  deliverOrder(token: string): Promise<ShipOrderResponse>;
  /** POST /api/orders/:token/release — buyer releases the escrow (no body). */
  releaseOrder(token: string): Promise<ReleaseOrderResponse>;
  /** POST /api/orders/:token/dispute — buyer or seller opens a dispute. */
  openDispute(
    token: string,
    req: OpenDisputeRequest,
  ): Promise<OpenDisputeResponse>;
  /** POST /api/orders/:token/ship — seller marks the order shipped. */
  shipOrder(token: string, req: ShipOrderRequest): Promise<ShipOrderResponse>;
  /** POST /api/disputes/:id/respond — seller replies to a dispute. */
  respondToDispute(
    disputeId: string,
    req: RespondToDisputeRequest,
  ): Promise<RespondToDisputeResponse>;
  /** GET /api/admin/disputes — mediator dispute queue. */
  getDisputes(): Promise<GetDisputesResponse>;
  /** POST /api/admin/disputes/:id/resolve — mediator signs an outcome. */
  resolveDispute(
    disputeId: string,
    req: ResolveDisputeRequest,
  ): Promise<ResolveDisputeResponse>;
}

/** True when the real backend URL is configured. */
export const API_BACKEND_CONFIGURED: boolean =
  typeof import.meta.env.VITE_API_URL === "string" &&
  import.meta.env.VITE_API_URL.length > 0;

/**
 * Demo mode. When `VITE_DEMO_MODE=true`, every call is served by the
 * in-memory mock client regardless of whether a backend URL is set — a
 * single switch for a reliable judges' demo that never touches a live
 * backend. It also unlocks `/admin` (see MediatorGate) and seeds
 * believable data. Set it back to `false` (or remove it) to use the real
 * Railway backend.
 */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === "true";

export const apiClient: ApiClient =
  DEMO_MODE || !API_BACKEND_CONFIGURED ? mockApi : httpApi;
