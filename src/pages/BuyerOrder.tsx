/**
 * SafeSale — Buyer Order Page (`/order/:token`).
 *
 * The buyer's only surface. Per PRD §"Dashboard 2", the buyer has no
 * account, no dashboard, no login — they reach this page via a unique
 * secret URL emailed/SMS'd to them at checkout. This page is what they
 * bookmark and what they return to days later when their package
 * arrives.
 *
 * Data flow:
 *   - `apiClient.getOrder(token)` returns a `GetOrderResponse` envelope
 *     ({order, listing, seller, dispute}). Polled every 8s while the
 *     order is in a non-terminal status so e.g. "shipped" appears
 *     automatically when the seller marks the order shipped on their
 *     own dashboard. Polling stops once status is terminal
 *     (completed / refunded) to avoid wasting traffic.
 *
 *   - `apiClient.releaseOrder(token, { buyerPrivateKeyHex })` — fired
 *     from the release-confirm modal. The hex private key is read from
 *     localStorage via `getBuyerPrivateKeyHex(token)` (planted at
 *     checkout). On success the polling query is invalidated, the page
 *     re-renders into the `completed` state, and the local key is
 *     cleared (it has no further use).
 *
 *   - `apiClient.openDispute(token, { reason, summary, openedBy:
 *     "buyer" })` — fired from the dispute modal. On success the
 *     polling query is invalidated and the page re-renders into the
 *     `disputed` state with the new dispute card.
 *
 * State-driven layout:
 *   The same skeleton (header → ID strip → hero → timeline → summary +
 *   delivery → seller card → actions → mobile sticky bar) renders for
 *   every status. What changes is the hero icon/color/copy, the active
 *   timeline step, and which action panel (active buttons / disabled
 *   buttons / review prompt / dispute summary / nothing) is shown.
 *
 * Trust model:
 *   The orderToken in the URL IS the authentication. We do not show
 *   any login UI, do not invite the user to "save your order", do not
 *   render their phone/email anywhere it could be screenshotted with
 *   no value to them. Sensitive fields (full address, phone) are only
 *   shown to the legitimate token-holder, who already entered them at
 *   checkout, so there's no incremental disclosure risk.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DemoMediatorLink } from "@/components/safesale/DemoMediatorLink";
import { useSeoMeta } from "@unhead/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  HeadphonesIcon,
  Loader2,
  MessageCircle,
  PackageCheck,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Star,
  Truck,
  Undo2,
  Upload,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

import { Logo } from "@/components/safesale/Logo";
import { OrderProgress } from "@/components/orders/OrderProgress";
import { CaseThread } from "@/components/disputes/CaseThread";
import { savedOrders } from "@/lib/savedOrders";
import { Avatar } from "@/components/safesale/Avatar";
import { HelpDialog } from "@/components/safesale/HelpDialog";
import { OrderChat } from "@/components/safesale/OrderChat";
import { ListingThumb } from "@/components/safesale/ListingThumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";

import {
  apiClient,
  ApiError,
  DEMO_MODE,
  type ApiDispute,
  type ApiListing,
  type ApiOrder,
  type ApiOrderStatus,
  type ApiSeller,
  type GetOrderResponse,
} from "@/lib/api";
import { marketStore } from "@/lib/store/marketStore";
import { useReviewForOrderLive } from "@/hooks/useMarket";
import { formatCountdownLong, formatDate, formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";
import { motion } from "motion/react";

/* ----------------------------- constants ----------------------------- */

/** Statuses we stop polling at — nothing else will happen on the server. */
const TERMINAL_STATUSES: ApiOrderStatus[] = ["completed", "refunded"];

/** Statuses where the buyer can release / open dispute. */
const ACTIONABLE_STATUSES: ApiOrderStatus[] = ["shipped", "delivered"];

const DISPUTE_REASONS = [
  { value: "not_received", label: "Item not received" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "damaged", label: "Damaged item" },
  { value: "not_as_described", label: "Not as described" },
  { value: "not_responding", label: "Seller not responding" },
  { value: "other", label: "Other" },
] as const;

type DisputeReason = (typeof DISPUTE_REASONS)[number]["value"];

/* ---------------------------- main component ------------------------- */

