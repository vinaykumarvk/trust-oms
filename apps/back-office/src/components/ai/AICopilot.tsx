/**
 * AI Copilot — Floating Chat Panel
 *
 * Streams responses from POST /api/v1/intelligence/copilot/stream via SSE.
 * Renders as a fixed floating button that opens a slide-in chat panel.
 *
 * Degrades gracefully: if the platform intelligence service is not configured,
 * displays an informative placeholder.
 *
 * Context: passes the current client/portfolio IDs from the URL if present
 * (e.g. /clients/:clientId/..., /portfolios/:portfolioId/...).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@ui/components/ui/sheet";
import { Badge } from "@ui/components/ui/badge";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import {
  Bot,
  Send,
  X,
  Loader2,
  WifiOff,
  RotateCcw,
} from "lucide-react";
import { cn } from "@ui/lib/utils";
import { apiUrl } from "@ui/lib/api-url";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  pending?: boolean; // streaming in progress
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

/** Extract :clientId and :portfolioId from the current URL path if present. */
function extractContextFromPath(pathname: string) {
  const clientMatch    = pathname.match(/\/clients\/([^/]+)/);
  const portfolioMatch = pathname.match(/\/portfolios\/([^/]+)/);
  return {
    clientId:    clientMatch?.[1],
    portfolioId: portfolioMatch?.[1],
  };
}

// ─── Chat messages list ───────────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
          message.pending && "opacity-80"
        )}
      >
        {message.content || (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AICopilot() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [streaming, setStreaming] = useState(false);
  const [platformOk, setPlatformOk] = useState<boolean | null>(null); // null = unknown
  const scrollRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const location   = useLocation();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Check platform status when panel opens
  useEffect(() => {
    if (!open || platformOk !== null) return;
    fetch(apiUrl("/api/v1/intelligence/platform-status"), { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPlatformOk(d.available === true))
      .catch(() => setPlatformOk(false));
  }, [open, platformOk]);

  const context = extractContextFromPath(location.pathname);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content: text };
    const asstMsg: Message = { id: uid(), role: "assistant", content: "", pending: true };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setStreaming(true);

    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    abortRef.current = new AbortController();

    try {
      const res = await fetch(apiUrl("/api/v1/intelligence/copilot/stream"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsg.id
              ? { ...m, content: "Service unavailable. Please try again.", pending: false }
              : m
          )
        );
        setPlatformOk(false);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstMsg.id
                    ? { ...m, content: m.content + payload.content }
                    : m
                )
              );
            }
            if (payload.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstMsg.id
                    ? { ...m, content: `Error: ${payload.error}`, pending: false }
                    : m
                )
              );
            }
          } catch {
            // partial JSON — continue
          }
        }
      }

      // Mark assistant message as done
      setMessages((prev) =>
        prev.map((m) => (m.id === asstMsg.id ? { ...m, pending: false } : m))
      );
      setPlatformOk(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstMsg.id
            ? { ...m, content: "Connection interrupted. Please try again.", pending: false }
            : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI Copilot"
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
          "bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <Bot className="h-5 w-5" />
      </button>

      {/* Slide-in chat panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-[420px]"
        >
          {/* Header */}
          <SheetHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">AI Copilot</SheetTitle>
              {platformOk === false && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <WifiOff className="h-3 w-3" /> Offline
                </Badge>
              )}
              {platformOk === true && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                  Live
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={clearChat}
                  aria-label="Clear conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
                aria-label="Close AI Copilot"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">TrustOMS AI Copilot</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                    Ask me about portfolios, clients, compliance requirements,
                    or anything trust banking related.
                  </p>
                </div>
                {platformOk === false && (
                  <div className="mt-2 rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-left">
                    <p className="text-xs font-medium">Platform offline</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Set{" "}
                      <code className="rounded bg-muted px-1 text-[10px]">
                        PLATFORM_INTELLIGENCE_SERVICE_URL
                      </code>{" "}
                      to enable the AI Copilot.
                    </p>
                  </div>
                )}
                {context.clientId && (
                  <Badge variant="outline" className="text-xs">
                    Client context: {context.clientId}
                  </Badge>
                )}
                {context.portfolioId && (
                  <Badge variant="outline" className="text-xs">
                    Portfolio context: {context.portfolioId}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  platformOk === false
                    ? "Platform offline…"
                    : "Ask anything… (Enter to send)"
                }
                disabled={streaming}
                rows={1}
                className={cn(
                  "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
                  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  "max-h-28 overflow-y-auto"
                )}
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                aria-label="Send message"
                className="h-9 w-9 shrink-0"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground text-right">
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
