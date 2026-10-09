import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Logo } from "./Logo";
import { PageTransition } from "@/components/motion";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";

interface Props {
  children: React.ReactNode;
}

/**
 * Public marketing layout. The header is session-aware:
 *
 *   - logged out            → "Sign in" + "Start selling"
 *   - logged in + seller    → avatar + "Go to dashboard"
 *   - logged in + no seller → avatar + "Start selling"
 *
 * The mediator console (/admin) is deliberately not linked here.
 */
const PUBLIC_LINKS = [
  { to: "/market", label: "Marketplace" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/for-sellers", label: "For sellers" },
] as const;

export function MarketingLayout({ children }: Props) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const { isAuthed, user: authUser } = useAuth();
  const [seller] = useCurrentSeller();

  // The header chrome is driven by the JWT session. A user who has opened a
  // shop (has a seller record) is treated as a seller; a signed-in user with
  // no shop yet is nudged to finish setup.
  const loggedIn = isAuthed || !!seller;
  const isSeller = !!seller;

  const displayName = seller?.name ?? authUser?.email ?? null;
  const avatarSeed = seller?.npub ?? authUser?.id ?? "guest";

  // Signed in: a seller goes to their dashboard; a plain account (buyer)
  // sees a "Start selling" prompt — signing in is account access, not shop
  // creation. The two are deliberately separate.
  const dashboardCta = isSeller
    ? { to: "/app", label: "Go to dashboard" }
    : { to: "/onboarding", label: "Start selling" };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {PUBLIC_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium text-body transition-colors hover:bg-canvas-soft hover:text-ink",
                  pathname === l.to && "text-ink",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {loggedIn ? (
              <>
                <Link
                  to={dashboardCta.to}
                  className="inline-flex h-10 items-center gap-2 rounded-full pr-4 pl-1 text-sm font-medium text-ink hover:bg-canvas-soft"
                  aria-label={`${dashboardCta.label} — signed in as ${displayName ?? "you"}`}
                >
                  <Avatar
                    seed={avatarSeed}
                    name={displayName ?? "Guest"}
                    size={28}
                    src={seller?.avatarUrl ?? null}
                  />
                  <span className="hidden lg:inline">{dashboardCta.label}</span>
                </Link>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/onboarding">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/onboarding">Start selling</Link>
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-line bg-canvas md:hidden">
            <div className="container flex flex-col gap-1 py-3">
              {PUBLIC_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-md px-2 py-2 text-base font-medium text-ink"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
                {loggedIn ? (
                  <Button asChild className="col-span-2">
                    <Link to={dashboardCta.to} onClick={() => setOpen(false)}>
                      {dashboardCta.label}
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline">
                      <Link to="/onboarding" onClick={() => setOpen(false)}>
                        Sign in
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link to="/onboarding" onClick={() => setOpen(false)}>
                        Start selling
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">
        <PageTransition key={pathname}>{children}</PageTransition>
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-forest text-canvas-sunken">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Logo className="[&_span]:text-canvas" />
            <p className="mt-4 max-w-xs text-sm text-canvas-sunken/70">
              Escrow for people who buy and sell on social media in Nigeria.
            </p>
          </div>
          <FooterCol
            title="Product"
            items={[
              { to: "/how-it-works", label: "How it works" },
              { to: "/for-sellers", label: "For sellers" },
              { to: "/market", label: "Marketplace" },
            ]}
          />
          <FooterCol
            title="Account"
            items={[
              { to: "/onboarding", label: "Start selling" },
              { to: "/onboarding", label: "Sign in" },
              { to: "/app", label: "Seller dashboard" },
              { to: "/admin", label: "Mediator console" },
            ]}
          />
        </div>
        <p className="mt-12 border-t border-canvas-sunken/15 pt-6 text-xs text-canvas-sunken/60">
          © {new Date().getFullYear()} SafeSale. Made in Lagos.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: { to: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wider text-canvas-sunken/60 uppercase">{title}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {items.map((i) => (
          <li key={i.label}>
            <Link to={i.to} className="text-canvas-sunken hover:text-canvas">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
