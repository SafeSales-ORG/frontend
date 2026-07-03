/**
 * SafeSale HTTP API — real (fetch) implementation.
 *
 * Hits the backend (Fastify + Prisma + Postgres, MavaPay rail).
 * Activated by setting `VITE_API_URL`; the toggle lives in `client.ts`.
 *
 * All methods reject with `ApiError` on non-2xx. The backend's error
 * envelope per `backend/src/lib/errors.ts` is `{ message, code? }` at
 * the top level — we accept both that shape and the older
 * `{ error: { code, message } }` envelope for forward compatibility.
 *
 * Auth: buyer endpoints are public (the orderToken in the URL IS the
 * auth). Seller endpoints will need NIP-98 signed-event headers (added
 * in a later commit when seller wiring lands).
 */

import type {
  AdminDisputeRow,
  ApiDispute,
  ApiListing,
  ApiOrder,
  ApiSeller,
  CreateListingRequest,
  CreateListingResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateSellerRequest,
  CreateSellerResponse,
  GetDisputesResponse,
  GetOrderResponse,
  GetSellerOrdersResponse,
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
import { ApiError } from "./errors";

function getBaseUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (!url || typeof url !== "string") {
    // The mock client should have intercepted this — defensive.
    throw new ApiError(
      "BACKEND_UNREACHABLE",
      "VITE_API_URL is not configured.",
    );
  }
  return url.replace(/\/$/, "");
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = getBaseUrl() + path;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(
      "BACKEND_UNREACHABLE",
      cause instanceof Error
        ? `Could not reach the SafeSale backend: ${cause.message}`
        : "Could not reach the SafeSale backend.",
    );
  }

  // Empty body on 204 is fine
  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(
        "UNKNOWN",
        `Backend returned non-JSON response (HTTP ${res.status}).`,
        res.status,
      );
    }
  }

  if (!res.ok) {
    // Accept both envelope shapes — the Fastify backend throws HttpError
    // which serializes as { message, statusCode }; an older draft used
    // { error: { code, message } }. Handle both.
    const flat = payload as { message?: string; code?: string } | null;
    const nested = payload as { error?: { code?: string; message?: string } } | null;
    const code = flat?.code ?? nested?.error?.code ?? "UNKNOWN";
    const message =
      flat?.message ??
      nested?.error?.message ??
      `Request failed (HTTP ${res.status}).`;
    throw new ApiError(code, message, res.status);
  }

  return payload as T;
}

/** Shape the backend returns from GET /api/admin/disputes (listing/seller
 * nested under `order`). We flatten it to the frontend's AdminDisputeRow. */
interface BackendAdminDispute extends ApiDispute {
  order: ApiOrder & { listing: ApiListing; seller: ApiSeller };
}

export const httpApi = {
  createSeller(req: CreateSellerRequest): Promise<CreateSellerResponse> {
    return request<CreateSellerResponse>("POST", "/api/sellers", req);
  },
  updatePayout(sellerId: string, req: UpdatePayoutRequest): Promise<void> {
    return request<void>(
      "PATCH",
      `/api/sellers/${encodeURIComponent(sellerId)}/payout`,
      req,
    );
  },
  createListing(req: CreateListingRequest): Promise<CreateListingResponse> {
    return request<CreateListingResponse>("POST", "/api/listings", req);
  },
  updateListing(
    id: string,
    patch: Partial<ApiListing>,
  ): Promise<CreateListingResponse> {
    return request<CreateListingResponse>(
      "PATCH",
      `/api/listings/${encodeURIComponent(id)}`,
      patch,
    );
  },
  async getListing(id: string): Promise<{ listing: ApiListing } | null> {
    try {
      return await request<{ listing: ApiListing }>(
        "GET",
        `/api/listings/${encodeURIComponent(id)}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  getSellerOrders(npub: string): Promise<GetSellerOrdersResponse> {
    return request<GetSellerOrdersResponse>(
      "GET",
      `/api/orders/seller/${encodeURIComponent(npub)}`,
    );
  },
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
    // Strip mock-only fields before sending over the wire. The real
    // backend has no notion of `_listingHint`; the listing already
    // exists in its Postgres DB from the seller's POST /api/listings.
    const { _listingHint: _hint, ...body } = req;
    return request<CreateOrderResponse>("POST", "/api/orders", body);
  },
  /**
   * DEMO-only: mark an order paid without a real bank transfer. The
   * backend route is `simulate-payment` and returns 404 unless DEMO_MODE
   * is on. In production, payment is confirmed by the MavaPay webhook.
   */
  confirmPayment(token: string): Promise<SimulatePaymentResponse> {
    return request<SimulatePaymentResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/simulate-payment`,
      {},
    );
  },
  getOrder(token: string): Promise<GetOrderResponse> {
    return request<GetOrderResponse>(
      "GET",
      `/api/orders/${encodeURIComponent(token)}`,
    );
  },
  deliverOrder(token: string): Promise<ShipOrderResponse> {
    return request<ShipOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/deliver`,
    );
  },
  releaseOrder(token: string): Promise<ReleaseOrderResponse> {
    // No body — possession of the orderToken in the URL is the buyer's
    // authority. The backend triggers the MavaPay payout to the seller.
    return request<ReleaseOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/release`,
    );
  },
  openDispute(
    token: string,
    req: OpenDisputeRequest,
  ): Promise<OpenDisputeResponse> {
    return request<OpenDisputeResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/dispute`,
      req,
    );
  },
  shipOrder(
    token: string,
    req: ShipOrderRequest,
  ): Promise<ShipOrderResponse> {
    return request<ShipOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/ship`,
      req,
    );
  },
  respondToDispute(
    disputeId: string,
    req: RespondToDisputeRequest,
  ): Promise<RespondToDisputeResponse> {
    return request<RespondToDisputeResponse>(
      "POST",
      `/api/disputes/${encodeURIComponent(disputeId)}/respond`,
      req,
    );
  },
  async getDisputes(): Promise<GetDisputesResponse> {
    const { disputes } = await request<{ disputes: BackendAdminDispute[] }>(
      "GET",
      `/api/admin/disputes`,
    );
    // Flatten the backend's nested shape into the frontend's AdminDisputeRow.
    const rows: AdminDisputeRow[] = disputes.map((d) => {
      const { order, ...dispute } = d;
      const { listing, seller, ...orderRest } = order;
      return { order: orderRest, listing, seller, dispute };
    });
    return { disputes: rows };
  },
  resolveDispute(
    disputeId: string,
    req: ResolveDisputeRequest,
  ): Promise<ResolveDisputeResponse> {
    // Backend expects `buyerPercent`; the frontend form uses `splitPct`.
    const { splitPct, ...rest } = req;
    const body = splitPct === undefined ? rest : { ...rest, buyerPercent: splitPct };
    return request<ResolveDisputeResponse>(
      "POST",
      `/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve`,
      body,
    );
  },
};
