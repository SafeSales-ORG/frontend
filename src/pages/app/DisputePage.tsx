/**
 * Seller Disputes — `/app/dispute` and `/app/dispute/:token`.
 *
 * Wired to real order data from the API via `useSellerOrders()` and
 * `apiClient.getOrder()`. Disputes are filtered from orders with
 * `status === 'disputed'` and orders that have a non-null `dispute`
 * relation.
 *
 * The "Your response" form submits the seller's stance + message through
 * `apiClient.respondToDispute(disputeId, …)` → `POST /api/disputes/:id/respond`.
 * In demo mode this writes the response to the in-memory store and moves
 * the case to `mediating`; against the real backend it hits Joy's
 * respond endpoint. Mediator *resolution* still happens on `/admin`.
 */

import { useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link, useParams } from "react-router-dom";
import { DemoMediatorLink } from "@/components/safesale/DemoMediatorLink";
import { useGoBack } from "@/hooks/useGoBack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/safesale/AppShell";
import { Stagger, StaggerItem } from "@/components/motion";
import { Avatar } from "@/components/safesale/Avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timeline, type TimelineStep } from "@/components/safesale/Timeline";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useToast } from "@/hooks/useToast";
import { apiClient, ApiError, type GetOrderResponse } from "@/lib/api";
import type { RespondToDisputeRequest } from "@/lib/api/types";
import type {
  ApiDispute,
  ApiDisputeStatus,
  ApiOrder,
  ApiListing,
  SellerOrderRow,
} from "@/lib/api/types";
import { formatNGN, formatRelative } from "@/lib/format";
import {
  Scale,
  ShieldCheck,
  MessageCircle,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { cn, sanitizeUrl } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                  ROUTE                                     */
/* -------------------------------------------------------------------------- */

export default function DisputePage() {
  const { id: token } = useParams<{ id?: string }>();

  // List view if no token supplied.
  if (!token) return <DisputeList />;

  return <DisputeDetailLoader token={token} />;
}

/* -------------------------------------------------------------------------- */
/*                                  LIST                                      */
/* -------------------------------------------------------------------------- */

function DisputeList() {
  useSeoMeta({ title: "Disputes — SafeSale" });
  const { orders, isLoading } = useSellerOrders();

  // Filter orders that have disputes attached
  const disputedOrders = orders.filter(
    (o) => o.dispute !== null && o.dispute !== undefined,
  );
  const open = disputedOrders.filter((o) => o.dispute!.status !== "resolved");
  const closed = disputedOrders.filter(
    (o) => o.dispute!.status === "resolved",
  );

  if (isLoading) {
    return (
      <AppShell
        title="Disputes"
        subtitle="Problems buyers have reported, and what happens next"
      >
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Disputes"
      subtitle="Problems buyers have reported, and what happens next"
    >
      <div className="space-y-5">
        {open.length === 0 ? (
          <EmptyDisputes />
        ) : (
          <Section title="Needs your action" count={open.length}>
            <Stagger as="ul" className="space-y-3">
              {open.map((o) => (
                <DisputeRow key={o.orderToken} order={o} />
              ))}
            </Stagger>
          </Section>
        )}

        {closed.length > 0 && (
          <Section title="Resolved" count={closed.length}>
            <Stagger as="ul" className="space-y-3">
              {closed.map((o) => (
                <DisputeRow key={o.orderToken} order={o} />
              ))}
            </Stagger>
          </Section>
        )}
      </div>
    </AppShell>
  );
}

function EmptyDisputes() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-12 text-center">
      <ShieldCheck className="mx-auto h-7 w-7 text-brand" />
      <p className="mt-3 text-sm font-medium text-ink">No active disputes</p>
      <p className="mt-1 text-xs text-ink-soft">
        When a buyer opens a dispute on one of your orders, it will appear here.
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="text-xs text-ink-soft">{count}</span>
      </div>
      {children}
    </section>
  );
}

