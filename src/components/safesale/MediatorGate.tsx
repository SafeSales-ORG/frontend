import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { LockKey } from "@phosphor-icons/react";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/safesale/BrandIcon";

/**
 * Wraps `/admin` so only the SafeSale mediator can open the dispute console.
 *
 * The backend decides who the mediator is (the account signed in with
 * MEDIATOR_EMAIL / MEDIATOR_PASSWORD gets role MEDIATOR) and enforces it on
 * every admin endpoint. This gate only keeps everyone else from seeing an
 * empty console.
 */
export function MediatorGate({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  const demo = import.meta.env.VITE_DEMO_MODE === "true";

  const me = useQuery({
    queryKey: ["safesale", "me"],
    queryFn: () => apiClient.getMe(),
    enabled: isAuthed && !demo,
    staleTime: 60_000,
  });

  // Demo mode: no real money and no real mediator, so the console is open.
  if (demo) return <>{children}</>;

  if (!isAuthed) return <AccessDenied reason="signed-out" />;

  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas-soft">
        <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Checking access" />
      </div>
    );
  }

  const role = me.data?.user.role;
  if (role === "MEDIATOR" || role === "ADMIN") return <>{children}</>;

  return <AccessDenied reason="wrong-account" />;
}

function AccessDenied({ reason }: { reason: "signed-out" | "wrong-account" }) {
  const signedOut = reason === "signed-out";
  return (
    <div className="grid min-h-screen place-items-center bg-canvas-soft px-4 py-16">
      <div className="w-full max-w-md rounded-3xl bg-canvas p-10 text-center">
        <BrandIcon icon={LockKey} size="lg" className="mx-auto" />
        <h1 className="mt-5 font-display text-h2 text-ink">Mediator console</h1>
        <p className="mx-auto mt-2 max-w-sm text-body">
          {signedOut
            ? "Disputes are decided here by the SafeSale mediator. Sign in with the mediator account to continue."
            : "This account isn't the SafeSale mediator. Sign out and sign in with the mediator account."}
        </p>
        <div className="mt-7 flex justify-center gap-2">
          {signedOut && (
            <Button asChild>
              <Link to="/onboarding">Sign in</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/">Back to SafeSale</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-mute">Buyers and sellers don't need this page.</p>
      </div>
    </div>
  );
}
