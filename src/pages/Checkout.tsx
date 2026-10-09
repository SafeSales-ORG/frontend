import { useSeoMeta } from "@unhead/react";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/safesale/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/safesale/Avatar";
import { EscrowShield } from "@/components/safesale/EscrowShield";
import { useListing } from "@/hooks/useListing";
import { getSeller as getFixtureSeller } from "@/lib/mock";
import {
  apiClient,
  ApiError,
  type ApiOrder,
  type GetOrderResponse,
} from "@/lib/api";
import { formatNGN } from "@/lib/format";
import { useToast } from "@/hooks/useToast";
import {
  ShieldCheck,
  ChevronLeft,
  Copy,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Lock,
  Link2 as LinkIcon,
  MapPin,
  Bookmark,
  Truck,
  Landmark,
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
import { celebrate } from "@/lib/celebrate";

type Step = "details" | "instructions" | "waiting" | "detected" | "secured";

export default function Checkout() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: listing, isLoading: listingLoading } = useListing(id);
  const sellerPubkey = listing?.sellerPubkey;
  const fixtureSeller = sellerPubkey ? getFixtureSeller(sellerPubkey) : undefined;
  const sellerName = listing?.sellerName ?? fixtureSeller?.name ?? "Seller";
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
   * `POST /api/orders` — orderToken + Nomba bank-transfer (pay-in)
   * details flattened from the response's `payIn` object.
   */
  const [createdOrder, setCreatedOrder] = useState<{
    orderToken: string;
    shortId: string;
    accountNumber: string;
    bankName: string;
    accountName: string;
    payInError: string | null;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Poll the order's current state once we have a token. The mock
  // client transitions pending_payment → paid ~5s after
  // createOrder, simulating the Nomba webhook landing.
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
        celebrate();
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

  // Email receives the order link; the phone number is for the seller's delivery.
  const contactValid = /.+@.+\..+/.test(email) && phone.replace(/\D/g, "").length >= 10;

  const valid =
    name.trim().length > 1 &&
    contactValid &&
    address.trim().length > 4 &&
    city.trim().length > 1;

  // Shown briefly before createOrder returns the real pay-in account.
  const placeholderPayTo = { accountNumber: "—", bankName: "—", accountName: "SafeSale Escrow" };

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
  //  Sends the buyer's name / phone / city / address to the backend
  //  (see backend `routes/orders.ts::CreateOrderSchema`) and stores the
  //  returned orderToken + pay-in bank details for the Instructions step.
  // ------------------------------------------------------------------

  const handleIssueAccount = async () => {
    if (creating || createdOrder) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiClient.createOrder({
        listingId: listing.id,
        buyerName: name.trim(),
        buyerPhone: phone.trim(),
        buyerEmail: email.trim() || undefined,
        buyerCity: city.trim(),
        buyerAddress: address.trim() || undefined,
        contactMethod: "email",
        variant: listing.tags?.[0],
        // Bridge: hand the mock client the listing data so it can
        // accept orders for listings it didn't ship with as fixtures
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

      setCreatedOrder({
        orderToken: res.orderToken,
        shortId: res.shortId,
        accountNumber: res.payIn?.bankAccountNumber ?? "—",
        bankName: res.payIn?.bankName ?? "—",
        accountName: res.payIn?.bankAccountName ?? "SafeSale Escrow",
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
  //  In production the payment provider's webhook marks the order paid;
  //  apiClient.confirmPayment just re-reads it (or, on a staging backend
  //  with simulation on, marks it paid). Either way the polling effect
  //  advances waiting → detected → secured once status leaves
  //  pending_payment. Retries ride out transient network errors.
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
        const { order } = await apiClient.confirmPayment(createdOrder.orderToken);
        await queryClient.invalidateQueries({
          queryKey: ["safesale", "order", createdOrder.orderToken],
        });
        if (order.status !== "pending_payment") {
          toast({ title: "Payment received. Your money is held in escrow." });
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
  // real mode Nomba issues them; in mock mode the mock client makes
  // them up. Either way they're per-order and survive across polls.
  const payTo = createdOrder
    ? {
        accountNumber: createdOrder.accountNumber,
        bankName: createdOrder.bankName,
        accountName: createdOrder.accountName,
      }
    : placeholderPayTo;

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
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft-foreground">
            <ShieldCheck className="h-3 w-3" />
            Secure
          </span>
        </div>
      </header>

      <main className="container max-w-5xl pt-6 pb-16">
        <StepBar step={step} />

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="space-y-5"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          >
            {step === "details" && (
              <DetailsForm
                name={name}
                setName={setName}
                phone={phone}
                setPhone={setPhone}
                email={email}
                setEmail={setEmail}
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
                onConfirm={handleConfirmTransferSent}
                pending={creating}
                hasAccount={!!createdOrder}
                onIssueAccount={handleIssueAccount}
                error={createError}
              />
            )}
            {step === "waiting" && (
              <WaitingPayment amount={total} />
            )}
            {step === "detected" && <Detected amount={total} />}
            {step === "secured" && createdOrder && (
              <Secured
                amount={total}
                orderToken={createdOrder.orderToken}
                contactValue={email}
                onContinue={() => navigate(`/order/${createdOrder.orderToken}`)}
              />
            )}
          </motion.div>
          </AnimatePresence>

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
              <p className="mt-2 text-xs text-ink-soft">
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
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-foreground">
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
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
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

        <Field
          label="Email address"
          hint="We'll send your private order link here after you pay."
          value={props.email}
          onChange={props.setEmail}
          placeholder="jane@example.com"
          type="email"
        />
        <Field
          label="Phone number"
          hint="The seller uses this to arrange delivery."
          value={props.phone}
          onChange={props.setPhone}
          placeholder="0803 555 0142"
          type="tel"
        />

        <div className="grid gap-4">
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
  };
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
        subtitle="We'll give you bank details for this order only. Transfer the exact amount to them."
      >
        <div className="mt-1 rounded-xl border border-border bg-surface p-4 text-sm text-ink-soft">
          Your money is held in escrow — the seller cannot touch it until
          you confirm delivery.
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-negative/25 bg-negative-pale p-3 text-sm text-negative">
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
      <ul className="mt-2 space-y-2 text-sm">
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

      <div className="mt-5 flex items-start gap-3 rounded-lg bg-brand-pale p-4 text-brand-ink">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">This account belongs to SafeSale, not the seller</p>
          <p className="mt-1">
            The seller can't touch your money. It's released when you confirm delivery. If something is
            wrong, report it first and a mediator decides.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-negative/25 bg-negative-pale p-3 text-sm text-negative">
          {error}
        </div>
      )}

      <Button size="lg" onClick={onConfirm} disabled={pending} className="mt-5 w-full">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking…
          </>
        ) : (
          <>I've sent the transfer</>
        )}
      </Button>
      <p className="mt-2 text-center text-xs text-ink-soft">
        This page updates as soon as your transfer arrives.
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
        "flex items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2.5",
        highlight && "bg-surface-2/30"
      )}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
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