function DisputeRow({ order }: { order: SellerOrderRow }) {
  const dispute = order.dispute!;
  const heroImg = order.listing.images[0]?.url
    ? sanitizeUrl(order.listing.images[0].url)
    : undefined;

  return (
    <StaggerItem as="li" lift>
      <Link
        to={`/app/dispute/${order.orderToken}`}
        className="block rounded-2xl border border-border bg-canvas p-4 transition-colors hover:"
      >
        <div className="flex items-start gap-3">
          {heroImg ? (
            <img
              src={heroImg}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg bg-surface" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {dispute.reason}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {order.shortId} · {order.listing.title} ·{" "}
                  {formatNGN(order.amountNGN)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DisputeStatusBadge status={dispute.status} />
              {dispute.isReturn && (
                <span className="rounded-full bg-info-pale px-2 py-0.5 text-xs font-medium text-info">
                  Return in progress
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </StaggerItem>
  );
}

/* -------------------------------------------------------------------------- */
/*                              DETAIL LOADER                                 */
/* -------------------------------------------------------------------------- */

function DisputeDetailLoader({ token }: { token: string }) {
  const { data, isLoading, error } = useQuery<GetOrderResponse>({
    queryKey: ["safesale", "order-detail", token],
    queryFn: () => apiClient.getOrder(token),
  });

  if (isLoading) {
    return (
      <AppShell title="Loading dispute…">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell title="Dispute not found">
        <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">
            We couldn't find that order or dispute.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/app/dispute">Back to all disputes</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!data.dispute) {
    return (
      <AppShell title="No dispute on this order">
        <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-brand" />
          <p className="mt-3 text-sm font-medium text-ink">
            This order doesn't have an active dispute.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/app/dispute">Back to all disputes</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <DisputeDetailView
      order={data.order}
      listing={data.listing}
      dispute={data.dispute}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                 DETAIL                                     */
/* -------------------------------------------------------------------------- */

function DisputeDetailView({
  order,
  listing,
  dispute,
}: {
  order: ApiOrder;
  listing: ApiListing;
  dispute: ApiDispute;
}) {
  useSeoMeta({ title: `Dispute on ${order.shortId} — SafeSale` });
  const goBack = useGoBack("/app/dispute");
  const isResolved = dispute.status === "resolved";
  const heroImg = listing.images[0]?.url
    ? sanitizeUrl(listing.images[0].url)
    : undefined;

  return (
    <AppShell
      title={`Dispute on ${order.shortId}`}
      subtitle={
        isResolved
          ? "This case has been closed."
          : "Share clear evidence. A SafeSale mediator decides."
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <StatusBanner dispute={dispute} amount={order.amountNGN} />
        {!isResolved && <DemoMediatorLink />}

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Order context */}
          <section className="rounded-2xl border border-border bg-canvas p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold text-ink">
              Order in dispute
            </h2>
            <div className="mt-3 flex items-start gap-3">
              {heroImg ? (
                <img
                  src={heroImg}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-surface" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-ink">
                  {listing.title}
                </p>
                <p className="text-xs text-ink-soft">
                  {order.shortId} · {formatNGN(order.amountNGN)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <MiniCard sub="Buyer">
                <Avatar
                  seed={order.buyerName}
                  name={order.buyerName}
                  size={32}
                />
                <p className="mt-2 truncate text-xs font-medium text-ink">
                  {order.buyerName}
                </p>
              </MiniCard>
              <MiniCard sub="Seller">
                <Avatar seed="seller" name="You" size={32} />
                <p className="mt-2 truncate text-xs font-medium text-ink">
                  You
                </p>
              </MiniCard>
            </div>
          </section>

          {/* Response form — only when the dispute is still actionable */}
          {!isResolved ? (
            <ResponseForm dispute={dispute} orderToken={order.orderToken} />
          ) : (
            <section className="rounded-2xl border border-border bg-canvas p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-ink">
                This dispute has been resolved
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                The outcome is final. Any payout or refund is processed automatically.
              </p>
            </section>
          )}
        </div>

        {/* Timeline of events */}
        <section className="rounded-2xl border border-border bg-canvas p-5">
          <h2 className="text-sm font-semibold text-ink">What happened</h2>
          <Timeline
            className="mt-4"
            steps={buildTimeline(dispute, order, listing)}
          />
        </section>

        {/* Reassurance */}
        {!isResolved && (
          <div className="rounded-2xl border border-brand/25 bg-brand-soft/40 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div className="text-sm text-ink-soft">
                <p className="text-sm font-medium text-ink">
                  You're not alone in this
                </p>
                <p className="mt-1 text-xs leading-relaxed">
                  Funds stay frozen while the case is open. A SafeSale mediator
                  reviews evidence from both sides and decides.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*                          STATUS-AWARE BANNER                               */
/* -------------------------------------------------------------------------- */

function StatusBanner({
  dispute,
  amount,
}: {
  dispute: ApiDispute;
  amount: number;
}) {
  const status = dispute.status;

  if (status === "direct_resolution") {
    return (
      <div className="overflow-hidden rounded-2xl border border-warning/25 bg-warning-pale p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-pale text-warning">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              Try to resolve directly with the buyer first
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Reply with your side of the story and any evidence — a replacement,
              a partial refund, or a clear explanation. A SafeSale mediator reviews
              both sides and decides.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "escalated" || status === "mediating") {
    return (
      <div className="overflow-hidden rounded-2xl border border-warning/25 bg-warning-pale p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-pale text-warning">
            <Scale className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">
              Mediation in progress
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {formatNGN(amount)} is held safely while a SafeSale mediator
              reviews the case.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "evidence_requested") {
    return (
      <div className="overflow-hidden rounded-2xl border border-negative/25 bg-negative-pale p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-negative-pale text-negative">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">
              The mediator needs more evidence
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Add the photos or details the mediator asked for below.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // resolved — no banner needed
  return null;
}

/** Plain-language dispute status for the seller. */
function DisputeStatusBadge({ status }: { status: ApiDisputeStatus }) {
  const map: Record<ApiDisputeStatus, { label: string; tone: string }> = {
    direct_resolution: { label: "Waiting for your reply", tone: "bg-warning-pale text-warning" },
    escalated: { label: "With a mediator", tone: "bg-info-pale text-info" },
    mediating: { label: "With a mediator", tone: "bg-info-pale text-info" },
    evidence_requested: { label: "Evidence needed", tone: "bg-warning-pale text-warning" },
    resolved: { label: "Resolved", tone: "bg-brand-pale text-brand-ink" },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", s.tone)}>
      {s.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                              RESPONSE FORM                                 */
/* -------------------------------------------------------------------------- */

function ResponseForm({
  dispute,
  orderToken,
}: {
  dispute: ApiDispute;
  orderToken: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stance, setStance] =
    useState<RespondToDisputeRequest["stance"]>("explain");
  const [message, setMessage] = useState("");

  const submitLabel =
    dispute.status === "direct_resolution"
      ? "Send to buyer"
      : "Submit to mediator";

  const respond = useMutation({
    mutationFn: () =>
      apiClient.respondToDispute(dispute.id, {
        stance,
        message: message.trim(),
      }),
    onSuccess: () => {
      // Refresh the dispute detail so the saved response renders.
      qc.invalidateQueries({
        queryKey: ["safesale", "order-detail", orderToken],
      });
      setMessage("");
      toast({
        title: "Response sent",
        description:
          dispute.status === "direct_resolution"
            ? "The buyer can see your reply. Funds stay frozen until you both agree or a mediator decides."
            : "Your response is with the SafeSale mediator. The outcome will show here.",
      });
    },
    onError: (err: unknown) => {
      const description =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't send your response. Try again in a moment.";
      toast({
        title: "Couldn't send response",
        description,
        variant: "destructive",
      });
    },
  });

  const submitting = respond.isPending;

  // If the seller has already responded, show it back to them (read-only)
  // with the option to add more.
  return (
    <section className="rounded-2xl border border-border bg-canvas p-5 lg:col-span-2">
      <h2 className="text-sm font-semibold text-ink">Your response</h2>
      {dispute.summary && (
        <p className="mt-1 text-xs text-ink-soft">
          Buyer says: "{dispute.summary}"
        </p>
      )}

      {dispute.sellerResponse && (
        <div className="mt-3 rounded-xl border border-border bg-surface-2/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Your last reply
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {dispute.sellerResponse}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <Label>Your stance</Label>
          <Select
            value={stance}
            onValueChange={(v) =>
              setStance(v as RespondToDisputeRequest["stance"])
            }
          >
            <SelectTrigger className="mt-1.5 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="explain">I'd like to explain</SelectItem>
              <SelectItem value="partial">Offer partial refund</SelectItem>
              <SelectItem value="full">Accept full refund</SelectItem>
              <SelectItem value="counter">Counter the claim</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="msg">Your message</Label>
          <Textarea
            id="msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1.5 min-h-[110px]"
            placeholder={
              dispute.status === "direct_resolution"
                ? "Write directly to the buyer. Try to resolve it here before a mediator gets involved."
                : "Calmly explain what happened. Be specific. Mediators read everything."
            }
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={submitting || message.trim().length === 0}
            onClick={() => respond.mutate()}
          >
            {submitting ? "Sending…" : submitLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              HELPERS                                       */
/* -------------------------------------------------------------------------- */

function buildTimeline(
  d: ApiDispute,
  order: ApiOrder,
  listing: ApiListing,
): TimelineStep[] {
  const fmt = (iso: string) => formatRelative(iso);
  const base: TimelineStep[] = [
    {
      key: "ord",
      title: "Order placed",
      description: `${order.buyerName} bought ${listing.title}`,
      at: fmt(order.createdAt),
      state: "done" as const,
    },
    {
      key: "esc",
      title: "Payment locked",
      description: `${formatNGN(order.amountNGN)} in SafeSale escrow`,
      at: fmt(order.updatedAt),
      state: "done" as const,
    },
    {
      key: "ship",
      title: "Shipped",
      description:
        order.trackingNumber
          ? `${order.carrier ?? ""} ${order.trackingNumber}`
          : undefined,
      at: order.shippedAt ? fmt(order.shippedAt) : undefined,
      state: order.shippedAt ? ("done" as const) : ("pending" as const),
    },
    {
      key: "dsp",
      title: "Dispute opened",
      description: d.summary ?? d.reason,
      at: fmt(d.createdAt),
      state: "alert" as const,
    },
  ];

  if (d.status === "direct_resolution") {
    base.push({
      key: "direct",
      title: "Waiting for your reply",
      description: "Explain what happened and add any evidence",
      at: undefined,
      state: "active" as const,
    });
  }
  if (d.status === "escalated" || d.status === "mediating") {
    base.push({
      key: "escalate",
      title: "With a SafeSale mediator",
      description: "The mediator is reviewing both sides",
      at: undefined,
      state: "active" as const,
    });
  }
  if (d.status === "evidence_requested") {
    base.push({
      key: "evidence",
      title: "Mediator requested more evidence",
      description: "Add the photos or details they asked for",
      at: undefined,
      state: "alert" as const,
    });
  }
  if (d.status === "resolved" && d.resolvedAt) {
    base.push({
      key: "resolved",
      title: "Resolved",
      at: fmt(d.resolvedAt),
      state: "done" as const,
    });
  }
  return base;
}

function MiniCard({
  sub,
  children,
}: {
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-surface-2/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
        {sub}
      </p>
      <div className="mt-2 flex flex-col items-center">{children}</div>
    </div>
  );
}
