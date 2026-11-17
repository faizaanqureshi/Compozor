"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AskActionCard } from "@/components/ask/ask-action-card";
import { AskAnswer } from "@/components/ask/ask-answer";
import { ApiError } from "@/lib/api";
import {
  getAskConversation,
  streamAskQuestion,
  type AskAction,
  type AskCitation,
  type AskMessage,
  type AskScope,
} from "@/lib/ask";
import { cn } from "@/lib/utils";
import { scopedStarters } from "@/lib/ask-starters";

type Turn = {
  key: string;
  role: "user" | "assistant";
  content: string;
  citations: Record<string, AskCitation>;
  actions: AskAction[];
  state: "working" | "streaming" | "complete" | "capped" | "error";
  statusLabel?: string;
  error?: string;
  messageId?: number;
  question?: string;
};

function fromMessage(message: AskMessage, question?: string): Turn {
  return {
    key: `m${message.id}`,
    role: message.role,
    content: message.content,
    citations: Object.fromEntries(message.citations.map((c) => [c.key, c])),
    actions: message.actions,
    state: message.status === "error" ? "error" : message.status,
    error: message.status === "error" ? "Couldn't answer that." : undefined,
    messageId: message.id,
    question,
  };
}

function withQuestions(messages: AskMessage[]): Turn[] {
  let lastQuestion: string | undefined;
  return messages.map((m) => {
    if (m.role === "user") lastQuestion = m.content;
    return fromMessage(m, m.role === "assistant" ? lastQuestion : undefined);
  });
}

