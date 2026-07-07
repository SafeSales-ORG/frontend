import { Link } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

/**
 * `MediatorGate` — wraps `/admin` so only a designated mediator account can
 * see the admin / dispute resolution UI.
 *
 * Trust model: SafeSale's mediator surface should never be reachable by the
 * public. Auth is the JWT session (`useAuth`); the mediator is whoever signs in
 * with the email configured at build time via `VITE_MEDIATOR_EMAIL`.
 *
 * Three render branches:
 *
 *   1. Not signed in                → "Access restricted" + sign-in CTA
 *   2. Signed in, wrong account     → "Access restricted" + back to home
 *   3. Signed in, mediator account  → renders the wrapped children
 *
 * Misconfiguration (env var unset) is treated as case (2): we deny rather than
 * open. Safer for a hackathon submission than a leaky default.
 */
export function MediatorGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthed } = useAuth();

  // Demo mode: no real mediator account exists, so for a judges' demo we open
  // /admin directly. The whole app is on the mock — no real funds — so there's
  // nothing to gate.
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    return <>{children}</>;
  }

  const mediatorEmail = import.meta.env.VITE_MEDIATOR_EMAIL?.trim().toLowerCase();

  if (!mediatorEmail) {
    // Env var unset. Treat as "no mediator yet" — deny everyone rather than
    // open the door. Logged for the operator.
    if (import.meta.env.DEV) {
      console.warn(
        "[MediatorGate] VITE_MEDIATOR_EMAIL is not set; /admin denied to all.",
      );
    }
    return <AccessDenied reason="not-configured" />;
  }

  if (!isAuthed) {
    return <AccessDenied reason="signed-out" />;
  }

  if (user?.email?.trim().toLowerCase() !== mediatorEmail) {
    return <AccessDenied reason="wrong-account" />;
  }

  return <>{children}</>;
}

function AccessDenied({
  reason,
}: {
  reason: "signed-out" | "wrong-account" | "not-configured";
}) {
  const heading =
    reason === "signed-out" ? "Mediator access only" : "Access restricted";
  const body =
    reason === "signed-out"
      ? "This area is restricted to SafeSale mediators. Sign in with the mediator account to continue."
      : reason === "wrong-account"
        ? "Your account doesn't have mediator permissions. If you're on the mediation team, switch to the mediator account."
        : "The mediator account isn't configured for this environment. Contact your administrator.";

  return (
    <div className="min-h-screen bg-surface px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-ink">{heading}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{body}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
        <p className="mt-6 text-[11px] text-ink-soft">
          Public surface — buyers and sellers don't need this page.
        </p>
      </div>
    </div>
  );
}
