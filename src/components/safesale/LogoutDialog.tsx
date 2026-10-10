import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";

import { Avatar } from "./Avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

/** Confirm-and-sign-out dialog shared by the seller dashboard and the admin console. */
export function LogoutDialog({
  open,
  onOpenChange,
  name,
  avatarSeed,
  avatarUrl,
  reassurance = "Your shop stays open while you're away. Buyers can still pay, and their money stays protected.",
  farewell = "Your shop is still open.",
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  avatarSeed: string;
  avatarUrl: string | null;
  /** Shown in the dialog: what keeps working while they're signed out. */
  reassurance?: string;
  /** Second sentence of the goodbye toast. */
  farewell?: string;
  /** Dialog heading; defaults to "Log out, {first name}?". */
  title?: string;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leaving, setLeaving] = useState(false);
  const firstName = name.split(" ")[0];

  const confirm = () => {
    setLeaving(true);
    window.setTimeout(() => {
      logout();
      onOpenChange(false);
      setLeaving(false);
      navigate("/");
      toast({ title: "You're signed out", description: title ? farewell : `See you soon, ${firstName}. ${farewell}` });
    }, 700);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !leaving && onOpenChange(o)}>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <div className="flex flex-col items-center bg-mint px-6 pt-8 pb-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="rounded-full ring-4 ring-canvas"
          >
            <Avatar seed={avatarSeed} name={name} size={64} src={avatarUrl} />
          </motion.div>
          <DialogTitle className="mt-4 font-display text-h2 text-forest">{title ?? `Log out, ${firstName}?`}</DialogTitle>
          <DialogDescription className="mt-2 text-forest/80">
            You'll need your email and password (or Google) to come back.
          </DialogDescription>
        </div>
        <div className="space-y-4 p-6">
          <p className="flex items-start gap-3 rounded-lg bg-canvas-soft p-3 text-sm text-body">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            {reassurance}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={leaving}>
              Stay signed in
            </Button>
            <Button onClick={confirm} disabled={leaving}>
              {leaving ? (
                <>
                  <Loader2 className="animate-spin" /> Signing out…
                </>
              ) : (
                <>
                  <LogOut /> Log out
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
