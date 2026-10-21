import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUUpLeft, Lock, Package, Scales, Storefront, TrendUp, WarningCircle } from "@phosphor-icons/react";

import { AdminShell } from "@/components/safesale/AdminShell";
import { ADMIN_OVERVIEW_KEY } from "@/lib/adminQueries";
import { AdminOrderList } from "@/components/admin/AdminOrderList";
import { AnimatedNumber } from "@/components/safesale/AnimatedNumber";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { Stagger, StaggerItem } from "@/components/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, DEMO_MODE } from "@/lib/api";
import type { AdminOverview as Overview, ApiOrderStatus } from "@/lib/api/types";
import { formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BAR: { status: ApiOrderStatus; label: string; cls: string }[] = [
  { status: "pending_payment", label: "Awaiting payment", cls: "bg-line-strong" },
  { status: "paid", label: "Paid, not shipped", cls: "bg-brand" },
  { status: "shipped", label: "Shipped", cls: "bg-info" },
  { status: "delivered", label: "Delivered", cls: "bg-mint" },
  { status: "disputed", label: "In dispute", cls: "bg-warning" },
  { status: "completed", label: "Paid out", cls: "bg-forest" },
  { status: "refunded", label: "Refunded", cls: "bg-negative" },
];

export default function AdminOverview() {
  useSeoMeta({ title: "Admin — SafeSale" });
  const { data, isLoading } = useQuery({
    queryKey: ADMIN_OVERVIEW_KEY,
    queryFn: () => apiClient.getAdminOverview(),
    refetchInterval: 15_000,
  });

  return (
    <AdminShell title="Overview" subtitle="Everything happening on SafeSale right now">
      {DEMO_MODE && (
        <p className="mb-6 rounded-2xl bg-canvas px-4 py-3 text-sm text-body">
          Demo mode: these numbers come from this browser's demo data. On the live site only the SafeSale admin account can open this console.
        </p>
      )}
      {isLoading || !data ? <OverviewSkeleton /> : <OverviewBody data={data} />}
    </AdminShell>
  );
}

function OverviewBody({ data }: { data: Overview }) {
  const attention = [
    data.openDisputes > 0 && {
      to: "/admin/disputes",
      icon: Scales,
      text: `${data.openDisputes} open ${data.openDisputes === 1 ? "dispute" : "disputes"}`,
      sub: "Buyers and sellers are waiting on a decision.",
    },
    data.refundsToPay.count > 0 && {
      to: "/admin/refunds",
      icon: ArrowUUpLeft,
      text: `${formatNGN(data.refundsToPay.amountNGN)} to refund`,
      sub: `${data.refundsToPay.count} ${data.refundsToPay.count === 1 ? "buyer is" : "buyers are"} owed money after a dispute.`,
    },
    data.failedPayouts > 0 && {
      to: "/admin/refunds",
      icon: WarningCircle,
      text: `${data.failedPayouts} failed ${data.failedPayouts === 1 ? "payout" : "payouts"}`,
      sub: "The bank rejected a transfer. It needs a look.",
    },
  ].filter(Boolean) as { to: string; icon: typeof Scales; text: string; sub: string }[];

  const total = Math.max(1, data.totalOrders);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem lift className="rounded-2xl bg-forest p-5 text-canvas">
          <BrandIcon icon={Lock} tone="mint" size="sm" />
          <p className="mt-4 text-sm text-canvas/75">Held in escrow</p>
          <AnimatedNumber value={data.heldNGN} format={(n) => formatNGN(Math.round(n))} className="block font-display text-h1 text-mint tabular-nums" />
        </StaggerItem>
        <StaggerItem lift className="rounded-2xl bg-canvas p-5">
          <BrandIcon icon={TrendUp} tone="pale" size="sm" />
          <p className="mt-4 text-sm text-mute">Paid to sellers this week</p>
          <AnimatedNumber value={data.paidOutWeekNGN} format={(n) => formatNGN(Math.round(n))} className="block font-display text-h1 text-ink tabular-nums" />
        </StaggerItem>
        <StaggerItem lift className="rounded-2xl bg-canvas p-5">
          <BrandIcon icon={Storefront} tone="info" size="sm" />
          <p className="mt-4 text-sm text-mute">Shops</p>
          <p className="font-display text-h1 text-ink tabular-nums">
            <AnimatedNumber value={data.sellers} />
            {data.newSellersWeek > 0 && <span className="ml-2 text-sm font-semibold text-brand">+{data.newSellersWeek} this week</span>}
          </p>
        </StaggerItem>
        <StaggerItem lift className="rounded-2xl bg-canvas p-5">
          <BrandIcon icon={Package} tone="neutral" size="sm" />
          <p className="mt-4 text-sm text-mute">Listings for sale</p>
          <AnimatedNumber value={data.activeListings} className="block font-display text-h1 text-ink tabular-nums" />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl bg-canvas p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-ink">Orders</h2>
            <p className="text-sm text-mute tabular-nums">{data.totalOrders} in total</p>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-canvas-soft">
            {STATUS_BAR.map((s, i) => {
              const n = data.ordersByStatus[s.status] ?? 0;
              if (!n) return null;
              return (
                <motion.div
                  key={s.status}
                  className={s.cls}
                  initial={{ width: 0 }}
                  animate={{ width: `${(n / total) * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.05, ease: [0.2, 0, 0, 1] }}
                  title={`${s.label}: ${n}`}
                />
              );
            })}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {STATUS_BAR.map((s) => (
              <li key={s.status}>
                <Link to={`/admin/orders?status=${s.status}`} className="flex items-center gap-2 text-body hover:text-ink">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.cls)} />
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="font-semibold text-ink tabular-nums">{data.ordersByStatus[s.status] ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-canvas p-5 sm:p-6">
          <h2 className="font-semibold text-ink">Needs your attention</h2>
          {attention.length === 0 ? (
            <p className="mt-4 rounded-xl bg-brand-pale p-4 text-sm text-brand-ink">
              Nothing waiting. No open disputes and no refunds owed.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link to={a.to} className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-canvas-soft">
                    <BrandIcon icon={a.icon} tone="warning" size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{a.text}</span>
                      <span className="block text-sm text-mute">{a.sub}</span>
                    </span>
                    <ArrowRight size={16} weight="bold" className="text-mute transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold text-ink">Latest orders</h2>
          <Link to="/admin/orders" className="text-sm font-semibold text-brand hover:underline">
            See all orders
          </Link>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="rounded-2xl bg-canvas p-8 text-center text-sm text-mute">No orders yet.</p>
        ) : (
          <AdminOrderList orders={data.recentOrders} />
        )}
      </section>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
