/**
 * Seller Earnings — `/app/earnings`.
 *
 * Designed and ported directly from spec — no Stitch round-trip on
 * this screen (cost more than the layout it produced for the other
 * pages). Same visual contract as #2 / #3 / #4: semantic tokens,
 * lucide icons only, mobile-first.
 *
 * Data source: 100 % `useSellerOrders()` — the same TanStack cache
 * the dashboard and the orders list use, so all three surfaces agree
 * at all times. Backend has no dedicated `/api/earnings` endpoint yet
 * (per PROGRESS.md "Still on mock data" + PRD delta #8). When it
 * lands, the aggregation done here in JavaScript moves to a single
 * `apiClient.getEarnings()` call; the UI doesn't change.
 *
 * What the page surfaces (every number derived from real orders):
 *
 *   - Released (lifetime)  — sum of amountNGN across `completed` orders
 *   - Locked in escrow     — sum of amountNGN across `paid` orders
 *   - This month           — sum of amountNGN across `completed` orders
 *                            where releasedAt ≥ first of current month
 *   - Pending shipment     — count of orders still in `paid`
 *   - Payout history       — completed orders, newest first, in NGN
 *
 * What's intentionally *NOT* on this page:
 *
 *   - Sparkline / weekly chart. Earlier stub had a fabricated 7-day
 *     array; we don't have real time-series data and inventing one
 *     would be a fake-stat in the same category as the old TrustStrip
 *     numbers. Dropped.
 *
 *   - Bank account "on file." The backend Seller schema supports
 *     `bankName`, `bankAccount`, `bankHolder` but nothing reads/writes
 *     them on this page yet. Showing a fake "GTB ****2841" row in the
 *     meantime is lying. Replaced with an honest empty-state card.
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useState } from "react";

import { AppShell } from "@/components/safesale/AppShell";
import { EscrowStatusPill } from "@/components/safesale/EscrowStatus";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Pencil,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { NIGERIAN_BANKS } from "@/lib/nigeria";
import type { CurrentSeller } from "@/hooks/useCurrentSeller";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useSellerEarningsLive, useCashOut } from "@/hooks/useMarket";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import type { SellerOrderRow } from "@/lib/api";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                Page                                     */
/* ----------------------------------------------------------------------- */

