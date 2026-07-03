/**
 * SafeSale buyer-key store.
 *
 * The buyer never has a SafeSale account. Instead, when they hit
 * Checkout we generate a **one-time Nostr keypair** for them and send
 * the npub up to the backend in `POST /api/orders`. The backend uses
 * that npub to address the buyer's order notifications (Nostr DMs); it
 * also serves as a stable, account-free buyer identity for the order.
 * The nsec is stored in this browser only, keyed by `orderToken`.
 *
 * The key is bound to one order: it cannot sign anything else and has no
 * associated profile. After the order completes or refunds call
 * `clearBuyerKey(token)` to remove the entry. Until then we keep it —
 * buyers frequently reopen their order page days later from a bookmark
 * or SMS link.
 *
 * Layout in localStorage (one entry per order):
 *
 *   key:   `safesale:buyer:<orderToken>`
 *   value: `{ "nsec": "nsec1...", "npub": "npub1...", "createdAt": "ISO8601" }`
 */

import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

/** A buyer's one-time keypair, persisted per-order in this browser. */
export interface BuyerKey {
  /** Bech32 nsec. Held only in the buyer's browser. */
  nsec: string;
  /** Bech32 npub. Sent to the backend at order creation. */
  npub: string;
  /** ISO 8601 — when this key was generated (for debugging only). */
  createdAt: string;
}

const KEY_PREFIX = "safesale:buyer:";

function storageKey(orderToken: string): string {
  return `${KEY_PREFIX}${orderToken}`;
}

/**
 * Generate a fresh keypair, persist it under the given order token, and
 * return it. Calling this **overwrites** any existing key for the same
 * token — only call it once per order (at checkout, immediately before
 * `createOrder`).
 *
 * Callers should also send `result.npub` up to the backend in the
 * `CreateOrderRequest.buyerNpub` field.
 */
export function generateBuyerKey(orderToken: string): BuyerKey {
  const secretBytes = generateSecretKey();
  const pubkeyHex = getPublicKey(secretBytes);
  const nsec = nip19.nsecEncode(secretBytes);
  const npub = nip19.npubEncode(pubkeyHex);
  const entry: BuyerKey = {
    nsec,
    npub,
    createdAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(orderToken), JSON.stringify(entry));
  } catch {
    // localStorage may throw in incognito with quota set to 0, or when
    // disabled. We still return the keypair — the caller can choose to
    // proceed (degraded: release won't work after page reload) or warn
    // the user. Hooks that depend on persistence call `getBuyerKey()`
    // later and see `null`, then surface a clear error there.
  }
  return entry;
}

/**
 * Re-persist an existing keypair under a new orderToken — used when
 * the keypair was generated before the order token was known (because
 * the backend mints the token in the same call that needs the npub),
 * then re-stored under the real token once the response lands.
 *
 * Does NOT generate a new key. Use `generateBuyerKey` for that.
 */
export function persistBuyerKey(orderToken: string, key: Pick<BuyerKey, "nsec" | "npub">): void {
  const entry: BuyerKey = {
    nsec: key.nsec,
    npub: key.npub,
    createdAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(orderToken), JSON.stringify(entry));
  } catch {
    // best-effort, same reasoning as generateBuyerKey
  }
}

/**
 * Read the stored buyer key for an order. Returns `null` when no key
 * exists for this token in this browser — typically means the buyer is
 * opening the page from a different device than they used at checkout,
 * which is a known UX failure mode flagged elsewhere in the UI.
 */
export function getBuyerKey(orderToken: string): BuyerKey | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(orderToken));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as BuyerKey).nsec === "string" &&
      typeof (parsed as BuyerKey).npub === "string"
    ) {
      return parsed as BuyerKey;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove the stored key for an order. Call after a successful release
 * or refund — at that point the key has no further use and we
 * shouldn't keep it around indefinitely.
 */
export function clearBuyerKey(orderToken: string): void {
  try {
    localStorage.removeItem(storageKey(orderToken));
  } catch {
    // Same as generate: best-effort.
  }
}
