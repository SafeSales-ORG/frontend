/**
 * Orders a buyer placed or opened on this device. Buyers have no account,
 * so this is how "My orders" works without one. Browser storage only: it
 * can be empty (private mode, cleared data) and nothing breaks if it is.
 */

export interface SavedOrder {
  /** The buyer's secret order-link token. */
  token: string;
  shortId: string;
  title: string;
  amountNGN: number;
  image?: string | null;
  savedAt: string;
}

const KEY = "safesale:my-orders:v1";
const MAX = 50;
const listeners = new Set<() => void>();
let cache: SavedOrder[] | null = null;

function read(): SavedOrder[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as SavedOrder[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: SavedOrder[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the list just lives for this visit.
  }
  listeners.forEach((l) => l());
}

export const savedOrders = {
  list(): SavedOrder[] {
    return read();
  },
  /** Add a new order at the top; an order already saved keeps its place. */
  save(order: Omit<SavedOrder, "savedAt">) {
    const list = read();
    const existing = list.find((o) => o.token === order.token);
    if (!existing) {
      write([{ ...order, savedAt: new Date().toISOString() }, ...list].slice(0, MAX));
      return;
    }
    const next = { ...existing, ...order };
    // The order page polls; only write when something actually changed.
    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      write(list.map((o) => (o.token === order.token ? next : o)));
    }
  },
  remove(token: string) {
    write(read().filter((o) => o.token !== token));
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
};

/** Pull the token out of a pasted order link (or accept a bare token). */
export function tokenFromOrderLink(input: string): string | null {
  const text = input.trim();
  const match = /\/order\/([A-Za-z0-9_-]{8,128})/.exec(text);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{16,128}$/.test(text) ? text : null;
}
