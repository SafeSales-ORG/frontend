/**
 * `SellerGate` — role-based protection for the seller dashboard (`/app/*`).
 *
 * Buyers never have a shop and must never see seller surfaces (earnings,
 * order management, listings). Access requires a signed-in JWT session
 * (`useAuth`) AND a SafeSale seller record for that account.
 *
 *   - not signed in            → friendly gate with Sign in / Start selling
 *   - signed in, no shop yet    → nudge to create a shop (Start selling)
 *   - signed in + has a shop     → renders the dashboard
 *
 * This is a client-side guard for UX, not a security boundary — but it cleanly
 * separates the buyer and seller worlds the way the product intends. The seller
 * record is set at onboarding (and re-hydrated from `GET /api/auth/me` on login).
 */

import { Link } from "react-router-dom";
import { Lock, Store } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/safesale/Logo";

export function SellerGate({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  const [seller] = useCurrentSeller();

  // A signed-in account with a persisted seller record is a seller. Logout
  // clears both the session and the seller record, so a stale record can't
  // grant access on its own.
  const isSeller = isAuthed && !!seller;

  if (isSeller) return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 py-12">
      <div className="max-w-md rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
        <Logo />
        <div className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
          {isAuthed ? <Store className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-ink">
          {isAuthed ? "Open your shop to continue" : "This is the seller area"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          {isAuthed
            ? "You're signed in but don't have a shop yet. Create one to access the seller dashboard, listings and earnings."
            : "The dashboard is for sellers. Browse the marketplace to shop, or open a shop to start selling."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/market">Browse marketplace</Link>
          </Button>
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/onboarding">Start selling</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SellerGate;
