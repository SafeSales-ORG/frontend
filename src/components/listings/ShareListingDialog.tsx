import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { ArrowSquareOut, Check, Copy, DownloadSimple, Export, LinkSimple, SealCheck, Storefront } from "@phosphor-icons/react";

import { LogoMark } from "@/components/safesale/Logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { FacebookMark, TelegramMark, WhatsAppMark, XMark } from "@/components/listings/BrandMarks";
import { useToast } from "@/hooks/useToast";
import { formatNGN } from "@/lib/format";
import { displayUrl, listingUrl } from "@/lib/links";
import type { MyListing } from "@/lib/types";

const QR_DARK = "#0b3a2a";

/**
 * Share sheet for a listing. Opens right after publishing (with confetti)
 * and from the Share action on any listing card.
 */
export function ShareListingDialog({
  listing,
  fresh,
  open,
  onOpenChange,
}: {
  listing: MyListing | null;
  /** True straight after publishing. */
  fresh: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-3xl">
        {listing && <ShareBody listing={listing} fresh={fresh} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ listing, fresh }: { listing: MyListing; fresh: boolean }) {
  const { toast } = useToast();
  const link = listingUrl(listing.id);
  const message = `${listing.title} — ${formatNGN(listing.priceNGN)}. Pay safely with SafeSale: your money is held until it arrives.`;
  const [copied, setCopied] = useState(false);
  const logoRef = useRef<HTMLSpanElement>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const isLocal = /\/\/(localhost|127\.0\.0\.1)/.test(link);

  const copy = async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(link);
      else if (!legacyCopy(link)) throw new Error("copy failed");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      if (legacyCopy(link)) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        return;
      }
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually." });
    }
  };

  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const text = encodeURIComponent(message);
  const url = encodeURIComponent(link);

  const download = async () => {
    try {
      const svg = logoRef.current?.querySelector("svg") ?? null;
      const blob = await renderPoster({ listing, link, logoSvg: svg });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `safesale-${listing.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-qr.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast({ title: "QR poster saved", description: "Post it on your status or print it for your stall." });
    } catch {
      toast({ title: "Couldn't create the image", description: "Please try again." });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Left: listing + QR on forest */}
      <div className="relative overflow-hidden bg-forest p-6 text-canvas sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-mint/10 blur-2xl" />
        <motion.span
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.05 }}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-mint text-forest"
        >
          <SealCheck size={24} weight="fill" />
        </motion.span>
        <DialogTitle className="mt-4">
          <span className="font-display text-h2 text-canvas">{fresh ? "Your listing is live" : "Share your listing"}</span>
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-canvas/70">
          Buyers who open this link pay into SafeSale escrow, not your account directly.
        </DialogDescription>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 flex items-center gap-3 rounded-2xl bg-canvas/10 p-3"
        >
          {listing.images[0] ? (
            <img src={listing.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-canvas/10 text-mint">
              <Storefront size={24} weight="duotone" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-canvas">{listing.title}</p>
            <p className="text-sm text-mint tabular-nums">{formatNGN(listing.priceNGN)}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 22 }}
          className="mt-4 rounded-2xl bg-canvas p-4 text-center"
        >
          <div className="relative mx-auto w-fit">
            <QRCodeCanvas value={link} size={176} level="H" dark={QR_DARK} className="block" />
            <span
              ref={logoRef}
              className="absolute top-1/2 left-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-canvas shadow-sm"
            >
              <LogoMark className="h-8 w-8" />
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-ink">Scan with a phone camera to buy</p>
          {isLocal && <p className="mt-1 text-xs text-mute">Points to this computer while testing. On the live site it opens your listing.</p>}
          <button
            type="button"
            onClick={() => void download()}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-canvas-soft px-4 text-sm font-semibold text-forest transition-colors hover:bg-mint-soft"
          >
            <DownloadSimple size={16} weight="bold" /> Save QR poster
          </button>
        </motion.div>
      </div>

      {/* Right: link + apps */}
      <div className="flex flex-col p-6 sm:p-8">
        <p className="font-semibold text-ink">Your link</p>
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-canvas-soft p-1.5 pl-4">
          <LinkSimple size={18} className="shrink-0 text-mute" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink select-all">{displayUrl(link)}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="relative inline-flex h-10 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-forest text-sm font-semibold text-mint transition-transform active:scale-95"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "done" : "copy"}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="inline-flex items-center gap-1.5"
              >
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                {copied ? "Copied" : "Copy"}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        <p className="mt-7 font-semibold text-ink">Share to</p>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-3 lg:grid-cols-5">
          <AppTile label="WhatsApp" bg="#25D366" onClick={() => open(`https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}`)} i={0}>
            <WhatsAppMark className="h-7 w-7 text-white" />
          </AppTile>
          <AppTile label="X" bg="#000000" onClick={() => open(`https://x.com/intent/post?text=${text}&url=${url}`)} i={1}>
            <XMark className="h-6 w-6 text-white" />
          </AppTile>
          <AppTile label="Facebook" bg="#0866FF" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${url}`)} i={2}>
            <FacebookMark className="h-7 w-7 text-white" />
          </AppTile>
          <AppTile label="Telegram" bg="#26A5E4" onClick={() => open(`https://t.me/share/url?url=${url}&text=${text}`)} i={3}>
            <TelegramMark className="h-7 w-7 text-white" />
          </AppTile>
          <AppTile
            label={canNativeShare ? "More apps" : "Copy link"}
            bg="var(--color-canvas-sunken)"
            i={4}
            onClick={async () => {
              if (!canNativeShare) return void copy();
              try {
                await navigator.share({ title: listing.title, text: message, url: link });
              } catch {
                // Cancelled.
              }
            }}
          >
            <Export size={26} weight="bold" className="text-forest" />
          </AppTile>
        </div>

        <div className="mt-7 rounded-2xl bg-brand-pale p-4 text-sm text-brand-ink">
          <p className="font-semibold">Tip</p>
          <p className="mt-0.5">
            Put the link in your Instagram bio and WhatsApp status. Buyers trust sellers who use escrow, so mention it.
          </p>
        </div>

        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand hover:underline"
        >
          See it as a buyer <ArrowSquareOut size={16} weight="bold" />
        </a>
      </div>
    </div>
  );
}

