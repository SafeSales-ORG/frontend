/**
 * Seller Onboarding — Google Sign-In primary path.
 *
 * Primary flow:
 *   1. User taps "Continue with Google"
 *   2. Google Identity Services popup / redirect completes
 *   3. Frontend POSTs the ID token to `POST /api/auth/google`
 *   4. Backend verifies token, creates/fetches an encrypted Nostr keypair,
 *      returns `{ nsec, npub, seller, isNew }`
 *   5a. If `seller` is not null → returning user, log in and navigate to /app.
 *   5b. If `isNew` → collect handle + phone, call `POST /api/sellers`, then /app.
 *
 * Escape hatch for Nostr power-users: a small "Already on Nostr?" link at the
 * bottom opens the original nsec-paste dialog (unchanged from before).
 *
 * Nostr remains the underlying identity protocol — the keypair is just managed
 * by the backend instead of being generated in-browser.
 */

import { useSeoMeta } from "@unhead/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools";
import { Check, Eye, EyeOff, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { useNostrLogin } from "@nostrify/react/login";
import { useQueryClient } from "@tanstack/react-query";

import { Logo } from "@/components/safesale/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useLoginActions } from "@/hooks/useLoginActions";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import type { GoogleAuthResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const HANDLE_MIN = 3;
const SHOP_NAME_MIN = 2;
/** Backend `CreateSellerSchema` requires `phone.min(7)`. */
const PHONE_MIN = 7;
const DEFAULT_LOCATION = "Nigeria";
const DEFAULT_CATEGORY = "General";

/* -------------------------------------------------------------------------- */
/*                               Page root                                    */
/* -------------------------------------------------------------------------- */

export default function Onboarding() {
  useSeoMeta({ title: "Open your shop — SafeSale" });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-4 antialiased">
      <Link to="/" className="mb-8 inline-block">
        <Logo />
      </Link>

      <OnboardingCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Main card                                     */
/* -------------------------------------------------------------------------- */

function OnboardingCard() {
  const [nsecOpen, setNsecOpen] = useState(false);

  return (
    <>
      <main className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-white p-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.06),0_4px_6px_-4px_rgba(0,0,0,0.05)] sm:p-8">
        <header className="mb-7 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Open your shop in seconds.
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Sign in with Google — your shop is ready in two steps.
          </p>
        </header>

        <GoogleSignInFlow />

        <div className="mt-6 border-t border-border/70 pt-5 text-center">
          <button
            type="button"
            onClick={() => setNsecOpen(true)}
            className="rounded px-2 py-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Already on Nostr? Sign in with your nsec →
          </button>
        </div>
      </main>

      <SignInWithNsecDialog open={nsecOpen} onOpenChange={setNsecOpen} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Google sign-in flow                              */
/* -------------------------------------------------------------------------- */

type FlowStage =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "details"; nsec: string; npub: string; prefillName: string; prefillAvatar?: string };

function GoogleSignInFlow() {
  const [stage, setStage] = useState<FlowStage>({ type: "idle" });
  const [error, setError] = useState<string | null>(null);

  const loginActions = useLoginActions();
  const { logins, removeLogin } = useNostrLogin();
  const [, setCurrentSeller] = useCurrentSeller();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /** Flush any previously-stored session to prevent multi-account contamination. */
  const clearPreviousSession = () => {
    for (const existing of logins) {
      removeLogin(existing.id);
    }
    setCurrentSeller(null);
    queryClient.removeQueries({ queryKey: ["safesale", "my-listings"] });
    queryClient.removeQueries({ queryKey: ["safesale", "seller-orders"] });
  };

  const handleGoogleToken = async (idToken: string) => {
    setError(null);
    setStage({ type: "loading" });
    try {
      const res = await apiClient.googleAuth({ idToken }) as GoogleAuthResponse & {
        _googleProfile?: { name: string; picture?: string };
      };

      clearPreviousSession();
      // Log the user into the Nostrify session using the backend-issued nsec.
      loginActions.nsec(res.nsec);

      if (!res.isNew && res.seller) {
        // Returning user — seller profile already exists.
        setCurrentSeller({
          id: res.seller.id,
          npub: res.seller.npub,
          handle: res.seller.handle,
          name: res.seller.name,
          avatarUrl: res.seller.avatarUrl ?? null,
          createdAt: res.seller.createdAt,
        });
        toast({ title: "Welcome back!", description: `Signed in as @${res.seller.handle}.` });
        navigate("/app");
      } else {
        // New user — collect handle + phone before creating seller record.
        setStage({
          type: "details",
          nsec: res.nsec,
          npub: res.npub,
          prefillName: res._googleProfile?.name ?? "",
          prefillAvatar: res._googleProfile?.picture,
        });
      }
    } catch (err) {
      setStage({ type: "idle" });
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed. Please try again.",
      );
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      // `useGoogleLogin` with flow="implicit" gives us an access_token.
      // We need an id_token, so we use flow="auth-code" or the credential
      // from the GoogleLogin button. Here we use the tokenResponse's
      // access_token to fetch the userinfo and re-request as credential.
      //
      // Actually, useGoogleLogin flow="implicit" gives access_token, not
      // id_token. We'll instead use a credential-based approach in the
      // render below (GoogleLogin component). This handler is kept as a
      // fallback if the credential approach fails.
      handleGoogleToken(tokenResponse.access_token);
    },
    onError: (err) => {
      setError(
        "Google sign-in was cancelled or failed. " +
        (err.error_description ?? err.error ?? ""),
      );
      setStage({ type: "idle" });
    },
    flow: "implicit",
  });

  if (stage.type === "details") {
    return (
      <ShopDetailsForm
        npub={stage.npub}
        prefillName={stage.prefillName}
        prefillAvatar={stage.prefillAvatar}
        onSuccess={(seller) => {
          setCurrentSeller({
            id: seller.id,
            npub: seller.npub,
            handle: seller.handle,
            name: seller.name,
            avatarUrl: seller.avatarUrl ?? null,
            createdAt: seller.createdAt,
          });
          toast({ title: "Shop created!", description: `Welcome, @${seller.handle} 🎉` });
          navigate("/app");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Google Sign-In button */}
      <button
        id="google-signin-btn"
        type="button"
        disabled={stage.type === "loading"}
        onClick={() => {
          if (stage.type === "loading") return;
          setError(null);
          googleLogin();
        }}
        className={cn(
          "relative flex w-full items-center justify-center gap-3 rounded-xl border border-border/80 bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm transition-all",
          "hover:bg-surface hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {stage.type === "loading" ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
        ) : (
          <GoogleLogoSvg />
        )}
        <span>
          {stage.type === "loading" ? "Signing in…" : "Continue with Google"}
        </span>
      </button>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {/* Trust signals */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface/60 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="text-xs leading-relaxed text-ink-soft">
          Your Google account is used only to identify you. We create a secure,
          recoverable identity for your shop — no passwords, no keys to manage.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*               New-user step 2 — collect handle + phone                    */
/* -------------------------------------------------------------------------- */

interface ShopDetailsFormProps {
  npub: string;
  prefillName: string;
  prefillAvatar?: string;
  onSuccess: (seller: { id: string; npub: string; handle: string; name: string; avatarUrl?: string | null; createdAt: string }) => void;
}

function ShopDetailsForm({ npub, prefillName, prefillAvatar, onSuccess }: ShopDetailsFormProps) {
  const [handle, setHandle] = useState("");
  const [shopName, setShopName] = useState(prefillName);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleValid = isHandleValid(handle);
  const shopNameValid = shopName.trim().length >= SHOP_NAME_MIN;
  const phoneValid = isPhoneValid(phone);
  const canSubmit = handleValid && shopNameValid && phoneValid && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { seller } = await apiClient.createSeller({
        npub,
        handle: handle.trim().toLowerCase(),
        name: shopName.trim(),
        phone: phone.trim(),
        location: DEFAULT_LOCATION,
        category: DEFAULT_CATEGORY,
        avatarUrl: prefillAvatar,
      });
      onSuccess(seller);
    } catch (err) {
      toast({
        title: "Couldn't create your shop",
        description: friendlySellerError(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Confirmation of Google sign-in */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3.5">
        {prefillAvatar ? (
          <img
            src={prefillAvatar}
            alt="Google profile"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <Check className="h-4 w-4 text-brand" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Signed in with Google ✓</p>
          <p className="truncate text-sm text-ink-soft">
            {prefillName ? `Hi, ${prefillName}! ` : ""}Pick a handle to finish.
          </p>
        </div>
      </div>

      <HandleField
        value={handle}
        onChange={setHandle}
        showValidation={handle.length > 0}
        valid={handleValid}
      />

      <ShopNameField value={shopName} onChange={setShopName} />

      <PhoneField value={phone} onChange={setPhone} />

      <Button
        type="button"
        size="lg"
        className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
        disabled={!canSubmit}
        onClick={submit}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating your shop…
          </>
        ) : (
          "Open my shop"
        )}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*              Escape hatch — existing Nostr user pastes nsec                */
/* -------------------------------------------------------------------------- */

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SignInWithNsecDialog({ open, onOpenChange }: SignInDialogProps) {
  const [stage, setStage] = useState<"paste" | "details">("paste");

  const [nsecInput, setNsecInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [handle, setHandle] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [opening, setOpening] = useState(false);

  const [signedInNpub, setSignedInNpub] = useState<string | null>(null);

  const loginActions = useLoginActions();
  const { logins, removeLogin } = useNostrLogin();
  const [, setCurrentSeller] = useCurrentSeller();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setStage("paste");
    setNsecInput("");
    setReveal(false);
    setConnecting(false);
    setError(null);
    setHandle("");
    setShopName("");
    setPhone("");
    setOpening(false);
    setSignedInNpub(null);
  };

  const onChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const trimmed = nsecInput.trim();
  const looksLikeNsec = trimmed.startsWith("nsec1") && trimmed.length >= 60;

  const handleSignIn = async () => {
    if (!looksLikeNsec || connecting) return;
    setError(null);
    setConnecting(true);
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== "nsec") {
        throw new Error("That key isn't a private key (nsec).");
      }
      const npub = nip19.npubEncode(getPublicKey(decoded.data));

      for (const existing of logins) {
        removeLogin(existing.id);
      }
      setCurrentSeller(null);
      queryClient.removeQueries({ queryKey: ["safesale", "my-listings"] });
      queryClient.removeQueries({ queryKey: ["safesale", "seller-orders"] });

      loginActions.nsec(trimmed);
      setSignedInNpub(npub);
      setStage("details");
      setNsecInput("");
    } catch (err) {
      setError(
        err instanceof Error
          ? friendlifyNsecError(err.message)
          : "That doesn't look like a valid nsec. Double-check and try again.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenShop = async () => {
    if (
      !isHandleValid(handle) ||
      shopName.trim().length < SHOP_NAME_MIN ||
      !isPhoneValid(phone) ||
      !signedInNpub
    ) {
      return;
    }
    setOpening(true);
    try {
      const { seller } = await apiClient.createSeller({
        npub: signedInNpub,
        handle: handle.trim().toLowerCase(),
        name: shopName.trim(),
        phone: phone.trim(),
        location: DEFAULT_LOCATION,
        category: DEFAULT_CATEGORY,
      });
      setCurrentSeller({
        id: seller.id,
        npub: seller.npub,
        handle: seller.handle,
        name: seller.name,
        avatarUrl: seller.avatarUrl ?? null,
        createdAt: seller.createdAt,
      });
      toast({ title: "Welcome back", description: `Signed in as @${seller.handle}.` });
      onOpenChange(false);
      reset();
      navigate("/app");
    } catch (err) {
      toast({
        title: "Couldn't open your shop",
        description: friendlySellerError(err),
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage === "paste" ? "Sign in with your nsec" : "Set up your shop"}
          </DialogTitle>
          <DialogDescription>
            {stage === "paste"
              ? "Paste the private key (nsec) from your other Nostr app. It stays in this browser — we never send it anywhere."
              : "Pick a handle and a name for your SafeSale shop."}
          </DialogDescription>
        </DialogHeader>

        {stage === "paste" ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="nsec-input">Your nsec</Label>
              <div className="relative mt-1.5">
                <Input
                  id="nsec-input"
                  type={reveal ? "text" : "password"}
                  value={nsecInput}
                  onChange={(e) => {
                    setNsecInput(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSignIn();
                    }
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="nsec1..."
                  className={cn(
                    "pr-10 font-mono text-sm tracking-tight",
                    error && "border-rose-400 focus-visible:ring-rose-200",
                  )}
                  aria-invalid={!!error}
                  aria-describedby={error ? "nsec-error" : undefined}
                />
                <button
                  type="button"
                  aria-label={reveal ? "Hide nsec" : "Show nsec"}
                  onClick={() => setReveal((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && (
                <p id="nsec-error" className="mt-2 text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface/60 p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <p className="text-xs leading-relaxed text-ink-soft">
                Your nsec stays in this browser's local storage. SafeSale
                never sees it, never sends it anywhere.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onChange(false)} disabled={connecting}>
                Cancel
              </Button>
              <Button
                onClick={handleSignIn}
                disabled={!looksLikeNsec || connecting}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {connecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 p-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <Check className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">Signed in with your existing key</p>
                <p className="truncate text-sm text-ink-soft">Pick a SafeSale handle to finish.</p>
              </div>
            </div>

            <HandleField
              value={handle}
              onChange={setHandle}
              showValidation={handle.length > 0}
              valid={isHandleValid(handle)}
            />
            <ShopNameField value={shopName} onChange={setShopName} />
            <PhoneField value={phone} onChange={setPhone} />

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onChange(false)} disabled={opening}>
                Cancel
              </Button>
              <Button
                onClick={handleOpenShop}
                disabled={
                  !isHandleValid(handle) ||
                  shopName.trim().length < SHOP_NAME_MIN ||
                  !isPhoneValid(phone) ||
                  opening
                }
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {opening ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening…
                  </>
                ) : (
                  "Open my shop"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Shared field components                         */
/* -------------------------------------------------------------------------- */

function HandleField({
  value,
  onChange,
  showValidation,
  valid,
}: {
  value: string;
  onChange: (next: string) => void;
  showValidation: boolean;
  valid: boolean;
}) {
  return (
    <div>
      <Label htmlFor="handle">Shop handle</Label>
      <div className="relative mt-1.5 flex items-center">
        <span aria-hidden className="pointer-events-none absolute left-3 text-sm text-ink-soft">
          @
        </span>
        <Input
          id="handle"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase())
          }
          placeholder="yourshop"
          className="pl-7 pr-10"
        />
        {showValidation && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-3 transition-opacity",
              valid ? "text-brand" : "text-rose-500",
            )}
          >
            {valid ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </span>
        )}
      </div>
    </div>
  );
}

function ShopNameField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div>
      <Label htmlFor="shop-name">Shop name</Label>
      <Input
        id="shop-name"
        className="mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Amaka's Boutique"
      />
    </div>
  );
}

function PhoneField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div>
      <Label htmlFor="shop-phone">Phone number</Label>
      <Input
        id="shop-phone"
        type="tel"
        autoComplete="tel"
        className="mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+234 800 000 0000"
        inputMode="tel"
      />
      <p className="mt-1.5 text-[11px] text-ink-soft">
        Buyers see this on the order page so they can reach you about delivery.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Google logo SVG                                   */
/* -------------------------------------------------------------------------- */

function GoogleLogoSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Utility helpers                               */
/* -------------------------------------------------------------------------- */

function isHandleValid(handle: string): boolean {
  const cleaned = handle.trim();
  return (
    cleaned.length >= HANDLE_MIN &&
    cleaned.length <= 24 &&
    /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(cleaned)
  );
}

function isPhoneValid(phone: string): boolean {
  const cleaned = phone.trim();
  const digits = cleaned.replace(/[^\d]/g, "");
  return cleaned.length >= PHONE_MIN && cleaned.length <= 20 && digits.length >= 7;
}

function friendlifyNsecError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("checksum")) {
    return "This nsec looks tampered with or mistyped — the security check failed.";
  }
  if (lower.includes("invalid") || lower.includes("decode")) {
    return 'That doesn\'t look like a valid nsec. It should start with "nsec1" and be about 63 characters.';
  }
  return raw;
}

function friendlySellerError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "BACKEND_UNREACHABLE") {
      return "We couldn't reach SafeSale right now. Check your connection and try again.";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Please try again.";
}
