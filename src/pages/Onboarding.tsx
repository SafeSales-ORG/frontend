/**
 * Seller sign-up / sign-in.
 *
 * Step 1 — account: email + password (or Google, when configured).
 * Step 2 — shop: name, handle and payout account (`POST /api/sellers`).
 * Returning sellers skip step 2 and go straight to /app.
 */

import { useSeoMeta } from "@unhead/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Logo } from "@/components/safesale/Logo";
import { LiveOrderCard } from "@/components/landing/LiveOrderCard";
import { GoogleButton, type GoogleProfile } from "@/components/onboarding/GoogleButton";
import { ShopDetailsForm, type CreatedSeller } from "@/components/onboarding/ShopDetailsForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { GOOGLE_SIGN_IN_ENABLED } from "@/lib/config";
import { cn } from "@/lib/utils";

const PASSWORD_MIN = 8;

type Mode = "signup" | "login";
type Stage = { type: "account" } | { type: "shop"; npub: string; prefillName: string; prefillAvatar?: string };

export default function Onboarding() {
  useSeoMeta({ title: "Open your shop — SafeSale" });

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-mint p-12 lg:flex">
        <Link to="/" aria-label="SafeSale home">
          <Logo />
        </Link>
        <div>
          <h2 className="max-w-md text-display-lg text-forest">Your shop, protected.</h2>
          <ul className="mt-8 space-y-3 text-lg text-forest">
            {[
              "Buyers pay SafeSale, so they're not afraid to pay first.",
              "Ship once the money is confirmed and held.",
              "Get paid to your bank when they confirm delivery.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-1.5 h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <LiveOrderCard className="w-full max-w-sm" />
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8 lg:justify-center lg:px-16">
        <Link to="/" className="mb-10 self-start lg:hidden" aria-label="SafeSale home">
          <Logo />
        </Link>
        <div className="mx-auto w-full max-w-md">
          <OnboardingFlow />
        </div>
      </main>
    </div>
  );
}

function OnboardingFlow() {
  const [stage, setStage] = useState<Stage>({ type: "account" });
  const [, setCurrentSeller] = useCurrentSeller();
  const navigate = useNavigate();
  const { toast } = useToast();

  const finish = (seller: CreatedSeller) => {
    setCurrentSeller({
      id: seller.id,
      npub: seller.npub,
      handle: seller.handle,
      name: seller.name,
      avatarUrl: seller.avatarUrl ?? null,
      createdAt: seller.createdAt,
    });
    toast({ title: "Your shop is open", description: `Welcome, @${seller.handle}.` });
    navigate("/app");
  };

  const step = stage.type === "account" ? 1 : 2;

  return (
    <div>
      <StepIndicator step={step} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stage.type}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="mt-8"
        >
          {stage.type === "account" ? (
            <AccountStep
              onNeedsShop={(npub, prefillName, prefillAvatar) =>
                setStage({ type: "shop", npub, prefillName, prefillAvatar })
              }
            />
          ) : (
            <>
              <h1 className="text-h1 text-ink">Set up your shop</h1>
              <p className="mt-2 text-body">This is what buyers see, and where your money goes.</p>
              <div className="mt-8">
                <ShopDetailsForm
                  npub={stage.npub}
                  prefillName={stage.prefillName}
                  prefillAvatar={stage.prefillAvatar}
                  onSuccess={finish}
                />
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = ["Account", "Shop & payout"];
  return (
    <ol className="flex items-center gap-3" aria-label="Sign-up progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors",
                done || current ? "bg-forest text-mint" : "bg-canvas-sunken text-mute",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : n}
            </span>
            <span className={cn("text-sm font-medium", current ? "text-ink" : "text-mute")}>{label}</span>
            {i < steps.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-canvas-sunken">
                <motion.span
                  className="block h-full bg-forest"
                  initial={false}
                  animate={{ width: step > 1 ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AccountStep({
  onNeedsShop,
}: {
  onNeedsShop: (npub: string, prefillName: string, prefillAvatar?: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { register, login, loginWithGoogle } = useAuth();
  const [, setCurrentSeller] = useCurrentSeller();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= PASSWORD_MIN;
  const canSubmit = emailValid && passwordValid && busy === null;

  /** After any successful sign-in: returning sellers go to /app, new ones set up a shop. */
  const routeAfterAuth = async (prefillName: string, prefillAvatar?: string) => {
    setCurrentSeller(null);
    queryClient.removeQueries({ queryKey: ["safesale", "my-listings"] });
    queryClient.removeQueries({ queryKey: ["safesale", "seller-orders"] });

    const me = await apiClient.getMe();
    const shop = me.user.seller;
    if (shop) {
      setCurrentSeller({
        id: shop.id,
        npub: shop.npub,
        handle: shop.handle,
        name: shop.name,
        avatarUrl: null,
        createdAt: me.user.createdAt,
      });
      toast({ title: "Welcome back", description: `Signed in as @${shop.handle}.` });
      navigate("/app");
      return;
    }
    if (!me.user.nostrNpub) {
      setError("Your account is missing a shop identity. Please contact support.");
      return;
    }
    onNeedsShop(me.user.nostrNpub, prefillName, prefillAvatar);
  };

  const submitEmail = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy("email");
    try {
      if (mode === "signup") await register(email.trim(), password);
      else await login(email.trim(), password);
      await routeAfterAuth(email.trim().split("@")[0]);
    } catch (err) {
      setError(friendlyAuthError(err, mode));
    } finally {
      setBusy(null);
    }
  };

  const onGoogleProfile = async (p: GoogleProfile) => {
    try {
      await loginWithGoogle(p.accessToken, p.email, p.googleId);
      await routeAfterAuth(p.name ?? p.email.split("@")[0], p.picture);
    } catch (err) {
      setError(friendlyAuthError(err, "login"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="text-h1 text-ink">{mode === "signup" ? "Open your shop" : "Welcome back"}</h1>
      <p className="mt-2 text-body">
        {mode === "signup" ? "Create your account. It takes about two minutes." : "Sign in to your shop."}
      </p>

      <ModeSwitch
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

      {GOOGLE_SIGN_IN_ENABLED && (
        <div className="mt-6">
          <GoogleButton
            busy={busy === "google"}
            disabled={busy !== null}
            onStart={() => {
              setError(null);
              setBusy("google");
            }}
            onProfile={onGoogleProfile}
            onError={(message) => {
              setError(message);
              setBusy(null);
            }}
          />
          <div className="my-6 flex items-center gap-3 text-sm text-mute">
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}

      <form
        className={cn("space-y-4", !GOOGLE_SIGN_IN_ENABLED && "mt-6")}
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
              setError(null);
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
                setError(null);
              }}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              className="pr-12"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-mute hover:bg-canvas-soft hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "signup" && password.length > 0 && !passwordValid && (
            <p className="mt-1.5 text-sm text-mute">
              {PASSWORD_MIN - password.length} more character{PASSWORD_MIN - password.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md bg-negative-pale px-3.5 py-2.5 text-sm text-negative"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {busy === "email" ? (
            <>
              <Loader2 className="animate-spin" />
              {mode === "signup" ? "Creating your account…" : "Signing in…"}
            </>
          ) : mode === "signup" ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-sm text-mute">
        We only use your details to run your shop and contact you about orders.
      </p>
    </div>
  );
}

/** Two-option switch with a sliding highlight. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: "signup", label: "Create account" },
    { value: "login", label: "Sign in" },
  ];
  return (
    <div role="tablist" className="mt-6 grid grid-cols-2 rounded-full bg-canvas-sunken p-1">
      {options.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-10 rounded-full text-sm font-semibold transition-colors",
              active ? "text-ink" : "text-body hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-switch-pill"
                className="absolute inset-0 rounded-full bg-canvas shadow-[0_1px_2px_rgb(17_22_19/0.08)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function friendlyAuthError(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.code === "BACKEND_UNREACHABLE") return "We couldn't reach SafeSale. Check your connection and try again.";
    if (err.status === 409) return "There's already an account with this email. Sign in instead.";
    if (err.status === 401) return mode === "login" ? "That email and password don't match." : err.message;
    if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return mode === "signup" ? "We couldn't create your account. Please try again." : "We couldn't sign you in. Please try again.";
}
