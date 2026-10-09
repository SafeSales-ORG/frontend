import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./Logo";
import { Avatar } from "./Avatar";
import { HelpDialog } from "./HelpDialog";
import { PageTransition } from "@/components/motion";
import {
  Home,
  Package,
  Receipt,
  Wallet,
  Bell,
  Search,
  Scale,
  LogOut,
  LifeBuoy,
  ShieldAlert,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useAuth } from "@/hooks/useAuth";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useMarketState } from "@/hooks/useMarket";
import { useMyListings } from "@/hooks/useMyListings";
import { marketStore } from "@/lib/store/marketStore";
import { Input } from "@/components/ui/input";

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

// Mobile bottom-nav: 5 most-used (MVP per PRD §51-89).
const mobileTabs = [
  { to: "/app", icon: Home, label: "Home", end: true },
  { to: "/app/listings", icon: Package, label: "Listings" },
  { to: "/app/orders", icon: Receipt, label: "Orders" },
  { to: "/app/earnings", icon: Wallet, label: "Earnings" },
  { to: "/app/dispute", icon: Scale, label: "Disputes" },
];

function buildSidebarGroups(activeDisputes: number) {
  return [
    {
      label: "Manage",
      items: [
        { to: "/app", icon: Home, label: "Home", end: true, badge: undefined as string | undefined },
        { to: "/app/listings", icon: Package, label: "Listings", end: false, badge: undefined },
        { to: "/app/orders", icon: Receipt, label: "Orders", end: false, badge: undefined },
        { to: "/app/earnings", icon: Wallet, label: "Earnings", end: false, badge: undefined },
      ],
    },
    {
      label: "Support",
      items: [
        {
          to: "/app/dispute",
          icon: Scale,
          label: "Disputes",
          end: false,
          badge: activeDisputes > 0 ? String(activeDisputes) : undefined,
        },
      ],
    },
  ];
}

