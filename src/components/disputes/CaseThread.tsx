import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ChatsCircle,
  HandWaving,
  ImageSquare,
  Info,
  PaperPlaneRight,
  Scales,
  Storefront,
  User,
  X,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { apiClient } from "@/lib/api";
import type { DisputeParty, DisputeRequestTarget, DisputeThreadMessage } from "@/lib/api/types";
import { formatDue, formatNGN } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 4;

const PARTY_LABEL: Record<DisputeParty, string> = {
  buyer: "Buyer",
  seller: "Seller",
  mediator: "Mediator",
};

/**
 * The case conversation for a dispute. Buyer, seller and the SafeSale
 * mediator all see the same thread while the money stays in escrow; the
 * mediator can ask a specific party for information.
 */
export function CaseThread({
  disputeId,
  viewer,
  buyerToken,
  heldNGN,
  className,
}: {
  disputeId: string;
  viewer: DisputeParty;
  /** Buyer's order-link token (buyer page only). */
  buyerToken?: string;
  /** Amount still held, shown in the header. */
  heldNGN?: number;
  className?: string;
}) {
  const who = { buyerToken, as: viewer };
  const queryKey = ["safesale", "case-thread", disputeId];
  const thread = useQuery({
    queryKey,
    queryFn: () => apiClient.getDisputeThread(disputeId, who),
    refetchInterval: (q) => (q.state.data?.dispute.status === "resolved" ? false : 5_000),
  });

  const data = thread.data;
  const closed = data?.dispute.status === "resolved";
  const messages = data?.messages ?? [];
  const waiting = data?.waitingOn ?? [];
  const lastRequest = [...messages].reverse().find((m) => m.authorRole === "mediator" && m.requestFrom);

  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className={cn("overflow-hidden rounded-2xl bg-canvas", className)} aria-label="Case chat">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-forest text-mint">
            <ChatsCircle size={22} weight="fill" />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Case chat</h2>
            <p className="text-sm text-mute">Buyer, seller and the SafeSale mediator all see this.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {heldNGN !== undefined && !closed && (
            <span className="rounded-full bg-brand-pale px-3 py-1 text-xs font-semibold text-brand-ink tabular-nums">
              {formatNGN(heldNGN)} held
            </span>
          )}
          <Participants />
        </div>
      </header>

      <TurnBanner viewer={viewer} waiting={waiting} closed={closed} request={lastRequest} dueAt={data?.dispute.evidenceDueAt} />

      <ol ref={listRef} className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto px-5 py-5">
        {thread.isLoading && (
          <li className="grid place-items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-mute" aria-label="Loading messages" />
          </li>
        )}
        {thread.isError && (
          <li className="rounded-xl bg-negative-pale p-3 text-sm text-negative">
            We couldn't load the case chat. It will retry automatically.
          </li>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} viewer={viewer} />
          ))}
        </AnimatePresence>
      </ol>

      {closed ? (
        <p className="border-t border-line bg-canvas-soft px-5 py-4 text-center text-sm text-mute">
          This case is closed. The decision is final.
        </p>
      ) : (
        data && <Composer disputeId={disputeId} viewer={viewer} buyerToken={buyerToken} queryKey={queryKey} />
      )}
    </section>
  );
}

function Participants() {
  const items = [
    { icon: User, label: "Buyer", cls: "bg-info-pale text-info" },
    { icon: Storefront, label: "Seller", cls: "bg-warning-pale text-warning" },
    { icon: Scales, label: "Mediator", cls: "bg-forest text-mint" },
  ];
  return (
    <div className="flex -space-x-2" aria-hidden>
      {items.map(({ icon: Icon, label, cls }) => (
        <span key={label} title={label} className={cn("grid h-8 w-8 place-items-center rounded-full ring-2 ring-canvas", cls)}>
          <Icon size={15} weight="fill" />
        </span>
      ))}
    </div>
  );
}

function TurnBanner({
  viewer,
  waiting,
  closed,
  request,
  dueAt,
}: {
  viewer: DisputeParty;
  waiting: DisputeParty[];
  closed: boolean;
  request?: DisputeThreadMessage;
  dueAt?: string | null;
}) {
  if (closed || waiting.length === 0) return null;
  const yourTurn = waiting.includes(viewer);

  let text: string;
  if (viewer === "mediator") {
    text = yourTurn
      ? "Your move: reply, ask someone for information, or make a decision."
      : `Waiting on the ${waiting.map((p) => PARTY_LABEL[p].toLowerCase()).join(" and ")} to answer your question.`;
  } else if (yourTurn) {
    text = `The mediator asked you for more information${dueAt ? `. Please reply ${formatDue(dueAt)}` : ""}. The decision can go ahead without it.`;
  } else if (waiting.includes("mediator")) {
    text = "Waiting for the mediator. You can still add messages or photos.";
  } else {
    text = `The mediator is waiting on the ${waiting.map((p) => PARTY_LABEL[p].toLowerCase()).join(" and ")}.`;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-5 py-3 text-sm",
        yourTurn ? "bg-warning-pale text-warning" : "bg-canvas-soft text-body",
      )}
      role={yourTurn ? "status" : undefined}
    >
      {yourTurn ? <HandWaving size={18} weight="fill" className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
      <p>
        {text}
        {yourTurn && viewer !== "mediator" && request && (
          <span className="mt-1 block font-medium">“{request.content}”</span>
        )}
      </p>
    </div>
  );
}