export default function EarningsPage() {
  useSeoMeta({ title: "Earnings — SafeSale" });

  const [seller, setSeller] = useCurrentSeller();
  const { orders, isLoading } = useSellerOrders();
  const { toast } = useToast();

  // Live escrow earnings — Locked vs Available, summed across all of this
  // seller's orders and updated the instant an order changes state.
  const earnings = useSellerEarningsLive();
  const cashOut = useCashOut();

  const stats = useMemo(() => computeStats(orders), [orders]);
  const completed = useMemo(
    () =>
      orders
        .filter((o) => o.status === "completed")
        .sort((a, b) => +new Date(b.releasedAt ?? b.updatedAt) - +new Date(a.releasedAt ?? a.updatedAt)),
    [orders],
  );

  const canCashOut = earnings.availableNGN > 0;
  const onCashOut = () => {
    if (!canCashOut) {
      toast({
        title: "Nothing to cash out yet",
        description:
          "Funds become available once a buyer confirms delivery or a dispute resolves in your favour.",
      });
      return;
    }
    const ngn = earnings.availableNGN;
    cashOut(ngn);
    toast({
      title: "Cash-out initiated",
      description: `${formatNGN(ngn)} is on its way to your bank. Allow 1–2 business days.`,
    });
  };

  return (
    <AppShell
      title="Earnings"
      subtitle="Every released order — Naira in escrow, paid straight to your bank."
    >
      <div className="space-y-6">
        {/* 1. Hero — available balance + working cash-out, locked alongside */}
        <section className="grid gap-4 sm:grid-cols-2">
          {/* Available to withdraw */}
          <div className="overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/60 to-white p-5 sm:p-6">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-brand-soft-foreground">
              <Wallet className="h-3.5 w-3.5" aria-hidden /> Available to cash out
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {isLoading ? (
                <Skeleton className="h-9 w-40" />
              ) : (
                <>
                  <p className="text-3xl font-semibold tracking-tight text-ink tabular-nums sm:text-4xl">
                    {formatNGN(earnings.availableNGN)}
                  </p>
                </>
              )}
            </div>
            
            <Button
              type="button"
              onClick={onCashOut}
              disabled={!canCashOut}
              size="lg"
              className="mt-4 h-11 w-full rounded-lg bg-brand text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              <ArrowDownCircle className="mr-2 h-4 w-4" aria-hidden />
              {!canCashOut ? "Nothing to cash out yet" : "Cash out to Naira"}
            </Button>
            {earnings.paidOutNGN > 0 && (
              <p className="mt-2 text-[11px] text-ink-soft tabular-nums">
                {formatNGN(earnings.paidOutNGN)} cashed out so far
              </p>
            )}
          </div>

          {/* Locked in escrow */}
          <div className="overflow-hidden rounded-2xl border border-border bg-white p-5 sm:p-6">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Locked in escrow
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {isLoading ? (
                <Skeleton className="h-9 w-40" />
              ) : (
                <>
                  <p className="text-3xl font-semibold tracking-tight text-amber-700 tabular-nums sm:text-4xl">
                    {formatNGN(earnings.lockedNGN)}
                  </p>
                </>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Held safely until the buyer confirms delivery, the order
              auto-completes, or a dispute resolves in your favour. You can't
              withdraw this yet — that's the buyer's protection.
            </p>
          </div>
        </section>

        {/* 2. Stats grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={ShieldCheck}
            label="Released (lifetime)"
            value={isLoading ? null : formatNGN(earnings.releasedNGN)}
            sub={null}
            footnote={
              stats.toShipCount > 0
                ? `${stats.toShipCount} order${stats.toShipCount === 1 ? "" : "s"} still to ship`
                : "All caught up"
            }
            footnoteTone={stats.toShipCount > 0 ? "warn" : "ok"}
          />
          <StatCard
            icon={TrendingUp}
            label="This month"
            value={isLoading ? null : formatNGN(stats.monthNGN)}
            sub={null}
            footnote={
              stats.monthCount > 0
                ? `${stats.monthCount} release${stats.monthCount === 1 ? "" : "s"}`
                : "No releases yet this month"
            }
          />
          <StatCard
            icon={CheckCircle2}
            label="Completed orders"
            value={isLoading ? null : String(stats.completedCount)}
            sub={isLoading ? null : "all time"}
            footnote={
              stats.completedCount > 0
                ? `Latest · ${formatRelative(completed[0]?.releasedAt ?? completed[0]?.updatedAt ?? "")}`
                : "When buyers release, they show up here"
            }
          />
        </section>

        {/* 3. Bank-on-file panel — add / edit payout bank */}
        <BankPanel seller={seller} onSave={setSeller} />

        {/* 4. Payout history (=completed orders) */}
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                Payout history
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Every order the buyer released. Newest first.
              </p>
            </div>
            <Link
              to="/app/orders"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              All orders <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </header>

          {isLoading ? (
            <PayoutSkeleton />
          ) : !seller ? (
            <EmptyNotSignedUp />
          ) : completed.length === 0 ? (
            <EmptyNoPayouts toShipCount={stats.toShipCount} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-white text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    <tr>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Released</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {completed.map((o) => (
                      <PayoutRow key={o.orderToken} order={o} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <ul className="divide-y divide-border sm:hidden">
                {completed.map((o) => (
                  <PayoutMobile key={o.orderToken} order={o} />
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 5. Footnote — how released funds are held */}
        <p className="px-1 text-[11px] italic leading-relaxed text-ink-soft">
          Released funds are yours — paid out in Naira to your Nigerian bank
          account whenever you like.
        </p>
      </div>
    </AppShell>
  );
}

/* ----------------------------------------------------------------------- */
/*                            Aggregation                                  */
/* ----------------------------------------------------------------------- */

interface Stats {
  releasedNGN: number;
  lockedNGN: number;
  monthNGN: number;
  monthCount: number;
  completedCount: number;
  toShipCount: number;
}

function computeStats(orders: SellerOrderRow[]): Stats {
  const firstOfMonthMs = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  })();

  let releasedNGN = 0;
  let lockedNGN = 0;
  let monthNGN = 0;
  let monthCount = 0;
  let completedCount = 0;
  let toShipCount = 0;

  for (const o of orders) {
    if (o.status === "completed") {
      releasedNGN += o.amountNGN;
      completedCount += 1;

      const releasedAt = o.releasedAt ? Date.parse(o.releasedAt) : null;
      if (releasedAt && releasedAt >= firstOfMonthMs) {
        monthNGN += o.amountNGN;
        monthCount += 1;
      }
    } else if (o.status === "paid") {
      lockedNGN += o.amountNGN;
      toShipCount += 1;
    }
  }

  return {
    releasedNGN,
    lockedNGN,
    monthNGN,
    monthCount,
    completedCount,
    toShipCount,
  };
}

/* ----------------------------------------------------------------------- */
/*                            Subcomponents                                */
/* ----------------------------------------------------------------------- */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  footnote,
  footnoteTone,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string | null;
  sub: string | null;
  footnote: string;
  footnoteTone?: "warn" | "ok";
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
          {label}
        </p>
        <Icon className="h-4 w-4 text-ink-soft" aria-hidden />
      </div>
      <div className="mt-2 min-h-[2rem]">
        {value === null ? (
          <Skeleton className="h-6 w-32" />
        ) : (
          <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
        )}
      </div>
      <div className="mt-0.5 min-h-[1rem]">
        {sub === null ? (
          <Skeleton className="h-3 w-20" />
        ) : (
          <p className="text-[11px] tabular-nums text-ink-soft">{sub}</p>
        )}
      </div>
      <p
        className={
          "mt-3 border-t border-border pt-3 text-[11px] " +
          (footnoteTone === "warn"
            ? "text-amber-800"
            : footnoteTone === "ok"
              ? "text-brand-soft-foreground"
              : "text-ink-soft")
        }
      >
        {footnote}
      </p>
    </div>
  );
}

function BankPanel({
  seller,
  onSave,
}: {
  seller: CurrentSeller | null;
  onSave: (next: CurrentSeller) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankName, setBankName] = useState(seller?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(seller?.bankAccount ?? "");
  const [accountName, setAccountName] = useState(seller?.bankHolder ?? "");
  const hasBank = !!seller?.bankName && !!seller?.bankAccount;

  const bankValid =
    bankName.trim().length > 1 &&
    /^\d{10}$/.test(accountNumber.trim()) &&
    accountName.trim().length > 1;
  // Backend requires a bank payout method.
  const valid = bankValid;

  const openDialog = () => {
    setBankName(seller?.bankName ?? "");
    setAccountNumber(seller?.bankAccount ?? "");
    setAccountName(seller?.bankHolder ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!valid || !seller) return;
    setSaving(true);
    try {
      await apiClient.updatePayout(seller.id, {
        ...(bankValid
          ? {
              bankName: bankName.trim(),
              bankAccount: accountNumber.trim(),
              bankHolder: accountName.trim(),
            }
          : {}),
        
      });
      onSave({
        ...seller,
        ...(bankValid
          ? {
              bankName: bankName.trim(),
              bankAccount: accountNumber.trim(),
              bankHolder: accountName.trim(),
            }
          : {}),
        
      });
      setOpen(false);
      toast({
        title: "Payout details saved",
        description: "You can now cash out to Naira.",
      });
    } catch (err) {
      toast({
        title: "Couldn't save payout details",
        description:
          err instanceof Error
            ? err.message
            : "Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasAny = hasBank;

  return (
    <section
      className={cn(
        "rounded-2xl border bg-white p-5 sm:p-6",
        hasAny ? "border-border" : "border-dashed border-border",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            hasAny ? "bg-brand-soft text-brand" : "bg-surface text-ink-soft",
          )}
        >
          {hasAny ? <Check className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          {hasAny ? (
            <>
              <p className="text-sm font-semibold text-ink">✓ Payout details added</p>
              {hasBank && (
                <p className="mt-1 text-sm text-ink-soft">
                  {seller?.bankName} ·{" "}
                  <span className="tabular-nums">
                    ****{(seller?.bankAccount ?? "").slice(-4)}
                  </span>{" "}
                  · {seller?.bankHolder}
                </p>
              )}
              
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">
                No payout details on file yet
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Add a Nigerian bank account to cash out to Naira.
              </p>
            </>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={openDialog}
          disabled={!seller}
          className="shrink-0"
        >
          {hasAny ? (
            <>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit payout
            </>
          ) : (
            "Add payout details"
          )}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{hasAny ? "Edit payout details" : "Add payout details"}</DialogTitle>
            <DialogDescription>
              Where we send your earnings. Add a bank account for Naira. You can update this any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bank</Label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent>
                  {NIGERIAN_BANKS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="acct-no">Account number</Label>
              <Input
                id="acct-no"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="0123456789"
                className="mt-1.5 h-11 tabular-nums"
              />
              {accountNumber.length > 0 && accountNumber.length < 10 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Account number is 10 digits.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="acct-name">Account name</Label>
              <Input
                id="acct-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="As it appears on your bank account"
                className="mt-1.5 h-11"
              />
            </div>

            
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!valid || saving}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {saving ? "Saving..." : "Save payout details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PayoutRow({ order }: { order: SellerOrderRow }) {
  return (
    <tr className="hover:bg-surface">
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <ListingThumb
            image={order.listing.images[0]}
            alt={order.listing.title}
            size={40}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {order.listing.title}
            </p>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
              {order.shortId}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <p className="truncate text-sm text-ink">{order.buyerName}</p>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {order.buyerCity}
        </p>
      </td>
      <td className="px-4 py-3 align-middle text-right">
        <p className="text-sm font-semibold tabular-nums text-ink">
          {formatNGN(order.amountNGN)}
        </p>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <EscrowStatusPill status={order.status} size="sm" />
          <span className="text-[11px] text-ink-soft">
            {formatRelative(order.releasedAt ?? order.updatedAt)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function PayoutMobile({ order }: { order: SellerOrderRow }) {
  return (
    <li className="px-4 py-4">
      <div className="flex items-center gap-3">
        <ListingThumb
          image={order.listing.images[0]}
          alt={order.listing.title}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {order.listing.title}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
            {order.shortId}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-ink">
            {formatNGN(order.amountNGN)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          {order.buyerName}, {order.buyerCity}
        </p>
        <span className="text-[11px] text-ink-soft">
          {formatRelative(order.releasedAt ?? order.updatedAt)}
        </span>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                            Empty / loading                              */
/* ----------------------------------------------------------------------- */

function PayoutSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <div className="shrink-0 space-y-2 text-right">
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyNotSignedUp() {
  return (
    <div className="border-t border-border p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
        <Wallet className="h-6 w-6" aria-hidden />
      </div>
      <p className="mt-4 text-base font-semibold text-ink">
        Finish signing up to see your payouts
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
        You'll see every released order here once your seller profile is
        live.
      </p>
      <Link
        to="/onboarding"
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Complete signup
      </Link>
    </div>
  );
}

function EmptyNoPayouts({ toShipCount }: { toShipCount: number }) {
  return (
    <div className="border-t border-border p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
        <Clock className="h-6 w-6" aria-hidden />
      </div>
      <p className="mt-4 text-base font-semibold text-ink">No payouts yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
        {toShipCount > 0
          ? `You have ${toShipCount} order${toShipCount === 1 ? "" : "s"} locked in escrow. Mark them shipped, the buyer releases, and the money lands here.`
          : "When a buyer releases their first payment, it'll appear here. Share your listing link to bring in your first sale."}
      </p>
      <Link
        to="/app/orders"
        className="mt-5 inline-flex h-11 items-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Go to orders
      </Link>
    </div>
  );
}
