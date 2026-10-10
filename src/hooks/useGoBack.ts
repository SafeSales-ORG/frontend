import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Go back to wherever the visitor came from inside SafeSale. If they landed
 * here directly (shared link, new tab), there's nothing to go back to, so
 * send them to `fallback` instead of out of the site.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, location.key, fallback]);
}
