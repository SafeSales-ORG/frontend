/**
 * SafeSale API — error type.
 *
 * Every method on `apiClient` rejects with an `ApiError` on failure. The
 * UI can render `err.message` directly; `err.code` is stable and meant
 * for branching ("ORDER_NOT_FOUND" → 404 page, etc.). The shape mirrors
 * the JSON envelope defined in BACKEND.md §HTTP API:
 *
 *   { "error": { "code": "...", "message": "..." } }
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * True when a call failed because the backend route isn't built yet (404 on a
 * write path). The live backend is still missing several routes (see
 * PROGRESS.md "BACKEND HANDOFF"); until they land, these actions only work in
 * demo mode. Lets the UI show an honest message instead of a scary error.
 */
export function isEndpointMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Friendly copy for an action whose backend route doesn't exist yet. */
export function backendPendingMessage(action: string): string {
  return `${action} isn't available on the live backend yet — the backend team is still building this route. It works fully in demo mode.`;
}

/** Known error codes the buyer slice may surface. Extend as needed. */
export type ApiErrorCode =
  | "ORDER_NOT_FOUND"
  | "LISTING_NOT_FOUND"
  | "ORDER_ALREADY_RELEASED"
  | "ORDER_NOT_RELEASABLE"
  | "DISPUTE_ALREADY_OPEN"
  | "INVALID_REQUEST"
  | "BACKEND_UNREACHABLE"
  | "UNKNOWN";
