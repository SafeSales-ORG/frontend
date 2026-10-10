import { useAuth } from "@/hooks/useAuth";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";

/** Where "Start selling" goes for the current session. */
export function useSellerCta(): { to: string; label: string } {
  const { isAuthed } = useAuth();
  const [seller] = useCurrentSeller();
  if (seller) return { to: "/app", label: "Go to your dashboard" };
  if (isAuthed) return { to: "/onboarding", label: "Finish setting up" };
  return { to: "/onboarding", label: "Start selling" };
}
