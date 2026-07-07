import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./Logo";
import { Avatar } from "./Avatar";
import { HelpDialog } from "./HelpDialog";
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
import { useSellerListingsLive, useMarketState } from "@/hooks/useMarket";
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
  // POST /api/sellers). No Nostr keys are surfaced to the user.
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
  const listings = useSellerListingsLive();
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
    <div className="min-h-screen bg-surface text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-border px-5">
          {/* Logo always returns to the marketing landing page —
              the standard SaaS convention. The sidebar's 'Home' nav
              item below is the dashboard home; the brand-mark up here
              is the marketing home. Two different "homes," same as
              Stripe / Shopify / Linear. */}
          <Link to="/" aria-label="SafeSale home">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                {group.label}
              </p>
              {group.items.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn(
                      "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                         ? "bg-brand-soft text-brand-soft-foreground"
                         : "text-ink-soft hover:bg-secondary hover:text-ink"
                    )
                  }
                >
                  <t.icon className="h-4 w-4" />
                  <span className="flex-1">{t.label}</span>
                  {t.badge && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      {t.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex w-full items-center gap-3 rounded-lg p-2 text-left">
            <Avatar seed={avatarSeed} name={displayName} size={36} src={avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{displayName}</p>
              {displayHandle ? (
                <p className="truncate text-xs text-ink-soft">@{displayHandle}</p>
              ) : !loggedIn ? (
                <Link to="/onboarding" className="text-xs text-brand hover:underline">
                  Start selling
                </Link>
              ) : null}
            </div>
          </div>

          {/* Logout */}
          {loggedIn && (
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          )}
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 lg:h-16 lg:px-8">
            <Link to="/" className="lg:hidden" aria-label="SafeSale home">
              <LogoMark />
            </Link>
            <div className="flex-1 min-w-0">
              {title && (
                <p className="truncate text-base font-semibold text-ink lg:text-lg">
                  {title}
                </p>
              )}
              {subtitle && (
                <p className="truncate text-xs text-ink-soft lg:text-sm">{subtitle}</p>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-secondary hover:text-ink"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {searchOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSearchOpen(false)} />
                  <div className="absolute right-0 mt-2 z-20 w-80 overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
                    <div className="border-b border-border p-3">
                      <Input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search orders & listings…"
                        className="h-9"
                      />
                    </div>
                    <div className="max-h-[320px] overflow-y-auto p-2">
                      {!searchQuery.trim() ? (
                        <p className="p-4 text-center text-xs text-ink-soft">
                          Search by buyer, order ID, or product.
                        </p>
                      ) : searchResults.orders.length === 0 &&
                        searchResults.listings.length === 0 ? (
                        <p className="p-4 text-center text-xs text-ink-soft">
                          No matches.
                        </p>
                      ) : (
                        <>
                          {searchResults.orders.map((o) => (
                            <NavLink
                              key={o.orderToken}
                              to={`/app/orders/${o.orderToken}`}
                              onClick={() => setSearchOpen(false)}
                              className="block rounded-lg px-3 py-2 text-sm hover:bg-surface"
                            >
                              <span className="font-medium text-ink">{o.shortId}</span>{" "}
                              <span className="text-ink-soft">· {o.buyerName} · {o.listing.title}</span>
                            </NavLink>
                          ))}
                          {searchResults.listings.map((l) => (
                            <NavLink
                              key={l.id}
                              to={`/buy/${l.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="block rounded-lg px-3 py-2 text-sm hover:bg-surface"
                            >
                              <span className="font-medium text-ink">{l.title}</span>{" "}
                              <span className="text-ink-soft">· listing</span>
                            </NavLink>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-secondary hover:text-ink"
              aria-label="Help"
            >
              <LifeBuoy className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifsOpen(!notifsOpen);
                  if (!notifsOpen) setHasUnread(true);
                }}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-secondary hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && !hasUnread && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand" />
                )}
              </button>

              {notifsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setNotifsOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 z-20 w-80 overflow-hidden rounded-2xl border border-border bg-white shadow-xl animate-in fade-in zoom-in duration-200">
                    <div className="border-b border-border p-4">
                      <p className="text-sm font-semibold text-ink">Notifications</p>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="max-h-[320px] overflow-y-auto p-6 text-center">
                        <p className="text-sm text-ink-soft">You're all caught up.</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          New orders, messages and disputes appear here.
                        </p>
                      </div>
                    ) : (
                      <ul className="max-h-[320px] divide-y divide-border overflow-y-auto">
                        {notifications.map((n) => (
                          <li key={n.id}>
                            <NavLink
                              to={n.to}
                              onClick={() => setNotifsOpen(false)}
                              className="flex items-start gap-3 px-4 py-3 hover:bg-surface"
                            >
                              <span
                                className={cn(
                                  "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                                  n.icon === "dispute"
                                    ? "bg-rose-50 text-rose-700"
                                    : n.icon === "done"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : n.icon === "msg"
                                        ? "bg-sky-50 text-sky-700"
                                        : "bg-brand-soft text-brand",
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
                              <span className="min-w-0 flex-1 text-sm text-ink">
                                {n.text}
                              </span>
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link to="/app/orders" className="block border-t border-border p-3 text-center text-xs font-medium text-brand hover:bg-brand-soft/40">
                      View all orders
                    </Link>
                  </div>
                </>
              )}
            </div>
            <div className="lg:hidden">
              <Avatar seed={avatarSeed} name={displayName} size={32} src={avatarUrl} />
            </div>
          </div>
          {action && (
            <div className="border-t border-border/60 px-4 py-2 lg:px-8">{action}</div>
          )}
        </header>

        <main className="px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 pb-safe backdrop-blur-md lg:hidden">
        <ul className="grid grid-cols-5">
          {mobileTabs.map((t) => {
            const isActive = t === activeTab;
            return (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  end={t.end}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                    isActive ? "text-brand" : "text-ink-soft"
                  )}
                >
                  <t.icon className={cn("h-5 w-5", isActive && "text-brand")} />
                  {t.label}
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
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center">Log out of your shop?</DialogTitle>
            <DialogDescription className="text-center">
              You'll need your email and password (or Google) to sign back in.
              Your shop and orders stay safe on SafeSale.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
            <Button
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" /> Log out
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
