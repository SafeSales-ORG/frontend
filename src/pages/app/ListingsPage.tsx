/**
 * Seller Listings — `/app/listings`.
 *
 * Where a seller adds a new product, copies the buyer link for an
 * existing one, or sees what's live vs. sold out. Create / edit /
 * mark-out-of-stock go through `apiClient` (POST/PATCH /api/listings).
 */

import { useSeoMeta } from "@unhead/react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/safesale/AppShell";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { AnimatedNumber } from "@/components/safesale/AnimatedNumber";
import { motion } from "motion/react";
import { FloppyDisk, MagnifyingGlass, Package as PackageIcon, PencilSimple, RocketLaunch, Storefront, WarningCircle } from "@phosphor-icons/react";
import { FormBlock, ListingPreview, MoneyField, PhotoDropzone } from "@/components/listings/ListingEditorParts";
import { Stagger, StaggerItem } from "@/components/motion";
import { listingUrl } from "@/lib/links";
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
  Share2,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { XIcon } from "@/components/safesale/BrandIcons";

import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useAuth } from "@/hooks/useAuth";
import { type MyListing } from "@/lib/types";
import { MY_LISTINGS_KEY, useMyListings } from "@/hooks/useMyListings";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";

import { apiClient, DEMO_MODE } from "@/lib/api";
import { ApiError, isEndpointMissing, backendPendingMessage } from "@/lib/api/errors";
import type { ApiListing } from "@/lib/api/types";
import { marketStore } from "@/lib/store/marketStore";
import { formatNGN, formatRelative } from "@/lib/format";
import { cn, sanitizeUrl } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

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

  const { isAuthed } = useAuth();
  const [seller] = useCurrentSeller();
  // Whether this person can manage a shop: a signed-in JWT session plus a
  // seller record — same check as SellerGate, in both demo and real mode.
  const canSell = isAuthed && !!seller;
  // Live from the market store — the source of truth in demo mode. New
  // listings (and edits / stock toggles) reflect here instantly.
  const { listings: apiListings, isLoading } = useMyListings();
  const listings = useMemo(() => apiListings.map(apiToMyListing), [apiListings]);
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
          className="fixed bottom-24 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-forest text-mint shadow-[var(--shadow-float)] transition-transform active:scale-95 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
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
  const tiles = [
    { label: "Listings", value: stats.total, icon: Storefront, tone: "bg-forest text-canvas", iconTone: "forest" as const, sub: "In your shop" },
    { label: "In stock", value: stats.available, icon: PackageIcon, tone: "bg-mint text-forest", iconTone: "pale" as const, sub: "Buyers can order" },
    {
      label: "Sold out",
      value: stats.outOfStock,
      icon: WarningCircle,
      tone: stats.outOfStock > 0 ? "bg-warning-pale text-warning" : "bg-canvas text-ink",
      iconTone: stats.outOfStock > 0 ? ("warning" as const) : ("neutral" as const),
      sub: stats.outOfStock > 0 ? "Restock or hide them" : "Nothing to restock",
    },
  ];
  return (
    <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <StaggerItem key={t.label} className={cn("flex items-center gap-4 rounded-2xl p-5", t.tone)}>
          <BrandIcon icon={t.icon} tone={t.iconTone === "forest" ? "mint" : t.iconTone} size="md" />
          <div>
            <p className="text-sm font-medium opacity-80">{t.label}</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-10" />
            ) : (
              <AnimatedNumber value={t.value} className="block font-display text-h1 tabular-nums" />
            )}
            <p className="text-xs opacity-70">{t.sub}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
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
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <MagnifyingGlass
          size={18}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your listings"
          className="h-11 rounded-full border-0 bg-canvas pl-11"
        />
      </div>
      <div className="flex gap-1 rounded-full bg-canvas p-1" role="tablist" aria-label="Filter by stock">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                isActive ? "text-mint" : "text-body hover:text-ink",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="listing-filter"
                  className="absolute inset-0 rounded-full bg-forest"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{f.label}</span>
              <span className={cn("relative text-xs tabular-nums", isActive ? "text-mint/80" : "text-mute")}>
                {countFor(f.key)}
              </span>
            </button>
          );
        })}
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
    <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <StaggerItem key={l.id} lift>
          <ListingCard listing={l} onShare={() => onShare(l)} onEdit={() => onEdit(l)} />
        </StaggerItem>
      ))}
    </Stagger>
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [stockBusy, setStockBusy] = useState(false);
  const cover = listing.images[0] ? sanitizeUrl(listing.images[0]) : undefined;
  const extraImages = Math.max(0, listing.images.length - 1);
  const isOut = listing.inStock <= 0;
  const buyLink = listingUrl(listing.id);

  const copyLink = () => {
    void navigator.clipboard?.writeText(buyLink).then(() => {
      toast({ title: "Buyer link copied" });
    });
  };


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
      void updated;
      void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY });
      toast({
        title: isOut ? "Back in stock" : "Marked out of stock",
        description: isOut
          ? "Buyers can purchase this listing again."
          : "Buyers now see “Out of stock” and can't check out.",
      });
    } catch (err) {
      toast({
        title: "Couldn't update stock",
        description: isEndpointMissing(err)
          ? backendPendingMessage("Changing stock")
          : err instanceof Error
            ? err.message
            : "Try again.",
        variant: "destructive",
      });
    } finally {
      setStockBusy(false);
    }
  };

  return (
    <div
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-canvas transition-shadow duration-300 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-canvas-soft">
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
          <span className="absolute top-3 right-3 rounded-full bg-forest/70 px-2 py-0.5 text-xs font-semibold text-canvas backdrop-blur-sm">
            +{extraImages} photos
          </span>
        )}
        <span
          className={cn(
            "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isOut ? "bg-warning-pale text-warning" : "bg-mint text-forest",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", isOut ? "bg-warning" : "bg-brand")} />
          {isOut ? "Sold out" : `${listing.inStock} in stock`}
        </span>
      </div>

      <div className="flex-1 p-5">
        <Link
          to={`/buy/${listing.id}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {listing.title}
        </Link>
        <p className="mt-2 font-display text-h2 text-ink tabular-nums">{formatNGN(listing.priceNGN)}</p>
        <p className="mt-1 text-sm text-mute">
          {listing.deliveryFee ? `+ ${formatNGN(listing.deliveryFee)} delivery` : "Free delivery"} · Listed{" "}
          {formatRelative(new Date(listing.publishedAt * 1000).toISOString())}
        </p>
      </div>

      <div className="flex items-center gap-2 px-5 pb-5">
        <Button variant="mint" size="sm" className="flex-1" onClick={copyLink}>
          <Copy /> Copy link
        </Button>
        <FooterAction icon={Share2} label="Share" onClick={onShare} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="grid h-9 w-9 place-items-center rounded-full bg-canvas-soft text-body transition-colors hover:bg-canvas-sunken hover:text-ink"
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
      className="grid h-9 w-9 place-items-center rounded-full bg-canvas-soft text-body transition-colors hover:bg-canvas-sunken hover:text-ink"
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
      <div className="max-w-sm rounded-2xl border border-dashed border-border bg-canvas p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="mt-4 text-base font-semibold text-ink">
          Open your shop to manage listings
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Create your SafeSale shop to post items, track orders, and get paid
          straight to your bank.
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
    <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-12 text-center sm:px-10 sm:py-14">
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
    <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-10 text-center">
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
          className="overflow-hidden rounded-2xl border border-border bg-canvas"
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
    <div className="rounded-2xl border border-dashed border-border bg-canvas px-6 py-10 text-center">
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
  const shareLink = listingUrl(listing.id);

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
          <div className="rounded-xl border border-border bg-canvas p-3 text-center">
            <QRCodeCanvas value={shareLink} size={120} className="mx-auto" />
            <p className="mt-2 text-xs text-ink-soft">Or share the QR</p>
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
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-canvas px-3 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
  /** Final image URL after a successful upload, else null. */
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
  const { isAuthed } = useAuth();
  const [currentSeller] = useCurrentSeller();
  const { mutateAsync: uploadFile } = useUploadFile();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Backend round-trip the publish button waits on. */
  const [isSavingToBackend, setIsSavingToBackend] = useState(false);

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
  // A signed-in seller can publish (matches SellerGate / the page gate).
  const canSell = isAuthed && !!currentSeller;
  const canPublish =
    canSell &&
    title.trim().length > 1 &&
    Number(price) > 0 &&
    uploadedPhotos.length > 0 &&
    !stillUploading &&
    !isSavingToBackend;


  const addFiles = async (all: File[]) => {
    const files = all.filter((f) => f.type.startsWith("image/"));
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

    // Process images one at a time to keep memory use low.
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

    // Demo mode only: make sure the in-browser store knows this seller (a
    // cleared localStorage can drop it while the session survives).
    if (DEMO_MODE && !marketStore.getSellerByNpub(currentSeller.npub)) {
      marketStore.upsertSeller({
        id: currentSeller.id,
        npub: currentSeller.npub,
        pubkey: currentSeller.npub,
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
        inStock: Math.max(1, Number(quantity) || 1),
        deliveryFee: Number(deliveryFee) || 0,
      });
      backendListingId = listing.id;
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
      inStock: Math.max(1, Number(quantity) || 1),
      publishedAt: now,
    };

    // The backend (created above) is the source of truth — show success
    // and jump to the share step.
    toast({
      title: "Listing published",
      description: "It's live — share the link to start selling.",
    });
    celebrate();
    void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY });
    onClose();
    setIsSavingToBackend(false);
    setTimeout(() => onPublished(optimistic), 250);
  };

  const priceNum = Number(price) || 0;
  const feeNum = Number(deliveryFee) || 0;
  const cover = photos.find((p) => p.status !== "error")?.previewUrl ?? null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-5xl sm:rounded-l-3xl"
      >
        <div className="grid h-full min-h-0 lg:grid-cols-[1fr_380px]">
          {/* Form */}
          <div className="flex min-h-0 flex-col">
            <SheetHeader className="border-b border-line px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <BrandIcon icon={Storefront} size="md" />
                <div>
                  <SheetTitle className="font-display text-h2 text-ink">New listing</SheetTitle>
                  <SheetDescription className="text-body">
                    Goes live on your shop the moment you publish.
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-7">
                {/* Photos */}
                <FormBlock step={1} title="Photos" hint="Up to 4. The first one is the cover buyers see.">
                  <PhotoDropzone photos={photos} max={MAX_PHOTOS} onAdd={(f) => void addFiles(f)} onRemove={removePhoto} />
                </FormBlock>

                <FormBlock step={2} title="What are you selling?">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                        placeholder="e.g. Ankara two-piece set, size M"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor="desc">Description</Label>
                        <span className="text-xs text-mute tabular-nums">{description.length}/2000</span>
                      </div>
                      <Textarea
                        id="desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                        placeholder="Condition, size, what's included, how you deliver — keep it real."
                        className="mt-1.5 min-h-32"
                      />
                    </div>
                  </div>
                </FormBlock>

                <FormBlock step={3} title="Price and stock" hint="Buyers see the delivery fee added before they pay.">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <MoneyField id="price" label="Price" value={price} onChange={setPrice} placeholder="25,000" />
                    <MoneyField id="delivery-fee" label="Delivery fee" value={deliveryFee} onChange={setDeliveryFee} placeholder="0 = free" />
                    <div className="col-span-2 sm:col-span-1">
                      <Label htmlFor="quantity">Quantity in stock</Label>
                      <Input
                        id="quantity"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        className="mt-1.5 tabular-nums"
                      />
                    </div>
                  </div>
                </FormBlock>

                {error && (
                  <p role="alert" className="rounded-xl bg-negative-pale p-3 text-sm text-negative">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-6 py-4">
              <p className="hidden text-sm text-mute sm:block">
                {stillUploading ? "Processing photos…" : canPublish ? "Ready to go live." : "Add a photo, title and price to publish."}
              </p>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={isSavingToBackend}>
                  Cancel
                </Button>
                <Button onClick={onPublish} disabled={!canPublish} size="lg" className="px-6">
                  {isSavingToBackend ? (
                    <>
                      <Loader2 className="animate-spin" /> Publishing…
                    </>
                  ) : stillUploading ? (
                    <>
                      <Loader2 className="animate-spin" /> Processing photos…
                    </>
                  ) : (
                    <>
                      <RocketLaunch size={20} weight="fill" /> Publish listing
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <ListingPreview
            cover={cover}
            title={title}
            priceNGN={priceNum}
            deliveryFeeNGN={feeNum}
            sellerName={currentSeller?.name ?? "your shop"}
          />
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { mutateAsync: uploadFile } = useUploadFile();

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

  const addFiles = async (files: File[]) => {
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
      void updated;
      void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY });
      toast({
        title: "Listing updated",
        description: "Changes are live — the buyer page reflects them now.",
      });
      onClose();
    } catch (err) {
      const msg = isEndpointMissing(err)
        ? backendPendingMessage("Editing a listing")
        : err instanceof ApiError
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

  const [currentSeller] = useCurrentSeller();
  const priceNum = Number(price) || 0;
  const feeNum = Number(deliveryFee) || 0;
  const cover = photos.find((p) => p.status !== "error")?.previewUrl ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-5xl sm:rounded-l-3xl">
        <div className="grid h-full min-h-0 lg:grid-cols-[1fr_380px]">
          <div className="flex min-h-0 flex-col">
            <SheetHeader className="border-b border-line px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <BrandIcon icon={PencilSimple} size="md" />
                <div>
                  <SheetTitle className="font-display text-h2 text-ink">Edit listing</SheetTitle>
                  <SheetDescription className="text-body">Changes show on your shop as soon as you save.</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-7">
                <FormBlock step={1} title="Photos" hint="The first one is the cover buyers see.">
                  <PhotoDropzone photos={photos} max={MAX_PHOTOS} onAdd={(f) => void addFiles(f)} onRemove={removePhoto} />
                </FormBlock>

                <FormBlock step={2} title="What are you selling?">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edit-title">Title</Label>
                      <Input id="edit-title" className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} />
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor="edit-desc">Description</Label>
                        <span className="text-xs text-mute tabular-nums">{description.length}/2000</span>
                      </div>
                      <Textarea
                        id="edit-desc"
                        className="mt-1.5 min-h-32"
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                      />
                    </div>
                  </div>
                </FormBlock>

                <FormBlock step={3} title="Price and stock" hint="Set stock to 0 to stop new orders.">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <MoneyField id="edit-price" label="Price" value={price} onChange={setPrice} placeholder="25,000" />
                    <MoneyField id="edit-delivery-fee" label="Delivery fee" value={deliveryFee} onChange={setDeliveryFee} placeholder="0 = free" />
                    <div className="col-span-2 sm:col-span-1">
                      <Label htmlFor="edit-stock">Quantity in stock</Label>
                      <Input
                        id="edit-stock"
                        inputMode="numeric"
                        className="mt-1.5 tabular-nums"
                        value={stock}
                        onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      />
                    </div>
                  </div>
                </FormBlock>

                <FormBlock step={4} title="Details" hint="Optional — helps buyers decide.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="edit-category">Category</Label>
                      <Input id="edit-category" className="mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Fashion" />
                    </div>
                    <div>
                      <Label htmlFor="edit-variants">Sizes or options</Label>
                      <Input
                        id="edit-variants"
                        className="mt-1.5"
                        value={variants}
                        onChange={(e) => setVariants(e.target.value)}
                        placeholder="Small, Medium, Large"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="edit-delivery">Delivery</Label>
                      <Input
                        id="edit-delivery"
                        className="mt-1.5"
                        value={delivery}
                        onChange={(e) => setDelivery(e.target.value)}
                        placeholder="Lagos same-day · Nationwide 2–4 days"
                      />
                    </div>
                  </div>
                </FormBlock>

                {error && (
                  <p role="alert" className="rounded-xl bg-negative-pale p-3 text-sm text-negative">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-6 py-4">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={!canSave} size="lg" className="px-6">
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" /> Saving…
                  </>
                ) : stillUploading ? (
                  <>
                    <Loader2 className="animate-spin" /> Processing photos…
                  </>
                ) : (
                  <>
                    <FloppyDisk size={20} weight="fill" /> Save changes
                  </>
                )}
              </Button>
            </div>
          </div>

          <ListingPreview
            cover={cover}
            title={title}
            priceNGN={priceNum}
            deliveryFeeNGN={feeNum}
            sellerName={currentSeller?.name ?? "your shop"}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

