import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowUUpLeft,
  Receipt,
  Scales,
  SignOut,
  SquaresFour,
  Storefront,
  type Icon,
} from "@phosphor-icons/react";

import { Logo, LogoMark } from "./Logo";
import { Avatar } from "./Avatar";
import { LogoutDialog } from "./LogoutDialog";
import { PageTransition } from "@/components/motion";
import { useAuth } from "@/hooks/useAuth";
import { apiClient, DEMO_MODE } from "@/lib/api";
import { ADMIN_OVERVIEW_KEY } from "@/lib/adminQueries";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: Icon;
  label: string;
  short: string;
  end?: boolean;
  badge?: number;
}


/**
 * Layout for the SafeSale admin console: the one place that sees the whole
 * platform (orders, shops, disputes, refunds owed).
 */
export function AdminShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const overview = useQuery({
    queryKey: ADMIN_OVERVIEW_KEY,
    queryFn: () => apiClient.getAdminOverview(),
    refetchInterval: 15_000,
  });
  const o = overview.data;

  const items: NavItem[] = [
    { to: "/admin", icon: SquaresFour, label: "Overview", short: "Overview", end: true },
    { to: "/admin/disputes", icon: Scales, label: "Disputes", short: "Disputes", badge: o?.openDisputes },
    { to: "/admin/orders", icon: Receipt, label: "Orders", short: "Orders" },
    { to: "/admin/sellers", icon: Storefront, label: "Sellers", short: "Sellers" },
    { to: "/admin/refunds", icon: ArrowUUpLeft, label: "Refunds to pay", short: "Refunds", badge: o?.refundsToPay.count },
  ];
  const isActive = (i: NavItem) => (i.end ? pathname === i.to : pathname.startsWith(i.to));

  const name = DEMO_MODE ? "Demo admin" : "SafeSale admin";
  const email = DEMO_MODE ? "Open to anyone in demo mode" : (user?.email ?? "");

  return (
    <div className="min-h-screen bg-canvas-soft">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest lg:flex">
        <div className="flex h-16 items-center gap-3 px-6">
          <Link to="/" aria-label="SafeSale home">
            <Logo className="[&_span]:text-canvas" />
          </Link>
          <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-semibold text-forest">Admin</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin console">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className="relative block">
                {active && (
                  <motion.span
                    layoutId="admin-active"
                    className="absolute inset-0 rounded-full bg-mint"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span
                  className={cn(
                    "relative flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    active ? "text-forest" : "text-canvas/75 hover:text-canvas",
                  )}
                >
                  <item.icon size={19} weight={active ? "fill" : "regular"} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
                        active ? "bg-forest text-mint" : "bg-mint text-forest",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-canvas/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar seed="safesale-admin" name={name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-canvas">{name}</p>
              <p className="truncate text-xs text-canvas/60">{email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-canvas/80 transition-colors hover:bg-canvas/10 hover:text-canvas"
          >
            <SignOut size={18} /> Log out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
            <Link to="/admin" className="lg:hidden" aria-label="Admin overview">
              <LogoMark />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-sans text-h3 text-ink lg:text-h2">{title}</h1>
              {subtitle && <p className="hidden truncate text-sm text-mute xl:block">{subtitle}</p>}
            </div>
            {action}
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              aria-label="Log out"
              className="grid h-10 w-10 place-items-center rounded-full text-body hover:bg-canvas-soft lg:hidden"
            >
              <SignOut size={20} />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-16">
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-line bg-canvas pb-safe lg:hidden" aria-label="Admin console">
        <ul className="grid grid-cols-5 px-2 pt-2">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="relative flex flex-col items-center gap-1 px-1 py-1.5 text-xs font-medium">
                  {active && (
                    <motion.span
                      layoutId="admin-tab-active"
                      className="absolute top-0 h-8 w-14 rounded-full bg-mint"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative mt-1">
                    <item.icon size={22} weight={active ? "fill" : "regular"} className={active ? "text-forest" : "text-mute"} />
                    {!!item.badge && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-forest px-1 text-center text-[10px] leading-4 font-semibold text-mint">
                        {item.badge}
                      </span>
                    )}
                  </span>
                  <span className={cn("relative mt-1", active ? "text-forest" : "text-mute")}>{item.short}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <LogoutDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        name={name}
        avatarSeed="safesale-admin"
        avatarUrl={null}
        reassurance="SafeSale keeps running while you're away. Money in open disputes stays held until a decision is made."
        farewell="Open disputes will wait for you in the queue."
        title="Log out of the admin console?"
      />
    </div>
  );
}
