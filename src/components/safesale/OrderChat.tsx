/**
 * `OrderChat` — a per-order message thread between buyer and seller.
 *
 * Used on both the buyer order page (`viewer="buyer"`) and the seller order
 * detail page (`viewer="seller"`). Messages are stored in the live market
 * store keyed by orderToken, so a message sent on one side appears on the
 * other (same browser instantly, across tabs/devices via the store's
 * storage-event sync). This is the "Pay seller on agreement" coordination
 * channel — shipping questions, delivery details, negotiation.
 */

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

import { useMessagesLive } from "@/hooks/useMarket";
import { marketStore } from "@/lib/store/marketStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OrderChat({
  orderToken,
  viewer,
  counterpartyName,
}: {
  orderToken: string;
  viewer: "buyer" | "seller";
  counterpartyName?: string;
}) {
  const messages = useMessagesLive(orderToken);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    marketStore.addMessage({
      id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      orderToken,
      from: viewer,
      text: t,
      at: new Date().toISOString(),
    });
    setText("");
  };

  const other = viewer === "buyer" ? "seller" : "buyer";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">
          Messages
          {counterpartyName ? (
            <span className="font-normal text-ink-soft"> · {counterpartyName}</span>
          ) : null}
        </h3>
      </header>

      <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-soft">
            No messages yet. Say hello, ask about delivery, or coordinate
            shipping — your conversation stays attached to this order.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.from === viewer;
            const system = m.from === "system";
            if (system) {
              return (
                <p
                  key={m.id}
                  className="mx-auto w-fit rounded-full bg-surface px-3 py-1 text-center text-[11px] text-ink-soft"
                >
                  {m.text}
                </p>
              );
            }
            return (
              <div
                key={m.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    mine
                      ? "rounded-br-sm bg-brand text-brand-foreground"
                      : "rounded-bl-sm bg-surface text-ink",
                  )}
                >
                  {m.text}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-ink-soft">
                  {mine ? "You" : m.from === other ? other : m.from} ·{" "}
                  {formatTime(m.at)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Message the ${other}…`}
          className="h-10"
        />
        <Button
          onClick={send}
          disabled={!text.trim()}
          size="icon"
          className="h-10 w-10 shrink-0 bg-brand text-brand-foreground hover:bg-brand/90"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

export default OrderChat;
