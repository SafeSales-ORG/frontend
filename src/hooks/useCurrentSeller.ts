/**
 * `useCurrentSeller` — the logged-in seller's SafeSale profile, as returned
 * by the backend at signup (`id`, `npub` — the backend's public seller id —
 * `handle`, `name`).
 *
 * Persisted to `localStorage` under `safesale:seller` so the dashboard
 * works across reloads. Set by `Onboarding.tsx` after
 * `apiClient.createSeller`; cleared on logout.
 */

import { useLocalStorage } from "@/hooks/useLocalStorage";

export interface CurrentSeller {
  /** Backend-assigned cuid; matches `Order.sellerId`. */
  id: string;
  /** Backend public seller id (used in seller-scoped API routes). */
  npub: string;
  /** SafeSale handle (lowercased, no `@`). */
  handle: string;
  /** Display name as registered. */
  name: string;
  /** Shop avatar / profile image URL (https), if the seller set one. */
  avatarUrl?: string | null;
  /** Payout bank details, set from the Earnings page. */
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;

  /** ISO timestamp of when this seller record was created on the backend. */
  createdAt: string;
}

const STORAGE_KEY = "safesale:seller";

export function useCurrentSeller(): [
  CurrentSeller | null,
  (next: CurrentSeller | null) => void,
] {
  const [seller, setSeller] = useLocalStorage<CurrentSeller | null>(
    STORAGE_KEY,
    null,
  );
  return [seller, setSeller];
}

/**
 * Imperative clear — call this from logout flows that don't have a
 * `setSeller` setter in scope.
 */
export function clearCurrentSeller(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore — likely SSR or storage disabled */
  }
}
