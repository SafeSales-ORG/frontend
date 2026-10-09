/**
 * Seller earnings — `/app/earnings`.
 *
 * There is no balance to withdraw: when escrow is released, SafeSale pays
 * the seller's bank account automatically. This page shows what's held,
 * what's been paid out, and where payouts go.
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Landmark, Loader2, Lock, Pencil } from "lucide-react";

import { AppShell } from "@/components/safesale/AppShell";
import { Stagger, StaggerItem } from "@/components/motion";
import { AnimatedNumber } from "@/components/safesale/AnimatedNumber";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useToast } from "@/hooks/useToast";
import { apiClient, type SellerOrderRow } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import type { SellerPayout } from "@/lib/api/types";
import { formatDate, formatNGN } from "@/lib/format";
import { NIGERIAN_BANKS, bankNameFromCode } from "@/lib/nigeria";

const HELD = new Set(["paid", "shipped", "delivered", "disputed"]);
const MY_SELLER_KEY = ["safesale", "my-seller"] as const;

export default function EarningsPage() {
  useSeoMeta({ title: "Earnings — SafeSale" });
  const { orders, isLoading } = useSellerOrders();
  const [monthStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });

  const { held, heldCount, monthNGN, totalNGN, paidOut } = useMemo(() => {
    let heldSum = 0;
    let heldN = 0;
    let month = 0;
    let total = 0;
    const released: SellerOrderRow[] = [];
    for (const o of orders) {
      if (HELD.has(o.status)) {
        heldSum += o.amountNGN;
        heldN += 1;
      }
      if (o.status === "completed") {
        released.push(o);
        total += o.amountNGN;
        if (new Date(o.releasedAt ?? o.updatedAt).getTime() >= monthStart) month += o.amountNGN;
      }
    }
    released.sort((a, b) => +new Date(b.releasedAt ?? b.updatedAt) - +new Date(a.releasedAt ?? a.updatedAt));
    return { held: heldSum, heldCount: heldN, monthNGN: month, totalNGN: total, paidOut: released };
  }, [orders, monthStart]);

  return (
    <AppShell title="Earnings" subtitle="Money held for you, and what's been paid to your bank">
      <Stagger className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <StaggerItem className="rounded-xl bg-forest p-6 text-canvas">
          <p className="flex items-center gap-2 text-sm font-medium text-mint">
            <Lock className="h-4 w-4" aria-hidden /> Held in escrow
          </p>
          <AnimatedNumber value={held} format={(n) => formatNGN(Math.round(n))} className="mt-4 block text-display-md tabular-nums" />
          <p className="mt-2 text-sm text-canvas/70">
            {heldCount === 0
              ? "Nothing waiting right now."
              : `Across ${heldCount} order${heldCount === 1 ? "" : "s"}. Released when buyers confirm delivery.`}
          </p>
        </StaggerItem>
        <StaggerItem>
          <Figure label="Paid out this month" value={monthNGN} />
        </StaggerItem>
        <StaggerItem>
          <Figure label="Paid out in total" value={totalNGN} />
        </StaggerItem>
      </Stagger>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <PayoutAccountCard />
          <div className="rounded-xl bg-canvas p-6">
            <h3 className="text-h3 text-ink">How payouts work</h3>
            <ul className="mt-4 space-y-3 text-sm text-body">
              <li>There's nothing to withdraw — we pay your bank automatically.</li>
              <li>An order pays out when the buyer confirms delivery, or 7 days after you ship if they don't report a problem.</li>
              <li>If a buyer reports a problem, the money waits until a mediator decides.</li>
            </ul>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-h3 text-ink">Payout history</h3>
            <Link to="/app/orders" className="text-sm font-medium text-brand hover:underline">
              All orders
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl bg-canvas">
            {isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : paidOut.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Banknote className="mx-auto h-6 w-6 text-mute" aria-hidden />
                <p className="mt-3 font-medium text-ink">No payouts yet</p>
                <p className="mt-1 text-sm text-body">Your first payout shows here when a buyer confirms delivery.</p>
              </div>
            ) : (
              <Stagger as="ul" className="divide-y divide-line">
                {paidOut.map((o) => (
                  <StaggerItem as="li" key={o.orderToken}>
                    <Link
                      to={`/app/orders/${o.orderToken}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-canvas-soft"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-canvas-soft">
                        <ListingThumb image={o.listing.images[0]} alt="" size={44} fill />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{o.listing.title}</p>
                        <p className="text-sm text-mute">
                          {o.shortId} · {formatDate(o.releasedAt ?? o.updatedAt)}
                        </p>
                      </div>
                      <p className="font-semibold text-brand tabular-nums">+{formatNGN(o.amountNGN)}</p>
                    </Link>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl bg-canvas p-6">
      <p className="text-sm text-mute">{label}</p>
      <AnimatedNumber value={value} format={(n) => formatNGN(Math.round(n))} className="mt-4 block text-h1 text-ink tabular-nums" />
    </div>
  );
}

function PayoutAccountCard() {
  const { data, isLoading } = useQuery({ queryKey: MY_SELLER_KEY, queryFn: () => apiClient.getMySeller() });
  const [editing, setEditing] = useState(false);
  const payout = data?.payout;
  const hasAccount = !!payout?.bankCode;

  return (
    <div className="rounded-xl bg-canvas p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-pale text-brand">
            <Landmark className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-mute">Payouts go to</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-5 w-40" />
            ) : hasAccount ? (
              <p className="font-semibold text-ink">
                {payout.bankName ?? bankNameFromCode(payout.bankCode)} ••••{payout.accountNumberLast4}
              </p>
            ) : (
              <p className="font-semibold text-ink">No account added</p>
            )}
            {payout?.accountName && <p className="text-sm text-body">{payout.accountName}</p>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={isLoading}>
          <Pencil /> {hasAccount ? "Change" : "Add"}
        </Button>
      </div>
      {editing && <PayoutDialog current={payout} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PayoutDialog({ current, onClose }: { current?: SellerPayout; onClose: () => void }) {
  const [bankCode, setBankCode] = useState(current?.bankCode ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: () => apiClient.updatePayout({ bankCode, bankAccountNumber: accountNumber }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_SELLER_KEY });
      toast({ title: "Payout account updated" });
      onClose();
    },
  });
  const error =
    save.error instanceof ApiError || save.error instanceof Error ? save.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payout account</DialogTitle>
          <DialogDescription>We'll check the account name with your bank before saving it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (bankCode && accountNumber.length === 10) save.mutate();
          }}
        >
          <div>
            <Label htmlFor="payout-bank">Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger id="payout-bank" className="mt-1.5 w-full">
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {NIGERIAN_BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="payout-account">Account number</Label>
            <Input
              id="payout-account"
              inputMode="numeric"
              className="mt-1.5 tabular-nums tracking-wider"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 digits"
            />
          </div>
          {error && <p className="rounded-md bg-negative-pale px-3.5 py-2.5 text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!bankCode || accountNumber.length !== 10 || save.isPending}>
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Checking…
                </>
              ) : (
                "Save account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
