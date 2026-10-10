import { Link } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";

import { Stagger, StaggerItem } from "@/components/motion";
import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import type { AdminOrderRow } from "@/lib/api/types";
import { formatNGN, formatRelative } from "@/lib/format";

/** Orders across every shop. Disputed ones open their case. */
export function AdminOrderList({ orders }: { orders: AdminOrderRow[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl bg-canvas md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Seller</th>
              <th className="px-5 py-3 font-medium">Buyer</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Placed</th>
            </tr>
          </thead>
          <Stagger as="tbody" className="divide-y divide-line">
            {orders.map((o) => (
              <StaggerItem as="tr" key={o.id} className="group transition-colors hover:bg-canvas-soft">
                <td className="px-5 py-3.5">
                  <p className="font-mono text-sm font-semibold text-ink">{o.shortId}</p>
                  <p className="max-w-56 truncate text-xs text-mute">{o.listingTitle}</p>
                </td>
                <td className="px-5 py-3.5">
                  <Link to={`/s/${o.seller.handle}`} className="text-ink hover:text-brand hover:underline">
                    {o.seller.name}
                  </Link>
                  <p className="text-xs text-mute">@{o.seller.handle}</p>
                </td>
                <td className="px-5 py-3.5 text-ink">{o.buyerName}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-ink tabular-nums">{formatNGN(o.amountNGN)}</td>
                <td className="px-5 py-3.5">
                  {o.disputeId ? (
                    <Link to={`/admin/disputes?case=${o.disputeId}`} className="inline-flex items-center gap-1">
                      <EscrowStatusPill status={o.status} size="sm" />
                      <CaretRight size={14} className="text-mute" />
                    </Link>
                  ) : (
                    <EscrowStatusPill status={o.status} size="sm" />
                  )}
                </td>
                <td className="px-5 py-3.5 text-right text-mute">{formatRelative(o.createdAt)}</td>
              </StaggerItem>
            ))}
          </Stagger>
        </table>
      </div>

      <Stagger as="ul" className="space-y-3 md:hidden">
        {orders.map((o) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-ink">{o.shortId}</p>
                  <p className="truncate text-sm text-body">{o.listingTitle}</p>
                </div>
                <EscrowStatusPill status={o.status} size="sm" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 text-sm">
                <p className="min-w-0 truncate text-mute">
                  {o.buyerName} → {o.seller.name}
                </p>
                <p className="shrink-0 font-semibold text-ink tabular-nums">{formatNGN(o.amountNGN)}</p>
              </div>
            </>
          );
          return (
            <StaggerItem as="li" key={o.id}>
              {o.disputeId ? (
                <Link to={`/admin/disputes?case=${o.disputeId}`} className="block rounded-2xl bg-canvas p-4">
                  {body}
                </Link>
              ) : (
                <div className="rounded-2xl bg-canvas p-4">{body}</div>
              )}
            </StaggerItem>
          );
        })}
      </Stagger>
    </>
  );
}
