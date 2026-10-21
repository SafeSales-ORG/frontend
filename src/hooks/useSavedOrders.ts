import { useSyncExternalStore } from "react";
import { savedOrders, type SavedOrder } from "@/lib/savedOrders";

const empty: SavedOrder[] = [];

/** Orders remembered on this device, kept in sync across tabs. */
export function useSavedOrders(): SavedOrder[] {
  return useSyncExternalStore(savedOrders.subscribe, savedOrders.list, () => empty);
}
