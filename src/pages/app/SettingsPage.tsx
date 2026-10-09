/**
 * Seller settings — `/app/settings`: shop profile, payout account, account.
 */

import { useSeoMeta } from "@unhead/react";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Copy, Loader2, LogOut } from "lucide-react";

import { AppShell } from "@/components/safesale/AppShell";
import { Avatar } from "@/components/safesale/Avatar";
import { PayoutAccountCard } from "@/components/dashboard/PayoutAccountCard";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentSeller } from "@/hooks/useCurrentSeller";
import { MY_SELLER_KEY, useMySeller } from "@/hooks/useMySeller";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { apiClient } from "@/lib/api";
import type { ApiSeller } from "@/lib/api/types";
import { displayUrl, shopUrl } from "@/lib/links";
import { sanitizeUrl } from "@/lib/utils";

export default function SettingsPage() {
  useSeoMeta({ title: "Settings — SafeSale" });
  const { data, isLoading } = useMySeller();
  const { user, logout } = useAuth();

  return (
    <AppShell title="Settings" subtitle="Your shop, your payouts and your account">
      <Stagger className="mx-auto max-w-3xl space-y-6">
        <StaggerItem>
          <Section title="Shop profile" description="This is what buyers see on your shop and product pages.">
            {isLoading || !data ? <ProfileSkeleton /> : <ShopProfileForm seller={data.seller} />}
          </Section>
        </StaggerItem>

        <StaggerItem>
          <Section title="Payouts" description="Money from completed orders is paid here automatically.">
            <PayoutAccountCard />
          </Section>
        </StaggerItem>

        <StaggerItem>
          <Section title="Account">
            <div className="flex flex-col gap-4 rounded-xl bg-canvas p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-mute">Signed in as</p>
                <p className="font-semibold text-ink">{user?.email ?? "—"}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  logout();
                  window.location.assign("/");
                }}
              >
                <LogOut /> Log out
              </Button>
            </div>
          </Section>
        </StaggerItem>
      </Stagger>
    </AppShell>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-sans text-h3 text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-body">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ShopProfileForm({ seller }: { seller: ApiSeller }) {
  const [name, setName] = useState(seller.name);
  const [bio, setBio] = useState(seller.bio ?? "");
  const [delivery, setDelivery] = useState(seller.delivery ?? "");
  const [avatar, setAvatar] = useState<string | null>(seller.avatarUrl ?? null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: upload, isPending: uploading } = useUploadFile();
  const [currentSeller, setCurrentSeller] = useCurrentSeller();
  const qc = useQueryClient();
  const { toast } = useToast();

  const initialDelivery = seller.delivery ?? "";
  const dirty =
    name.trim() !== seller.name ||
    bio !== (seller.bio ?? "") ||
    delivery !== initialDelivery ||
    avatar !== (seller.avatarUrl ?? null);

  const save = useMutation({
    mutationFn: () =>
      apiClient.updateShopProfile({
        name: name.trim(),
        bio: bio.trim(),
        delivery: delivery.trim(),
        ...(avatar && avatar !== seller.avatarUrl && { avatar }),
      }),
    onSuccess: ({ seller: updated }) => {
      if (currentSeller) {
        setCurrentSeller({ ...currentSeller, name: updated.name, avatarUrl: updated.avatarUrl ?? currentSeller.avatarUrl });
      }
      void qc.invalidateQueries({ queryKey: MY_SELLER_KEY });
      void qc.invalidateQueries({ queryKey: ["safesale", "shop"] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      toast({ title: "Shop profile saved" });
    },
    onError: (err) => toast({ title: "Couldn't save", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" }),
  });

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const tags = await upload(file);
      const url = tags.find((t) => t[0] === "url")?.[1];
      if (url) setAvatar(url);
    } catch (err) {
      toast({ title: "Couldn't use that photo", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const link = shopUrl(seller.handle);

  return (
    <form
      className="rounded-xl bg-canvas p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && name.trim().length >= 2) save.mutate();
      }}
    >
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative shrink-0 rounded-full"
          aria-label="Change shop photo"
        >
          {avatar ? (
            <img src={sanitizeUrl(avatar) ?? undefined} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <Avatar seed={seller.npub} name={name} size={80} />
          )}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-forest/60 text-canvas opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPickPhoto(e.target.files?.[0])} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">@{seller.handle}</p>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => toast({ title: "Shop link copied" }))}
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-brand hover:underline"
          >
            <span className="truncate">{displayUrl(link)}</span>
            <Copy className="h-3.5 w-3.5 shrink-0" />
          </button>
          <p className="mt-1 text-xs text-mute">Your handle can't be changed.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <div>
          <Label htmlFor="shop-name">Shop name</Label>
          <Input id="shop-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} maxLength={140} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="shop-bio">About your shop</Label>
            <span className="text-xs text-mute tabular-nums">{bio.length}/300</span>
          </div>
          <Textarea
            id="shop-bio"
            className="mt-1.5 min-h-24"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 300))}
            placeholder="What you sell, where you're based, how you ship."
          />
        </div>
        <div>
          <Label htmlFor="shop-delivery">Delivery</Label>
          <Input
            id="shop-delivery"
            className="mt-1.5"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value.slice(0, 140))}
            placeholder="e.g. Lagos same-day · Nationwide 2–4 days"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={!dirty || name.trim().length < 2 || save.isPending}>
          <AnimatePresence mode="wait" initial={false}>
            {save.isPending ? (
              <motion.span key="saving" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Loader2 className="animate-spin" /> Saving…
              </motion.span>
            ) : saved ? (
              <motion.span key="saved" className="inline-flex items-center gap-2" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <Check /> Saved
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                Save changes
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 rounded-xl bg-canvas p-6">
      <div className="flex items-center gap-5">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