function WaitingPayment({ amount }: { amount: number }) {
  return (
    <Card
      title="Waiting for your payment"
      subtitle="As soon as the transfer arrives, we'll lock it in escrow for your protection."
    >
      <div className="flex flex-col items-center justify-center rounded-lg bg-canvas-soft px-6 py-12 text-center">
        <div className="relative grid h-20 w-20 place-items-center">
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-brand"
              initial={{ scale: 0.6, opacity: 0.6 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
            />
          ))}
          <span className="grid h-14 w-14 place-items-center rounded-full bg-forest text-mint">
            <Landmark className="h-6 w-6" aria-hidden />
          </span>
        </div>
        <p className="mt-5 font-semibold text-ink">Listening for your transfer…</p>
        <p className="mt-1 text-sm text-body tabular-nums">{formatNGN(amount)} expected</p>
      </div>
    </Card>
  );
}

function Detected({ amount }: { amount: number }) {
  return (
    <Card title="Payment detected" subtitle="Moving it into escrow…">
      <div className="flex flex-col items-center justify-center rounded-lg bg-brand-pale px-6 py-12 text-center">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          className="grid h-14 w-14 place-items-center rounded-full bg-forest text-mint"
        >
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </motion.span>
        <p className="mt-5 text-h3 text-ink tabular-nums">{formatNGN(amount)} received</p>
        <p className="mt-1 text-sm text-body">Locking it in escrow now…</p>
      </div>
    </Card>
  );
}

function Secured({
  amount,
  orderToken,
  contactValue,
  onContinue,
}: {
  amount: number;
  orderToken: string;
  contactValue: string;
  onContinue: () => void;
}) {
  const { toast } = useToast();
  const orderLink = `${window.location.origin}/order/${orderToken}`;
  return (
    <div className="space-y-4 ">
      <div>
        <EscrowShield
          amount={formatNGN(amount)}
          caption="The seller can now see your payment and ship your order."
        />
      </div>

      {/* The buyer has no account: this link is their only way back. It's
          also emailed, but we still ask them to save it here. */}
      <div className="rounded-2xl border border-warning/25 bg-warning-pale p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-pale text-warning">
            <Bookmark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              Save your order link now
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              It's your only way back to this order. We've also emailed it
              {contactValue ? <> to <span className="font-medium text-ink">{contactValue}</span></> : null}, but
              bookmark or copy it before you leave this page.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center rounded-lg border border-warning/25 bg-canvas overflow-hidden">
          <div className="flex flex-1 items-center gap-2 px-3 py-2.5 font-mono text-xs text-ink min-w-0 break-all">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
            <span className="break-all select-all">{orderLink}</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(orderLink);
              toast({ title: "Order link copied" });
            }}
            className="inline-flex items-center justify-center gap-1 border-t sm:border-t-0 sm:border-l border-warning/25 px-4 py-2.5 sm:py-0 text-xs font-semibold text-warning hover:bg-warning-pale transition-colors bg-warning-pale sm:bg-transparent shrink-0"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Link
          </button>
        </div>

      </div>

      {/* What happens next */}
      <div className="rounded-lg bg-canvas p-5">
        <p className="font-semibold text-ink">What happens next</p>
        <ol className="mt-3 space-y-2 text-sm text-ink-soft">
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Money is held safely — seller can't touch it yet.</span>
          </li>
          <li className="flex items-start gap-2">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>The seller ships your order. You'll see tracking on your order page if they add it.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>You confirm it arrived and the seller is paid. If it doesn't, report a problem first.</span>
          </li>
        </ol>
      </div>

      <Button onClick={onContinue} size="lg" className="w-full">
        Open my order page <ArrowRight />
      </Button>
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
    <div className="rounded-2xl border border-border bg-canvas p-5 ">
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
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-mute">
          {hint}
        </p>
      )}
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
  const support = import.meta.env.VITE_SUPPORT_EMAIL;
  if (!support) return null;
  return (
    <p className="px-1 text-sm text-mute">
      Questions about paying?{" "}
      <a href={`mailto:${support}`} className="font-medium text-brand hover:underline">
        Email SafeSale support
      </a>
      .
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
      <main className="container max-w-5xl pt-6 pb-16">
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
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


