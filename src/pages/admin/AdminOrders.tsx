import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { MagnifyingGlass, Receipt } from "@phosphor-icons/react";

import { AdminShell } from "@/components/safesale/AdminShell";
import { AdminOrderList } from "@/components/admin/AdminOrderList";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api";
import type { ApiOrderStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: ApiOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid, not shipped" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "disputed", label: "In dispute" },
  { value: "completed", label: "Paid out" },
  { value: "refunded", label: "Refunded" },
  { value: "pending_payment", label: "Awaiting payment" },
];

export default function AdminOrders() {
  useSeoMeta({ title: "Orders — SafeSale admin" });
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as ApiOrderStatus | null) ?? undefined;
  const [q, setQ] = useState("");
  const search = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["safesale", "admin", "orders", status ?? "all", search],
    queryFn: () => apiClient.getAdminOrders({ status, q: search || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const orders = data?.orders ?? [];

  const setStatus = (value: ApiOrderStatus | "all") =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "all") next.delete("status");
      else next.set("status", value);
      return next;
    });

  return (
    <AdminShell title="Orders" subtitle="Every order on SafeSale, newest first">
      <div className="space-y-5">
        <div className="rounded-2xl bg-canvas p-4">
          <div className="relative">
            <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by order number, buyer, shop or product"
              className="pl-10"
              aria-label="Search orders"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => {
              const active = (status ?? "all") === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-forest text-mint" : "bg-canvas-soft text-body hover:bg-canvas-sunken",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-80 rounded-2xl" />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-canvas p-10 text-center">
            <BrandIcon icon={Receipt} tone="neutral" size="lg" />
            <p className="mt-4 font-semibold text-ink">No orders here</p>
            <p className="mt-1 text-sm text-mute">{search ? "Nothing matches that search." : "Try another filter."}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-mute tabular-nums">
              {orders.length} {orders.length === 1 ? "order" : "orders"}
            </p>
            <AdminOrderList orders={orders} />
          </>
        )}
      </div>
    </AdminShell>
  );
}
