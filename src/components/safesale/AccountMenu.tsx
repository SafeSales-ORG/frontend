import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsUpDown, Copy, ExternalLink, LifeBuoy, LogOut, Wallet } from "lucide-react";

import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  handle: string | null;
  email: string | null;
  avatarSeed: string;
  avatarUrl: string | null;
  shopUrl: string | null;
  onCopyShopLink: () => void;
  onHelp: () => void;
  onLogout: () => void;
  /** "sidebar" opens upward from the full card; "header" is the avatar-only trigger. */
  variant: "sidebar" | "header";
}

/** The signed-in seller's account menu (sidebar card on desktop, avatar on mobile). */
export function AccountMenu(props: Props) {
  const { name, handle, avatarSeed, avatarUrl, variant } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
            open ? "bg-canvas/15" : "hover:bg-canvas/10",
          )}
        >
          <Avatar seed={avatarSeed} name={name} size={36} src={avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-canvas">{name}</p>
            {handle && <p className="truncate text-xs text-canvas/60">@{handle}</p>}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-canvas/60" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
          className="rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-mint"
        >
          <Avatar seed={avatarSeed} name={name} size={32} src={avatarUrl} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: variant === "sidebar" ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: variant === "sidebar" ? 8 : -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className={cn(
              "absolute z-40 w-72 overflow-hidden rounded-xl bg-canvas shadow-[var(--shadow-float)]",
              variant === "sidebar" ? "bottom-full left-0 mb-2 origin-bottom-left" : "top-full right-0 mt-2 origin-top-right",
            )}
          >
            <div className="flex items-center gap-3 bg-mint p-4">
              <Avatar seed={avatarSeed} name={name} size={44} src={avatarUrl} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-forest">{name}</p>
                <p className="truncate text-sm text-forest/70">{props.email ?? (handle ? `@${handle}` : "")}</p>
              </div>
            </div>
            <div className="p-2">
              {props.shopUrl && (
                <MenuItem icon={<ExternalLink />} as="a" href={props.shopUrl} onSelect={close}>
                  View my shop
                </MenuItem>
              )}
              {props.shopUrl && (
                <MenuItem
                  icon={<Copy />}
                  onSelect={() => {
                    props.onCopyShopLink();
                    close();
                  }}
                >
                  Copy shop link
                </MenuItem>
              )}
              <MenuItem icon={<Wallet />} as="link" to="/app/earnings" onSelect={close}>
                Payout settings
              </MenuItem>
              <MenuItem
                icon={<LifeBuoy />}
                onSelect={() => {
                  props.onHelp();
                  close();
                }}
              >
                Help & support
              </MenuItem>
            </div>
            <div className="border-t border-line p-2">
              <MenuItem
                icon={<LogOut />}
                tone="negative"
                onSelect={() => {
                  close();
                  props.onLogout();
                }}
              >
                Log out
              </MenuItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
  tone,
  as = "button",
  to,
  href,
}: {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  tone?: "negative";
  as?: "button" | "link" | "a";
  to?: string;
  href?: string;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4",
    tone === "negative" ? "text-negative hover:bg-negative-pale" : "text-ink hover:bg-canvas-soft",
  );
  if (as === "link" && to) {
    return (
      <Link role="menuitem" to={to} onClick={onSelect} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  if (as === "a" && href) {
    return (
      <a role="menuitem" href={href} target="_blank" rel="noreferrer" onClick={onSelect} className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onSelect} className={cls}>
      {icon}
      {children}
    </button>
  );
}
