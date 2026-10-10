import { useGoogleLogin } from "@react-oauth/google";
import { Loader2 } from "lucide-react";

export interface GoogleProfile {
  accessToken: string;
  email: string;
  googleId: string;
  name?: string;
  picture?: string;
}

/**
 * "Continue with Google". Only render this when GOOGLE_SIGN_IN_ENABLED is
 * true — the hook needs the GoogleOAuthProvider that App mounts in that case.
 */
export function GoogleButton({
  busy,
  disabled,
  onStart,
  onProfile,
  onError,
}: {
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  onProfile: (profile: GoogleProfile) => Promise<void>;
  onError: (message: string) => void;
}) {
  const login = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (token) => {
      try {
        // The profile is only for display; the backend verifies the token itself.
        const info = (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }).then((r) => r.json())) as { sub?: string; email?: string; name?: string; picture?: string };
        if (!info.email || !info.sub) throw new Error("Google didn't share an email address. Try email instead.");
        await onProfile({
          accessToken: token.access_token,
          email: info.email,
          googleId: info.sub,
          name: info.name,
          picture: info.picture,
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Google sign-in failed. Try again.");
      }
    },
    onError: () => onError("Google sign-in was cancelled. Try again or use email."),
  });

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onStart();
        login();
      }}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-canvas text-sm font-semibold text-ink transition-colors hover:bg-canvas-soft disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleLogo />}
      {busy ? "Signing in…" : "Continue with Google"}
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
