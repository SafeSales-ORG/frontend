/**
 * SafeSale HTTP API — real (fetch) implementation.
 *
 * Hits the backend (Fastify + Prisma + Postgres, Nomba rail).
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

/** Shape the backend returns from GET /api/mediator/disputes (listing/seller
 * nested under `order`). We flatten it to the frontend's AdminDisputeRow. */
interface BackendAdminDispute extends ApiDispute {
  order: ApiOrder & { listing: ApiListing; seller: ApiSeller };
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
    // Backend updates the caller's OWN seller via the JWT at PUT /api/sellers
    // (no `:id`); it re-runs the Nomba lookup to refresh the account name.
    return request<void>("PUT", "/api/sellers", req);
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
    //  - `_listingHint`/`buyerNpub`/`buyerName`/`contactMethod` are mock-only
    //    or backend-ignored; we drop them (backend hardcodes buyerName).
    const deliveryAddress =
      [req.buyerAddress, req.buyerCity].filter(Boolean).join(", ").trim() ||
      req.buyerCity;
    const body = {
      listingId: req.listingId,
      quantity: 1,
      variant: req.variant,
      deliveryAddress,
      buyerPhone: req.buyerPhone || undefined,
      buyerEmail: req.buyerEmail || undefined,
    };

    // Backend responds `{ order, payment }`; the FE wants a flat
    // `{ orderToken, shortId, amountNGN, payIn }`. Map it.
    const raw = await request<{
      order: { orderToken: string; shortId: string; priceNGN: number };
      payment: {
        accountName: string;
        accountNumber: string;
        bankName: string;
        amount: number;
      } | null;
    }>("POST", "/api/orders", body);

    const amountNGN = raw.payment?.amount ?? raw.order.priceNGN;
    return {
      orderToken: raw.order.orderToken,
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
   * DEV/DEMO: mark an order funded without a real bank transfer. The real
   * backend route is `POST /api/dev/simulate-payment` with `{ orderToken }`
   * (enabled on the deployed server via `NOMBA_SIMULATION`; in true production
   * payment is confirmed by the Nomba webhook instead). We then re-read the
   * order so callers get the updated `{ order }` shape.
   */
  async confirmPayment(token: string): Promise<SimulatePaymentResponse> {
    await request<{ ok: boolean; simulatedAmountNGN: number }>(
      "POST",
      `/api/dev/simulate-payment`,
      { orderToken: token },
    );
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
    // No body — possession of the orderToken in the URL is the buyer's
    // authority. The backend triggers the Nomba payout to the seller.
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
      const { order, ...dispute } = d;
      const { listing, seller, ...orderRest } = order;
      return { order: orderRest, listing, seller, dispute };
    });
    return { disputes: rows };
  },
  async resolveDispute(
    disputeId: string,
    req: ResolveDisputeRequest,
  ): Promise<ResolveDisputeResponse> {
    // Backend expects `buyerPercent`; the frontend form uses `splitPct`.
    const { splitPct, ...rest } = req;
    const body = splitPct === undefined ? rest : { ...rest, buyerPercent: splitPct };
    const res = await request<ResolveDisputeResponse>(
      "POST",
      `/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve`,
      body,
    );
    return { ...res, order: mapOrderStatus(res.order) };
  },
};
