import { Link, NavLink, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { GearSix, House, Package, Receipt, Scales, Wallet, type Icon } from "@phosphor-icons/react";

import { Logo, LogoMark } from "./Logo";
import { HelpDialog } from "./HelpDialog";
import { LogoutDialog } from "./LogoutDialog";
import { AccountMenu } from "./AccountMenu";
import { PageTransition } from "@/components/motion";
import { HeaderSearch } from "@/components/dashboard/HeaderSearch";
import { NotificationsMenu } from "@/components/dashboard/NotificationsMenu";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useAuth } from "@/hooks/useAuth";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { useToast } from "@/hooks/useToast";
import { shopUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

const baseTabs = [
  { to: "/app", icon: House, label: "Home", end: true },
  { to: "/app/listings", icon: Package, label: "Listings" },
  { to: "/app/orders", icon: Receipt, label: "Orders" },
  { to: "/app/earnings", icon: Wallet, label: "Earnings" },
];

/** The fifth tab is Disputes only for sellers who have one; otherwise Settings. */
function mobileTabsFor(hasDisputes: boolean) {
  return [
    ...baseTabs,
    hasDisputes
      ? { to: "/app/dispute", icon: Scales, label: "Disputes" }
      : { to: "/app/settings", icon: GearSix, label: "Settings" },
  ];
}

interface NavItem {
  to: string;
  icon: Icon;
  label: string;
  end?: boolean;
  badge?: string;
}

function sidebarGroups(activeDisputes: number, hasDisputes: boolean): { label: string; items: NavItem[] }[] {
  return [
    {
      label: "Manage",
      items: [
        { to: "/app", icon: House, label: "Home", end: true },
        { to: "/app/listings", icon: Package, label: "Listings" },
        { to: "/app/orders", icon: Receipt, label: "Orders" },
        { to: "/app/earnings", icon: Wallet, label: "Earnings" },
      ],
    },
    {
      label: "Support",
      items: [
        // Disputes only appear once a buyer has reported a problem.
        ...(hasDisputes
          ? [{ to: "/app/dispute", icon: Scales, label: "Disputes", badge: activeDisputes > 0 ? String(activeDisputes) : undefined }]
          : []),
        { to: "/app/settings", icon: GearSix, label: "Settings" },
      ],
    },
  ];
}

export function AppShell({ children, title, subtitle, action }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { pathname } = useLocation();
  const { user: authUser } = useAuth();
  const [seller] = useCurrentSeller();
  const { toast } = useToast();

  const displayName = seller?.name ?? authUser?.email ?? "Guest";
  const handle = seller?.handle ?? null;
  const avatarSeed = seller?.npub ?? authUser?.id ?? "guest";
  const avatarUrl = seller?.avatarUrl ?? null;
  const link = handle ? shopUrl(handle) : null;

  const { orders } = useSellerOrders();
  const activeDisputes = orders.filter((o) => o.status === "disputed").length;
  const hasDisputes = activeDisputes > 0 || orders.some((o) => o.dispute) || pathname.startsWith("/app/dispute");
  const mobileTabs = mobileTabsFor(hasDisputes);
  const activeTab = mobileTabs.find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));

  const accountProps = {
    name: displayName,
    handle,
    email: authUser?.email ?? null,
    avatarSeed,
    avatarUrl,
    shopUrl: link,
    onCopyShopLink: () => {
      if (link) void navigator.clipboard?.writeText(link).then(() => toast({ title: "Shop link copied" }));
    },
    onHelp: () => setHelpOpen(true),
    onLogout: () => setLogoutOpen(true),
  };

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
          {sidebarGroups(activeDisputes, hasDisputes).map((group) => (
            <div key={group.label} className="mb-6">
              <p className="px-3 pb-2 text-xs font-medium tracking-wider text-canvas/50 uppercase">{group.label}</p>
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
                        <t.icon size={19} weight={isActive ? "fill" : "regular"} />
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
          <AccountMenu variant="sidebar" {...accountProps} />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div className="flex h-16 items-center gap-2 px-4 lg:px-8">
            <Link to="/" className="mr-1 lg:hidden" aria-label="SafeSale home">
              <LogoMark />
            </Link>
            <div className="min-w-0 flex-1">
              {title && <h1 className="truncate font-sans text-h3 text-ink lg:text-h2">{title}</h1>}
              {subtitle && <p className="hidden truncate text-sm text-mute xl:block">{subtitle}</p>}
            </div>
            {action && <div className="hidden items-center gap-2 lg:flex">{action}</div>}
            <HeaderSearch />
            <NotificationsMenu />
            <NavLink
              to="/app/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                cn(
                  "hidden h-10 w-10 place-items-center rounded-full transition-colors sm:grid",
                  isActive ? "bg-mint text-forest" : "text-body hover:bg-canvas-soft hover:text-ink",
                )
              }
            >
              <GearSix size={20} />
            </NavLink>
            <div className="ml-1 lg:hidden">
              <AccountMenu variant="header" {...accountProps} />
            </div>
          </div>
          {action && <div className="flex gap-2 border-t border-line px-4 py-2.5 lg:hidden">{action}</div>}
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-line bg-canvas pb-safe lg:hidden" aria-label="Seller dashboard">
        <ul className="grid grid-cols-5 px-2 pt-2">
          {mobileTabs.map((t) => {
            const isActive = t === activeTab;
            return (
              <li key={t.to}>
                <NavLink to={t.to} end={t.end} className="relative flex flex-col items-center gap-1 px-1 py-1.5 text-xs font-medium">
                  {isActive && (
                    <motion.span
                      layoutId="mobile-tab-active"
                      className="absolute top-0 h-8 w-14 rounded-full bg-mint"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <t.icon
                    size={22}
                    weight={isActive ? "fill" : "regular"}
                    className={cn("relative mt-1", isActive ? "text-forest" : "text-mute")}
                  />
                  <span className={cn("relative mt-1", isActive ? "text-forest" : "text-mute")}>{t.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <LogoutDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        name={displayName}
        avatarSeed={avatarSeed}
        avatarUrl={avatarUrl}
      />
    </div>
  );
}
