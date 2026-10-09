import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import type { SellerPayout } from "@/lib/api/types";
import { NIGERIAN_BANKS, bankNameFromCode } from "@/lib/nigeria";
import { MY_SELLER_KEY, useMySeller } from "@/hooks/useMySeller";

/** Where payouts go (bank + last 4 digits), with a dialog to change it. */
export function PayoutAccountCard() {
  const { data, isLoading } = useMySeller();
  const [editing, setEditing] = useState(false);
  const payout = data?.payout;
  const hasAccount = !!payout?.bankCode;

  return (
    <div className="rounded-xl bg-canvas p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-pale text-brand">
            <Landmark className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-mute">Payouts go to</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-5 w-40" />
            ) : hasAccount ? (
              <p className="font-semibold text-ink">
                {payout.bankName ?? bankNameFromCode(payout.bankCode)} ••••{payout.accountNumberLast4}
              </p>
            ) : (
              <p className="font-semibold text-ink">No account added</p>
            )}
            {payout?.accountName && <p className="text-sm text-body">{payout.accountName}</p>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={isLoading}>
          <Pencil /> {hasAccount ? "Change" : "Add"}
        </Button>
      </div>
      {editing && <PayoutDialog current={payout} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PayoutDialog({ current, onClose }: { current?: SellerPayout; onClose: () => void }) {
  const [bankCode, setBankCode] = useState(current?.bankCode ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: () => apiClient.updatePayout({ bankCode, bankAccountNumber: accountNumber }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_SELLER_KEY });
      toast({ title: "Payout account updated" });
      onClose();
    },
  });
  const error =
    save.error instanceof ApiError || save.error instanceof Error ? save.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payout account</DialogTitle>
          <DialogDescription>We'll check the account name with your bank before saving it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (bankCode && accountNumber.length === 10) save.mutate();
          }}
        >
          <div>
            <Label htmlFor="payout-bank">Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger id="payout-bank" className="mt-1.5 w-full">
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
            <Label htmlFor="payout-account">Account number</Label>
            <Input
              id="payout-account"
              inputMode="numeric"
              className="mt-1.5 tabular-nums tracking-wider"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 digits"
            />
          </div>
          {error && <p className="rounded-md bg-negative-pale px-3.5 py-2.5 text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!bankCode || accountNumber.length !== 10 || save.isPending}>
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Checking…
                </>
              ) : (
                "Save account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
