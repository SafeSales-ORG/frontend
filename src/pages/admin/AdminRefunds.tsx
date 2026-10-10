import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { ArrowUUpLeft, ChatsCircle, CheckCircle, EnvelopeSimple, Phone } from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";

import { AdminShell } from "@/components/safesale/AdminShell";
import { BrandIcon } from "@/components/safesale/BrandIcon";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import type { AdminRefund } from "@/lib/api/types";
import { formatDate, formatNGN } from "@/lib/format";

export default function AdminRefunds() {
  useSeoMeta({ title: "Refunds — SafeSale admin" });
  const [paying, setPaying] = useState<AdminRefund | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["safesale", "admin", "refunds"],
    queryFn: () => apiClient.getAdminRefunds(),
    refetchInterval: 30_000,
  });
  const refunds = data?.refunds ?? [];
  const owed = refunds.filter((r) => r.status !== "succeeded");
  const done = refunds.filter((r) => r.status === "succeeded");

  return (
    <AdminShell title="Refunds to pay" subtitle="Money owed back to buyers after a dispute">
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-2xl bg-canvas p-5 text-sm text-body">
          <BrandIcon icon={ArrowUUpLeft} tone="pale" size="sm" />
          <p>
            Buyers don't give bank details at checkout, so refunds are sent by hand. Ask the buyer for their account (call,
            email or the case chat), send the transfer, then record its reference here. The buyer and seller see a note in the case chat.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-60 rounded-2xl" />
        ) : (
          <>
            <section>
              <h2 className="mb-3 font-semibold text-ink">
                To send <span className="text-mute tabular-nums">· {owed.length}</span>
              </h2>
              {owed.length === 0 ? (
                <p className="rounded-2xl bg-brand-pale p-5 text-sm text-brand-ink">No refunds waiting. Every buyer has been paid back.</p>
              ) : (
                <Stagger as="ul" className="space-y-3">
                  {owed.map((r) => (
                    <StaggerItem as="li" key={r.id}>
                      <RefundCard refund={r} onPay={() => setPaying(r)} />
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </section>

            {done.length > 0 && (
              <section>
                <h2 className="mb-3 font-semibold text-ink">
                  Sent <span className="text-mute tabular-nums">· {done.length}</span>
                </h2>
                <ul className="space-y-3">
                  {done.map((r) => (
                    <li key={r.id}>
                      <RefundCard refund={r} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <MarkPaidDialog refund={paying} onClose={() => setPaying(null)} />
    </AdminShell>
  );
}

function RefundCard({ refund: r, onPay }: { refund: AdminRefund; onPay?: () => void }) {
  const sent = r.status === "succeeded";
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-canvas p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-display text-h2 text-ink tabular-nums">{formatNGN(r.amountNGN)}</p>
          <p className="text-sm text-mute">
            to <span className="font-semibold text-ink">{r.order.buyerName}</span> · order {r.order.shortId} from {r.order.sellerName}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {r.order.buyerPhone && (
            <a href={`tel:${r.order.buyerPhone}`} className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-3 py-1 text-body hover:text-ink">
              <Phone size={14} /> {r.order.buyerPhone}
            </a>
          )}
          {r.order.buyerEmail && (
            <a href={`mailto:${r.order.buyerEmail}`} className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-3 py-1 text-body hover:text-ink">
              <EnvelopeSimple size={14} /> {r.order.buyerEmail}
            </a>
          )}
          {r.order.disputeId && (
            <Link to={`/admin/disputes?case=${r.order.disputeId}`} className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-3 py-1 text-body hover:text-ink">
              <ChatsCircle size={14} /> Case chat
            </Link>
          )}
        </div>
      </div>
      {sent ? (
        <p className="flex items-center gap-2 text-sm text-brand-ink">
          <CheckCircle size={20} weight="fill" className="text-brand" />
          <span>
            Sent {r.paidAt ? formatDate(r.paidAt) : ""}
            {r.reference && <span className="block text-xs text-mute">Ref {r.reference}</span>}
          </span>
        </p>
      ) : (
        <Button onClick={onPay} className="shrink-0">
          I've sent it
        </Button>
      )}
    </div>
  );
}

function MarkPaidDialog({ refund, onClose }: { refund: AdminRefund | null; onClose: () => void }) {
  const [reference, setReference] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: () => apiClient.markRefundPaid(refund!.id, reference.trim()),
    onSuccess: () => {
      toast({ title: "Refund recorded", description: `${refund!.order.buyerName} can see it in the case chat.` });
      void qc.invalidateQueries({ queryKey: ["safesale"] });
      setReference("");
      onClose();
    },
    onError: (err) =>
      toast({ title: "Couldn't record it", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" }),
  });

  return (
    <Dialog open={!!refund} onOpenChange={(o) => !o && !mark.isPending && onClose()}>
      <DialogContent className="max-w-md">
        {refund && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reference.trim().length >= 3) mark.mutate();
            }}
          >
            <DialogTitle className="font-display text-h2 text-ink">Record the refund</DialogTitle>
            <DialogDescription className="mt-1 text-body">
              {formatNGN(refund.amountNGN)} to {refund.order.buyerName}. Only do this after the transfer has gone through.
            </DialogDescription>
            <Label htmlFor="refund-ref" className="mt-5 block">
              Transfer reference
            </Label>
            <Input
              id="refund-ref"
              className="mt-1.5"
              value={reference}
              onChange={(e) => setReference(e.target.value.slice(0, 120))}
              placeholder="e.g. the session ID from your bank app"
              autoFocus
            />
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={mark.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={reference.trim().length < 3 || mark.isPending}>
                {mark.isPending ? <Loader2 className="animate-spin" /> : "Record refund"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
