/**
 * Admin / Mediator Dispute Dashboard — `/admin`.
 *
 * The mediator's working surface: queue of open disputes, click into
 * one to see both sides' evidence, sign a resolution.
 *
 * Access control: this route is wrapped in `MediatorGate` at the
 * router level (`src/AppRouter.tsx`). The component below assumes
 * the viewer is the trusted mediator npub — no in-component gating.
 *
 * Data source:
 *
 *   The queue is fed by `apiClient.getDisputes()` and the "Resolve"
 *   action calls `apiClient.resolveDispute(id, { outcome, splitPct,
 *   rationale })` — both wired through the API seam. In demo mode
 *   (`VITE_DEMO_MODE=true`) these resolve against the in-memory mock;
 *   against the real backend they hit `GET /api/admin/disputes` and
 *   `POST /api/admin/disputes/:id/resolve` (enumerated in `BACKEND.md`).
 *
 *   Still pending on the backend side: the Nostr kind-33889
 *   resolution-publishing path (per PROGRESS.md PRD delta #7). When
 *   that lands the resolve mutation gets a signed publish step — no
 *   change to this component's structure.
 */

import { useSeoMeta } from "@unhead/react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/safesale/AppShell";
import { Avatar } from "@/components/safesale/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Gavel,
  Package,
  Scale,
  Search,
} from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { useMessagesLive } from "@/hooks/useMarket";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiClient, DEMO_MODE } from "@/lib/api";
import type { AdminDisputeRow, ApiDisputeStatus, DisputeOutcome } from "@/lib/api";

/* ----------------------------------------------------------------------- */
/*                          Dispute display model                          */
/* ----------------------------------------------------------------------- */

type DisputePriority = "high" | "medium" | "low";
type DisputeQueueStatus = "escalated" | "evidence_requested" | "mediating";

interface DisputeFixture {
  id: string;
  /** The order token — used to target apiClient.resolveDispute. */
  orderToken: string;
  shortId: string;
  orderShortId: string;
  status: DisputeQueueStatus;
  priority: DisputePriority;
  openedBy: "buyer" | "seller";
  openedAt: string;
  evidenceDueAt: string;
  reason: string;
  summary: string;
  amountNGN: number;
  seller: {
    handle: string;
    name: string;
    location: string;
  };
  buyer: {
    name: string;
    city: string;
  };
  listing: {
    title: string;
  };
  /** Evidence image URLs, tagged by uploader. */
  evidence: {
    buyer: string[];
    seller: string[];
  };
  /** The seller's written response, if any. */
  sellerResponse: string | null;
}

/**
 * Fold the 5-value backend dispute status into the 3 the queue renders.
 * `direct_resolution` (the 72h peer window) and `mediating` both display
 * as "Mediating"; `resolved` never reaches here (filtered server-side).
 */
function queueStatus(s: ApiDisputeStatus): DisputeQueueStatus {
  if (s === "escalated") return "escalated";
  if (s === "evidence_requested") return "evidence_requested";
  return "mediating";
}

/** Derive a readable DSP-XXXX label from a dispute id. */
function disputeShortId(id: string): string {
  const tail = id
    .replace(/^dsp[_-]?(mock[_-]?)?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4);
  return `DSP-${tail || id.slice(0, 4).toUpperCase()}`;
}

/**
 * Adapt the API's order+dispute envelope into the display model the queue
 * and detail views are built around. Evidence text is synthesized from the
 * dispute reason/summary — enough to look real in the demo; real evidence
 * (photos, Nostr DM log) lands when the backend dispute flow ships.
 */
