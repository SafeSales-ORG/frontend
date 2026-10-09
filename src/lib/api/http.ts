/**
 * SafeSale HTTP API — real (fetch) implementation.
 *
 * Hits the backend (Fastify + Prisma + Postgres). Activated by setting
 * `VITE_API_URL`; the toggle lives in `client.ts`.
 *
 * All methods reject with `ApiError` on non-2xx. The backend's error
 * envelope is `{ error: { code, message } }`.
 *
 * Auth: seller and mediator routes use the JWT session. Buyer actions are
 * authorised by the buyer's secret token in the order URL.
 */

import type {
  AdminDisputeRow,
  ApiDispute,
  ApiListing,
  ApiOrder,
  ApiSeller,
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
  OpenDisputeRequest,
  RegisterRequest,
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
  GetMySellerResponse,
  UpdateShopProfileRequest,
} from "./types";
import { ApiError } from "./errors";
import { getToken } from "@/lib/auth/session";

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
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = getBaseUrl() + path;

  // Attach the JWT bearer token (email/password or Google session) when the
  // user is signed in. Protected seller/admin routes require it; public
  // routes (buyer order pages) simply ignore it.
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
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
    // The backend sends { error: { code, message } }; tolerate a flat shape too.
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

/** Shape the backend returns from GET /api/admin/disputes. We flatten it to
 * the frontend's AdminDisputeRow. */
interface BackendAdminDispute extends ApiDispute {
  order: ApiOrder & { listing: ApiListing };
  seller: ApiSeller;
  listing: ApiListing;
}

/**
 * The backend's escrow enum uses `funded`/`released`; the frontend's canonical
 * enum (used across ~65 call-sites, switches, timelines) uses `paid`/`completed`.
 * Map at the API boundary so every component works unchanged. No-op in demo mode
 * (the mock already emits paid/completed).
 */
const STATUS_MAP: Record<string, string> = {
  funded: "paid",
  released: "completed",
};
function mapOrderStatus<T extends { status?: string } | null | undefined>(
  order: T,
): T {
  if (order && order.status && STATUS_MAP[order.status]) {
    return { ...order, status: STATUS_MAP[order.status] };
  }
  return order;
}

