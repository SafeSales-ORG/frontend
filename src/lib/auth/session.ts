/**
 * JWT auth session store.
 *
 * SafeSale auth is a standard JWT session (email/password or Google). The
 * token issued by the backend is persisted to localStorage and attached as
 * `Authorization: Bearer <token>` on every API call (see `lib/api/http.ts`).
 *
 * This is a tiny external store (module-level value + listener set) so any
 * component can subscribe via `useAuth()` and re-render the instant the user
 * logs in or out — no React context provider required. Cross-tab logout is
 * handled by listening for the browser `storage` event.
 *
 * NOTE: this is the *user* identity. The seller profile lives separately in
 * `useCurrentSeller` (also localStorage-backed) because a user may or may not
 * have opened a shop.
 */

import type { AuthSession } from "@/lib/api/types";

const STORAGE_KEY = "safesale:auth";

function load(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

let current: AuthSession | null = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Current session, or null if signed out. */
export function getSession(): AuthSession | null {
  return current;
}

/** Bearer token for API calls, or null if signed out. */
export function getToken(): string | null {
  return current?.token ?? null;
}

/** Persist a new session (or clear it with `null`) and notify subscribers. */
export function setSession(next: AuthSession | null): void {
  current = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled — session still works for this tab in memory */
  }
  emit();
}

export function clearSession(): void {
  setSession(null);
}

/** Subscribe to session changes. Returns an unsubscribe fn. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Keep tabs in sync: another tab logging in/out updates this one.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      current = load();
      emit();
    }
  });
}