function AppTile({
  label,
  bg,
  onClick,
  children,
  i,
}: {
  label: string;
  bg: string;
  onClick: () => void;
  children: ReactNode;
  i: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + i * 0.05 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.94 }}
      className="group flex flex-col items-center gap-2 rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl shadow-sm transition-shadow group-hover:shadow-md"
        style={{ background: bg }}
      >
        {children}
      </span>
      <span className="text-xs font-medium text-body">{label}</span>
    </motion.button>
  );
}

/* --------------------------- QR poster (PNG) --------------------------- */

async function renderPoster({
  listing,
  link,
  logoSvg,
}: {
  listing: MyListing;
  link: string;
  logoSvg: SVGSVGElement | null;
}): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  await document.fonts?.ready;

  ctx.fillStyle = QR_DARK;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#9df2c0";
  ctx.font = "600 34px Manrope, Inter, sans-serif";
  ctx.fillText("SCAN TO BUY SAFELY", W / 2, 120);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 60px Manrope, Inter, sans-serif";
  const lines = wrap(ctx, listing.title, W - 160).slice(0, 2);
  lines.forEach((l, idx) => ctx.fillText(l, W / 2, 205 + idx * 70));
  ctx.fillStyle = "#9df2c0";
  ctx.font = "700 52px Manrope, Inter, sans-serif";
  ctx.fillText(formatNGN(listing.priceNGN), W / 2, 205 + lines.length * 70 + 20);

  // QR card
  const card = 720;
  const cx = (W - card) / 2;
  const cy = 420;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cx, cy, card, card, 48);
  ctx.fill();

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, link, { width: 640, margin: 0, errorCorrectionLevel: "H", color: { dark: QR_DARK, light: "#ffffff" } });
  ctx.drawImage(qr, cx + 40, cy + 40, 640, 640);

  // Logo badge in the middle
  const badge = 150;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, W / 2 - badge / 2, cy + card / 2 - badge / 2, badge, badge, 32);
  ctx.fill();
  if (logoSvg) {
    const img = await svgToImage(logoSvg);
    ctx.drawImage(img, W / 2 - 55, cy + card / 2 - 55, 110, 110);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 36px Manrope, Inter, sans-serif";
  ctx.fillText("Your money is held by SafeSale until it arrives", W / 2, 1220);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "500 30px Inter, sans-serif";
  ctx.fillText(displayUrl(link), W / 2, 1275);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  if (out.length > 2) out[1] = `${out[1]}…`;
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "220");
  clone.setAttribute("height", "220");
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Fallback for browsers or pages where the async clipboard is blocked. */
function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  let ok: boolean;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  el.remove();
  return ok;
}
