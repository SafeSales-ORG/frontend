import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { ArrowSquareOut, MagnifyingGlass, SealCheck, Storefront } from "@phosphor-icons/react";

import { AdminShell } from "@/components/safesale/AdminShell";
import { Avatar } from "@/components/safesale/Avatar";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { Stagger, StaggerItem } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api";
import { formatNGN, formatRelative } from "@/lib/format";

export default function AdminSellers() {
  useSeoMeta({ title: "Sellers — SafeSale admin" });
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["safesale", "admin", "sellers"],
    queryFn: () => apiClient.getAdminSellers(),
    refetchInterval: 30_000,
  });
  const needle = q.trim().toLowerCase();
  const sellers = (data?.sellers ?? []).filter(
    (s) => !needle || [s.name, s.handle, s.email ?? ""].some((v) => v.toLowerCase().includes(needle)),
  );

  return (
    <AdminShell title="Sellers" subtitle="Every shop on SafeSale and how it's doing">
      <div className="space-y-5">
        <div className="relative rounded-2xl bg-canvas p-4">
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-7.5 -translate-y-1/2 text-mute" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops by name, @handle or email" className="pl-10" aria-label="Search sellers" />
        </div>

        {isLoading ? (
          <Skeleton className="h-80 rounded-2xl" />
        ) : sellers.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-canvas p-10 text-center">
            <BrandIcon icon={Storefront} tone="neutral" size="lg" />
            <p className="mt-4 font-semibold text-ink">No shops found</p>
          </div>
        ) : (
          <Stagger as="ul" className="grid gap-4 md:grid-cols-2">
            {sellers.map((s) => (
              <StaggerItem as="li" key={s.id} lift className="rounded-2xl bg-canvas p-5">
                <div className="flex items-start gap-3">
                  <Avatar seed={s.id} name={s.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                      {s.name}
                      {s.verified && <SealCheck size={16} weight="fill" className="shrink-0 text-brand" aria-label="Verified" />}
                    </p>
                    <p className="truncate text-sm text-mute">
                      @{s.handle}
                      {s.email && ` · ${s.email}`}
                    </p>
                  </div>
                  <Link
                    to={`/s/${s.handle}`}
                    target="_blank"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas-soft text-body hover:text-ink"
                    aria-label={`Open ${s.name}'s shop`}
                  >
                    <ArrowSquareOut size={16} />
                  </Link>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <Stat label="Listings" value={String(s.listings)} />
                  <Stat label="Orders" value={String(s.orders)} />
                  <Stat label="Disputes" value={String(s.disputes)} warn={s.disputes > 0} />
                  <Stat label="Held now" value={formatNGN(s.heldNGN)} />
                  <Stat label="Paid out" value={formatNGN(s.paidOutNGN)} />
                  <Stat
                    label="Payout bank"
                    value={s.accountNumberLast4 ? `${s.bankName ?? "Bank"} ••${s.accountNumberLast4.slice(-2)}` : "Not in demo"}
                  />
                </dl>
                <p className="mt-4 text-xs text-mute">Joined {formatRelative(s.createdAt)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-canvas-soft px-3 py-2">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={warn ? "truncate font-semibold text-warning tabular-nums" : "truncate font-semibold text-ink tabular-nums"}>{value}</dd>
    </div>
  );
}
