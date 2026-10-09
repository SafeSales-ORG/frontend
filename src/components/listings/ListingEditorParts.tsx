import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImageSquare } from "@phosphor-icons/react";
import { Loader2, Lock, ShieldCheck, X } from "lucide-react";

import { BrandIcon } from "@/components/safesale/BrandIcon";
import { AnimatedNumber } from "@/components/safesale/AnimatedNumber";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface EditorPhoto {
  key: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
}

/** A numbered section of the listing form. */
export function FormBlock({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-mint tabular-nums">
          {step}
        </span>
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          {hint && <p className="text-sm text-mute">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Naira input that shows thousands separators while storing digits only. */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-medium text-mute">₦</span>
        <Input
          id={id}
          inputMode="numeric"
          value={value ? Number(value).toLocaleString("en-NG") : ""}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
          placeholder={placeholder}
          className="pl-8 tabular-nums"
        />
      </div>
    </div>
  );
}

/** Drag-and-drop photo picker with thumbnails; the first photo is the cover. */
export function PhotoDropzone({
  photos,
  max,
  onAdd,
  onRemove,
}: {
  photos: EditorPhoto[];
  max: number;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onAdd(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
      }}
      className={cn(
        "rounded-2xl border-2 border-dashed p-3 transition-colors",
        dragging ? "border-brand bg-brand-pale" : "border-line-strong bg-canvas-soft",
      )}
    >
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3 px-4 py-10 text-center"
        >
          <BrandIcon icon={ImageSquare} size="lg" />
          <span className="font-semibold text-ink">Drag photos here, or tap to choose</span>
          <span className="text-sm text-mute">JPG, PNG or WebP · clear, well-lit photos sell faster</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <AnimatePresence initial={false}>
            {photos.map((p, i) => (
              <motion.div
                key={p.key}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square overflow-hidden rounded-xl bg-canvas"
              >
                <img
                  src={p.previewUrl}
                  alt=""
                  className={cn(
                    "h-full w-full object-cover",
                    p.status === "uploading" && "opacity-60",
                    p.status === "error" && "opacity-40",
                  )}
                />
                {i === 0 && p.status !== "error" && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-forest px-2 py-0.5 text-xs font-semibold text-mint">
                    Cover
                  </span>
                )}
                {p.status === "uploading" && (
                  <span aria-label="Uploading" className="absolute inset-0 grid place-items-center bg-forest/30 text-canvas">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                )}
                {p.status === "error" && (
                  <span title={p.errorMessage} className="absolute inset-0 grid place-items-center bg-negative/80 text-xs font-semibold text-canvas">
                    Failed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(p.key)}
                  aria-label="Remove photo"
                  className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-canvas/90 text-body hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {photos.length < max && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl bg-canvas text-body transition-colors hover:text-brand"
            >
              <ImageSquare size={24} weight="duotone" />
              <span className="text-xs font-medium">Add</span>
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          onAdd(files);
        }}
      />
    </div>
  );
}

/** What buyers will see — updates live as the seller types. */
export function ListingPreview({
  cover,
  title,
  priceNGN,
  deliveryFeeNGN,
  sellerName,
}: {
  cover: string | null;
  title: string;
  priceNGN: number;
  deliveryFeeNGN: number;
  sellerName: string;
}) {
  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto bg-mint p-6 lg:flex">
      <p className="text-sm font-semibold text-forest">Live preview</p>
      <p className="text-sm text-forest/70">This is what buyers see.</p>
      <motion.div layout className="mt-5 overflow-hidden rounded-2xl bg-canvas shadow-[var(--shadow-float)]">
        <div className="relative aspect-square bg-canvas-soft">
          <AnimatePresence mode="wait">
            {cover ? (
              <motion.img
                key={cover}
                src={cover}
                alt=""
                className="h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            ) : (
              <motion.div key="empty" className="grid h-full place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ImageSquare size={48} weight="duotone" className="text-line-strong" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="p-5">
          <p className={cn("font-semibold", title ? "text-ink" : "text-mute")}>{title || "Your product title"}</p>
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-body">
              <span>Item</span>
              <span className="tabular-nums">{priceNGN ? formatNGN(priceNGN) : "—"}</span>
            </div>
            <div className="flex justify-between text-body">
              <span>Delivery</span>
              <span className="tabular-nums">{deliveryFeeNGN ? formatNGN(deliveryFeeNGN) : "Free"}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Total</span>
              <AnimatedNumber value={priceNGN + deliveryFeeNGN} format={(n) => formatNGN(Math.round(n))} className="tabular-nums" />
            </div>
          </div>
          <div className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-forest text-sm font-semibold text-mint">
            <Lock className="h-4 w-4" /> Buy with SafeSale
          </div>
          <p className="mt-3 text-center text-xs text-mute">Sold by {sellerName}</p>
        </div>
      </motion.div>
      <p className="mt-5 flex items-start gap-2 text-sm text-forest/80">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Buyers pay SafeSale first, so they're happy to pay before you ship.
      </p>
    </aside>
  );
}