function MessageRow({ message: m, viewer }: { message: DisputeThreadMessage; viewer: DisputeParty }) {
  const time = new Date(m.createdAt).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  if (m.authorRole === "system") {
    return (
      <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-1">
        <p className="max-w-md rounded-full bg-canvas-soft px-4 py-1.5 text-center text-xs text-body">{m.content}</p>
      </motion.li>
    );
  }

  const mine = m.authorRole === viewer;
  const isMediator = m.authorRole === "mediator";
  const roleLabel = PARTY_LABEL[m.authorRole];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn("flex gap-2.5", mine && "flex-row-reverse")}
    >
      <Avatar role={m.authorRole} />
      <div className={cn("max-w-[78%] min-w-0", mine && "items-end text-right")}>
        <p className={cn("mb-1 text-xs text-mute", mine && "text-right")}>
          <span className="font-semibold text-ink">{mine ? "You" : m.authorName}</span>
          {!mine && !isMediator && <span> · {roleLabel}</span>} · {time}
        </p>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed whitespace-pre-line",
            mine ? "rounded-tr-md bg-forest text-canvas" : isMediator ? "rounded-tl-md bg-brand-pale text-brand-ink" : "rounded-tl-md bg-canvas-soft text-ink",
          )}
        >
          {m.requestFrom && (
            <span
              className={cn(
                "mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                mine ? "bg-mint text-forest" : "bg-forest text-mint",
              )}
            >
              <HandWaving size={12} weight="fill" />
              Asked {m.requestFrom === "both" ? "both of you" : `the ${m.requestFrom}`} for information
            </span>
          )}
          {m.requestFrom && <br />}
          {m.content}
        </div>
        {m.attachments.length > 0 && (
          <div className={cn("mt-2 flex flex-wrap gap-2", mine && "justify-end")}>
            {m.attachments.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
                <img src={url} alt="Attached photo" className="h-24 w-24 object-cover transition-transform hover:scale-105" />
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}

function Avatar({ role }: { role: DisputeParty }) {
  const map = {
    buyer: { icon: User, cls: "bg-info-pale text-info" },
    seller: { icon: Storefront, cls: "bg-warning-pale text-warning" },
    mediator: { icon: Scales, cls: "bg-forest text-mint" },
  } as const;
  const { icon: Icon, cls } = map[role];
  return (
    <span className={cn("mt-5 grid h-8 w-8 shrink-0 place-items-center rounded-full", cls)} aria-hidden>
      <Icon size={15} weight="fill" />
    </span>
  );
}

function Composer({
  disputeId,
  viewer,
  buyerToken,
  queryKey,
}: {
  disputeId: string;
  viewer: DisputeParty;
  buyerToken?: string;
  queryKey: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [askFrom, setAskFrom] = useState<DisputeRequestTarget | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: uploadFile } = useUploadFile({ buyerToken });

  const send = useMutation({
    mutationFn: () =>
      apiClient.postDisputeMessage(
        disputeId,
        { content: text.trim(), attachments: photos, ...(askFrom && { requestFrom: askFrom }) },
        { buyerToken, as: viewer },
      ),
    onSuccess: () => {
      setText("");
      setPhotos([]);
      setAskFrom(null);
      void queryClient.invalidateQueries({ queryKey });
      // Status pills elsewhere on the page (e.g. "Waiting on buyer").
      void queryClient.invalidateQueries({ queryKey: ["safesale"] });
    },
    onError: (err) =>
      toast({
        title: "Message not sent",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const addFiles = async (files: File[]) => {
    const room = MAX_PHOTOS - photos.length;
    for (const file of files.slice(0, room)) {
      setUploading((n) => n + 1);
      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1];
        if (url) setPhotos((p) => [...p, url]);
      } catch {
        toast({ title: "Couldn't upload that photo", variant: "destructive" });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const canSend = text.trim().length > 0 && uploading === 0 && !send.isPending;
  const placeholder =
    viewer === "mediator"
      ? askFrom
        ? `What do you need from the ${askFrom === "both" ? "buyer and seller" : askFrom}?`
        : "Write to the buyer and seller…"
      : "Explain what happened, or answer the mediator…";

  return (
    <form
      className="border-t border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) send.mutate();
      }}
    >
      {viewer === "mediator" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-mute">Ask for information from</span>
          {(["buyer", "seller", "both"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAskFrom((cur) => (cur === t ? null : t))}
              aria-pressed={askFrom === t}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                askFrom === t ? "bg-forest text-mint" : "bg-canvas-soft text-body hover:bg-canvas-sunken",
              )}
            >
              {t === "both" ? "Both" : PARTY_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {(photos.length > 0 || uploading > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {photos.map((url) => (
            <span key={url} className="relative">
              <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-canvas"
              >
                <X size={12} weight="bold" />
              </button>
            </span>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <span key={i} className="grid h-16 w-16 place-items-center rounded-xl bg-canvas-soft">
              <Loader2 className="h-4 w-4 animate-spin text-mute" />
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photos.length + uploading >= MAX_PHOTOS}
          aria-label="Attach photos"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas-soft text-body transition-colors hover:bg-canvas-sunken hover:text-ink disabled:opacity-40"
        >
          <ImageSquare size={20} weight="duotone" />
        </button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) send.mutate();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          rows={1}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-mint transition-transform active:scale-95 disabled:opacity-40"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PaperPlaneRight size={18} weight="fill" />}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />
    </form>
  );
}