function adaptRow(row: AdminDisputeRow): DisputeFixture {
  const { order, listing, seller, dispute } = row;
  const summary =
    dispute.summary ??
    `${dispute.openedBy === "buyer" ? "Buyer" : "Seller"} opened a dispute: ${dispute.reason}.`;
  return {
    id: dispute.id,
    orderToken: order.orderToken,
    shortId: disputeShortId(dispute.id),
    orderShortId: order.shortId,
    status: queueStatus(dispute.status),
    priority: dispute.priority,
    openedBy: dispute.openedBy,
    openedAt: dispute.createdAt,
    evidenceDueAt:
      dispute.evidenceDueAt ??
      dispute.directResolutionUntil ??
      order.autoReleaseAt ??
      dispute.createdAt,
    reason: dispute.reason,
    summary,
    amountNGN: order.amountNGN,
    seller: { handle: seller.handle, name: seller.name, location: seller.location },
    buyer: { name: order.buyerName, city: order.buyerCity },
    listing: { title: listing.title },
    evidence: {
      buyer: (dispute.evidence ?? [])
        .filter((e) => e.by === "buyer")
        .map((e) => e.url),
      seller: (dispute.evidence ?? [])
        .filter((e) => e.by === "seller")
        .map((e) => e.url),
    },
    sellerResponse: dispute.sellerResponse ?? null,
  };
}

/* ----------------------------------------------------------------------- */
/*                                Page                                     */
/* ----------------------------------------------------------------------- */

type FilterKey = "open" | "evidence" | "mediating" | "all";

interface FilterSpec {
  key: FilterKey;
  label: string;
  matches: (s: DisputeQueueStatus) => boolean;
}

const FILTERS: FilterSpec[] = [
  { key: "all", label: "All", matches: () => true },
  {
    key: "open",
    label: "Escalated",
    matches: (s) => s === "escalated",
  },
  {
    key: "evidence",
    label: "Awaiting evidence",
    matches: (s) => s === "evidence_requested",
  },
  {
    key: "mediating",
    label: "Mediating",
    matches: (s) => s === "mediating",
  },
];

