import { useSeoMeta } from "@unhead/react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/safesale/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/safesale/Avatar";
import { EscrowShield } from "@/components/safesale/EscrowShield";
import { Countdown } from "@/components/safesale/Countdown";
import { useListing } from "@/hooks/useListing";
import { useAuthor } from "@/hooks/useAuthor";
import { getSeller as getFixtureSeller } from "@/lib/mock";
import {
  apiClient,
  ApiError,
  DEMO_MODE,
  type ApiOrder,
  type GetOrderResponse,
} from "@/lib/api";
import { formatNGN } from "@/lib/format";
import { genUserName } from "@/lib/genUserName";
import { useToast } from "@/hooks/useToast";
import { generateBuyerKey, persistBuyerKey } from "@/lib/buyerKey";
import {
  ShieldCheck,
  ChevronLeft,
  Copy,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Lock,
  ImageDown,
  Link2 as LinkIcon,
  MapPin,
  Phone,
  Bookmark,
  Truck,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import { cn, sanitizeUrl } from "@/lib/utils";

type Step = "details" | "instructions" | "waiting" | "detected" | "secured";

export default function Checkout() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: listing, isLoading: listingLoading } = useListing(id);
  const sellerPubkey = listing?.sellerPubkey;
  const author = useAuthor(sellerPubkey);
  const fixtureSeller = sellerPubkey ? getFixtureSeller(sellerPubkey) : undefined;
  const sellerName =
    author.data?.metadata?.name ??
    fixtureSeller?.name ??
    (sellerPubkey ? genUserName(sellerPubkey) : "Seller");
  const sellerAvatarSeed = fixtureSeller?.avatarSeed ?? sellerPubkey ?? "seller";
  const sellerRating = fixtureSeller?.rating;
  const sellerReviews = fixtureSeller?.reviews;
  const sellerVerified = fixtureSeller?.verified ?? false;

  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useSeoMeta({
    title: listing ? `Checkout — ${listing.title}` : "Checkout — SafeSale",
  });

  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  /**
   * The order, once we've called apiClient.createOrder(). Until then
   * this is null and the user is still on the details/instructions
   * step. Once we have a token, the polling effect below will keep
   * `liveOrder` fresh so the UI can react to backend state changes
   * (e.g. webhook → paid).
   *
   * Shape mirrors the `CreateOrderResponse` returned by
   * `POST /api/orders` — orderToken + MavaPay bank-transfer (pay-in)
   * details flattened from the response's `payIn` object.
   */
  const [createdOrder, setCreatedOrder] = useState<{
    orderToken: string;
    shortId: string;
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: string;
    payInError: string | null;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Poll the order's current state once we have a token. The mock
  // client transitions pending_payment → paid ~5s after
  // createOrder, simulating the MavaPay webhook landing.
  //
  // `apiClient.getOrder` returns the full `{order, listing, seller, dispute}`
  // envelope; for checkout we only care about `order.status`.
  // This query shares its key with the Buyer Order Page
  // (`["safesale", "order", token]`), so it MUST return the same full
  // `GetOrderResponse` envelope. If it returned only `order`, then when
  // the buyer taps "Open my order page" the order page would read this
  // cached value, find no `.listing` / `.seller`, and crash on
  // `order.status` (the global staleTime keeps it from refetching to
  // self-heal). Returning the envelope means the order page also opens
  // with a warm, correct cache.
  const { data: liveOrderEnv } = useQuery<GetOrderResponse | null>({
    queryKey: ["safesale", "order", createdOrder?.orderToken ?? ""],
    enabled: !!createdOrder?.orderToken,
    queryFn: async () => {
      if (!createdOrder) return null;
      try {
        return await apiClient.getOrder(createdOrder.orderToken);
      } catch (err) {
        if (err instanceof ApiError && err.code === "ORDER_NOT_FOUND") {
          return null;
        }
        throw err;
      }
    },
    // Poll every 2s while we're waiting for the payment-locked transition;
    // once locked, slow the polling right down — the user has already
    // moved on visually to the "secured" view.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      return data.order.status === "pending_payment" ? 2000 : false;
    },
  });
  const liveOrder = liveOrderEnv?.order ?? null;

  // While waiting, advance to "secured" automatically when the order
  // transitions out of pending_payment. We use refs to detect the edge
  // (status changed *and* we're in waiting). The setState call here is
  // intentional — we're reacting to a polled external state change,
  // which is exactly what the rule allows via an opt-out.
  const prevStatusRef = useRef<ApiOrder["status"] | undefined>(undefined);
  const detectedTimerRef = useRef<number | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const status = liveOrder?.status;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!createdOrder) return;
    if (status === prev) return;
    if (status && status !== "pending_payment" && step === "waiting") {
      setStep("detected");
      if (detectedTimerRef.current !== null) {
        clearTimeout(detectedTimerRef.current);
      }
      detectedTimerRef.current = window.setTimeout(() => {
        setStep("secured");
        detectedTimerRef.current = null;
      }, 1500);
    }
  }, [liveOrder?.status, createdOrder, step]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      if (detectedTimerRef.current !== null) {
        clearTimeout(detectedTimerRef.current);
      }
    };
  }, []);

  const contactValid =
    contactMethod === "email"
      ? /.+@.+\..+/.test(email)
      : phone.trim().length >= 10; // WhatsApp number usually 10-11 digits

  const valid =
    name.trim().length > 1 &&
    contactValid &&
    address.trim().length > 4 &&
    city.trim().length > 1;

  // Placeholder pay-in details used briefly before createOrder returns
  // a real account. Computed via useState initializer (the one place a
  // hook is allowed to call Date.now()), and stable for the lifetime
  // of the page so the Countdown doesn't reset across re-renders.
  const [placeholderPayTo] = useState<{
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: string;
  }>(() => ({
    accountNumber: "—",
    bankName: "—",
    accountName: "SafeSale Escrow",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  }));

  // ------------------------------------------------------------------
  //  Loading + not-found gates
  // ------------------------------------------------------------------

  if (listingLoading) {
    return <CheckoutSkeleton />;
  }

  if (!listing) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface text-center">
        <div>
          <p className="text-lg font-semibold text-ink">Listing not found</p>
          <p className="mt-1 text-sm text-ink-soft">
            The link may be old, mistyped, or never existed.
          </p>
          <Button asChild className="mt-4 bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  //  Order creation — fires when the user taps "Continue to payment"
  //  on the instructions screen.
  //
  //  1. Generate a one-time Nostr keypair in the browser for the buyer.
  //     The nsec is persisted to `localStorage` under
  //     `safesale:buyer:<orderToken>`; the npub identifies the buyer's
  //     order for backend notifications.
  //  2. Send the corresponding npub to the backend along with the
  //     buyer's name / phone / city / address (the real backend
  //     requires these fields — see `routes/orders.ts::CreateOrderSchema`).
  //  3. Store the `CreateOrderResponse` (orderToken + MavaPay pay-in
  //     bank details) so the Instructions step can render them.
  //
  //  KEY ORDER MATTERS: we generate-and-persist the keypair BEFORE
  //  awaiting createOrder so that if the user refreshes mid-call (or
  //  the network drops) we don't end up with a token on the backend
  //  pointing at an npub whose nsec was never written to disk.
  //  Worst case: an orphan key under a token that doesn't exist. Best
  //  case: success. Either way the release flow is never blocked.
  // ------------------------------------------------------------------

  const handleIssueAccount = async () => {
    if (creating || createdOrder) return;
    setCreating(true);
    setCreateError(null);
    try {
      // Step 1: pre-generate a tentative token-less key? No — we don't
      // have the token yet. The backend generates it. So we generate
      // the key first, then create the order with the resulting npub,
      // then persist the nsec under the returned token in a single
      // tick once we have it.
      const tentativeKey = generateBuyerKey("__pending__");
      const res = await apiClient.createOrder({
        listingId: listing.id,
        buyerNpub: tentativeKey.npub,
        buyerName: name.trim(),
        buyerPhone: phone.trim(),
        buyerEmail: email.trim() || undefined,
        buyerCity: city.trim(),
        buyerAddress: address.trim() || undefined,
        contactMethod,
        variant: listing.tags?.[0],
        // Bridge: hand the mock client the listing data so it can
        // accept orders for listings it didn't ship with as fixtures
        // (e.g. anything the seller just published to Nostr).
        // The real backend silently ignores this — its DB already
        // has the listing from the seller's POST /api/listings.
        _listingHint: {
          id: listing.id,
          sellerId: listing.sellerPubkey,
          title: listing.title,
          description: listing.description,
          priceNGN: listing.priceNGN,
          images: listing.images.map((url) => ({ url })),
          category: listing.category ?? "general",
          variants: listing.tags ?? null,
          inStock: listing.inStock,
          delivery: listing.delivery ?? null,
          deliveryFee: listing.deliveryFee ?? 0,
          seller: {
            name: sellerName,
            handle: fixtureSeller?.handle,
            location: fixtureSeller?.location,
            verified: sellerVerified,
          },
        },
      });

      // Re-persist the keypair under the real orderToken, then drop
      // the tentative entry. This atomic-feeling swap guarantees that
      // `getBuyerKey(orderToken)` works the moment the buyer arrives
      // at /order/:token.
      persistBuyerKey(res.orderToken, {
        nsec: tentativeKey.nsec,
        npub: tentativeKey.npub,
      });
      try {
        localStorage.removeItem("safesale:buyer:__pending__");
      } catch {
        // best-effort cleanup
      }

      setCreatedOrder({
        orderToken: res.orderToken,
        shortId: res.shortId,
        accountNumber: res.payIn?.bankAccountNumber ?? "—",
        bankName: res.payIn?.bankName ?? "—",
        accountName: res.payIn?.bankAccountName ?? "SafeSale Escrow",
        expiresAt: res.payIn?.expiresAt ?? placeholderPayTo.expiresAt,
        payInError: res.payInError ?? null,
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Couldn't start the order. Try again.";
      setCreateError(msg);
      toast({
        title: "Couldn't create your order",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ------------------------------------------------------------------
  //  Confirm transfer sent — moves to the "waiting" step, then locks the
  //  payment in escrow.
  //
  //  Two modes:
  //   - Mock mode (no VITE_API_URL): the mock client transitions the
  //     order to paid ~5s after createOrder on its own, so we
  //     just show "waiting" and let the polling effect advance the UI.
  //   - Real backend (VITE_API_URL set): in production the MavaPay pay-in
  //     webhook flips the order to paid. For demos the bank rail isn't
  //     wired, so we trigger the transition ourselves via the demo-only
  //     POST /api/orders/:token/simulate-payment (apiClient.confirmPayment).
  //     WITHOUT this the order sits in pending_payment and the buyer's
  //     "I've sent the transfer" spinner never resolves.
  //
  //  simulate-payment is idempotent (a second hit returns the existing
  //  paid order), so we retry a few times with backoff to ride out a
  //  transient backend hiccup.
  // ------------------------------------------------------------------

  const handleConfirmTransferSent = async () => {
    if (!createdOrder) return;
    setStep("waiting");
    toast({
      title: "Confirming your payment…",
      description:
        "Save your order link on the next screen — it's how you'll come back to this order.",
    });

    // Lock escrow via the API client. The mock resolves instantly; the
    // real backend marks the order paid (demo simulate-payment), so retry
    // a few times with backoff. The polling effect then advances
    // waiting → detected → secured the moment status leaves pending_payment.
    const maxRetries = 4;
    const backoffMs = [1500, 3000, 5000];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await apiClient.confirmPayment(createdOrder.orderToken);
        await queryClient.invalidateQueries({
          queryKey: ["safesale", "order", createdOrder.orderToken],
        });
        toast({ title: "Payment confirmed ✓" });
        // Demo-only: surface the email the backend would send at this exact
        // point (payment confirmed → Resend "order secured" + tracking link).
        // No real email is sent in demo mode; this just makes the step visible.
        if (DEMO_MODE && email.trim()) {
          toast({
            title: "📧 Order email sent",
            description: `Tracking link sent to ${email.trim()} (simulated in demo).`,
          });
        }
        return;
      } catch (err) {
        const isLast = attempt === maxRetries;
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        if (!isLast) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt - 1] ?? 5000));
          continue;
        }
        toast({
          title: "Payment confirmation failed",
          description: `${msg}. Please try again in a moment.`,
          variant: "destructive",
        });
        setStep("instructions");
      }
    }
  };

  // The bank-transfer (pay-in) details come from the API response. In
  // real mode MavaPay issues them; in mock mode the mock client makes
  // them up. Either way they're per-order and survive across polls.
  const payTo: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: string;
  } = createdOrder
    ? {
        accountNumber: createdOrder.accountNumber,
        bankName: createdOrder.bankName,
        accountName: createdOrder.accountName,
        expiresAt: createdOrder.expiresAt,
      }
    : placeholderPayTo;
  const payExpiresAt = createdOrder?.expiresAt ?? payTo.expiresAt;

  const heroImage = sanitizeUrl(listing.images[0]);
  // Buyer pays item + delivery into escrow — the full, known-up-front total.
  const deliveryFee = listing.deliveryFee ?? 0;
  const total = listing.priceNGN + deliveryFee;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link
            to={`/buy/${listing.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <Logo />
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft-foreground">
            <ShieldCheck className="h-3 w-3" />
            Secure
          </span>
        </div>
      </header>

      <main className="container max-w-2xl pb-12 pt-6">
        <StepBar step={step} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-5">
            {step === "details" && (
              <DetailsForm
                name={name}
                setName={setName}
                phone={phone}
                setPhone={setPhone}
                email={email}
                setEmail={setEmail}
                contactMethod={contactMethod}
                setContactMethod={setContactMethod}
                city={city}
                setCity={setCity}
                address={address}
                setAddress={setAddress}
                onSubmit={() => valid && setStep("instructions")}
                valid={valid}
              />
            )}
            {step === "instructions" && (
              <Instructions
                amount={total}
                payTo={payTo}
                expiresAt={payExpiresAt}
                onConfirm={handleConfirmTransferSent}
                pending={creating}
                hasAccount={!!createdOrder}
                onIssueAccount={handleIssueAccount}
                error={createError}
              />
            )}
            {step === "waiting" && (
              <WaitingPayment
                amount={total}
                expiresAt={payExpiresAt}
              />
            )}
            {step === "detected" && <Detected amount={total} />}
            {step === "secured" && createdOrder && (
              <Secured
                amount={total}
                orderToken={createdOrder.orderToken}
                contactMethod={contactMethod}
                contactValue={contactMethod === "email" ? email : phone}
                onContinue={() => navigate(`/order/${createdOrder.orderToken}`)}
              />
            )}
          </div>

          {/* Order summary - sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:h-min">
            <div className="overflow-hidden rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                {heroImage ? (
                  <img
                    src={heroImage}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="h-16 w-16 shrink-0 rounded-xl bg-secondary"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-ink">
                    {listing.title}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {formatNGN(listing.priceNGN)}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <Row k="Item" v={formatNGN(listing.priceNGN)} />
                <Row
                  k="Delivery"
                  v={deliveryFee > 0 ? formatNGN(deliveryFee) : "Free"}
                />
                <Row k="Buyer protection" v="Free" sub />
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Total
                </span>
                <span className="text-lg font-semibold tabular-nums text-ink">
                  {formatNGN(total)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-ink-soft">
                The full amount — item + delivery — is locked in escrow. No
                extra delivery charges after you pay.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
              <Avatar seed={sellerAvatarSeed} name={sellerName} size={32} />
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-medium text-ink">{sellerName}</p>
                {sellerRating !== undefined && (
                  <p className="truncate text-ink-soft">
                    {sellerRating.toFixed(1)} ★
                    {sellerReviews !== undefined && (
                      <> · {sellerReviews} reviews</>
                    )}
                  </p>
                )}
              </div>
              {sellerVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-soft-foreground">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>

            <Footnote />
          </aside>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StepBar({ step }: { step: Step }) {
  const order: Step[] = ["details", "instructions", "waiting", "detected", "secured"];
  const ix = order.indexOf(step);
  const labels = [
    { key: "details", label: "Details" },
    { key: "instructions", label: "Pay" },
    { key: "secured", label: "Done" },
  ];
  const milestones = [0, 1, 4];
  return (
    <div className="flex items-center gap-3">
      {labels.map((l, i) => {
        const active = ix >= milestones[i];
        return (
          <div key={l.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                active
                  ? "bg-brand text-brand-foreground"
                  : "bg-secondary text-ink-soft"
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-ink" : "text-ink-soft"
              )}
            >
              {l.label}
            </span>
            {i < labels.length - 1 && (
              <span
                className={cn(
                  "ml-1 h-px flex-1",
                  ix > milestones[i] ? "bg-brand/40" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailsForm(props: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  contactMethod: "email" | "phone";
  setContactMethod: (m: "email" | "phone") => void;
  city: string;
  setCity: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  valid: boolean;
  onSubmit: () => void;
}) {
  return (
    <Card title="Delivery details" subtitle="Where should the seller send your order?">
      <div className="space-y-4">
        <Field
          label="Full name"
          value={props.name}
          onChange={props.setName}
          placeholder="Jane Adekola"
        />

        {/* Contact method — chooses where we send the order link */}
        <div>
          <Label>How should we send your order link?</Label>
          <p className="mt-1 text-xs text-ink-soft">
            Your order link is your only way back to this order. We'll send it
            here so you can return any time.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["email", "phone"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => props.setContactMethod(m)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                  props.contactMethod === m
                    ? "border-brand bg-brand-soft text-brand-soft-foreground"
                    : "border-border bg-white text-ink-soft hover:text-ink"
                )}
              >
                {m === "email" ? "Email" : "SMS to phone"}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {props.contactMethod === "email" ? (
              <Field
                label="Email address"
                value={props.email}
                onChange={props.setEmail}
                placeholder="jane@example.com"
                type="email"
              />
            ) : (
              <Field
                label="WhatsApp number"
                value={props.phone}
                onChange={props.setPhone}
                placeholder="0803 555 0142"
                type="tel"
              />
            )}
          </div>
        </div>

        {/* The other contact field, optional, for the seller to reach them */}
        {props.contactMethod === "email" ? (
          <Field
            label="WhatsApp number (for delivery updates)"
            value={props.phone}
            onChange={props.setPhone}
            placeholder="0803 555 0142"
            type="tel"
          />
        ) : (
          <Field
            label="Email (optional, for backup)"
            value={props.email}
            onChange={props.setEmail}
            placeholder="jane@example.com"
            type="email"
          />
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr,1.5fr]">
          <div className="space-y-1.5">
            <Label htmlFor="checkout-city" className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" /> City (State)
            </Label>
            <Select value={props.city} onValueChange={props.setCity}>
              <SelectTrigger id="checkout-city" className="h-11">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {NIGERIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Delivery address"
            value={props.address}
            onChange={props.setAddress}
            placeholder="House / street / area"
          />
        </div>
        
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-3">
          <p className="flex items-center gap-2 text-[11px] font-medium text-amber-800">
            <Phone className="h-3.5 w-3.5" />
            WhatsApp number is mandatory for delivery updates.
          </p>
        </div>
      </div>

      <Button
        size="lg"
        disabled={!props.valid}
        onClick={props.onSubmit}
        className="mt-6 h-12 w-full rounded-lg bg-brand text-base font-semibold text-brand-foreground hover:bg-brand/90"
      >
        Continue to payment <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </Card>
  );
}

function Instructions({
  amount,
  payTo,
  expiresAt,
  onConfirm,
  pending,
  hasAccount,
  onIssueAccount,
  error,
}: {
  amount: number;
  payTo: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: string;
  };
  expiresAt: string;
  onConfirm: () => void;
  pending: boolean;
  /** True once createOrder has returned and we have real account details. */
  hasAccount: boolean;
  /** Issue the virtual account by calling createOrder. */
  onIssueAccount: () => void;
  error: string | null;
}) {
  const { toast } = useToast();
  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    toast({ title: "Copied" });
  };

  // Two sub-states inside the same panel:
  //   - !hasAccount → render an "Issue account" CTA. We haven't called
  //     createOrder yet, so there's no real bank account to show.
  //   - hasAccount  → render the bank details + "I've sent the transfer"
  if (!hasAccount) {
    return (
      <Card
        title="Pay to escrow"
        subtitle="Generate a unique bank account to send your payment to. It expires in 24 hours."
      >
        <div className="mt-1 rounded-xl border border-border bg-surface p-4 text-sm text-ink-soft">
          Your money is held in escrow — the seller cannot touch it until
          you confirm delivery.
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        <Button
          size="lg"
          onClick={onIssueAccount}
          disabled={pending}
          className="mt-5 h-12 w-full rounded-lg bg-brand text-base font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Issuing escrow account…
            </>
          ) : (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Continue to payment
            </>
          )}
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Transfer to escrow" subtitle="Send the exact amount. Your money is held safely until you confirm delivery.">
      <div className="mt-1 rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-amber-900">
        <p className="inline-flex items-center gap-1.5 text-xs">
          <Countdown targetIso={expiresAt} prefix="Account expires in" />
        </p>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        <PayRow label="Bank" value={payTo.bankName} onCopy={() => copy(payTo.bankName)} />
        <PayRow label="Account number" value={payTo.accountNumber} onCopy={() => copy(payTo.accountNumber)} highlight />
        <PayRow label="Account name" value={payTo.accountName} onCopy={() => copy(payTo.accountName)} />
        <PayRow
          label="Amount"
          value={formatNGN(amount)}
          onCopy={() => copy(String(amount))}
          highlight
        />
      </ul>

      <div className="mt-5 rounded-xl border border-emerald-200/60 bg-brand-soft/50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="text-xs leading-relaxed text-ink-soft">
            <p className="text-sm font-medium text-ink">
              This is a SafeSale escrow account
            </p>
            <p className="mt-1">
              The seller cannot access your money. It's released only when you
              confirm delivery — or refunded if anything goes wrong.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] italic text-ink-soft">
        Your payment is held in SafeSale escrow and only released when you
        confirm delivery — or refunded if anything goes wrong.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Button
        size="lg"
        onClick={onConfirm}
        disabled={pending}
        className="mt-5 h-12 w-full rounded-lg bg-brand text-base font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking…
          </>
        ) : (
          <>I've sent the transfer</>
        )}
      </Button>
      <p className="mt-2 text-center text-[11px] text-ink-soft">
        We usually detect bank transfers within 60 seconds.
      </p>
    </Card>
  );
}

function PayRow({
  label,
  value,
  onCopy,
  highlight,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5",
        highlight && "bg-surface-2/30"
      )}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">
          {label}
        </p>
        <p className="text-sm font-semibold text-ink tabular-nums">{value}</p>
      </div>
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft/40"
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </button>
    </li>
  );
}

function WaitingPayment({ amount, expiresAt }: { amount: number; expiresAt: string }) {
  return (
    <Card
      title="Waiting for your payment"
      subtitle="As soon as the transfer arrives, we'll lock it in escrow for your protection."
    >
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white px-6 py-10 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="mt-4 text-sm font-medium text-ink">Listening for your transfer…</p>
        <p className="mt-1 text-xs text-ink-soft">
          {formatNGN(amount)} expected
        </p>
        <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-ink-soft">
          <Countdown targetIso={expiresAt} prefix="Auto-cancels in" />
        </div>
      </div>
    </Card>
  );
}

function Detected({ amount }: { amount: number }) {
  return (
    <Card title="Payment detected" subtitle="Verifying & moving into escrow…">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200/70 bg-brand-soft/50 px-6 py-10 text-center">
        <span className="relative inline-flex">
          <span className="absolute inset-0 rounded-full bg-brand/20 animate-lock-pulse" />
          <CheckCircle2 className="relative h-12 w-12 text-brand" />
        </span>
        <p className="mt-4 text-base font-semibold text-ink">
          {formatNGN(amount)} received
        </p>
        <p className="mt-1 text-sm text-ink-soft">Locking it in escrow now…</p>
      </div>
    </Card>
  );
}

function Secured({
  amount,
  orderToken,
  contactMethod,
  contactValue,
  onContinue,
}: {
  amount: number;
  orderToken: string;
  contactMethod: "email" | "phone";
  contactValue: string;
  onContinue: () => void;
}) {
  const { toast } = useToast();
  const orderLink = `safesale.app/order/${orderToken}`;
  return (
    <div className="space-y-4 animate-slide-up">
      <div className="rounded-2xl border border-emerald-200/60 bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,42,30,0.15)]">
        <EscrowShield
          amount={formatNGN(amount)}
          caption="Your seller has been notified and is preparing your order."
        />
      </div>

      {/* SAVE YOUR LINK — the critical bit. Without this URL the buyer
          has no way back to their escrow. Per PRD, the link is
          *displayed on screen with a clear instruction to bookmark or
          screenshot it*; email/SMS delivery is a future backend job
          (Termii + Resend), not promised here until it's actually wired. */}
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Bookmark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              Save your order link now
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              This is your only way back to this order — you don't have an
              account. <span className="font-medium text-ink">Bookmark it, screenshot it, or copy it to your{" "}
              {contactMethod === "email" ? "email drafts" : "WhatsApp chat"}</span>
              {contactValue && (
                <>
                  {" "}({contactValue})
                </>
              )}{" "}
              before leaving this page.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center rounded-lg border border-amber-200 bg-white overflow-hidden">
          <div className="flex flex-1 items-center gap-2 px-3 py-2.5 font-mono text-xs text-ink min-w-0 break-all">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
            <span className="break-all select-all">{orderLink}</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(orderLink);
              toast({ title: "Order link copied" });
            }}
            className="inline-flex items-center justify-center gap-1 border-t sm:border-t-0 sm:border-l border-amber-200 px-4 py-2.5 sm:py-0 text-xs font-semibold text-amber-800 hover:bg-amber-100/60 transition-colors bg-amber-50/40 sm:bg-transparent shrink-0"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Link
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <SaveAction icon={Copy} label="Copy the link" />
          <SaveAction icon={Bookmark} label="Bookmark this page" />
          <SaveAction icon={ImageDown} label="Screenshot it" />
        </div>
      </div>

      {/* What happens next */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-sm font-semibold text-ink">What happens next?</p>
        <ol className="mt-3 space-y-2 text-sm text-ink-soft">
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Money is held safely — seller can't touch it yet.</span>
          </li>
          <li className="flex items-start gap-2">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Seller ships your order with a tracking number.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>You confirm delivery — seller gets paid in seconds.</span>
          </li>
        </ol>
      </div>

      <Button
        onClick={onContinue}
        size="lg"
        className="h-12 w-full rounded-lg bg-brand text-base font-semibold text-brand-foreground hover:bg-brand/90"
      >
        Open my order page <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function SaveAction({
  icon: Icon,
  label,
  done,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  done?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border bg-white px-2 py-2 text-center",
        done ? "border-emerald-200 bg-brand-soft/40" : "border-amber-200"
      )}
    >
      <Icon className={cn("h-4 w-4", done ? "text-brand" : "text-amber-700")} />
      <span className={cn("text-[10px] font-medium", done ? "text-brand-soft-foreground" : "text-ink")}>
        {label}
      </span>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_24px_-16px_rgba(15,42,30,0.12)] animate-slide-up">
      <h2 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="mt-1.5 h-11"
      />
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        sub && "text-xs text-ink-soft"
      )}
    >
      <span className={sub ? "text-xs text-ink-soft" : "text-sm text-ink-soft"}>{k}</span>
      <span className={cn("tabular-nums", sub ? "text-xs text-ink-soft" : "text-sm font-medium text-ink")}>
        {v}
      </span>
    </div>
  );
}

function Footnote() {
  return (
    <p className="px-1 text-[11px] leading-relaxed text-ink-soft">
      Need help? Message{" "}
      <a href="#" className="text-brand hover:underline">
        SafeSale support
      </a>{" "}
      any time. Our team responds within minutes.
    </p>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Skeleton className="h-4 w-12" />
          <Logo />
          <Skeleton className="h-4 w-14" />
        </div>
      </header>
      <main className="container max-w-2xl pb-12 pt-6">
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-5">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
          <aside className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </aside>
        </div>
      </main>
    </div>
  );
}