export default function BuyerOrder() {
  const { token = "" } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ------------------------------ data ------------------------------ //

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
      // No retry on 404 — invalid token is invalid forever.
      if (err instanceof ApiError && err.code === "ORDER_NOT_FOUND") return false;
      return failureCount < 2;
    },
  });

  // Opening the link (e.g. from WhatsApp on a new phone) remembers the order
  // on this device for "My orders".
  const saved = query.data;
  useEffect(() => {
    if (!saved) return;
    const image = saved.listing.images[0];
    savedOrders.save({
      token,
      shortId: saved.order.shortId,
      title: saved.listing.title,
      amountNGN: saved.order.amountNGN,
      image: typeof image === "string" ? image : (image?.url ?? null),
    });
  }, [saved, token]);

  // ------------------------------ ui state -------------------------- //

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeReason>("not_received");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const { mutateAsync: uploadFile } = useUploadFile({ buyerToken: token });
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  const onEvidencePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setEvidenceUploading(true);
    for (const file of files.slice(0, 5 - evidenceUrls.length)) {
      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1];
        if (url) setEvidenceUrls((prev) => [...prev, url]);
      } catch {
        toast({ title: "Couldn't upload that photo", variant: "destructive" });
      }
    }
    setEvidenceUploading(false);
  };

  // ------------------------------ mutations ------------------------- //

  const releaseMutation = useMutation({
    mutationFn: async () => {
      // No body: the buyer's secret token in the URL is their authority.
      return apiClient.releaseOrder(token);
    },
    onSuccess: (res) => {
      qc.setQueryData<GetOrderResponse>(
        ["safesale", "order", token],
        (prev) => (prev ? { ...prev, order: res.order } : prev),
      );
      setReleaseOpen(false);
      celebrate();
      toast({
        title: "Payment released",
        description: `${formatNGN(res.order.amountNGN)} on its way to the seller.`,
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't release the payment. Try again in a moment.";
      toast({
        title: "Couldn't release payment",
        description: message,
        variant: "destructive",
      });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async () => {
      const reasonLabel = DISPUTE_REASONS.find((r) => r.value === disputeReason)?.label ?? disputeReason;
      return apiClient.openDispute(token, {
        reason: reasonLabel,
        summary: disputeDescription.trim() || undefined,
        openedBy: "buyer",
        evidence: evidenceUrls,
      });
    },
    onSuccess: (res) => {
      qc.setQueryData<GetOrderResponse>(
        ["safesale", "order", token],
        (prev) =>
          prev
            ? { ...prev, order: res.order, dispute: res.dispute }
            : prev,
      );
      // Show the in-dialog success confirmation (don't just close).
      setDisputeSubmitted(true);
      toast({
        title: "Dispute submitted",
        description: "The payout is frozen while a SafeSale mediator reviews it.",
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't open the dispute. Try again in a moment.";
      toast({
        title: "Couldn't open dispute",
        description: message,
        variant: "destructive",
      });
    },
  });

  // ------------------------------ seo ------------------------------- //

  useSeoMeta({
    title: query.data
      ? `Order ${query.data.order.shortId} — SafeSale`
      : "Your order — SafeSale",
  });

  // ------------------------------ render gates ---------------------- //

  if (query.isLoading) {
    return <BuyerOrderSkeleton />;
  }

  if (
    query.error instanceof ApiError &&
    query.error.code === "ORDER_NOT_FOUND"
  ) {
    return <InvalidOrderToken token={token} />;
  }

  if (!query.data) {
    return (
      <ErrorScreen
        title="Something went wrong"
        description={
          query.error instanceof Error
            ? query.error.message
            : "We couldn't load your order right now. Try again in a moment."
        }
      />
    );
  }

  const { order, listing, seller, dispute } = query.data;
  const status = order.status;
  const releasing = releaseMutation.isPending;
  const disputing = disputeMutation.isPending;

  return (
    <div className="min-h-screen bg-canvas-soft">
      <HeaderBar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
        className="container mx-auto max-w-3xl space-y-6 px-4 pb-32 pt-6 sm:px-6 lg:pb-12">
        <HeroStatusBlock order={order} dispute={dispute} />

        {dispute && (
          <CaseThread
            disputeId={dispute.id}
            viewer="buyer"
            buyerToken={token}
            heldNGN={order.amountNGN}
          />
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <OrderSummaryCard order={order} listing={listing} />
          <DeliveryDetailsCard order={order} />
        </div>

        <SellerMiniCard seller={seller} />

        {/* Order chat is stored in this browser only (no backend yet), so it
            only appears in demo mode. */}
        {!DEMO_MODE || dispute ? null : status === "pending_payment" ? (
          <section className="rounded-2xl border border-dashed border-line-strong bg-canvas p-4 text-center">
            <MessageCircle className="mx-auto h-5 w-5 text-ink-soft" />
            <p className="mt-2 text-sm font-medium text-ink">
              Order chat unlocks after payment
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Once your payment is locked in escrow, you can message the seller
              here to coordinate delivery.
            </p>
          </section>
        ) : (
          <OrderChat orderToken={token} viewer="buyer" counterpartyName={seller.name} />
        )}

        {/* Action panel — what the buyer can DO. Swaps by status. */}
        <ActionPanel
          status={status}
          order={order}
          listing={listing}
          dispute={dispute}
          onRelease={() => setReleaseOpen(true)}
          onDispute={() => setDisputeOpen(true)}
        />

        <EscrowTrustFooter />
      </motion.main>

      {/* Sticky mobile bottom bar — only for actionable statuses */}
      {ACTIONABLE_STATUSES.includes(status) && (
        <MobileActionBar
          onRelease={() => setReleaseOpen(true)}
          onDispute={() => setDisputeOpen(true)}
        />
      )}
      {status === "pending_payment" && <MobileWaitingBar />}

      {/* Release confirmation modal */}
      <Dialog open={releaseOpen} onOpenChange={(o) => !releasing && setReleaseOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <DialogTitle className="leading-tight">
                Release {formatNGN(order.amountNGN)} to {seller.name}?
              </DialogTitle>
            </div>
            <DialogDescription className="pt-3 text-sm leading-relaxed">
              This is final. The seller will receive payment instantly and the
              order will be marked complete. Only confirm if you have received
              your item and you're satisfied with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={releasing}
              onClick={() => setReleaseOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={releasing}
              onClick={() => releaseMutation.mutate()}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {releasing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Releasing…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Yes, release payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open-dispute modal */}
      <Dialog
        open={disputeOpen}
        onOpenChange={(o) => {
          if (disputing) return;
          setDisputeOpen(o);
          if (!o) {
            // Reset on close so a re-open starts fresh.
            setDisputeSubmitted(false);
            setDisputeDescription("");
            setEvidenceUrls([]);
            setDisputeReason("not_received");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[88dvh] overflow-y-auto">
          {disputeSubmitted ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-ink">
                Dispute submitted successfully
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
                The payout is frozen while a SafeSale mediator reviews it.
                Your money stays with SafeSale until the mediator decides. Check this page for the
                outcome.
              </p>
              <Button
                onClick={() => {
                  setDisputeOpen(false);
                  setDisputeSubmitted(false);
                  setDisputeDescription("");
                  setEvidenceUrls([]);
                }}
                className="mt-5 h-11 w-full rounded-lg bg-brand text-sm font-semibold text-brand-foreground hover:bg-brand/90"
              >
                Done
              </Button>
            </div>
          ) : (
          <>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-warning-pale text-warning">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <DialogTitle className="leading-tight">Report a problem</DialogTitle>
            </div>
            <DialogDescription className="pt-3 text-sm leading-relaxed">
              The payment is frozen while a SafeSale mediator looks into it. Be specific —
              the seller and the mediator will both read this.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-ink">
                What's the problem?
              </Label>
              <RadioGroup
                value={disputeReason}
                onValueChange={(v) => setDisputeReason(v as DisputeReason)}
                className="gap-2"
              >
                {DISPUTE_REASONS.map((r) => (
                  <Label
                    key={r.value}
                    htmlFor={`reason-${r.value}`}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm font-medium text-ink transition-colors hover:bg-secondary/40 has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft/40"
                  >
                    <RadioGroupItem id={`reason-${r.value}`} value={r.value} />
                    {r.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="dispute-description"
                className="text-sm font-semibold text-ink"
              >
                Describe what happened
              </Label>
              <Textarea
                id="dispute-description"
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                placeholder="What did you expect vs. what you received? Be as specific as you can."
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Evidence photos. The mediator and
                seller both see these on their dashboards. */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-ink">
                Add photos of the problem (recommended)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {evidenceUrls.map((url, i) => (
                  <div
                    key={url}
                    className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface"
                  >
                    <img src={url} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setEvidenceUrls((prev) => prev.filter((u) => u !== url))
                      }
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-canvas/90 text-ink-soft hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {evidenceUrls.length < 5 && (
                  <button
                    type="button"
                    onClick={() => evidenceInputRef.current?.click()}
                    disabled={evidenceUploading}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-surface text-ink-soft hover:border-brand hover:text-ink disabled:opacity-60"
                  >
                    {evidenceUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        <span className="text-xs font-medium">Add photo</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                ref={evidenceInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onEvidencePicked}
              />
              <p className="text-xs text-ink-soft">
                Clear photos help the mediator understand what happened.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={disputing}
              onClick={() => setDisputeOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={disputing} onClick={() => disputeMutation.mutate()}>
              {disputing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Scale className="mr-2 h-4 w-4" />
                  Report problem
                </>
              )}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ sub-components ========================= */

function HeaderBar() {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHelpOpen(true)}
          className="text-ink-soft hover:text-ink"
        >
          <HeadphonesIcon className="mr-1.5 h-4 w-4" />
          <span className="text-xs font-medium">Help</span>
        </Button>
      </div>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}

/* ----------------------- hero status block --------------------------- */

interface HeroProps {
  order: ApiOrder;
  dispute: ApiDispute | null;
}

function HeroStatusBlock({ order, dispute }: HeroProps) {
  const config = getHeroConfig(order, dispute);
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard?.writeText(window.location.href);
    toast({ title: "Order link copied", description: "Bookmark it — it's how you get back to this order." });
  };
  return (
    <section className="rounded-3xl bg-forest p-6 text-canvas sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-canvas/70">
          <span className="font-mono font-semibold text-canvas">{order.shortId}</span> · placed {formatDate(order.createdAt)}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy order link"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas/10 px-3 py-1.5 text-xs font-semibold text-canvas transition-colors hover:bg-canvas/20"
        >
          <Copy className="h-3.5 w-3.5" /> Copy link
        </button>
      </div>

      <div className="mt-6 flex items-start gap-4">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0.1 }}
          className={cn(
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            config.tone === "alert" ? "bg-warning-pale text-warning" : "bg-mint text-forest",
          )}
        >
          <config.Icon className="h-6 w-6" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-h2 leading-tight text-canvas sm:text-h1">{config.headline}</h1>
          {config.subline && <p className="mt-1.5 text-sm leading-relaxed text-canvas/75 sm:text-base">{config.subline}</p>}
          {config.countdownIso && <CountdownChip targetIso={config.countdownIso} />}
        </div>
      </div>

      <div className="mt-8">
        <OrderProgress status={order.status} tone="dark" disputed={!!dispute || !!order.settlement} />
      </div>

      {order.status === "disputed" && dispute && (
        <p className="mt-6 flex items-center gap-2 rounded-xl bg-canvas/10 px-4 py-3 text-sm text-canvas/85">
          <Scale className="h-4 w-4 shrink-0 text-mint" />
          Paused for review since {formatDate(dispute.createdAt)}. Your money stays held until a mediator decides.
        </p>
      )}
    </section>
  );
}

function CountdownChip({ targetIso }: { targetIso: string }) {
  // Live-updating countdown using a small interval. Re-uses the
  // long-form formatter from lib/format which handles "6d 14h 22m".
  const [, setTick] = useState(0);
  useTicker(() => setTick((t) => t + 1), 60_000);
  const remaining = formatCountdownLong(targetIso);
  return (
    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-canvas/10 px-3 py-1 text-xs font-medium text-canvas">
      <Clock className="h-3.5 w-3.5" />
      <span className="tabular-nums">{remaining}</span>
      <span className="text-canvas/70">until auto-release</span>
    </span>
  );
}

interface HeroConfig {
  tone: "ok" | "alert";
  Icon: typeof Truck;
  headline: string;
  subline: string;
  countdownIso?: string;
}

function getHeroConfig(order: ApiOrder, dispute: ApiDispute | null): HeroConfig {
  const amount = formatNGN(order.amountNGN);
  switch (order.status) {
    case "pending_payment":
      return {
        tone: "ok",
        Icon: Wallet,
        headline: "Awaiting your bank transfer",
        subline: `Send ${amount} to the account below. This page updates as soon as your transfer arrives.`,
      };
    case "paid":
      return {
        tone: "ok",
        Icon: ShieldCheck,
        headline: "Your payment is locked in escrow",
        subline: `${amount} is held by SafeSale. The seller can now see your payment and ship your order.`,
      };
    case "shipped":
      return {
        tone: "ok",
        Icon: Truck,
        headline: "Your order has been shipped",
        subline: order.trackingNumber
          ? `Tracking: ${order.trackingNumber}${order.carrier ? ` via ${order.carrier}` : ""}. Funds release automatically if you take no action.`
          : "The seller has marked your order as shipped. Funds release automatically if you take no action.",
        countdownIso: order.autoReleaseAt ?? undefined,
      };
    case "delivered":
      return {
        tone: "ok",
        Icon: PackageCheck,
        headline: "Marked as delivered",
        subline: "Confirm you received your order, or let us know if there's a problem.",
        countdownIso: order.autoReleaseAt ?? undefined,
      };
    case "completed":
      if (order.settlement && order.settlement.buyerRefundNGN > 0) {
        return {
          tone: "ok",
          Icon: Scale,
          headline: "The mediator split the payment",
          subline: `${formatNGN(order.settlement.buyerRefundNGN)} is being refunded to you and ${formatNGN(order.settlement.sellerReleaseNGN)} went to the seller. The reasons are in the case chat below.`,
        };
      }
      if (order.settlement) {
        return {
          tone: "ok",
          Icon: Scale,
          headline: "The mediator paid the seller",
          subline: `After reviewing both sides, the mediator released ${amount} to the seller. The reasons are in the case chat below.`,
        };
      }
      return {
        tone: "ok",
        Icon: CheckCircle2,
        headline: "Payment released — order complete",
        subline: `Thank you. ${amount} has been sent to the seller. A receipt is in your email.`,
      };
    case "disputed":
      return {
        tone: "alert",
        Icon: Scale,
        headline: "Dispute opened — under review",
        subline:
          dispute?.status === "resolved"
            ? "A mediator has resolved your dispute. See details below."
            : "Your money is frozen while a SafeSale mediator reviews the problem.",
      };
    case "refunded":
      return {
        tone: "alert",
        Icon: Undo2,
        headline: "Dispute resolved in your favour",
        subline: `Your ${amount} refund has been approved. Our team will process it to you shortly.`,
      };
    default:
      // Defensive fallback — never crash the page on an unexpected status.
      return {
        tone: "ok",
        Icon: ShieldCheck,
        headline: "Your order is being processed",
        subline: "We're updating this order. Refresh in a moment for the latest status.",
      };
  }
}

/* ----------------------- order summary card ------------------------- */

function OrderSummaryCard({
  order,
  listing,
}: {
  order: ApiOrder;
  listing: ApiListing;
}) {
  const firstImage = listing.images[0];
  return (
    <section className="rounded-2xl bg-canvas p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <ListingThumb image={firstImage} alt={listing.title} size={80} iconScale={0.35} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-sm font-semibold text-ink">
            {listing.title}
          </h2>
          {order.variant && (
            <p className="mt-0.5 text-xs text-ink-soft">{order.variant}</p>
          )}
          <p className="mt-2 text-xl font-semibold tabular-nums text-ink">
            {formatNGN(order.amountNGN)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
        <PriceRow
          label="Item"
          value={formatNGN(order.itemNGN ?? order.amountNGN)}
        />
        <PriceRow
          label="Delivery"
          value={order.deliveryFee && order.deliveryFee > 0 ? formatNGN(order.deliveryFee) : "Free"}
        />
        <PriceRow label="Buyer protection" value="Free" muted />
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-ink">
            Total in escrow
          </span>
          <span className="text-base font-semibold tabular-nums text-ink">
            {formatNGN(order.amountNGN)}
          </span>
        </div>
      </div>
    </section>
  );
}

function PriceRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-sm", muted ? "text-ink-soft" : "text-ink-soft")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          muted ? "text-xs text-ink-soft" : "text-sm font-medium text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ----------------------- delivery details ---------------------------- */

function DeliveryDetailsCard({ order }: { order: ApiOrder }) {
  return (
    <section className="rounded-2xl bg-canvas p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Truck className="h-4 w-4 text-brand" />
        Shipping to
      </h3>
      <div className="mt-3 space-y-0.5 text-sm">
        <p className="font-semibold text-ink">{order.buyerName}</p>
        <p className="text-ink-soft">{order.buyerPhone}</p>
        <p className="leading-relaxed text-ink-soft">
          {order.buyerAddress ? (
            <>
              {order.buyerAddress}
              <br />
              {order.buyerCity}
            </>
          ) : (
            order.buyerCity
          )}
        </p>
      </div>

      {order.trackingNumber && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <Truck className="h-4 w-4 shrink-0 text-brand" />
          <p className="min-w-0 text-sm">
            <span className="font-mono font-medium text-ink">
              {order.trackingNumber}
            </span>
            {order.carrier && (
              <span className="text-ink-soft"> · {order.carrier}</span>
            )}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-brand">
        <ShieldCheck className="h-4 w-4" />
        <span className="text-xs font-medium">Escrow protection active</span>
      </div>
    </section>
  );
}

/* ----------------------- seller mini-card ---------------------------- */

function SellerMiniCard({ seller }: { seller: ApiSeller }) {
  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl bg-canvas p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative">
          <Avatar seed={seller.handle} name={seller.name} size={44} src={seller.avatarUrl} />
          {seller.verified && (
            <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-background">
              <Check className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">
              {seller.name}
            </p>
            {seller.verified && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-soft-foreground">
                <ShieldCheck className="h-2.5 w-2.5" /> Verified
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {seller.location}
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-ink-soft hover:bg-secondary/60 hover:text-ink"
        aria-label="Message seller"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>
    </section>
  );
}

/* ----------------------- action panel -------------------------------- */

interface ActionPanelProps {
  status: ApiOrderStatus;
  order: ApiOrder;
  listing: ApiListing;
  dispute: ApiDispute | null;
  onRelease: () => void;
  onDispute: () => void;
}

function ActionPanel({
  status,
  order,
  listing,
  dispute,
  onRelease,
  onDispute,
}: ActionPanelProps) {
  switch (status) {
    case "pending_payment":
      return <BankTransferCard order={order} />;
    case "paid":
      return (
        <DecisionCard
          locked
          onRelease={onRelease}
          onDispute={onDispute}
          countdownIso={null}
        />
      );
    case "shipped":
    case "delivered":
      return (
        <DecisionCard
          locked={false}
          onRelease={onRelease}
          onDispute={onDispute}
          countdownIso={order.autoReleaseAt ?? null}
        />
      );
    case "completed":
      return <ReviewSection order={order} listing={listing} />;
    case "disputed":
      return <DisputeSummaryCard dispute={dispute} />;
    case "refunded":
      return null;
  }
}

/* --- pending_payment: bank transfer details */

function BankTransferCard({ order }: { order: ApiOrder }) {
  const { toast } = useToast();
  const copy = (s: string, label: string) => {
    navigator.clipboard?.writeText(s);
    toast({ title: `${label} copied` });
  };
  return (
    <section className="rounded-2xl bg-brand-pale p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Wallet className="h-4 w-4 text-brand" />
        Awaiting your payment
      </h3>
      <ul className="mt-4 space-y-2 text-sm">
        <BankRow
          label="Amount"
          value={formatNGN(order.amountNGN)}
          onCopy={() => copy(String(order.amountNGN), "Amount")}
          highlight
        />
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Transfer the exact amount to the SafeSale Escrow bank account shown on
        your checkout screen. Once your transfer is confirmed (usually under 60
        seconds), this page will update automatically and your payment will be
        locked in escrow.
      </p>
    </section>
  );
}

function BankRow({
  label,
  value,
  onCopy,
  highlight,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5",
        highlight && "bg-background",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-ink">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
      </div>
      <button
        onClick={onCopy}
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </button>
    </li>
  );
}

/* --- shipped / delivered: the two-button decision panel */

function DecisionCard({
  locked,
  onRelease,
  onDispute,
  countdownIso,
}: {
  locked: boolean;
  onRelease: () => void;
  onDispute: () => void;
  countdownIso: string | null;
}) {
  return (
    <section className="rounded-2xl bg-canvas p-5 sm:p-6">
      <p className="text-sm font-semibold text-ink">
        Your decision
      </p>
      {locked && (
        <p className="mt-2 text-body">
          Release payment once your order arrives. If the seller doesn't ship, you can report a
          problem now.
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Button onClick={onRelease} disabled={locked} size="lg" className="w-full">
          <ShieldCheck />
          Release payment
        </Button>
        <Button onClick={onDispute} variant="outline" size="lg" className="w-full">
          <AlertTriangle />
          Report a problem
        </Button>
      </div>
      {!locked && countdownIso && (
        <div className="mt-3 rounded-lg bg-surface/60 p-3 text-xs leading-relaxed text-ink-soft">
          <p>
            Funds automatically release to the seller in{" "}
            <span className="font-semibold tabular-nums text-ink">
              {formatCountdownLong(countdownIso)}
            </span>{" "}
            if you don't release it or report a problem. Before then you can:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-brand" /> Confirm successful delivery
            </li>
            <li className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-warning" /> Open a dispute
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

/* --- completed: review placeholder */

function ReviewSection({
  order,
  listing,
}: {
  order: ApiOrder;
  listing: ApiListing;
}) {
  const { toast } = useToast();
  const existing = useReviewForOrderLive(order.orderToken);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");

  if (existing) {
    return (
      <section className="rounded-2xl bg-canvas p-5 text-center sm:p-6">
        <CheckCircle2 className="mx-auto h-7 w-7 text-brand" />
        <p className="mt-3 text-base font-semibold text-ink">Thanks for your review!</p>
        <div className="mt-2 flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={cn(
                "h-4 w-4",
                s <= existing.rating ? "fill-warning text-warning" : "text-border",
              )}
            />
          ))}
        </div>
        {existing.text && (
          <p className="mt-2 text-sm italic text-ink-soft">“{existing.text}”</p>
        )}
      </section>
    );
  }

  const submit = () => {
    marketStore.addReview({
      id: `rev_${Math.random().toString(36).slice(2, 10)}`,
      orderToken: order.orderToken,
      sellerId: order.sellerId,
      buyerName: order.buyerName,
      rating,
      text: text.trim(),
      productTitle: listing.title,
      createdAt: new Date().toISOString(),
    });
    toast({
      title: "Review published",
      description: "Thanks! Your feedback builds the seller's reputation.",
    });
  };

  return (
    <section className="rounded-2xl bg-canvas p-5 sm:p-6">
      <p className="text-base font-semibold text-ink">Payment released — leave a review</p>
      <p className="mt-1 text-sm text-ink-soft">
        How was your experience with this seller? Your rating is public and
        helps other buyers.
      </p>
      <div className="mt-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(s)}
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                s <= (hover || rating)
                  ? "fill-warning text-warning"
                  : "text-border",
              )}
            />
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        placeholder="Share details of your experience (optional)…"
        rows={3}
        className="mt-3 resize-none"
      />
      <Button
        onClick={submit}
        className="mt-3 h-11 w-full rounded-lg bg-brand text-sm font-semibold text-brand-foreground hover:bg-brand/90"
      >
        Publish review
      </Button>
    </section>
  );
}

/* --- disputed: summary card */

function DisputeSummaryCard({ dispute }: { dispute: ApiDispute | null }) {
  if (!dispute) {
    return (
      <section className="rounded-2xl bg-warning-pale p-5 sm:p-6">
        <p className="text-sm text-warning">Dispute is being prepared…</p>
      </section>
    );
  }
  const statusLabel: Record<ApiDispute["status"], string> = {
    direct_resolution: "Direct resolution",
    escalated: "Escalated to mediator",
    evidence_requested: "Awaiting evidence",
    mediating: "Under mediation",
    resolved: "Resolved",
  };
  const isResolved = dispute.status === "resolved";
  return (
    <section className="rounded-2xl bg-warning-pale p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Scale className="h-4 w-4 text-warning" />
          Dispute opened {formatDate(dispute.createdAt)}
        </h3>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
            isResolved
              ? "bg-brand text-brand-foreground"
              : "bg-warning text-white",
          )}
        >
          {statusLabel[dispute.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
        <dt className="text-sm font-semibold text-ink">
          Reason
        </dt>
        <dd className="text-ink">{dispute.reason}</dd>
        {dispute.summary && (
          <>
            <dt className="text-sm font-semibold text-ink">
              Your description
            </dt>
            <dd className="leading-relaxed text-ink-soft">{dispute.summary}</dd>
          </>
        )}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        {isResolved
          ? "This dispute is closed. The outcome is shown above."
          : "Your money stays held while a SafeSale mediator looks at both sides. Use the case chat above to talk to the mediator and the seller."}
      </p>
      {!isResolved && <DemoMediatorLink className="mt-4" />}
    </section>
  );
}

/* ----------------------- mobile sticky bars -------------------------- */

function MobileActionBar({
  onRelease,
  onDispute,
}: {
  onRelease: () => void;
  onDispute: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur lg:hidden"
      role="region"
      aria-label="Order actions"
    >
      <div className="container mx-auto max-w-3xl space-y-2">
        <Button onClick={onRelease} size="lg" className="w-full">
          <ShieldCheck />
          Release payment
        </Button>
        <Button onClick={onDispute} variant="outline" className="w-full">
          Report a problem
        </Button>
      </div>
    </div>
  );
}

function MobileWaitingBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur lg:hidden"
      role="region"
      aria-label="Waiting for payment"
    >
      <div className="container mx-auto max-w-3xl">
        <Button
          size="lg"
          disabled
          className="h-12 w-full rounded-lg bg-ink-soft/20 text-base font-semibold text-ink-soft"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Waiting for your transfer…
        </Button>
      </div>
    </div>
  );
}

/* ----------------------- escrow footer ------------------------------- */

function EscrowTrustFooter() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-6 text-center">
      <ShieldCheck className="h-4 w-4 shrink-0 text-brand" />
      <p className="text-xs leading-relaxed text-ink-soft">
        Your payment is held by SafeSale. It's released when you confirm delivery,
        automatically 7 days after shipping if no problem is reported, or by a mediator's decision.{" "}
        <a
          href="#how-escrow-works"
          className="font-medium text-brand hover:underline"
        >
          How escrow works →
        </a>
      </p>
    </div>
  );
}

/* ----------------------- error / loading states --------------------- */

function BuyerOrderSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      </header>
      <main className="container mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-6 sm:px-6">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </main>
    </div>
  );
}

function InvalidOrderToken({ token }: { token: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 text-center">
      <div className="max-w-md">
        <Logo />
        <ShieldAlert className="mx-auto mt-8 h-10 w-10 text-warning" />
        <p className="mt-4 text-xl font-semibold tracking-tight text-ink">
          We couldn't find that order link
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {token
            ? "The link may be old, mistyped, or never existed."
            : "No order token was provided."}{" "}
          Order links are private and only valid for the buyer they were sent to.
        </p>
        <Button
          asChild
          className="mt-5 bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link to="/">Back home</Link>
        </Button>
        <p className="mt-4 text-xs text-ink-soft">
          Lost your order link? Check the email or SMS we sent you when you paid.
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 text-center">
      <div className="max-w-md">
        <Logo />
        <XCircle className="mx-auto mt-8 h-10 w-10 text-negative" />
        <p className="mt-4 text-xl font-semibold tracking-tight text-ink">
          {title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>
        <Button
          onClick={() => window.location.reload()}
          className="mt-5 bg-brand text-brand-foreground hover:bg-brand/90"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

/* ----------------------- utilities ---------------------------------- */

/** Tiny interval hook for the live countdown chip. */
function useTicker(fn: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [fn, ms]);
}
