/**
 * `useAuth` — the SafeSale JWT session hook.
 *
 * Exposes the current user and the auth actions (register / login / Google /
 * logout). Every action calls the backend through `apiClient`, stores the
 * returned JWT session, and notifies all subscribers so the UI updates
 * immediately. Backed by the external store in `lib/auth/session.ts`.
 */

import { useCallback, useSyncExternalStore } from "react";

import { apiClient } from "@/lib/api";
import type { AuthSession } from "@/lib/api/types";
import {
  clearSession,
  getSession,
  setSession,
  subscribe,
} from "@/lib/auth/session";
import { clearCurrentSeller } from "@/hooks/useCurrentSeller";

export function useAuth() {
  const session = useSyncExternalStore(subscribe, getSession, getSession);

  const register = useCallback(
    async (email: string, password: string): Promise<AuthSession> => {
      const s = await apiClient.register({ email, password });
      setSession(s);
      return s;
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<AuthSession> => {
      const s = await apiClient.login({ email, password });
      setSession(s);
      return s;
    },
    [],
  );

  const loginWithGoogle = useCallback(
    async (email: string, googleId: string): Promise<AuthSession> => {
      const s = await apiClient.googleAuth({ email, googleId });
      setSession(s);
      return s;
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    clearCurrentSeller();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isAuthed: !!session,
    register,
    login,
    loginWithGoogle,
    logout,
  };
}
