/**
 * Seller Listings — `/app/listings`.
 *
 * Where a seller adds a new product, copies the buyer link for an
 * existing one, or sees what's live vs. sold out. Design ported from
 * `.stitch-designs/03-seller-listings.html` — Stitch shipped the right
 * layout (snapshot strip → search/filters → 3-col card grid → create
 * sheet → share dialog → mobile FAB) but in Material Design tokens
 * with a violet primary, custom sidebar, Material Symbols, and a
 * glassmorphism layer. All of those are stripped here; the page uses
 * the SafeSale tokens + lucide-react + the existing AppShell, the
 * same way #2 Seller Dashboard was ported.
 *
 * Reads exclusively from Nostr via `useMyListings()` (kind 30018
 * addressable events authored by the logged-in seller). Create-flow
 * is wired against the live Railway backend via `apiClient.createListing`
 * (added in Phase 8 step B) — backend cuid round-trips back as the
 * Nostr `d` tag so /buy/:id and POST /api/orders agree on the id.
 *
 * Edit + Mark-out-of-stock per-card actions are wired through
 * `apiClient.updateListing(id, …)` (PATCH /api/listings/:id). In demo
 * mode they update the in-memory mock; against the real backend they
 * hit the PATCH route, which must also keep the Nostr kind-30018 event
 * (same `d` tag) in sync so /buy/:id and POST /api/orders validate
 * against the current title/price/stock.
 */

import { useSeoMeta } from "@unhead/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/safesale/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  Check,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PackageX,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import { XIcon } from "@/components/safesale/BrandIcons";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { type MyListing } from "@/hooks/useMyListings";
import { useSellerListingsLive } from "@/hooks/useMarket";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";

import { apiClient, DEMO_MODE } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import type { ApiListing } from "@/lib/api/types";
import { marketStore } from "@/lib/store/marketStore";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn, sanitizeUrl } from "@/lib/utils";

/**
 * Adapt a store `ApiListing` into the `MyListing` view-model the cards
 * render. Seed-based images become the `safesale://` placeholder; URL
 * images pass through.
 */
function apiToMyListing(l: ApiListing): MyListing {
  const images = l.images
    .map((img) =>
      img.url ? img.url : img.seed ? `safesale://fixture-image/${img.seed}` : "",
    )
    .filter(Boolean);
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    priceNGN: l.priceNGN,
    images,
    category: l.category,
    inStock: l.inStock,
    delivery: l.delivery ?? undefined,
    deliveryFee: l.deliveryFee ?? 0,
    variants: l.variants ?? undefined,
    publishedAt: Math.floor(new Date(l.createdAt).getTime() / 1000),
  };
}

/* -------------------------------------------------------------------------- */
/*                                Constants                                   */
/* -------------------------------------------------------------------------- */

const MAX_PHOTOS = 4;

type StockFilter = "all" | "available" | "out";

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "out", label: "Out of stock" },
];

/* -------------------------------------------------------------------------- */
/*                                  Page                                      */
/* -------------------------------------------------------------------------- */

