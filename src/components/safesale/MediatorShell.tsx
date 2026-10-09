import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Scales, SignOut } from "@phosphor-icons/react";

import { Logo, LogoMark } from "./Logo";
import { PageTransition } from "@/components/motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

/** Layout for the SafeSale mediator: dispute queue only, no seller tools. */
export function MediatorShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leaving, setLeaving] = useState(false);

  const signOut = () => {
    setLeaving(true);
    logout();
    navigate("/");
    toast({ title: "You're signed out of the mediator console" });
  };

  return (
    <div className="min-h-screen bg-canvas-soft">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest lg:flex">
        <div className="flex h-16 items-center gap-3 px-6">
          <Link to="/" aria-label="SafeSale home">
            <Logo className="[&_span]:text-canvas" />
          </Link>
          <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-semibold text-forest">Mediator</span>
        </div>
        <nav className="flex-1 px-3 py-4" aria-label="Mediator">
          <NavLink to="/admin" className="relative block">
            <motion.span layoutId="mediator-active" className="absolute inset-0 rounded-full bg-mint" />
            <span className="relative flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-forest">
              <Scales size={19} weight="fill" />
              Dispute queue
            </span>
          </NavLink>
        </nav>
        <div className="border-t border-canvas/10 p-4">
          <p className="text-xs text-canvas/60">Signed in as</p>
          <p className="truncate text-sm font-semibold text-canvas">{user?.email ?? "Mediator"}</p>
          <button
            type="button"
            onClick={signOut}
            disabled={leaving}
            className="mt-3 flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-canvas/80 transition-colors hover:bg-canvas/10 hover:text-canvas"
          >
            <SignOut size={18} /> Log out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
            <Link to="/" className="lg:hidden" aria-label="SafeSale home">
              <LogoMark />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-sans text-h3 text-ink lg:text-h2">{title}</h1>
              {subtitle && <p className="hidden truncate text-sm text-mute xl:block">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Log out"
              className="grid h-10 w-10 place-items-center rounded-full text-body hover:bg-canvas-soft lg:hidden"
            >
              <SignOut size={20} />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 lg:px-8 lg:pt-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