export default function Admin() {
  useSeoMeta({ title: "Mediator dashboard — SafeSale" });

  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Live dispute queue from the order store. Polls so a dispute a buyer
  // opens mid-demo appears here within a few seconds.
  const { data } = useQuery({
    queryKey: ["safesale", "admin", "disputes"],
    queryFn: () => apiClient.getDisputes(),
    refetchInterval: 4000,
  });

  const allDisputes = useMemo<DisputeFixture[]>(
    () => (data?.disputes ?? []).map(adaptRow),
    [data],
  );

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return allDisputes.filter((d) => {
      if (!f.matches(d.status)) return false;
      if (!q) return true;
      return (
        d.shortId.toLowerCase().includes(q) ||
        d.orderShortId.toLowerCase().includes(q) ||
        d.reason.toLowerCase().includes(q) ||
        d.seller.handle.toLowerCase().includes(q) ||
        d.buyer.name.toLowerCase().includes(q)
      );
    });
  }, [filter, query, allDisputes]);

  const active = activeId
    ? allDisputes.find((d) => d.id === activeId) ?? null
    : null;

  const handleResolve = async (
    disputeId: string,
    orderToken: string,
    outcome: DisputeOutcome,
    splitPct: number,
    rationale: string,
  ) => {
    try {
      await apiClient.resolveDispute(disputeId, { outcome, splitPct, rationale });
      // Reflect the outcome everywhere the order is shown: admin queue (the
      // case drops off), the seller dashboard, and the buyer's order page.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["safesale", "admin", "disputes"] }),
        qc.invalidateQueries({ queryKey: ["safesale", "seller-orders"] }),
        qc.invalidateQueries({ queryKey: ["safesale", "order", orderToken] }),
      ]);
      toast({
        title: "Resolution recorded",
        description:
          "The buyer's and seller's order pages now reflect the outcome.",
      });
      setActiveId(null);
    } catch (err) {
      toast({
        title: "Couldn't resolve the dispute",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppShell
      title="Mediator dashboard"
      subtitle="Review a dispute and sign a resolution — the buyer's and seller's order pages update immediately."
    >
      <div className="space-y-6">
        {/* Mode banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div className="text-sm">
            {DEMO_MODE ? (
              <>
                <p className="font-medium">Demo mode — this queue is fully interactive</p>
                <p className="mt-1 text-xs text-amber-800">
                  Disputes below are live from the in-memory escrow store. Resolving
                  one immediately updates the matching buyer and seller order pages.
                  No backend or live funds involved.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Admin endpoints aren't wired on the live backend yet</p>
                <p className="mt-1 text-xs text-amber-800">
                  Run with VITE_DEMO_MODE=true to drive the full mediator flow. On the live
                  backend this page needs GET /api/admin/disputes and
                  POST /api/admin/disputes/:id/resolve.
                </p>
              </>
            )}
          </div>
        </div>

        {!active ? (
          <DisputeQueue
            disputes={filtered}
            allDisputes={allDisputes}
            filter={filter}
            onFilterChange={setFilter}
            query={query}
            onQueryChange={setQuery}
            onOpen={setActiveId}
          />
        ) : (
          <DisputeDetail
            dispute={active}
            onBack={() => setActiveId(null)}
            onResolve={handleResolve}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ----------------------------------------------------------------------- */
/*                             Queue view                                  */
/* ----------------------------------------------------------------------- */

function DisputeQueue({
  disputes,
  allDisputes,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onOpen,
}: {
  disputes: DisputeFixture[];
  allDisputes: DisputeFixture[];
  filter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (id: string) => void;
}) {
  const counts: Record<FilterKey, number> = {
    all: allDisputes.length,
    open: allDisputes.filter((d) => d.status === "escalated").length,
    evidence: allDisputes.filter((d) => d.status === "evidence_requested").length,
    mediating: allDisputes.filter((d) => d.status === "mediating").length,
  };

  return (
    <>
      {/* Search + filters */}
      <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by dispute id, order id, reason, seller, or buyer"
            className="h-10 pl-10"
            aria-label="Search disputes"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const count = counts[f.key];
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  isActive
                    ? "border-brand-soft bg-brand-soft text-brand-soft-foreground"
                    : "border-border bg-white text-ink-soft hover:text-ink",
                  !isActive && count === 0 && "opacity-60",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-white/50 text-current" : "bg-surface text-ink-soft",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Queue */}
      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <p className="mt-4 text-base font-semibold text-ink">All clear</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            {query
              ? "No disputes match this search."
              : "No disputes match this filter. Pick another or sit back."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Dispute</th>
                  <th className="px-4 py-3">Order / parties</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {disputes.map((d) => (
                  <DisputeRow key={d.id} dispute={d} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 sm:hidden">
            {disputes.map((d) => (
              <DisputeMobileCard key={d.id} dispute={d} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function DisputeRow({
  dispute,
  onOpen,
}: {
  dispute: DisputeFixture;
  onOpen: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onOpen(dispute.id)}
      className="cursor-pointer transition-colors hover:bg-surface focus-within:bg-surface"
    >
      <td className="px-4 py-3 align-middle">
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
          {dispute.shortId}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">
          {dispute.reason}
        </p>
      </td>
      <td className="px-4 py-3 align-middle">
        <p className="text-sm text-ink">
          {dispute.buyer.name}{" "}
          <span className="text-ink-soft">vs.</span> @{dispute.seller.handle}
        </p>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
          {dispute.orderShortId}
        </p>
      </td>
      <td className="px-4 py-3 align-middle">
        <p className="text-sm font-semibold tabular-nums text-ink">
          {formatNGN(dispute.amountNGN)}
        </p>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={dispute.status} />
          <PriorityBadge priority={dispute.priority} />
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-right">
        <p className="text-xs text-ink-soft">
          {formatRelative(dispute.openedAt)}
        </p>
      </td>
    </tr>
  );
}

function DisputeMobileCard({
  dispute,
  onOpen,
}: {
  dispute: DisputeFixture;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(dispute.id)}
        className="block w-full rounded-2xl border border-border bg-white p-4 text-left transition-colors active:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold tabular-nums text-ink">
              {dispute.shortId}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
              {dispute.reason}
            </p>
          </div>
          <StatusBadge status={dispute.status} />
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-ink">
              {dispute.buyer.name} vs. @{dispute.seller.handle}
            </p>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
              {dispute.orderShortId}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatNGN(dispute.amountNGN)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {formatRelative(dispute.openedAt)}
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                            Detail view                                  */
/* ----------------------------------------------------------------------- */

function DisputeDetail({
  dispute,
  onBack,
  onResolve,
}: {
  dispute: DisputeFixture;
  onBack: () => void;
  onResolve: (
    disputeId: string,
    orderToken: string,
    outcome: DisputeOutcome,
    splitPct: number,
    rationale: string,
  ) => void | Promise<void>;
}) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canResolve =
    outcome !== null && rationale.trim().length >= 20 && !submitting;

  const handleResolveClick = async () => {
    if (!outcome) return;
    setSubmitting(true);
    try {
      await onResolve(dispute.id, dispute.orderToken, outcome, splitPct, rationale.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded text-xs font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to queue
      </button>

      {/* Heading */}
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tabular-nums text-ink">
            {dispute.shortId}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {dispute.reason} ·{" "}
            <span className="font-mono tabular-nums">
              {dispute.orderShortId}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={dispute.status} />
          <PriorityBadge priority={dispute.priority} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT — both sides + resolution */}
        <div className="space-y-6 lg:col-span-2">
          {/* Both parties side-by-side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <PartyCard
              role="Buyer"
              name={dispute.buyer.name}
              location={dispute.buyer.city}
              evidence={dispute.evidence.buyer}
              statement={dispute.summary}
              opened={dispute.openedBy === "buyer"}
            />
            <PartyCard
              role="Seller"
              name={`@${dispute.seller.handle}`}
              subname={dispute.seller.name}
              location={dispute.seller.location}
              evidence={dispute.evidence.seller}
              statement={dispute.sellerResponse}
              opened={dispute.openedBy === "seller"}
            />
          </div>

          {/* Full buyer↔seller conversation for context */}
          <ConversationCard orderToken={dispute.orderToken} />


          {/* Resolution form */}
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-ink">
              Sign a resolution
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              The resolution is recorded and both the buyer's and seller's
              order pages update immediately to reflect the outcome.
            </p>

            <div className="mt-5 space-y-4">
              <fieldset>
                <legend className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                  Outcome
                </legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <OutcomeOption
                    value="refund_buyer"
                    label="Refund to buyer"
                    selected={outcome === "refund_buyer"}
                    onSelect={() => setOutcome("refund_buyer")}
                  />
                  <OutcomeOption
                    value="release_seller"
                    label="Release to seller"
                    selected={outcome === "release_seller"}
                    onSelect={() => setOutcome("release_seller")}
                  />
                  <OutcomeOption
                    value="split"
                    label="Split"
                    selected={outcome === "split"}
                    onSelect={() => setOutcome("split")}
                  />
                </div>
              </fieldset>

              {outcome === "split" && (
                <div>
                  <Label htmlFor="split">Buyer share (%)</Label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <input
                      id="split"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={splitPct}
                      onChange={(e) => setSplitPct(Number(e.target.value))}
                      className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-surface"
                    />
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                      {splitPct}%
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-soft">
                    Buyer receives {formatNGN(Math.round((dispute.amountNGN * splitPct) / 100))} ·
                    seller receives {formatNGN(dispute.amountNGN - Math.round((dispute.amountNGN * splitPct) / 100))}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="rationale">
                  Rationale <span className="text-ink-soft">(min 20 chars; published publicly)</span>
                </Label>
                <Textarea
                  id="rationale"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why this outcome — phrased so both parties can read it without escalating."
                  className="mt-1.5 min-h-[100px]"
                />
                <p className="mt-1 text-[11px] text-ink-soft">
                  {rationale.length} / 600
                </p>
              </div>

              <Button
                type="button"
                onClick={handleResolveClick}
                disabled={!canResolve}
                className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                <Gavel className="mr-2 h-4 w-4" aria-hidden />
                {submitting ? "Saving…" : "Sign resolution"}
              </Button>
            </div>
          </section>
        </div>

        {/* RIGHT — case details + summary */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
              Case
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <Pair label="Listing">
                <span className="text-ink">{dispute.listing.title}</span>
              </Pair>
              <Pair label="Disputed amount">
                <div>
                  <p className="font-semibold tabular-nums text-ink">
                    {formatNGN(dispute.amountNGN)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-ink-soft">
                    held in escrow
                  </p>
                </div>
              </Pair>
              <Pair label="Opened by">
                <span className="capitalize text-ink">{dispute.openedBy}</span>
              </Pair>
              <Pair label="Opened">
                <span className="text-ink">{formatRelative(dispute.openedAt)}</span>
              </Pair>
              <Pair label="Evidence due">
                <span className="inline-flex items-center gap-1 text-ink">
                  <Calendar className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
                  {formatRelative(dispute.evidenceDueAt)}
                </span>
              </Pair>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
              Summary
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink">
              {dispute.summary}
            </p>
          </section>

          <p className="text-[11px] italic text-ink-soft">
            Evidence and the mediator's signed decision are recorded against
            the order. Both parties see the outcome on their order page.
          </p>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                          Small primitives                               */
/* ----------------------------------------------------------------------- */

function StatusBadge({ status }: { status: DisputeQueueStatus }) {
  const cfg =
    status === "escalated"
      ? { label: "Escalated", cls: "bg-rose-50 text-rose-800 border-rose-200", Icon: AlertTriangle }
      : status === "evidence_requested"
        ? { label: "Awaiting evidence", cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: Package }
        : { label: "Mediating", cls: "bg-sky-50 text-sky-800 border-sky-200", Icon: Gavel };
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide",
        cfg.cls,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden /> {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: DisputePriority }) {
  const cls =
    priority === "high"
      ? "bg-rose-100 text-rose-800"
      : priority === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-surface text-ink-soft";
  return (
    <span
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        cls,
      )}
    >
      priority: {priority}
    </span>
  );
}

function PartyCard({
  role,
  name,
  subname,
  location,
  evidence,
  statement,
  opened,
}: {
  role: "Buyer" | "Seller";
  name: string;
  subname?: string;
  location: string;
  evidence: string[];
  statement?: string | null;
  opened: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <header className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
          {role}
        </p>
        {opened && (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-800">
            Opened
          </span>
        )}
      </header>
      <div className="mt-3 flex items-center gap-3">
        <Avatar seed={`${role}-${name}`} name={name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-soft">
            {subname ? `${subname} · ` : ""}
            {location}
          </p>
        </div>
      </div>

      {/* Written statement */}
      <div className="mt-4 rounded-lg border border-border bg-surface/40 p-3 text-xs text-ink">
        {statement ? (
          <span>“{statement}”</span>
        ) : (
          <span className="text-ink-soft">
            {role === "Seller"
              ? "No response from the seller yet."
              : "No statement provided."}
          </span>
        )}
      </div>

      {/* Evidence images */}
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        Evidence ({evidence.length})
      </p>
      {evidence.length === 0 ? (
        <p className="mt-1 text-xs text-ink-soft">No photos uploaded.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {evidence.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-lg border border-border"
            >
              <img src={url} alt={`${role} evidence ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/** Read-only buyer↔seller conversation, shown to the mediator for context. */
function ConversationCard({ orderToken }: { orderToken: string }) {
  const messages = useMessagesLive(orderToken);
  if (messages.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
        Buyer ↔ seller conversation
      </p>
      <ul className="mt-3 space-y-2">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            <span
              className={cn(
                "font-semibold",
                m.from === "buyer" ? "text-brand" : m.from === "seller" ? "text-ink" : "text-ink-soft",
              )}
            >
              {m.from === "system" ? "System" : m.from === "buyer" ? "Buyer" : "Seller"}:
            </span>{" "}
            <span className="text-ink-soft">{m.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OutcomeOption({
  value,
  label,
  selected,
  onSelect,
}: {
  value: DisputeOutcome;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-value={value}
      className={cn(
        "rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        selected
          ? "border-brand bg-brand-soft text-brand-soft-foreground"
          : "border-border bg-white text-ink hover:bg-surface",
      )}
    >
      {label}
    </button>
  );
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0">
      <dt className="text-[11px] uppercase tracking-wider text-ink-soft">
        {label}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
