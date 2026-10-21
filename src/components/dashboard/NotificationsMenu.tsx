import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, LockKey, Money, Truck, WarningCircle, type Icon } from "@phosphor-icons/react";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "paid" | "shipped" | "disputed" | "paidout";

interface Notification {
  id: string;
  kind: Kind;
  text: string;
  at: string;
  to: string;
}

const ICON: Record<Kind, { Icon: Icon; tone: string }> = {
  paid: { Icon: LockKey, tone: "bg-brand-pale text-brand" },
  shipped: { Icon: Truck, tone: "bg-info-pale text-info" },
  disputed: { Icon: WarningCircle, tone: "bg-warning-pale text-warning" },
  paidout: { Icon: Money, tone: "bg-mint text-forest" },
};

/**
 * Order events as notifications. "Unread" = newer than the last time the
 * seller opened this panel (remembered per shop in this browser).
 */
export function NotificationsMenu() {
  const { orders } = useSellerOrders();
  const [seller] = useCurrentSeller();
  const [lastSeen, setLastSeen] = useLocalStorage<string>(`safesale:notifications-seen:${seller?.id ?? ""}`, "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const list: Notification[] = [];
    for (const o of orders) {
      const to = `/app/orders/${o.orderToken}`;
      const amount = formatNGN(o.amountNGN);
      if (o.status === "paid") {
        list.push({ id: `paid-${o.orderToken}`, kind: "paid", text: `${o.buyerName} paid ${amount} for “${o.listing.title}”. Ship it now.`, at: o.updatedAt, to });
      }
      if ((o.status === "shipped" || o.status === "delivered") && o.shippedAt) {
        list.push({ id: `ship-${o.orderToken}`, kind: "shipped", text: `${o.shortId} is on its way to ${o.buyerName}.`, at: o.shippedAt, to });
      }
      if (o.status === "disputed") {
        list.push({ id: `disp-${o.orderToken}`, kind: "disputed", text: `${o.buyerName} reported a problem with ${o.shortId}.`, at: o.updatedAt, to: `/app/dispute/${o.orderToken}` });
      }
      if (o.status === "completed") {
        list.push({ id: `done-${o.orderToken}`, kind: "paidout", text: `${amount} for ${o.shortId} was paid to your bank.`, at: o.releasedAt ?? o.updatedAt, to });
      }
    }
    return list.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 20);
  }, [orders]);

  const unread = items.filter((n) => !lastSeen || new Date(n.at) > new Date(lastSeen)).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = () => setLastSeen(new Date().toISOString());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-body transition-colors hover:bg-canvas-soft hover:text-ink"
      >
        <Bell size={20} weight={open ? "fill" : "regular"} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-negative px-1 text-[10px] font-bold text-canvas tabular-nums ring-2 ring-canvas"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl bg-canvas shadow-[var(--shadow-float)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold text-ink">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="text-sm font-medium text-brand hover:underline">
                  Mark all as read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={28} weight="duotone" className="mx-auto text-mute" aria-hidden />
                <p className="mt-3 text-sm font-medium text-ink">Nothing yet</p>
                <p className="mt-1 text-sm text-mute">New payments, shipments and payouts show up here.</p>
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {items.map((n, i) => {
                  const isUnread = !lastSeen || new Date(n.at) > new Date(lastSeen);
                  const { Icon, tone } = ICON[n.kind];
                  return (
                    <motion.li
                      key={n.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.03 }}
                    >
                      <Link
                        to={n.to}
                        onClick={() => {
                          setOpen(false);
                          markAllRead();
                        }}
                        className={cn("flex items-start gap-3 px-4 py-3 hover:bg-canvas-soft", isUnread && "bg-brand-pale/40")}
                      >
                        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full", tone)}>
                          <Icon size={18} weight="duotone" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-ink">{n.text}</span>
                          <span className="mt-0.5 block text-xs text-mute">{formatRelative(n.at)}</span>
                        </span>
                        {isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
