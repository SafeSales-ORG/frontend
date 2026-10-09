/**
 * Seller Order Detail — `/app/orders/:token`.
 *
 * Mirrors the buyer-side page (`/order/:token`) but from the seller's
 * angle. Data + wiring pattern preserved verbatim from the previous
 * version:
 *
 *   - `apiClient.getOrder(token)` → polled every 8s while non-terminal
 *   - `apiClient.shipOrder(token, { trackingNumber, carrier })` →
 *     `shipMutation` behind the inline "Mark as shipped" form
 *
 * Design ported from `.stitch-designs/04-seller-orders.html` — same
 * recipe used on screens #2 and #3:
 *
 *   - Adopted Stitch's two-column-on-desktop / single-column-on-mobile
 *     layout (left = hero + summary, right = ship-to + timeline).
 *   - Replaced the Mark-Shipped dialog with an inline form embedded
 *     directly in the hero card when `status === "paid"`.
 *     This is the seller's one job; removing the click-into-dialog
 *     step matches the prompt's "make it impossible to miss" goal.
 *   - Re-spec'd the hero card to be status-aware: every status surfaces
 *     a different headline + sub + (optional) form / data block, so
 *     this page tells the truth no matter where the order is in the
 *     escrow lifecycle.
 *   - Added a mobile sticky action bar that ONLY appears when
 *     `paid` — scrolls to the inline ship form on tap.
 *
 * What was stripped from Stitch's output: Material Symbols, violet
 * primary, custom sidebar + mobile bottom-nav (AppShell already
 * provides those), invented fields (BTC conversion, member-since,
 * shipping fee, SafeSale Fee, condition/category), and the
 * "Contact Buyer" + "Raise Dispute" header buttons the prompt
 * explicitly forbade (sellers can't unilaterally open disputes; the
 * buyer phone is the only contact surface in MVP).
 *
 * The activity timeline is rendered inline (4 steps: placed → paid →
 * shipped → released) rather than via the shared `Timeline` primitive
 * — gives finer per-step control over the "alert" variant when
 * disputed and the colour tiers requested by the prompt.
 *
 * URL parameter is `:token` (not `:id` or `:shortId`) because that's
 * the only identifier the backend accepts on the order endpoints.
 */