export function AskChat({
  conversationId,
  onConversationChange,
  scope = null,
  variant = "page",
  onNavigate,
}: {
  conversationId: number | null;
  onConversationChange?: (id: number | null) => void;
  /** What the staff member is looking at; sent with each question. */
  scope?: AskScope | null;
  variant?: "page" | "panel";
  onNavigate?: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const activeId = useRef<number | null>(conversationId);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Load a saved conversation, unless it's the one this chat just created.
  useEffect(() => {
    if (conversationId === activeId.current && turns.length > 0) return;
    activeId.current = conversationId;
    abortRef.current?.abort();
    setBusy(false);
    if (conversationId === null) {
      setTurns([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getAskConversation(conversationId)
      .then((conversation) => !cancelled && setTurns(withQuestions(conversation.messages)))
      .catch((e) => !cancelled && setLoadError(e instanceof ApiError ? e.message : "Couldn't load this conversation."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const lastContent = turns.at(-1)?.content.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, lastContent]);

  const updateLast = useCallback((fn: (turn: Turn) => Turn) => {
    setTurns((current) => (current.length ? [...current.slice(0, -1), fn(current[current.length - 1])] : current));
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      setDraft("");
      setBusy(true);
      const stamp = Date.now();
      setTurns((current) => [
        ...current,
        { key: `u${stamp}`, role: "user", content: text, citations: {}, actions: [], state: "complete" },
        { key: `a${stamp}`, role: "assistant", content: "", citations: {}, actions: [], state: "working",
          statusLabel: "Thinking", question: text },
      ]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamAskQuestion(
          {
            question: text,
            conversation_id: activeId.current,
            client_id: !activeId.current && scope?.kind === "client" ? scope.id : null,
            scope: scope ? { kind: scope.kind, id: scope.id } : null,
          },
          (event) => {
            switch (event.type) {
              case "conversation":
                if (activeId.current !== event.conversation_id) {
                  activeId.current = event.conversation_id;
                  onConversationChange?.(event.conversation_id);
                }
                break;
              case "status":
                updateLast((t) => ({ ...t, statusLabel: event.label }));
                break;
              case "reset":
                updateLast((t) => ({ ...t, content: "" }));
                break;
              case "citation":
                updateLast((t) => ({ ...t, citations: { ...t.citations, [event.citation.key]: event.citation } }));
                break;
              case "delta":
                updateLast((t) => ({ ...t, state: "streaming", content: t.content + event.text }));
                break;
              case "action":
                updateLast((t) => ({ ...t, actions: [...t.actions, event.action] }));
                break;
              case "done":
                updateLast((t) => ({ ...fromMessage(event.message, t.question), key: t.key }));
                break;
              case "error":
                updateLast((t) => ({ ...t, state: "error", error: event.error, messageId: event.message?.id }));
                break;
            }
          },
          controller.signal,
        );
      } catch (e) {
        if (!controller.signal.aborted) {
          updateLast((t) => ({ ...t, state: "error", error: e instanceof ApiError ? e.message : "Couldn't reach Compozor." }));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
        updateLast((t) => (t.state === "working" || t.state === "streaming" ? { ...t, state: "complete" } : t));
      }
    },
    [busy, scope, onConversationChange, updateLast],
  );

  const stop = () => {
    abortRef.current?.abort();
    updateLast((t) => ({ ...t, state: t.content ? "complete" : "error", error: t.content ? undefined : "Stopped." }));
    setBusy(false);
  };

  const starters = scopedStarters(scope);
  const empty = turns.length === 0 && !loading && !loadError;
  const panel = variant === "panel";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", panel ? "h-full" : "")}>
      <div ref={scrollRef} className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", panel ? "px-5" : "px-1")}>
        {empty ? (
          <AskEmptyState
            starters={starters}
            scope={scope}
            panel={panel}
            onPick={(s) => void ask(s)}
          />
        ) : (
          <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8", panel ? "py-5" : "py-6 md:py-10")}>
            {loading && (
              <div className="flex flex-col gap-3">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            {loadError && <p className="text-sm text-muted-foreground">{loadError}</p>}
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <div key={turn.key} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[0.9375rem] leading-6 text-pretty whitespace-pre-wrap">
                    {turn.content}
                  </p>
                </div>
              ) : (
                <AssistantTurn
                  key={turn.key}
                  turn={turn}
                  onNavigate={onNavigate}
                  onRetry={index === turns.length - 1 && turn.question ? () => {
                    setTurns((current) => current.slice(0, -2));
                    void ask(turn.question!);
                  } : undefined}
                  conversationId={activeId.current}
                />
              )
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className={cn("shrink-0", panel ? "border-t border-border/60 px-5 pt-3 pb-4" : "pt-2 pb-1")}>
        <div className="mx-auto w-full max-w-3xl">
          <AskComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void ask(draft)}
            onStop={stop}
            busy={busy}
            inputRef={inputRef}
            placeholder={scope ? `Ask about ${scope.kind === "client" ? scope.label.split(/\s+/)[0] : `this ${scope.kind === "email" ? "thread" : scope.kind}`}…` : "Ask about any client…"}
          />
          {!panel && (
            <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
              Ask reads your firm&apos;s data and links every source. It never changes anything without your confirmation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantTurn({
  turn,
  onNavigate,
  onRetry,
  conversationId,
}: {
  turn: Turn;
  onNavigate?: () => void;
  onRetry?: () => void;
  conversationId: number | null;
}) {
  if (turn.state === "error") {
    return (
      <div data-ask-turn data-state="error" className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{turn.error ?? "Couldn't answer that."}</p>
        {onRetry && (
          <Button variant="ghost" size="sm" className="-ml-3" onClick={onRetry}>
            <RotateCcw />
            Try again
          </Button>
        )}
      </div>
    );
  }
  return (
    <div data-ask-turn data-state={turn.state} className="flex flex-col gap-4">
      {turn.state === "working" && !turn.content ? (
        <p className="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/40" />
            <span className="relative inline-flex size-2 rounded-full bg-accent/70" />
          </span>
          {turn.statusLabel ?? "Thinking"}…
        </p>
      ) : (
        <AskAnswer text={turn.content} citations={turn.citations} streaming={turn.state === "streaming"} onNavigate={onNavigate} />
      )}
      {turn.actions.map((action) => (
        <AskActionCard
          key={`${turn.messageId ?? turn.key}-${action.id}`}
          action={action}
          conversationId={conversationId}
          messageId={turn.messageId}
          onNavigate={onNavigate}
        />
      ))}
      {turn.state === "capped" && (
        <p className="text-xs text-muted-foreground">
          This answer hit its research limit. Ask a narrower follow-up for more.
        </p>
      )}
    </div>
  );
}

function AskEmptyState({
  starters,
  scope,
  panel,
  onPick,
}: {
  starters: string[];
  scope: AskScope | null;
  panel: boolean;
  onPick: (starter: string) => void;
}) {
  const clientName = scope?.kind === "client" ? scope.label : undefined;
  return (
    <div className={cn("mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8", panel ? "py-8" : "py-10 md:py-16")}>
      <div className="flex flex-col gap-3">
        {panel ? (
          <p className="text-xl font-light tracking-tight text-balance">
            {scope
              ? scope.kind === "client"
                ? `Ask anything about ${scope.label.split(/\s+/)[0]}.`
                : scope.kind === "run"
                  ? "Ask about this run."
                  : scope.kind === "workflow"
                    ? `Ask about ${scope.label}.`
                    : "Ask about this thread."
              : "Ask anything about your clients."}
          </p>
        ) : (
          <h1 className="text-4xl leading-tight font-light tracking-tight text-balance [font-family:var(--font-display)] md:text-5xl">
            Ask about your clients.
          </h1>
        )}
        <p className="max-w-xl text-sm text-pretty text-muted-foreground md:text-[0.9375rem]">
          {clientName
            ? "Answers come from their checklist, documents, emails and workflow runs, with a link to every source."
            : "Answers come from your clients' checklists, documents, emails and workflow runs, with a link to every source."}
          {panel && " Ask can also prepare emails, reminders and workflow runs for you to confirm."}
        </p>
      </div>
      <div className={cn("grid gap-2.5", !panel && "sm:grid-cols-2")}>
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onPick(starter)}
            className="rounded-xl bg-card px-4 py-3.5 text-left text-sm text-foreground/85 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  inputRef,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, inputRef]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-end gap-2 rounded-2xl bg-card p-2 pl-4 ring-1 ring-foreground/12 transition-shadow focus-within:ring-foreground/25"
    >
      <label htmlFor="ask-input" className="sr-only">
        Question
      </label>
      <textarea
        id="ask-input"
        ref={inputRef}
        rows={1}
        value={value}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) onSubmit();
          }
        }}
        placeholder={placeholder}
        className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-muted-foreground/70 md:text-[0.9375rem]"
      />
      {busy ? (
        <Button type="button" size="icon" variant="secondary" className="rounded-xl" onClick={onStop} aria-label="Stop">
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" className="rounded-xl" disabled={!value.trim()} aria-label="Ask">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      )}
    </form>
  );
}
