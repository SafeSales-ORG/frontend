import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { NIGERIAN_BANKS } from "@/lib/nigeria";
import { cn } from "@/lib/utils";

const ACCOUNT_DIGITS = 10;

export interface CreatedSeller {
  id: string;
  npub: string;
  handle: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
}

/** Turn "Amaka's Boutique" into "amakas_boutique". */
function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

/** Mirrors the backend: 3–30 chars of a–z, 0–9 and underscores. */
function isHandleValid(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle);
}

export function ShopDetailsForm({
  npub,
  prefillName,
  prefillAvatar,
  onSuccess,
}: {
  npub: string;
  prefillName: string;
  prefillAvatar?: string;
  onSuccess: (seller: CreatedSeller) => void;
}) {
  const [shopName, setShopName] = useState(prefillName);
  const [handle, setHandle] = useState(suggestHandle(prefillName));
  const [handleEdited, setHandleEdited] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), handle: useId(), bank: useId(), account: useId() };

  const valid =
    shopName.trim().length >= 2 &&
    isHandleValid(handle) &&
    bankCode !== "" &&
    accountNumber.length === ACCOUNT_DIGITS;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { seller } = await apiClient.createSeller({
        npub,
        handle,
        name: shopName.trim(),
        bankCode,
        bankAccountNumber: accountNumber,
        location: "Nigeria",
        category: "General",
        avatarUrl: prefillAvatar,
      });
      onSuccess(seller);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409 && /handle/i.test(err.message)
          ? `@${handle} is already taken. Try adding your city or a number, like @${handle}_lagos.`
          : err instanceof ApiError && err.code === "BACKEND_UNREACHABLE"
          ? "We couldn't reach SafeSale. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "We couldn't create your shop. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <Label htmlFor={ids.name}>Shop name</Label>
        <Input
          id={ids.name}
          className="mt-1.5"
          value={shopName}
          onChange={(e) => {
            setShopName(e.target.value);
            if (!handleEdited) setHandle(suggestHandle(e.target.value));
          }}
          placeholder="e.g. Amaka's Boutique"
          autoComplete="organization"
        />
      </div>

      <div>
        <Label htmlFor={ids.handle}>Shop handle</Label>
        <div className="relative mt-1.5">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute">
            @
          </span>
          <Input
            id={ids.handle}
            value={handle}
            onChange={(e) => {
              setHandleEdited(true);
              setHandle(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 30));
            }}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="yourshop"
            className="pr-10 pl-8"
          />
          {handle.length > 0 && isHandleValid(handle) && (
            <Check className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-brand" aria-hidden />
          )}
        </div>
        <p className="mt-1.5 text-sm text-mute">Letters, numbers and underscores. Buyers see this.</p>
      </div>

      <div className="rounded-lg bg-canvas-soft p-4">
        <p className="font-semibold text-ink">Where should we pay you?</p>
        <p className="mt-1 text-sm text-body">Money from completed orders goes to this account.</p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor={ids.bank}>Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger id={ids.bank} className="mt-1.5 w-full">
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {NIGERIAN_BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor={ids.account}>Account number</Label>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  accountNumber.length === ACCOUNT_DIGITS ? "text-brand" : "text-mute",
                )}
              >
                {accountNumber.length}/{ACCOUNT_DIGITS}
              </span>
            </div>
            <Input
              id={ids.account}
              className="mt-1.5 tabular-nums tracking-wider"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, ACCOUNT_DIGITS))}
              placeholder="0123456789"
            />
          </div>

          <p className="flex items-start gap-2 text-sm text-body">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            We confirm the account name with your bank before saving it.
          </p>
        </div>
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

      <Button type="submit" size="lg" className="w-full" disabled={!valid || saving}>
        {saving ? (
          <>
            <Loader2 className="animate-spin" /> Checking your account…
          </>
        ) : (
          "Open my shop"
        )}
      </Button>
    </form>
  );
}
