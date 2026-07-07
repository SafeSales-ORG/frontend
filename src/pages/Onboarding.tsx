/**
 * Seller Onboarding — email/password + Google.
 *
 * Auth is a standard JWT session (see `useAuth`). On success we look up the
 * user's shop via `GET /api/auth/me`:
 *   - existing seller → sign in and go to /app
 *   - new user       → collect handle + name + bank payout details,
 *                      `POST /api/sellers`, /app
 *
 * The seller's stable key is the backend-minted `nostrNpub` — an internal
 * messaging identity the user never sees or manages. No keys, no nsec.
 */

import { useSeoMeta } from "@unhead/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { Check, Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Logo } from "@/components/safesale/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const HANDLE_MIN = 3;
const SHOP_NAME_MIN = 2;
/** Backend `RegisterSchema` requires `password.min(8)`. */
const PASSWORD_MIN = 8;
const DEFAULT_LOCATION = "Nigeria";
const DEFAULT_CATEGORY = "General";

/**
 * Nigerian banks the seller can pick for their payout account. `code` is the
 * NIBSS bank code the backend forwards to Nomba's account lookup. Kept short
 * and covering the common banks + fintechs used at the hackathon.
 */
const NIGERIAN_BANKS: { code: string; name: string }[] = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank" },
  { code: "050", name: "Ecobank" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank (FCMB)" },
  { code: "058", name: "Guaranty Trust Bank (GTBank)" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "50211", name: "Kuda Microfinance Bank" },
  { code: "50515", name: "Moniepoint MFB" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "068", name: "Standard Chartered" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank" },
  { code: "033", name: "United Bank for Africa (UBA)" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

/** Backend `bankAccountNumber` must be exactly 10 digits. */
const ACCOUNT_NUMBER_LEN = 10;

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

      <main className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-white p-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.06),0_4px_6px_-4px_rgba(0,0,0,0.05)] sm:p-8">
        <AuthFlow />
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Auth flow                                     */
/* -------------------------------------------------------------------------- */

type Mode = "signup" | "login";

type FlowStage =
  | { type: "auth" }
  | { type: "details"; npub: string; prefillName: string; prefillAvatar?: string };

function AuthFlow() {
  const [stage, setStage] = useState<FlowStage>({ type: "auth" });
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { register, login, loginWithGoogle } = useAuth();
  const [, setCurrentSeller] = useCurrentSeller();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= PASSWORD_MIN;
  const canSubmit = emailValid && passwordValid && busy === null;

  /** Flush any stale cached seller data before entering a fresh session. */
  const clearPreviousSession = () => {
    setCurrentSeller(null);
    queryClient.removeQueries({ queryKey: ["safesale", "my-listings"] });
    queryClient.removeQueries({ queryKey: ["safesale", "seller-orders"] });
  };

  /**
   * After a successful register/login/google, resolve whether the user
   * already has a shop and route accordingly.
   */
  const routeAfterAuth = async (prefillName: string, prefillAvatar?: string) => {
    clearPreviousSession();
    const me = await apiClient.getMe();

    if (me.user.seller) {
      const s = me.user.seller;
      setCurrentSeller({
        id: s.id,
        npub: s.npub,
        handle: s.handle,
        name: s.name,
        avatarUrl: null,
        createdAt: me.user.createdAt,
      });
      toast({ title: "Welcome back!", description: `Signed in as @${s.handle}.` });
      navigate("/app");
      return;
    }

    const npub = me.user.nostrNpub;
    if (!npub) {
      setError("Your account is missing a shop identity. Please contact support.");
      return;
    }
    setStage({ type: "details", npub, prefillName, prefillAvatar });
  };

  const submitEmail = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy("email");
    try {
      if (mode === "signup") {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      await routeAfterAuth(email.trim().split("@")[0]);
    } catch (err) {
      setError(friendlyAuthError(err, mode));
    } finally {
      setBusy(null);
    }
  };

  const googleLogin = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (tokenResponse) => {
      setError(null);
      setBusy("google");
      try {
        // Exchange the access token for the user's verified email + stable id.
        const info = (await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } },
        ).then((r) => r.json())) as {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
        };

        if (!info.email || !info.sub) {
          throw new Error("Google did not return an email. Try another method.");
        }
        await loginWithGoogle(info.email, info.sub);
        await routeAfterAuth(info.name ?? info.email.split("@")[0], info.picture);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Google sign-in failed. Try again.",
        );
      } finally {
        setBusy(null);
      }
    },
    onError: (err) => {
      setError(
        "Google sign-in was cancelled or failed. " +
          (err.error_description ?? err.error ?? ""),
      );
      setBusy(null);
    },
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
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Open your shop in seconds.
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {mode === "signup"
            ? "Create your account — your shop is ready in two steps."
            : "Welcome back — sign in to your shop."}
        </p>
      </header>

      {/* Continue with Google */}
      <button
        id="google-signin-btn"
        type="button"
        disabled={busy !== null}
        onClick={() => {
          if (busy !== null) return;
          setError(null);
          googleLogin();
        }}
        className={cn(
          "relative flex w-full items-center justify-center gap-3 rounded-xl border border-border/80 bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm transition-all",
          "hover:bg-surface hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {busy === "google" ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
        ) : (
          <GoogleLogoSvg />
        )}
        <span>{busy === "google" ? "Signing in…" : "Continue with Google"}</span>
      </button>

      {/* Divider */}
      <div className="relative flex items-center">
        <span className="h-px flex-1 bg-border/70" />
        <span className="px-3 text-[11px] font-medium uppercase tracking-wide text-ink-soft">
          or
        </span>
        <span className="h-px flex-1 bg-border/70" />
      </div>

      {/* Email + password */}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitEmail();
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1.5"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1.5">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "signup" && password.length > 0 && !passwordValid && (
            <p className="mt-1.5 text-[11px] text-rose-600">
              Password must be at least {PASSWORD_MIN} characters.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
          disabled={!canSubmit}
        >
          {busy === "email" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "signup" ? "Creating account…" : "Signing in…"}
            </>
          ) : mode === "signup" ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      {/* Mode toggle */}
      <p className="text-center text-sm text-ink-soft">
        {mode === "signup" ? "Already have an account?" : "New to SafeSale?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError(null);
          }}
          className="font-semibold text-brand hover:underline focus-visible:outline-none"
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>

      {/* Trust signal */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface/60 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="text-xs leading-relaxed text-ink-soft">
          Your details are used only to secure your shop and reach you about
          orders. Payouts go straight to your Nigerian bank account.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*          New-user step 2 — collect handle + bank payout details            */
/* -------------------------------------------------------------------------- */

interface ShopDetailsFormProps {
  npub: string;
  prefillName: string;
  prefillAvatar?: string;
  onSuccess: (seller: {
    id: string;
    npub: string;
    handle: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: string;
  }) => void;
}

function ShopDetailsForm({ npub, prefillName, prefillAvatar, onSuccess }: ShopDetailsFormProps) {
  const [handle, setHandle] = useState("");
  const [shopName, setShopName] = useState(prefillName);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleValid = isHandleValid(handle);
  const shopNameValid = shopName.trim().length >= SHOP_NAME_MIN;
  const bankValid = bankCode.length > 0;
  const accountValid = accountNumber.length === ACCOUNT_NUMBER_LEN;
  const canSubmit =
    handleValid && shopNameValid && bankValid && accountValid && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { seller } = await apiClient.createSeller({
        npub,
        handle: handle.trim().toLowerCase(),
        name: shopName.trim(),
        bankCode,
        bankAccountNumber: accountNumber,
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
      {/* Confirmation of sign-in */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3.5">
        {prefillAvatar ? (
          <img
            src={prefillAvatar}
            alt="Profile"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <Check className="h-4 w-4 text-brand" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Account ready ✓</p>
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

      <BankField value={bankCode} onChange={setBankCode} />

      <AccountNumberField value={accountNumber} onChange={setAccountNumber} />

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
            onChange(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())
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

function BankField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div>
      <Label htmlFor="shop-bank">Payout bank</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="shop-bank" className="mt-1.5">
          <SelectValue placeholder="Select your bank" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {NIGERIAN_BANKS.map((bank) => (
            <SelectItem key={bank.code} value={bank.code}>
              {bank.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AccountNumberField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const complete = value.length === ACCOUNT_NUMBER_LEN;
  return (
    <div>
      <Label htmlFor="shop-account">Account number</Label>
      <div className="relative mt-1.5 flex items-center">
        <Input
          id="shop-account"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, ACCOUNT_NUMBER_LEN))
          }
          placeholder="0123456789"
          className="pr-10"
        />
        {value.length > 0 && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-3 transition-opacity",
              complete ? "text-brand" : "text-rose-500",
            )}
          >
            {complete ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">
        Your 10-digit NUBAN. Escrow payouts for completed orders go straight here.
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

/** Mirrors the backend `CreateSellerSchema`: 3–30 chars, `^[a-z0-9_]+$`. */
function isHandleValid(handle: string): boolean {
  const cleaned = handle.trim();
  return (
    cleaned.length >= HANDLE_MIN &&
    cleaned.length <= 30 &&
    /^[a-z0-9_]+$/.test(cleaned)
  );
}

function friendlyAuthError(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.code === "BACKEND_UNREACHABLE") {
      return "We couldn't reach SafeSale right now. Check your connection and try again.";
    }
    if (err.status === 409) {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (err.status === 401) {
      return "Incorrect email or password.";
    }
    return err.message;
  }
  return err instanceof Error
    ? err.message
    : mode === "signup"
      ? "Couldn't create your account. Please try again."
      : "Couldn't sign you in. Please try again.";
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