export default function ListingsPage() {
  useSeoMeta({ title: "Listings — SafeSale" });

  const { user } = useCurrentUser();
  const [seller] = useCurrentSeller();
  // Whether this person can manage a shop. In demo mode the Nostr login
  // (`user`) churns during onboarding, so we trust the persisted seller
  // record — matching SellerGate. Real mode still requires the Nostr login.
  const canSell = DEMO_MODE ? !!seller : !!user;
  // Live from the market store — the source of truth in demo mode. New
  // listings (and edits / stock toggles) reflect here instantly.
  const liveListings = useSellerListingsLive();
  const listings = useMemo(
    () => liveListings.map(apiToMyListing),
    [liveListings],
  );
  const isLoading = false;
  const error: unknown = null;
  const [createOpen, setCreateOpen] = useState(false);
  const [editListing, setEditListing] = useState<MyListing | null>(null);
  const [shareListing, setShareListing] = useState<MyListing | null>(null);

  const [filter, setFilter] = useState<StockFilter>("all");
  const [query, setQuery] = useState("");

  // Snapshot stats — computed once per listings change.
  const stats = useMemo(() => {
    let available = 0;
    let outOfStock = 0;
    for (const l of listings) {
      if (l.inStock > 0) available += 1;
      else outOfStock += 1;
    }
    return { total: listings.length, available, outOfStock };
  }, [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
      if (filter === "available" && l.inStock <= 0) return false;
      if (filter === "out" && l.inStock > 0) return false;
      if (!q) return true;
      return l.title.toLowerCase().includes(q);
    });
  }, [listings, filter, query]);

  // Header right-action: primary "+ New listing" button. The same
  // primary CTA also appears as a floating FAB on mobile (see end of
  // the page) so the user always has it in reach.
  const headerAction = (
    <Button
      onClick={() => setCreateOpen(true)}
      disabled={!canSell}
      size="sm"
      className="h-9 bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
    >
      <Plus className="mr-1 h-4 w-4" />
      <span className="hidden sm:inline">New listing</span>
      <span className="sm:hidden">New</span>
    </Button>
  );

  return (
    <AppShell
      title="Listings"
      subtitle="Your products live here."
      action={headerAction}
    >
      <div className="space-y-6">
        {!canSell ? (
          <SignedOutState />
        ) : (
          <>
            <SnapshotStrip stats={stats} loading={isLoading} />
            <SearchAndFilters
              query={query}
              setQuery={setQuery}
              filter={filter}
              setFilter={setFilter}
              stats={stats}
            />

            {error ? (
              <ErrorState
                message={
                  error instanceof Error
                    ? error.message
                    : "Couldn't load your listings."
                }
              />
            ) : isLoading ? (
              <ListingsGridSkeleton />
            ) : listings.length === 0 ? (
              <EmptyListingsState onAdd={() => setCreateOpen(true)} />
            ) : filtered.length === 0 ? (
              <FilteredEmptyState
                query={query}
                onClearSearch={() => setQuery("")}
              />
            ) : (
              <ListingsGrid
                listings={filtered}
                onShare={setShareListing}
                onEdit={setEditListing}
              />
            )}
          </>
        )}
      </div>

      {/* Mobile-only floating action button. Hidden on sm+ where the
          header action is always visible. */}
      {canSell && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="New listing"
          className="fixed bottom-20 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg transition-transform active:scale-95 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <CreateListingSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPublished={(l) => setShareListing(l)}
      />
      <EditListingSheet
        listing={editListing}
        open={!!editListing}
        onClose={() => setEditListing(null)}
      />
      <ShareDialog
        listing={shareListing}
        open={!!shareListing}
        onOpenChange={(o) => !o && setShareListing(null)}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Snapshot strip                                */
/* -------------------------------------------------------------------------- */

function SnapshotStrip({
  stats,
  loading,
}: {
  stats: { total: number; available: number; outOfStock: number };
  loading: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-white p-4 sm:p-5">
      <SnapshotStat
        label="Total listings"
        value={stats.total}
        loading={loading}
      />
      <Divider />
      <SnapshotStat
        label="Available"
        value={stats.available}
        loading={loading}
      />
      <Divider />
      <SnapshotStat
        label="Out of stock"
        value={stats.outOfStock}
        loading={loading}
        emphasize={stats.outOfStock > 0}
      />
    </section>
  );
}

function SnapshotStat({
  label,
  value,
  loading,
  emphasize,
}: {
  label: string;
  value: number;
  loading: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[110px]">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold leading-none tabular-nums",
          emphasize ? "text-amber-700" : "text-ink",
        )}
      >
        {loading ? <Skeleton className="h-5 w-10" /> : value}
      </p>
    </div>
  );
}

function Divider() {
  return (
    <div aria-hidden className="hidden h-6 w-px bg-border sm:block" />
  );
}

/* -------------------------------------------------------------------------- */
/*                            Search + filter chips                           */
/* -------------------------------------------------------------------------- */

