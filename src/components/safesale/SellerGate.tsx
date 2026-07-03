/**
 * `SellerGate` — role-based protection for the seller dashboard (`/app/*`).
 *
 * Buyers never have a shop and must never see seller surfaces (earnings,
 * order management, listings). Access requires BOTH a Nostr login AND a
 * SafeSale seller record whose npub matches that login — the same
 * "trusted seller" check the rest of the app uses.
 *
 *   - not signed in            → friendly gate with Sign in / Start selling
 *   - signed in, no shop yet    → nudge to create a shop (Start selling)
 *   - signed in + matching shop → renders the dashboard
 *
 * This is a client-side guard for UX, not a security boundary (there's no
 * sensitive server data behind it in demo mode) — but it cleanly separates
 * the buyer and seller worlds the way the product intends.
 */

import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { Lock, Store } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { DEMO_MODE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/safesale/Logo";

function safeNpub(pubkeyHex: string): string | null {
  try {
    return nip19.npubEncode(pubkeyHex);
  } catch {
    return null;
  }
}

export function SellerGate({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const [seller] = useCurrentSeller();

  const userNpub = user?.pubkey ? safeNpub(user.pubkey) : null;
  // Demo mode is store-backed and doesn't depend on a live Nostr session, so
  // a persisted seller record is sufficient — this avoids the Nostr identity
  // churn (login removed/re-added at onboarding) bouncing a real seller back
  // to "create a shop". Real mode keeps the strict npub-match check.
  const isSeller = DEMO_MODE
    ? !!seller
    : !!user && !!seller && seller.npub === userNpub;

  if (isSeller) return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 py-12">
      <div className="max-w-md rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
        <Logo />
        <div className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
          {user ? <Store className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-ink">
          {user ? "Open your shop to continue" : "This is the seller area"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          {user
            ? "You're signed in as a buyer. Create a shop to access the seller dashboard, listings and earnings."
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