export const httpApi = {
  register(req: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>("POST", "/api/auth/register", req);
  },
  login(req: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>("POST", "/api/auth/login", req);
  },
  getMe(): Promise<MeResponse> {
    return request<MeResponse>("GET", "/api/auth/me");
  },
  googleAuth(req: GoogleAuthRequest): Promise<GoogleAuthResponse> {
    return request<GoogleAuthResponse>("POST", "/api/auth/google", req);
  },
  createSeller(req: CreateSellerRequest): Promise<CreateSellerResponse> {
    return request<CreateSellerResponse>("POST", "/api/sellers", req);
  },
  updatePayout(req: UpdatePayoutRequest): Promise<void> {
    // Updates the caller's own seller; the backend re-checks the account name with the bank.
    return request<void>("PUT", "/api/sellers", req);
  },
  updateShopProfile(req: UpdateShopProfileRequest): Promise<{ seller: ApiSeller }> {
    return request<{ seller: ApiSeller }>("PUT", "/api/sellers", req);
  },
  getMySeller(): Promise<GetMySellerResponse> {
    return request<GetMySellerResponse>("GET", "/api/sellers/me");
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
  async getListing(id: string): Promise<{ listing: ApiListing; seller?: ApiSeller | null } | null> {
    try {
      return await request<{ listing: ApiListing; seller: ApiSeller }>(
        "GET",
        `/api/listings/${encodeURIComponent(id)}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  getMarketplace(): Promise<{ listings: MarketplaceListing[] }> {
    return request<{ listings: MarketplaceListing[] }>("GET", "/api/listings?limit=60");
  },
  getMyListings(): Promise<{ listings: ApiListing[] }> {
    return request<{ listings: ApiListing[] }>("GET", "/api/listings/mine");
  },
  async getShop(handle: string): Promise<GetShopResponse | null> {
    try {
      const { seller } = await request<{ seller: ApiSeller }>(
        "GET",
        `/api/sellers/${encodeURIComponent(handle)}`,
      );
      const { listings } = await request<{ listings: ApiListing[] }>(
        "GET",
        `/api/listings?seller=${encodeURIComponent(seller.npub)}`,
      );
      return { seller, listings };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  async getSellerOrders(npub: string): Promise<GetSellerOrdersResponse> {
    const res = await request<GetSellerOrdersResponse>(
      "GET",
      `/api/orders/seller/${encodeURIComponent(npub)}`,
    );
    return { ...res, orders: res.orders.map(mapOrderStatus) };
  },
  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
    // The real backend's `CreateOrderSchema` differs from the FE's request
    // shape, so adapt both directions here (Checkout stays backend-agnostic):
    //  - it REQUIRES a single `deliveryAddress` (min 5) — the FE collects a
    //    city + optional street, so we join them.
    //  - `_listingHint`/`contactMethod` are mock-only; we drop them.
    const deliveryAddress =
      [req.buyerAddress, req.buyerCity].filter(Boolean).join(", ").trim() ||
      req.buyerCity;
    const body = {
      listingId: req.listingId,
      quantity: 1,
      variant: req.variant,
      deliveryAddress,
      buyerName: req.buyerName?.trim() || undefined,
      buyerPhone: req.buyerPhone || undefined,
      buyerEmail: req.buyerEmail || undefined,
    };

    // Backend responds `{ order, buyerToken, payment }`; the FE wants a flat
    // `{ orderToken, shortId, amountNGN, payIn }`. The buyer's pages are keyed
    // by their secret `buyerToken`, so that's what we hand back as the token.
    const raw = await request<{
      order: { orderToken: string; shortId: string; amountNGN: number };
      buyerToken: string;
      payment: {
        accountName: string;
        accountNumber: string;
        bankName: string;
        amount: number;
      } | null;
    }>("POST", "/api/orders", body);

    const amountNGN = raw.payment?.amount ?? raw.order.amountNGN;
    return {
      orderToken: raw.buyerToken,
      shortId: raw.order.shortId,
      amountNGN,
      payIn: raw.payment
        ? {
            bankName: raw.payment.bankName,
            bankAccountNumber: raw.payment.accountNumber,
            bankAccountName: raw.payment.accountName,
            totalAmountKobo: amountNGN * 100,
          }
        : null,
      payInError: raw.payment
        ? null
        : "The escrow pay-in account couldn't be created. Please try again.",
    };
  },
  /**
   * Buyer says they've paid. In production the payment provider's webhook
   * marks the order funded, so this just re-reads the order. On a staging
   * backend with `PAYMENT_SIMULATION=true`, set `VITE_PAYMENT_SIMULATION=true`
   * to mark it paid without a real transfer.
   */
  async confirmPayment(token: string): Promise<SimulatePaymentResponse> {
    if (import.meta.env.VITE_PAYMENT_SIMULATION === "true") {
      await request<{ ok: boolean }>("POST", `/api/dev/simulate-payment`, {
        orderToken: token,
      });
    }
    const { order } = await request<GetOrderResponse>(
      "GET",
      `/api/orders/${encodeURIComponent(token)}`,
    );
    return { order: mapOrderStatus(order) };
  },
  async getOrder(token: string): Promise<GetOrderResponse> {
    // Backend returns the flat { order, listing, seller, dispute } shape
    // (normalized server-side). Map the escrow status to the FE enum.
    const res = await request<GetOrderResponse>(
      "GET",
      `/api/orders/${encodeURIComponent(token)}`,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async deliverOrder(token: string): Promise<ShipOrderResponse> {
    const res = await request<ShipOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/deliver`,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async releaseOrder(token: string): Promise<ReleaseOrderResponse> {
    // No body — the buyer's secret token in the URL is their authority.
    // The backend pays the seller out.
    const res = await request<ReleaseOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/release`,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async openDispute(
    token: string,
    req: OpenDisputeRequest,
  ): Promise<OpenDisputeResponse> {
    // Backend exposes this at the FE's original path and returns { order, dispute }.
    const res = await request<OpenDisputeResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/dispute`,
      req,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async shipOrder(
    token: string,
    req: ShipOrderRequest,
  ): Promise<ShipOrderResponse> {
    const res = await request<ShipOrderResponse>(
      "POST",
      `/api/orders/${encodeURIComponent(token)}/ship`,
      req,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async respondToDispute(
    disputeId: string,
    req: RespondToDisputeRequest,
  ): Promise<RespondToDisputeResponse> {
    // Backend exposes this at the FE's original path and returns { order, dispute }.
    const res = await request<RespondToDisputeResponse>(
      "POST",
      `/api/disputes/${encodeURIComponent(disputeId)}/respond`,
      req,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
  async getDisputes(): Promise<GetDisputesResponse> {
    const { disputes } = await request<{ disputes: BackendAdminDispute[] }>(
      "GET",
      `/api/admin/disputes`,
    );
    // Flatten the backend's nested shape into the frontend's AdminDisputeRow.
    const rows: AdminDisputeRow[] = disputes.map((d) => {
      const { order, seller, listing, ...dispute } = d;
      const { listing: _orderListing, ...orderRest } = order;
      void _orderListing;
      return { order: mapOrderStatus(orderRest), listing, seller, dispute };
    });
    return { disputes: rows };
  },
  async resolveDispute(
    disputeId: string,
    req: ResolveDisputeRequest,
  ): Promise<ResolveDisputeResponse> {
    const res = await request<ResolveDisputeResponse>(
      "POST",
      `/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve`,
      req,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
};