import { useSeoMeta } from "@unhead/react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/safesale/AppShell";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { OrderProgress } from "@/components/orders/OrderProgress";
import { MapPinLine } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { OrderChat } from "@/components/safesale/OrderChat";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mail,
  Package,
  RotateCcw,
  Send,
  Truck,
} from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { marketStore } from "@/lib/store/marketStore";
import {
  apiClient,
  DEMO_MODE,
  ApiError,
  type ApiDispute,
  type ApiOrder,
  type ApiOrderStatus,
  type GetOrderResponse,
} from "@/lib/api";
import {
  formatDate,
  formatNGN,
  formatRelative,
  formatTime,
  formatDue,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/** Backend order statuses that won't change — stop polling here. */
const TERMINAL_STATUSES: ApiOrderStatus[] = ["completed", "refunded"];

/* -------------------------------- page -------------------------------- */

export default function OrderDetailPage() {
  useSeoMeta({ title: "Order detail — SafeSale" });

  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  /* ------------------------------- data ------------------------------- */

  const query = useQuery<GetOrderResponse>({
    queryKey: ["safesale", "order", token],
    enabled: token.length > 0,
    queryFn: () => apiClient.getOrder(token),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 8_000;
      return TERMINAL_STATUSES.includes(data.order.status) ? false : 8_000;
    },
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.code === "ORDER_NOT_FOUND") return false;
      return failureCount < 2;
    },
  });

  /* ----------------------------- ship form ---------------------------- */

  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const trackingRef = useRef<HTMLInputElement>(null);

  const shipMutation = useMutation({
    mutationFn: () =>
      apiClient.shipOrder(token, {
        trackingNumber: tracking.trim() || undefined,
        carrier: carrier.trim() || undefined,
      }),
    onSuccess: (res) => {
      qc.setQueryData<GetOrderResponse>(
        ["safesale", "order", token],
        (prev) => (prev ? { ...prev, order: res.order } : prev),
      );
      // Refresh the dashboard order feed so the dashboard's
      // "Needs your attention" strip drops this row immediately.
      qc.invalidateQueries({ queryKey: ["safesale", "seller-orders"] });
      setTracking("");
      setCarrier("");
      toast({
        title: "Marked as shipped",
        description: "The buyer can see it on their order page.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't mark as shipped",
        description:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  /* ----------------------------- guards ----------------------------- */

  if (query.isLoading) {
    return (
      <AppShell title="Order detail">
        <OrderSkeleton />
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    const notFound =
      query.error instanceof ApiError &&
      query.error.code === "ORDER_NOT_FOUND";
    return (
      <AppShell title="Order not found">
        <div className="rounded-2xl border border-dashed border-border bg-canvas p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <p className="mt-4 text-base font-semibold text-ink">
            {notFound
              ? "We couldn't find that order"
              : "Couldn't load this order"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            {notFound
              ? "The link may be wrong or the order may have been removed."
              : "Check your connection and try again."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {!notFound && (
              <Button
                onClick={() => query.refetch()}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Try again
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/app/orders">Back to orders</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const { order, listing } = query.data;
  const dispute: ApiDispute | null =
    "dispute" in query.data && query.data.dispute
      ? (query.data.dispute as ApiDispute)
      : null;
  const isPaymentLocked = order.status === "paid";
  // Tracking and courier are optional — the backend accepts shipping without them.
  const shipDisabled = shipMutation.isPending;

  return (
    <AppShell
      title={`Order ${order.shortId}`}
      subtitle={`Placed ${formatRelative(order.createdAt)}`}
    >
      <div className={cn("space-y-6", isPaymentLocked && "pb-24 sm:pb-0")}>
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to orders
        </button>

        {/* Status banner */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-3xl bg-forest p-6 text-canvas sm:p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-canvas/70">
                {order.shortId} · placed {formatRelative(order.createdAt)} by {order.buyerName}
              </p>
              <h2 className="mt-2 font-display text-h1 text-canvas sm:text-display-md">{statusHeadline(order)}</h2>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-sm text-canvas/70">{order.status === "completed" ? "Paid out" : "Order total"}</p>
              <p className="font-display text-h1 text-mint tabular-nums">{formatNGN(order.amountNGN)}</p>
            </div>
          </div>
          <div className="mt-8">
            <OrderProgress status={order.status} tone="dark" />
          </div>
        </motion.header>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* LEFT — hero + summary */}
          <div className="space-y-6 lg:col-span-2">
            {/* Status-aware hero */}
            <HeroCard
              order={order}
              dispute={dispute}
              tracking={tracking}
              carrier={carrier}
              onTrackingChange={setTracking}
              onCarrierChange={setCarrier}
              trackingRef={trackingRef}
              shipDisabled={shipDisabled}
              isShipping={shipMutation.isPending}
              shipError={
                shipMutation.error instanceof Error
                  ? shipMutation.error.message
                  : null
              }
              onShip={() => shipMutation.mutate()}
            />

            {/* Dispute working panel — only when disputed */}
            {order.status === "disputed" && dispute && (
              <SellerDisputePanel token={token} dispute={dispute} />
            )}

            {/* Order summary */}
            <SummaryCard
              listing={listing}
              order={order}
            />
          </div>

          {/* RIGHT — ship-to + timeline + chat */}
          <div className="space-y-6">
            <ShipToCard order={order} />
            {/* Chat is stored in this browser only, so it's demo-mode only. */}
            {DEMO_MODE && order.status !== "pending_payment" && (
              <OrderChat orderToken={token} viewer="seller" counterpartyName={order.buyerName} />
            )}
            <TimelineCard order={order} dispute={dispute} />
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar — only when paid */}
      {isPaymentLocked && (
        <div
          className="fixed right-0 bottom-0 left-0 z-30 flex items-center gap-3 border-t border-line bg-canvas px-4 py-3 shadow-[var(--shadow-float)] sm:hidden"
          role="region"
          aria-label="Quick ship action"
        >
          <p className="flex-1 text-xs leading-tight text-ink-soft">
            Ready to ship?
          </p>
          <Button
            type="button"
            onClick={() => {
              trackingRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              trackingRef.current?.focus();
            }}
          >
            <Send /> Mark shipped
          </Button>
        </div>
      )}
    </AppShell>
  );
}

/* ------------------------------ hero card ------------------------------ */

interface HeroProps {
  order: ApiOrder;
  dispute: ApiDispute | null;
  tracking: string;
  carrier: string;
  onTrackingChange: (v: string) => void;
  onCarrierChange: (v: string) => void;
  trackingRef: React.RefObject<HTMLInputElement | null>;
  shipDisabled: boolean;
  isShipping: boolean;
  shipError: string | null;
  onShip: () => void;
}

function HeroCard({
  order,
  dispute,
  tracking,
  carrier,
  onTrackingChange,
  onCarrierChange,
  trackingRef,
  shipDisabled,
  isShipping,
  shipError,
  onShip,
}: HeroProps) {
  switch (order.status) {
    case "paid":
      return (
        <Card>
          <AccentStrip
            tone="amber"
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
          >
            <span className="font-semibold">Action required</span> — buyer
            has paid; ship this item to release your money.
          </AccentStrip>
          <h2 className="mt-5 text-base font-semibold text-ink">
            Ship this order
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Mark it shipped once it's on its way. The buyer sees the update on their order page. If they
            don't confirm or report a problem within 7 days, the payment is released to you automatically.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tracking">Tracking number (optional)</Label>
              <Input
                id="tracking"
                ref={trackingRef}
                value={tracking}
                onChange={(e) => onTrackingChange(e.target.value)}
                placeholder="e.g. GIG12345"
                className="mt-1.5 h-11 font-mono tabular-nums"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="carrier">Courier (optional)</Label>
              <Input
                id="carrier"
                value={carrier}
                onChange={(e) => onCarrierChange(e.target.value)}
                placeholder="GIG, Kwik, DHL, Sendbox…"
                className="mt-1.5 h-11"
                autoComplete="off"
              />
            </div>
          </div>
          {shipError && (
            <p className="mt-3 text-xs text-negative">{shipError}</p>
          )}
          <Button
            type="button"
            onClick={onShip}
            disabled={shipDisabled}
            className="mt-5"
          >
            {isShipping ? (
              <>
                <Loader2 className="animate-spin" /> Marking shipped…
              </>
            ) : (
              <>
                <Send /> Mark as shipped
              </>
            )}
          </Button>
        </Card>
      );

    case "shipped":
      return (
        <Card>
          <div className="flex items-start gap-3">
            <IconCircle tone="sky">
              <Truck className="h-5 w-5" aria-hidden />
            </IconCircle>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Item is on the way
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                You've shipped this order. If the buyer doesn't confirm or report a problem, the payment is released to you{" "}
                <span className="font-medium text-ink">
                  {order.autoReleaseAt ? formatDue(order.autoReleaseAt) : "after 7 days"}
                </span>
                .
              </p>
            </div>
          </div>
          <ShipmentData order={order} />
          <p className="mt-4 border-t border-line pt-4 text-sm text-mute">
            The buyer confirms delivery from their private order link. You don't need to do anything else.
          </p>
        </Card>
      );

    case "delivered":
      return (
        <Card>
          <div className="flex items-start gap-3">
            <IconCircle tone="sky">
              <Truck className="h-5 w-5" aria-hidden />
            </IconCircle>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Buyer marked delivered
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                The buyer marked this as delivered. Payment auto-releases
                {order.autoReleaseAt
                  ? ` on ${formatDate(order.autoReleaseAt)}`
                  : " soon"}
                .
              </p>
            </div>
          </div>
          <ShipmentData order={order} />
        </Card>
      );

    case "completed":
      return (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Payment released — you got paid
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                The buyer released the escrow on{" "}
                {order.releasedAt ? formatTime(order.releasedAt) : "—"}.{" "}
                {formatNGN(order.amountNGN)} is on its way to your bank.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand-soft-foreground">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Completed
            </span>
          </div>
        </Card>
      );

    case "disputed":
      return (
        <Card>
          <div className="flex items-start gap-3">
            <IconCircle tone="rose">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </IconCircle>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-negative">
                This order is in dispute
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                A SafeSale mediator is reviewing. The decision will show on this page.
              </p>
            </div>
          </div>
          {dispute && (
            <div className="mt-4 space-y-2 rounded-xl border border-negative/25 bg-negative-pale p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-negative">
                Dispute reason
              </p>
              <p className="text-negative">{dispute.reason}</p>
              {dispute.summary && (
                <p className="text-xs text-negative">{dispute.summary}</p>
              )}
              <p className="text-xs text-negative">
                Opened by {dispute.openedBy} ·{" "}
                {formatRelative(dispute.createdAt)} · priority:{" "}
                {dispute.priority}
              </p>
            </div>
          )}
        </Card>
      );

    case "pending_payment":
      return (
        <Card>
          <div className="flex items-start gap-3">
            <IconCircle tone="neutral">
              <Clock className="h-5 w-5" aria-hidden />
            </IconCircle>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Awaiting buyer payment
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                The buyer has been given the SafeSale Escrow bank account to
                pay into. We'll notify you the moment the transfer lands and
                the payment is locked in escrow.
              </p>
            </div>
          </div>
        </Card>
      );

    case "refunded":
      return (
        <Card>
          <div className="flex items-start gap-3">
            <IconCircle tone="rose">
              <RotateCcw className="h-5 w-5" aria-hidden />
            </IconCircle>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Order was refunded
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Resolved on{" "}
                {order.refundedAt ? formatTime(order.refundedAt) : "—"}. The
                buyer got their money back.
              </p>
            </div>
          </div>
        </Card>
      );

    default:
      return null;
  }
}

/* --------------------------- seller dispute panel --------------------------- */

function SellerDisputePanel({
  token,
  dispute,
}: {
  token: string;
  dispute: ApiDispute;
}) {
  const { toast } = useToast();
  const { mutateAsync: uploadFile } = useUploadFile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [response, setResponse] = useState(dispute.sellerResponse ?? "");
  const [uploading, setUploading] = useState(false);

  const buyerEvidence = (dispute.evidence ?? []).filter((e) => e.by === "buyer");
  const sellerEvidence = (dispute.evidence ?? []).filter((e) => e.by === "seller");

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    for (const file of files.slice(0, 5)) {
      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1];
        if (url)
          marketStore.addDisputeEvidence(token, {
            url,
            by: "seller",
            at: new Date().toISOString(),
          });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    }
    setUploading(false);
  };

  const submitResponse = () => {
    marketStore.setSellerDisputeResponse(token, response.trim());
    toast({
      title: "Response submitted",
      description: "The mediator and buyer can now see your response.",
    });
  };

  return (
    <Card>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-negative" />
        <h2 className="text-base font-semibold text-negative">Respond to this dispute</h2>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Reason: <span className="font-medium text-ink">{dispute.reason}</span>
      </p>
      {dispute.summary && (
        <p className="mt-1 rounded-lg bg-negative-pale p-3 text-sm text-negative">
          “{dispute.summary}”
        </p>
      )}

      {/* Buyer's evidence */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Buyer's evidence
        </p>
        {buyerEvidence.length === 0 ? (
          <p className="mt-1 text-xs text-ink-soft">No photos uploaded.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {buyerEvidence.map((e, i) => (
              <a
                key={e.url}
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded-lg border border-border"
              >
                <img src={e.url} alt={`Buyer evidence ${i + 1}`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Seller counter-evidence */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Your evidence
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {sellerEvidence.map((e, i) => (
            <div key={e.url} className="aspect-square overflow-hidden rounded-lg border border-border">
              <img src={e.url} alt={`Your evidence ${i + 1}`} className="h-full w-full object-cover" />
            </div>
          ))}
          {sellerEvidence.length < 5 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-surface text-ink-soft hover:border-brand hover:text-ink disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              <span className="text-xs">Add proof</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
      </div>

      {/* Written response */}
      <div className="mt-4">
        <Label htmlFor="seller-response" className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Your response
        </Label>
        <Input
          id="seller-response"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Explain your side for the mediator…"
          className="mt-1.5 h-11"
        />
        <Button
          type="button"
          onClick={submitResponse}
          disabled={response.trim().length < 3}
          className="mt-3 h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          <Send className="mr-2 h-4 w-4" /> Submit response
        </Button>
        <p className="mt-2 text-xs text-ink-soft">
          A SafeSale mediator reviews both sides and issues a decision. Funds
          stay locked until then.
        </p>
      </div>
    </Card>
  );
}

/** Shared shipment-data block for shipped / delivered hero variants. */
function ShipmentData({ order }: { order: ApiOrder }) {
  const { toast } = useToast();
  return (
    <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
      <DataPair label="Tracking number">
        <span className="font-mono text-ink tabular-nums">
          {order.trackingNumber ?? "—"}
        </span>
        {order.trackingNumber && (
          <CopyButton
            value={order.trackingNumber}
            onCopied={() => toast({ title: "Tracking number copied" })}
          />
        )}
      </DataPair>
      <DataPair label="Carrier">
        <span className="text-ink">{order.carrier ?? "—"}</span>
      </DataPair>
      {order.shippedAt && (
        <DataPair label="Shipped">
          <span className="text-ink-soft">
            {formatRelative(order.shippedAt)}
          </span>
        </DataPair>
      )}
    </dl>
  );
}

/* ----------------------------- ship-to card ----------------------------- */

function ShipToCard({ order }: { order: ApiOrder }) {
  const { toast } = useToast();
  return (
    <Card>
      <div className="flex items-center gap-3">
        <BrandIcon icon={MapPinLine} size="sm" />
        <p className="font-semibold text-ink">Deliver to</p>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Buyer name">
          <p className="text-sm text-ink">{order.buyerName}</p>
        </Field>
        <Field label="Phone">
          <div className="flex items-center justify-between gap-2">
            <a
              href={`tel:${order.buyerPhone}`}
              className="text-sm text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              {order.buyerPhone}
            </a>
            <CopyButton
              value={order.buyerPhone}
              onCopied={() => toast({ title: "Phone copied" })}
            />
          </div>
        </Field>
        <Field label="City">
          <p className="text-sm text-ink">{order.buyerCity}</p>
        </Field>
        <Field label="Delivery address">
          {order.buyerAddress ? (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-ink">{order.buyerAddress}</p>
              <CopyButton
                value={order.buyerAddress}
                onCopied={() => toast({ title: "Address copied" })}
              />
            </div>
          ) : (
            <p className="text-sm italic text-ink-soft">
              Buyer didn't provide an address — contact them via phone above.
            </p>
          )}
        </Field>
        {order.buyerEmail && (
          <Field label="Email">
            <div className="flex items-center justify-between gap-2">
              <a
                href={`mailto:${order.buyerEmail}`}
                className="flex items-center gap-1.5 text-sm text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
              >
                <Mail className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
                {order.buyerEmail}
              </a>
              <CopyButton
                value={order.buyerEmail}
                onCopied={() => toast({ title: "Email copied" })}
              />
            </div>
          </Field>
        )}
        {order.variant && (
          <Field label="Variant">
            <p className="text-sm text-ink">{order.variant}</p>
          </Field>
        )}
      </dl>
    </Card>
  );
}

/* ----------------------------- summary card ----------------------------- */

function SummaryCard({
  listing,
  order,
}: {
  listing: GetOrderResponse["listing"];
  order: ApiOrder;
}) {
  return (
    <Card>
      <p className="font-semibold text-ink">
        Order summary
      </p>

      <div className="mt-4 flex items-center gap-3">
        <ListingThumb image={listing.images[0]} alt={listing.title} size={56} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {listing.title}
          </p>
          {order.variant && <p className="mt-0.5 truncate text-sm text-mute">{order.variant}</p>}
        </div>
      </div>

      <dl className="mt-4 space-y-0 text-sm">
        <SummaryRow label="Item">
          <span className="tabular-nums text-ink">{formatNGN(order.itemNGN ?? listing.priceNGN)}</span>
        </SummaryRow>
        <SummaryRow label="Delivery">
          <span className="tabular-nums text-ink">
            {order.deliveryFee ? formatNGN(order.deliveryFee) : "Free"}
          </span>
        </SummaryRow>
        <SummaryRow label="Total paid">
          <span className="font-semibold tabular-nums text-ink">
            {formatNGN(order.amountNGN)}
          </span>
        </SummaryRow>
      </dl>

      <p className="mt-4 text-xs italic text-ink-soft">
        Paid by bank transfer. SafeSale holds the money until the buyer confirms delivery, or 7 days
        after you ship if no problem is reported.
      </p>
    </Card>
  );
}

/* ---------------------------- timeline card ---------------------------- */

interface TimelineStepSpec {
  key: string;
  title: string;
  at?: string;
  detail?: string;
  state: "past" | "current" | "future" | "alert";
}

function TimelineCard({
  order,
  dispute,
}: {
  order: ApiOrder;
  dispute: ApiDispute | null;
}) {
  const steps = buildTimelineSteps(order, dispute);
  return (
    <Card>
      <p className="font-semibold text-ink">
        Activity
      </p>
      <ol className="mt-4 space-y-0">
        {steps.map((step, i) => (
          <TimelineRow
            key={step.key}
            step={step}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>
    </Card>
  );
}

function TimelineRow({
  step,
  isLast,
}: {
  step: TimelineStepSpec;
  isLast: boolean;
}) {
  const tone =
    step.state === "past"
      ? "bg-brand-soft text-brand-soft-foreground"
      : step.state === "current"
        ? "bg-warning-pale text-warning"
        : step.state === "alert"
          ? "bg-negative-pale text-negative"
          : "border border-border bg-surface text-ink-soft opacity-60";

  let Icon = CheckCircle2;
  if (step.key === "shipped") Icon = Truck;
  else if (step.key === "released") Icon = CheckCircle2;
  else if (step.key === "paid") Icon = Package;
  if (step.state === "alert")
    Icon = step.key === "released" ? AlertTriangle : RotateCcw;
  if (step.state === "future" && step.key === "shipped") Icon = Truck;

  return (
    <li
      className={cn(
        "flex items-start gap-3 py-3",
        !isLast && "border-b border-border",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          tone,
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{step.title}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{step.at ?? "—"}</p>
        {step.detail && (
          <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
            {step.detail}
          </p>
        )}
      </div>
    </li>
  );
}

function buildTimelineSteps(
  o: ApiOrder,
  dispute: ApiDispute | null,
): TimelineStepSpec[] {
  const past = (s: ApiOrderStatus[]) => s.includes(o.status);

  const steps: TimelineStepSpec[] = [
    {
      key: "placed",
      title: "Order placed",
      at: formatTime(o.createdAt),
      state: "past",
    },
    {
      key: "paid",
      title: past([
        "paid",
        "shipped",
        "delivered",
        "completed",
        "disputed",
        "refunded",
      ])
        ? "Payment received"
        : "Awaiting payment",
      at: past([
        "paid",
        "shipped",
        "delivered",
        "completed",
        "disputed",
        "refunded",
      ])
        ? formatTime(o.updatedAt)
        : undefined,
      state: past([
        "paid",
        "shipped",
        "delivered",
        "completed",
        "disputed",
        "refunded",
      ])
        ? "past"
        : o.status === "pending_payment"
          ? "current"
          : "future",
    },
    {
      key: "shipped",
      title: o.shippedAt ? "Shipped" : "Awaiting shipment",
      at: o.shippedAt ? formatTime(o.shippedAt) : undefined,
      detail:
        o.shippedAt && o.trackingNumber
          ? `${o.carrier ?? "Carrier"} · ${o.trackingNumber}`
          : undefined,
      state: o.shippedAt
        ? "past"
        : o.status === "paid"
          ? "current"
          : "future",
    },
    {
      key: "released",
      title:
        o.status === "refunded"
          ? "Refunded to buyer"
          : o.status === "disputed"
            ? `Dispute opened${dispute ? ` — ${dispute.reason}` : ""}`
            : o.status === "completed"
              ? "Payment released"
              : "Awaiting buyer release",
      at:
        o.status === "completed" && o.releasedAt
          ? formatTime(o.releasedAt)
          : o.status === "refunded" && o.refundedAt
            ? formatTime(o.refundedAt)
            : o.status === "disputed" && dispute
              ? formatTime(dispute.createdAt)
              : undefined,
      state:
        o.status === "completed"
          ? "past"
          : o.status === "disputed" || o.status === "refunded"
            ? "alert"
            : o.status === "shipped" || o.status === "delivered"
              ? "current"
              : "future",
    },
  ];

  return steps;
}

/* ---------------------------- small primitives ---------------------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-canvas p-5 sm:p-6">
      {children}
    </section>
  );
}

function AccentStrip({
  tone,
  icon,
  children,
}: {
  tone: "amber";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  // single tone for now; keeps prop API ready for future variants
  const cls = tone === "amber" ? "bg-warning-pale text-warning" : "bg-canvas-soft text-ink";
  return (
    <div className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium", cls)}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function IconCircle({
  tone,
  children,
}: {
  tone: "sky" | "rose" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "sky"
      ? "bg-info-pale text-info"
      : tone === "rose"
        ? "bg-negative-pale text-negative"
        : "bg-surface text-ink-soft";
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        cls,
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-mute">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function DataPair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-mute">
        {label}
      </dt>
      <dd className="mt-1 flex items-center justify-between gap-2">
        {children}
      </dd>
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CopyButton({
  value,
  onCopied,
}: {
  value: string;
  onCopied: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(onCopied).catch(() => {
          /* clipboard refused; silent — toast would be misleading */
        });
      }}
      aria-label="Copy"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Copy className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/* ------------------------------ skeleton ------------------------------ */

function OrderSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-canvas p-6">
            <Skeleton className="h-5 w-1/2" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-canvas p-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-canvas p-6">
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-canvas p-6">
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusHeadline(order: ApiOrder): string {
  const buyer = order.buyerName.split(" ")[0];
  switch (order.status) {
    case "pending_payment":
      return "Waiting for payment";
    case "paid":
      return "Paid and ready to ship";
    case "shipped":
      return `On its way to ${buyer}`;
    case "delivered":
      return `Delivered — waiting for ${buyer} to release`;
    case "completed":
      return "Paid out to your bank";
    case "disputed":
      return `${buyer} reported a problem`;
    case "refunded":
      return "Refunded to the buyer";
    default:
      return "Order";
  }
}