export function AppShell({ children, title, subtitle, action }: Props) {
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Signed-in identity comes from the JWT session (`useAuth`) plus the
  // SafeSale seller profile (`useCurrentSeller`, set by Onboarding after
  // POST /api/sellers).
  const { user: authUser, isAuthed, logout } = useAuth();
  const [seller] = useCurrentSeller();

  const loggedIn = isAuthed || !!seller;
  const displayName = seller?.name ?? authUser?.email ?? "Guest";
  const displayHandle = seller?.handle ?? null;
  const avatarSeed = seller?.npub ?? authUser?.id ?? "guest";
  const avatarUrl = seller?.avatarUrl ?? null;

  const handleLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate("/");
  };

  // Live dispute count off the real seller-orders feed. When the seller
  // isn't signed in, returns 0 — hook is `enabled: !!npub` internally.
  const { orders } = useSellerOrders();
  const activeDisputes = orders.filter((o) => o.status === "disputed").length;
  const sidebarGroups = buildSidebarGroups(activeDisputes);

  // Live listings for the header search.
  const { listings } = useMyListings();
  // Subscribe to the store so message-based notifications refresh live.
  useMarketState();

  // Build a notification feed from real order activity + buyer messages.
  const notifications = useMemo(() => {
    type Notif = { id: string; icon: "order" | "dispute" | "done" | "msg"; text: string; at: string; to: string };
    const items: Notif[] = [];
    for (const o of orders) {
      if (o.status === "paid")
        items.push({ id: `paid-${o.orderToken}`, icon: "order", text: `New paid order — ship “${o.listing.title}”`, at: o.updatedAt, to: `/app/orders/${o.orderToken}` });
      if (o.status === "disputed")
        items.push({ id: `disp-${o.orderToken}`, icon: "dispute", text: `Dispute opened on ${o.shortId}`, at: o.updatedAt, to: `/app/orders/${o.orderToken}` });
      if (o.status === "completed")
        items.push({ id: `done-${o.orderToken}`, icon: "done", text: `${o.buyerName} released payment for ${o.shortId}`, at: o.updatedAt, to: `/app/orders/${o.orderToken}` });
      const thread = marketStore.messagesForOrder(o.orderToken);
      const last = thread[thread.length - 1];
      if (last && last.from === "buyer")
        items.push({ id: `msg-${o.orderToken}`, icon: "msg", text: `New message from ${o.buyerName}`, at: last.at, to: `/app/orders/${o.orderToken}` });
    }
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8);
  }, [orders]);

  // Header search results across this seller's orders + listings.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { orders: [], listings: [] };
    return {
      orders: orders
        .filter(
          (o) =>
            o.shortId.toLowerCase().includes(q) ||
            o.buyerName.toLowerCase().includes(q) ||
            o.listing.title.toLowerCase().includes(q),
        )
        .slice(0, 5),
      listings: listings
        .filter((l) => l.title.toLowerCase().includes(q))
        .slice(0, 5),
    };
  }, [searchQuery, orders, listings]);

  const activeTab = mobileTabs.find((t) =>
    t.end ? pathname === t.to : pathname.startsWith(t.to)
  );

  return (
    <div className="min-h-screen bg-canvas-soft text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-forest lg:flex lg:flex-col">
        <div className="flex h-16 items-center px-6">
          <Link to="/" aria-label="SafeSale home">
            <Logo className="[&_span]:text-canvas" />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Seller dashboard">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="px-3 pb-2 text-xs font-medium tracking-wider text-canvas/50 uppercase">
                {group.label}
              </p>
              {group.items.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className="relative mb-0.5 block">
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-full bg-mint"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <span
                        className={cn(
                          "relative flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                          isActive ? "text-forest" : "text-canvas/75 hover:bg-canvas/10 hover:text-canvas",
                        )}
                      >
                        <t.icon className="h-4 w-4" />
                        <span className="flex-1">{t.label}</span>
                        {t.badge && (
                          <span className="rounded-full bg-warning-pale px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">
                            {t.badge}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-canvas/10 p-3">
          <div className="flex items-center gap-3 rounded-lg p-2">
            <Avatar seed={avatarSeed} name={displayName} size={36} src={avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-canvas">{displayName}</p>
              {displayHandle ? (
                <p className="truncate text-xs text-canvas/60">@{displayHandle}</p>
              ) : !loggedIn ? (
                <Link to="/onboarding" className="text-xs text-mint hover:underline">
                  Start selling
                </Link>
              ) : null}
            </div>
          </div>
          {loggedIn && (
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="mt-1 flex w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-canvas/70 transition-colors hover:bg-canvas/10 hover:text-canvas"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          )}
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div className="flex h-16 items-center gap-2 px-4 lg:px-8">
            <Link to="/" className="mr-1 lg:hidden" aria-label="SafeSale home">
              <LogoMark />
            </Link>
            <div className="min-w-0 flex-1">
              {title && <h1 className="truncate font-sans text-h3 text-ink lg:text-h2">{title}</h1>}
              {subtitle && <p className="hidden truncate text-sm text-mute sm:block">{subtitle}</p>}
            </div>
            {action && <div className="hidden items-center gap-2 md:flex">{action}</div>}
            <div className="relative">
              <IconButton label="Search" onClick={() => setSearchOpen((v) => !v)}>
                <Search className="h-[18px] w-[18px]" />
              </IconButton>
              <Popover open={searchOpen} onClose={() => setSearchOpen(false)}>
                <div className="border-b border-line p-3">
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search orders and listings"
                  />
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {!searchQuery.trim() ? (
                    <p className="p-4 text-center text-sm text-mute">Search by buyer, order number or product.</p>
                  ) : searchResults.orders.length === 0 && searchResults.listings.length === 0 ? (
                    <p className="p-4 text-center text-sm text-mute">No matches.</p>
                  ) : (
                    <>
                      {searchResults.orders.map((o) => (
                        <NavLink
                          key={o.orderToken}
                          to={`/app/orders/${o.orderToken}`}
                          onClick={() => setSearchOpen(false)}
                          className="block rounded-md px-3 py-2 text-sm hover:bg-canvas-soft"
                        >
                          <span className="font-medium text-ink">{o.shortId}</span>{" "}
                          <span className="text-mute">· {o.buyerName} · {o.listing.title}</span>
                        </NavLink>
                      ))}
                      {searchResults.listings.map((l) => (
                        <NavLink
                          key={l.id}
                          to={`/buy/${l.id}`}
                          onClick={() => setSearchOpen(false)}
                          className="block rounded-md px-3 py-2 text-sm hover:bg-canvas-soft"
                        >
                          <span className="font-medium text-ink">{l.title}</span>{" "}
                          <span className="text-mute">· listing</span>
                        </NavLink>
                      ))}
                    </>
                  )}
                </div>
              </Popover>
            </div>
            <IconButton label="Help" onClick={() => setHelpOpen(true)}>
              <LifeBuoy className="h-[18px] w-[18px]" />
            </IconButton>
            <div className="relative">
              <IconButton
                label="Notifications"
                onClick={() => {
                  setNotifsOpen(!notifsOpen);
                  if (!notifsOpen) setHasUnread(true);
                }}
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifications.length > 0 && !hasUnread && (
                  <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-canvas" />
                )}
              </IconButton>
              <Popover open={notifsOpen} onClose={() => setNotifsOpen(false)}>
                <p className="border-b border-line p-4 font-semibold text-ink">Notifications</p>
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-ink">You're all caught up.</p>
                    <p className="mt-1 text-sm text-mute">New orders and disputes show up here.</p>
                  </div>
                ) : (
                  <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <NavLink
                          to={n.to}
                          onClick={() => setNotifsOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-canvas-soft"
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                              n.icon === "dispute"
                                ? "bg-warning-pale text-warning"
                                : n.icon === "msg"
                                  ? "bg-info-pale text-info"
                                  : "bg-brand-pale text-brand",
                            )}
                          >
                            {n.icon === "dispute" ? (
                              <Scale className="h-3.5 w-3.5" />
                            ) : n.icon === "msg" ? (
                              <Bell className="h-3.5 w-3.5" />
                            ) : (
                              <Receipt className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 text-sm text-ink">{n.text}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/app/orders"
                  onClick={() => setNotifsOpen(false)}
                  className="block border-t border-line p-3 text-center text-sm font-medium text-brand hover:bg-canvas-soft"
                >
                  View all orders
                </Link>
              </Popover>
            </div>
            <div className="ml-1 lg:hidden">
              <Avatar seed={avatarSeed} name={displayName} size={32} src={avatarUrl} />
            </div>
          </div>
          {action && <div className="flex gap-2 border-t border-line px-4 py-2.5 md:hidden">{action}</div>}
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed right-0 bottom-0 left-0 z-30 border-t border-line bg-canvas pb-safe lg:hidden"
        aria-label="Seller dashboard"
      >
        <ul className="grid grid-cols-5 px-2 pt-2">
          {mobileTabs.map((t) => {
            const isActive = t === activeTab;
            return (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  end={t.end}
                  className="relative flex flex-col items-center gap-1 px-1 py-1.5 text-xs font-medium"
                >
                  {isActive && (
                    <motion.span
                      layoutId="mobile-tab-active"
                      className="absolute top-0 h-8 w-14 rounded-full bg-mint"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <t.icon className={cn("relative mt-1.5 h-5 w-5", isActive ? "text-forest" : "text-mute")} />
                  <span className={cn("relative mt-1", isActive ? "text-forest" : "text-mute")}>{t.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help modal */}
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Logout confirmation */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-warning-pale text-warning">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center">Log out of your shop?</DialogTitle>
            <DialogDescription className="text-center">
              You'll need your email and password (or Google) to sign back in.
              Your shop and orders stay safe on SafeSale.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
            <Button className="w-full" onClick={handleLogout}>
              <LogOut /> Log out
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setLogoutOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative grid h-10 w-10 place-items-center rounded-full text-body transition-colors hover:bg-canvas-soft hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Small anchored panel under a header icon; closes on outside click. */
function Popover({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-lg bg-canvas shadow-[var(--shadow-float)]"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