function SearchAndFilters({
  query,
  setQuery,
  filter,
  setFilter,
  stats,
}: {
  query: string;
  setQuery: (q: string) => void;
  filter: StockFilter;
  setFilter: (f: StockFilter) => void;
  stats: { total: number; available: number; outOfStock: number };
}) {
  const countFor = (k: StockFilter) =>
    k === "all" ? stats.total : k === "available" ? stats.available : stats.outOfStock;

  return (
    <section className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your listings"
            className="h-10 pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  isActive
                    ? "border-brand bg-brand-soft text-brand-soft-foreground"
                    : "border-border bg-white text-ink-soft hover:text-ink",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-white text-brand" : "bg-surface text-ink-soft",
                  )}
                >
                  {countFor(f.key)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Listing grid                                */
/* -------------------------------------------------------------------------- */

function ListingsGrid({
  listings,
  onShare,
  onEdit,
}: {
  listings: MyListing[];
  onShare: (l: MyListing) => void;
  onEdit: (l: MyListing) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          onShare={() => onShare(l)}
          onEdit={() => onEdit(l)}
        />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  onShare,
  onEdit,
}: {
  listing: MyListing;
  onShare: () => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const [stockBusy, setStockBusy] = useState(false);
  const cover = listing.images[0] ? sanitizeUrl(listing.images[0]) : undefined;
  const extraImages = Math.max(0, listing.images.length - 1);
  const isOut = listing.inStock <= 0;
  const buyLink = buyUrlFor(listing.id);

  const copyLink = () => {
    void navigator.clipboard?.writeText(buyLink).then(() => {
      toast({ title: "Buyer link copied" });
    });
  };

  const stockLabel = isOut
    ? "Out of stock"
    : listing.inStock > 1
      ? `In stock (${listing.inStock})`
      : "In stock";

  // Toggle stock through the API client → market store. The store is
  // reactive, so this card (and the buyer page) reflect the change
  // instantly. Out → 0; back-in → 1.
  const toggleStock = async () => {
    if (stockBusy) return;
    setStockBusy(true);
    try {
      const { listing: updated } = await apiClient.updateListing(listing.id, {
        inStock: isOut ? 1 : 0,
      });
      // Keep the store (which the dashboard + marketplace render from) in sync;
      // the real HTTP client doesn't write to it. See onPublish for context.
      marketStore.upsertListing(updated);
      toast({
        title: isOut ? "Back in stock" : "Marked out of stock",
        description: isOut
          ? "Buyers can purchase this listing again."
          : "Buyers now see “Out of stock” and can't check out.",
      });
    } catch (err) {
      toast({
        title: "Couldn't update stock",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setStockBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 animate-slide-up hover:scale-[1.01] hover:-translate-y-0.5 hover:shadow-md",
        "border-border focus-within:border-brand hover:border-brand/35",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
              isOut && "opacity-80",
            )}
          />
        ) : (
          <div className="h-full w-full bg-surface" aria-hidden />
        )}

        {/* "+N" chip — extra images count */}
        {extraImages > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-tight text-white">
            +{extraImages}
          </span>
        )}

        {/* Out-of-stock ribbon */}
        {isOut && (
          <span className="absolute left-0 top-3 rounded-r-md bg-amber-100/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 shadow-sm">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex-1 space-y-1.5 p-4">
        <Link
          to={`/buy/${listing.id}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {listing.title}
        </Link>
        <p className="text-base font-semibold tabular-nums text-ink">
          {formatNGN(listing.priceNGN)}
          {listing.deliveryFee ? (
            <span className="ml-1.5 text-xs font-normal text-ink-soft">
              + {formatNGN(listing.deliveryFee)} delivery ={" "}
              {formatNGN(listing.priceNGN + listing.deliveryFee)}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-ink-soft">
          {stockLabel} ·{" "}
          {formatRelative(
            new Date(listing.publishedAt * 1000).toISOString(),
          )}
        </p>
      </div>

      <div className="flex border-t border-border">
        <FooterAction
          icon={Copy}
          label="Copy buyer link"
          onClick={copyLink}
        />
        <div aria-hidden className="w-px bg-border" />
        <FooterAction
          icon={Share2}
          label="Share"
          onClick={onShare}
        />
        <div aria-hidden className="w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="inline-flex h-10 flex-1 items-center justify-center text-ink-soft transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link
                to={`/buy/${listing.id}`}
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer"
              >
                <Eye className="mr-2 h-4 w-4" />
                View as buyer
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit listing
            </DropdownMenuItem>
            <DropdownMenuItem disabled={stockBusy} onClick={toggleStock}>
              {isOut ? (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Mark back in stock
                </>
              ) : (
                <>
                  <PackageX className="mr-2 h-4 w-4" />
                  Mark out of stock
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FooterAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-10 flex-1 items-center justify-center text-ink-soft transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  States                                    */
/* -------------------------------------------------------------------------- */

function SignedOutState() {
  return (
    <div className="grid place-items-center py-16">
      <div className="max-w-sm rounded-2xl border border-dashed border-border bg-white p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="mt-4 text-base font-semibold text-ink">
          Sign in to manage your listings
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Your Nostr key signs every listing — no central account, no platform
          gatekeeping.
        </p>
        <Button
          asChild
          className="mt-5 bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link to="/onboarding">Get started</Link>
        </Button>
      </div>
    </div>
  );
}

function EmptyListingsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center sm:px-10 sm:py-14">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-soft">
        <ImagePlus className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-ink">
        Add your first listing
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
        Photos, price, and a title — about 90 seconds. You can edit anything
        later.
      </p>
      <Button
        onClick={onAdd}
        className="mt-5 h-11 bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
      >
        <Plus className="mr-1 h-4 w-4" />
        Create a listing
      </Button>
    </div>
  );
}

function FilteredEmptyState({
  query,
  onClearSearch,
}: {
  query: string;
  onClearSearch: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">
        {query
          ? `No listings match "${query}".`
          : "No listings match this filter."}
      </p>
      {query && (
        <Button
          onClick={onClearSearch}
          variant="ghost"
          className="mt-3 text-xs font-medium text-brand hover:text-brand"
        >
          Clear search
        </Button>
      )}
    </div>
  );
}

function ListingsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border bg-white"
        >
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">Couldn't load listings</p>
      <p className="mt-1 text-xs text-ink-soft">{message}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Share dialog                                  */
/* -------------------------------------------------------------------------- */

function ShareDialog({
  listing,
  open,
  onOpenChange,
}: {
  listing: MyListing | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  if (!listing) return null;
  const shareLink = buyUrlFor(listing.id);

  const copy = () => {
    void navigator.clipboard?.writeText(shareLink).then(() => {
      toast({ title: "Link copied" });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
            <Check className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-base">
            Your listing is live.
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Paste this link in your Instagram bio, WhatsApp About, TikTok —
            anywhere you sell.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* URL row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-border bg-surface p-2">
            <div className="flex-1 min-w-0 break-all px-2 py-1 font-mono text-xs text-ink-soft select-all">
              {shareLink}
            </div>
            <Button
              size="sm"
              onClick={copy}
              className="h-9 sm:h-8 w-full sm:w-auto px-3 text-xs font-semibold bg-brand text-brand-foreground hover:bg-brand/90 shrink-0"
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy Link
            </Button>
          </div>

          {/* Share targets */}
          <div className="grid grid-cols-3 gap-2">
            <ShareTarget
              icon={MessageSquare}
              label="WhatsApp"
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(`Check out this ${listing.title} on SafeSale: ${shareLink}`)}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            />
            <ShareTarget
              icon={XIcon}
              label="X"
              onClick={() =>
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this ${listing.title} on SafeSale!`)}&url=${encodeURIComponent(shareLink)}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            />
            <ShareTarget
              icon={Share2}
              label="More…"
              onClick={async () => {
                if (
                  typeof navigator !== "undefined" &&
                  typeof navigator.share === "function"
                ) {
                  try {
                    await navigator.share({
                      title: listing.title,
                      text: `Check out this ${listing.title} on SafeSale`,
                      url: shareLink,
                    });
                  } catch {
                    // User cancelled — silent.
                  }
                } else {
                  copy();
                }
              }}
            />
          </div>

          {/* QR */}
          <div className="rounded-xl border border-border bg-white p-3 text-center">
            <QRCodeCanvas value={shareLink} size={120} className="mx-auto" />
            <p className="mt-2 text-[11px] text-ink-soft">Or share the QR</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareTarget({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icon className="h-4 w-4 text-ink-soft" />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Create listing sheet                              */
/* -------------------------------------------------------------------------- */

interface PendingPhoto {
  /** Stable key for React lists. */
  key: string;
  /** Local file the user selected. */
  file: File;
  /** Data URL for preview while it uploads. */
  previewUrl: string;
  /** Final Blossom URL after a successful upload, else null. */
  uploadedUrl: string | null;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
}

function CreateListingSheet({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: (listing: MyListing) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const [currentSeller] = useCurrentSeller();
  const { mutateAsync: publish, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Backend round-trip; the publish button must wait on both this AND `isPublishing`. */
  const [isSavingToBackend, setIsSavingToBackend] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when the sheet closes (small delay so it doesn't flash
  // during the close animation).
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setTitle("");
        setPrice("");
        setDeliveryFee("");
        setDescription("");
        setPhotos([]);
        setError(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const uploadedPhotos = useMemo(
    () =>
      photos.filter(
        (p): p is PendingPhoto & { uploadedUrl: string } =>
          p.status === "ready" && p.uploadedUrl !== null,
      ),
    [photos],
  );
  const stillUploading = photos.some((p) => p.status === "uploading");
  // Demo mode publishes through the store and needs only a seller record;
  // real mode requires the Nostr login to sign the kind-30018 event.
  const canSell = DEMO_MODE ? !!currentSeller : !!user;
  const canPublish =
    canSell &&
    title.trim().length > 1 &&
    Number(price) > 0 &&
    uploadedPhotos.length > 0 &&
    !stillUploading &&
    !isPublishing &&
    !isSavingToBackend;

  const onFilesPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_PHOTOS - photos.length);
    const accepted = files.slice(0, remainingSlots);

    const newPending: PendingPhoto[] = accepted.map((file) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploadedUrl: null,
      status: "uploading",
    }));

    setPhotos((prev) => [...prev, ...newPending]);

    // Upload sequentially so we don't hammer the Blossom server.
    for (const photo of newPending) {
      try {
        const tags = await uploadFile(photo.file);
        const url = tags[0]?.[1];
        if (!url) throw new Error("Upload didn't return a URL");
        setPhotos((prev) =>
          prev.map((p) =>
            p.key === photo.key
              ? { ...p, uploadedUrl: url, status: "ready" }
              : p,
          ),
        );
      } catch (err) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.key === photo.key
              ? {
                  ...p,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : "Upload failed",
                }
              : p,
          ),
        );
      }
    }
  };

  const removePhoto = (key: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.key !== key);
      const removed = prev.find((p) => p.key === key);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  // Cleanup any remaining object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
    // We intentionally only want to clean up the final value when unmounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPublish = async () => {
    if (!canPublish) return;
    setError(null);

    if (!currentSeller) {
      const msg =
        "Your shop isn't fully set up. Sign out and create your shop again to fix this.";
      setError(msg);
      toast({
        title: "Shop not set up",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    const priceNGN = Number(price);
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    setIsSavingToBackend(true);

    // Ensure the seller exists in the reactive `marketStore` BEFORE creating
    // the listing. In demo mode the mock `createListing` looks the seller up
    // by npub and rejects with "Seller npub does not match any registered
    // seller" if it's missing — which happens when a localStorage reset cleared
    // the store but left the cached seller session. The dashboard + public
    // Marketplace also read sellers from this store, so register it either way.
    if (!marketStore.getSellerByNpub(currentSeller.npub)) {
      marketStore.upsertSeller({
        id: currentSeller.id,
        npub: currentSeller.npub,
        pubkey: user?.pubkey ?? currentSeller.npub,
        handle: currentSeller.handle,
        name: currentSeller.name,
        location: "",
        category: "General",
        verified: false,
        avatarUrl: currentSeller.avatarUrl ?? null,
        createdAt: currentSeller.createdAt,
      });
    }

    // 1. Backend first — its cuid becomes the canonical listing id.
    let backendListingId: string;
    try {
      const { listing } = await apiClient.createListing({
        sellerNpub: currentSeller.npub,
        title: trimmedTitle,
        description: trimmedDescription,
        priceNGN,
        images: uploadedPhotos.map((p) => ({ url: p.uploadedUrl })),
        // Sheet doesn't capture category yet. "General" satisfies the
        // backend's Zod min(2). When a category picker lands, swap this.
        category: "General",
        inStock: 1,
        deliveryFee: Number(deliveryFee) || 0,
      });
      backendListingId = listing.id;

      // Mirror the listing into the reactive store so the dashboard +
      // Marketplace (which read from `marketStore`, not the backend directly)
      // reflect it immediately.
      marketStore.upsertListing(listing);
    } catch (err) {
      setIsSavingToBackend(false);
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save your listing on SafeSale's servers.";
      setError(msg);
      toast({
        title: "Publish failed",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const optimistic: MyListing = {
      id: backendListingId,
      title: trimmedTitle,
      description: trimmedDescription,
      priceNGN,
      images: uploadedPhotos.map((p) => p.uploadedUrl),
      inStock: 1,
      publishedAt: now,
    };

    // Demo mode: the store IS the source of truth (already written above) and
    // there's no Nostr relay to broadcast to — so skip it, close the form, and
    // jump straight to the share step. No scary "broadcast failed" toast.
    if (DEMO_MODE) {
      toast({
        title: "Listing published",
        description: "It's live — share the link to start selling.",
      });
      onClose();
      setIsSavingToBackend(false);
      setTimeout(() => onPublished(optimistic), 250);
      return;
    }

    // 2. Real mode: broadcast to Nostr using the backend cuid as the `d` tag.
    const tags: string[][] = [
      ["d", backendListingId],
      ["title", trimmedTitle],
      ["price", String(priceNGN), "NGN"],
      ["published_at", String(now)],
      ["stock", "1"],
      ["r", buyUrlFor(backendListingId)],
    ];
    for (const photo of uploadedPhotos) {
      tags.push(["image", photo.uploadedUrl]);
    }

    try {
      const event = await publish({
        kind: 30018,
        content: trimmedDescription,
        tags,
        created_at: now,
      });

      toast({
        title: "Listing published",
        description: "It's live on SafeSale — share the link to start selling.",
      });

      queryClient.invalidateQueries({
        queryKey: ["safesale", "my-listings", user?.pubkey],
      });

      onClose();
      setIsSavingToBackend(false);
      setTimeout(() => onPublished({ ...optimistic, event }), 250);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Saved on SafeSale, but couldn't broadcast on Nostr.";
      setIsSavingToBackend(false);
      setError(msg);
      toast({
        title: "Published on SafeSale, not on Nostr",
        description:
          "Your listing is live and orderable. Nostr broadcast failed — buyers will see it via the SafeSale link.",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 sm:left-auto sm:right-0 sm:h-full sm:max-w-xl sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border sm:hidden" />
        <SheetHeader className="px-5 pt-4">
          <SheetTitle className="text-left text-lg">New listing</SheetTitle>
          <SheetDescription className="text-left">
            Add a clear title, photos and price. Saved to SafeSale and
            published to Nostr with your key.
          </SheetDescription>
        </SheetHeader>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 pb-8 sm:max-h-[calc(100vh-200px)]">
          <div className="space-y-5">
            {/* Photos */}
            <div>
              <Label>Photos</Label>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((p) => (
                  <div
                    key={p.key}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface"
                  >
                    <img
                      src={p.previewUrl}
                      alt=""
                      className={cn(
                        "h-full w-full object-cover",
                        p.status === "uploading" && "opacity-60",
                        p.status === "error" && "opacity-40",
                      )}
                    />
                    {p.status === "uploading" && (
                      <span
                        aria-label="Uploading"
                        className="absolute inset-0 grid place-items-center bg-black/20 text-white"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </span>
                    )}
                    {p.status === "error" && (
                      <span
                        title={p.errorMessage}
                        className="absolute inset-0 grid place-items-center bg-rose-700/30 text-[10px] font-semibold text-white"
                      >
                        Failed
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(p.key)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white/85 text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface text-ink-soft hover:border-brand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-[11px] font-medium">Add photo</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onFilesPicked}
              />
              <p className="mt-2 text-xs text-ink-soft">
                JPG / PNG / WebP, up to 4 photos. The first photo is the cover.
                {stillUploading && (
                  <span className="ml-1 inline-flex items-center gap-1 text-brand">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Uploading…
                  </span>
                )}
              </p>
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="e.g. Vintage Levi's 501 Jeans"
                className="mt-1.5 h-11"
              />
            </div>

            {/* Price + delivery fee */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price (NGN)</Label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">
                    ₦
                  </span>
                  <Input
                    id="price"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) =>
                      setPrice(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="25000"
                    className="h-11 pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="delivery-fee">Delivery fee (NGN)</Label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">
                    ₦
                  </span>
                  <Input
                    id="delivery-fee"
                    inputMode="numeric"
                    value={deliveryFee}
                    onChange={(e) =>
                      setDeliveryFee(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="0 = free"
                    className="h-11 pl-7"
                  />
                </div>
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-ink-soft">
              Buyers see the delivery fee added to the total before they pay —
              no surprises after payment.
            </p>

            {/* Description */}
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, 2000))
                }
                placeholder="Condition, size, what's included, pickup or delivery details — keep it real."
                className="mt-1.5 min-h-[140px]"
              />
              {description.length > 1500 && (
                <p className="mt-1 text-right text-[10px] text-ink-soft tabular-nums">
                  {description.length}/2000
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-white px-5 py-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPublishing || isSavingToBackend}
          >
            Cancel
          </Button>
          <Button
            onClick={onPublish}
            disabled={!canPublish}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {isSavingToBackend ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : stillUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for uploads…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Publish
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Edit listing sheet                              */
/* -------------------------------------------------------------------------- */

function EditListingSheet({
  listing,
  open,
  onClose,
}: {
  listing: MyListing | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: uploadFile } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("1");
  const [category, setCategory] = useState("");
  const [delivery, setDelivery] = useState("");
  const [variants, setVariants] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill whenever a new listing is opened for editing.
  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title);
    setPrice(String(listing.priceNGN));
    setDeliveryFee(String(listing.deliveryFee ?? 0));
    setDescription(listing.description ?? "");
    setStock(String(listing.inStock));
    setCategory(listing.category ?? "");
    setDelivery(listing.delivery ?? "");
    setVariants((listing.variants ?? []).join(", "));
    setError(null);
    // Existing images become already-ready photos (no File, url set).
    setPhotos(
      listing.images
        .filter((url) => !url.startsWith("safesale://"))
        .map((url, i) => ({
          key: `existing-${i}-${url.slice(-8)}`,
          file: undefined as unknown as File,
          previewUrl: url,
          uploadedUrl: url,
          status: "ready" as const,
        })),
    );
  }, [listing]);

  const uploaded = useMemo(
    () =>
      photos.filter(
        (p): p is PendingPhoto & { uploadedUrl: string } =>
          p.status === "ready" && p.uploadedUrl !== null,
      ),
    [photos],
  );
  const stillUploading = photos.some((p) => p.status === "uploading");
  const canSave =
    title.trim().length > 1 &&
    Number(price) > 0 &&
    !stillUploading &&
    !saving;

  const onFilesPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const slots = Math.max(0, MAX_PHOTOS - photos.length);
    const accepted = files.slice(0, slots);
    const pending: PendingPhoto[] = accepted.map((file) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploadedUrl: null,
      status: "uploading",
    }));
    setPhotos((prev) => [...prev, ...pending]);
    for (const photo of pending) {
      try {
        const tags = await uploadFile(photo.file);
        const url = tags[0]?.[1];
        if (!url) throw new Error("Upload didn't return a URL");
        setPhotos((prev) =>
          prev.map((p) =>
            p.key === photo.key ? { ...p, uploadedUrl: url, status: "ready" } : p,
          ),
        );
      } catch (err) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.key === photo.key
              ? {
                  ...p,
                  status: "error",
                  errorMessage: err instanceof Error ? err.message : "Upload failed",
                }
              : p,
          ),
        );
      }
    }
  };

  const removePhoto = (key: string) =>
    setPhotos((prev) => prev.filter((p) => p.key !== key));

  const onSave = async () => {
    if (!canSave || !listing) return;
    setSaving(true);
    setError(null);
    try {
      const { listing: updated } = await apiClient.updateListing(listing.id, {
        title: title.trim(),
        description: description.trim(),
        priceNGN: Number(price),
        deliveryFee: Number(deliveryFee) || 0,
        inStock: Math.max(0, Number(stock) || 0),
        category: category.trim() || "General",
        delivery: delivery.trim() || null,
        variants: variants.trim()
          ? variants.split(",").map((v) => v.trim()).filter(Boolean)
          : null,
        images: uploaded.map((p) => ({ url: p.uploadedUrl })),
      });
      // Sync the store the UI renders from; the real HTTP client doesn't.
      marketStore.upsertListing(updated);
      toast({
        title: "Listing updated",
        description: "Changes are live — the buyer page reflects them now.",
      });
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save your changes.";
      setError(msg);
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 sm:left-auto sm:right-0 sm:h-full sm:max-w-xl sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border sm:hidden" />
        <SheetHeader className="px-5 pt-4">
          <SheetTitle className="text-left text-lg">Edit listing</SheetTitle>
          <SheetDescription className="text-left">
            Update any field. Changes save instantly and show on the buyer page.
          </SheetDescription>
        </SheetHeader>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 pb-8 sm:max-h-[calc(100vh-200px)]">
          <div className="space-y-5">
            {/* Photos */}
            <div>
              <Label>Photos</Label>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((p) => (
                  <div
                    key={p.key}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface"
                  >
                    <img
                      src={p.previewUrl}
                      alt=""
                      className={cn(
                        "h-full w-full object-cover",
                        p.status === "uploading" && "opacity-60",
                        p.status === "error" && "opacity-40",
                      )}
                    />
                    {p.status === "uploading" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(p.key)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white/85 text-ink-soft hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface text-ink-soft hover:border-brand hover:text-ink"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-[11px] font-medium">Add photo</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onFilesPicked}
              />
            </div>

            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                className="mt-1.5 h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-price">Price (NGN)</Label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">
                    ₦
                  </span>
                  <Input
                    id="edit-price"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                    className="h-11 pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-stock">Quantity in stock</Label>
                <Input
                  id="edit-stock"
                  inputMode="numeric"
                  value={stock}
                  onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ""))}
                  className="mt-1.5 h-11"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-delivery-fee">Delivery fee (NGN) — 0 = free</Label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">
                  ₦
                </span>
                <Input
                  id="edit-delivery-fee"
                  inputMode="numeric"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-11 pl-7"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Fashion"
                  className="mt-1.5 h-11"
                />
              </div>
              <div>
                <Label htmlFor="edit-variants">Variants (comma-separated)</Label>
                <Input
                  id="edit-variants"
                  value={variants}
                  onChange={(e) => setVariants(e.target.value)}
                  placeholder="Small, Medium, Large"
                  className="mt-1.5 h-11"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-delivery">Shipping / delivery</Label>
              <Input
                id="edit-delivery"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                placeholder="Lagos same-day · Nationwide 2–4 days"
                className="mt-1.5 h-11"
              />
            </div>

            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                className="mt-1.5 min-h-[120px]"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-white px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!canSave}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : stillUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for uploads…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

function buyUrlFor(id: string): string {
  const base =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_URL) ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://safesale.app");
  return `${base.replace(/\/$/, "")}/buy/${id}`;
}
