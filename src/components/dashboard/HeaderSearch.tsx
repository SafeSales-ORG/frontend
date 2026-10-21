import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { MagnifyingGlass, Package, Receipt, X } from "@phosphor-icons/react";

import { useMyListings } from "@/hooks/useMyListings";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface Result {
  id: string;
  kind: "order" | "listing";
  title: string;
  meta: string;
  to: string;
}

/**
 * Search the seller's orders and listings. Inline field on desktop
 * (⌘K / Ctrl+K focuses it), full-width overlay from an icon on mobile.
 * Arrow keys move through results, Enter opens one.
 */
export function HeaderSearch() {
  const { orders } = useSellerOrders();
  const { listings } = useMyListings();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const orderHits = orders
      .filter(
        (o) =>
          o.shortId.toLowerCase().includes(q) ||
          o.buyerName.toLowerCase().includes(q) ||
          o.listing.title.toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map<Result>((o) => ({
        id: `o-${o.orderToken}`,
        kind: "order",
        title: `${o.shortId} · ${o.listing.title}`,
        meta: `${o.buyerName} · ${formatNGN(o.amountNGN)}`,
        to: `/app/orders/${o.orderToken}`,
      }));
    const listingHits = listings
      .filter((l) => l.title.toLowerCase().includes(q) || l.category?.toLowerCase().includes(q))
      .slice(0, 5)
      .map<Result>((l) => ({
        id: `l-${l.id}`,
        kind: "listing",
        title: l.title,
        meta: `${formatNGN(l.priceNGN)} · ${l.inStock === 0 ? "Sold out" : `${l.inStock} in stock`}`,
        to: `/buy/${l.id}`,
      }));
    return [...orderHits, ...listingHits];
  }, [query, orders, listings]);

  // ⌘K / Ctrl+K anywhere in the dashboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
        else setMobileOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (r: Result) => {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    navigate(r.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
      inputRef.current?.blur();
    }
  };

  const panel = (
    <ResultsPanel
      query={query}
      results={results}
      active={active}
      onHover={setActive}
      onPick={go}
    />
  );

  return (
    <>
      {/* Desktop: inline field */}
      <div ref={boxRef} className="relative hidden md:block">
        <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search orders and listings"
          aria-label="Search orders and listings"
          className="h-10 w-64 rounded-full bg-canvas-soft pr-14 pl-10 text-sm text-ink outline-none transition-[width,box-shadow] placeholder:text-mute focus:w-80 focus:bg-canvas focus:ring-2 focus:ring-brand/30 lg:w-72"
        />
        {!query && (
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 text-xs font-medium text-mute">
            {IS_MAC ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
        <AnimatePresence>
          {open && query.trim() && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 z-30 mt-2 w-[26rem] overflow-hidden rounded-xl bg-canvas shadow-[var(--shadow-float)]"
            >
              {panel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: icon → full-width overlay */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Search"
        className="grid h-10 w-10 place-items-center rounded-full text-body hover:bg-canvas-soft md:hidden"
      >
        <MagnifyingGlass size={20} />
      </button>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-canvas md:hidden"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 border-b border-line p-3">
              <MagnifyingGlass size={20} className="ml-1 text-mute" aria-hidden />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search orders and listings"
                aria-label="Search orders and listings"
                className="h-11 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-mute"
              />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close search"
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas-soft"
              >
                <X size={20} />
              </button>
            </div>
            {panel}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ResultsPanel({
  query,
  results,
  active,
  onHover,
  onPick,
}: {
  query: string;
  results: Result[];
  active: number;
  onHover: (i: number) => void;
  onPick: (r: Result) => void;
}) {
  if (!query.trim()) {
    return <p className="p-6 text-center text-sm text-mute">Search by buyer, order number or product.</p>;
  }
  if (results.length === 0) {
    return <p className="p-6 text-center text-sm text-mute">No orders or listings match “{query}”.</p>;
  }
  return (
    <ul className="max-h-96 overflow-y-auto p-2" role="listbox">
      {results.map((r, i) => {
        const showHeading = i === 0 || results[i - 1].kind !== r.kind;
        return (
          <li key={r.id}>
            {showHeading && (
              <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-wider text-mute uppercase">
                {r.kind === "order" ? "Orders" : "Listings"}
              </p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(r)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
                i === active ? "bg-canvas-soft" : "",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-pale text-brand">
                {r.kind === "order" ? <Receipt size={18} weight="duotone" /> : <Package size={18} weight="duotone" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                <span className="block truncate text-xs text-mute">{r.meta}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
