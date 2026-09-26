import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";
import type { EmailLogEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

export type MessageTone = "issue" | "warning" | "received" | "sent" | "muted";
export type MessageState = { label: string; tone: MessageTone };

// The one label a staff member needs for a message: what happened to it.
// Shared by the email log and the client page's conversation.
export function messageState(entry: EmailLogEntry): MessageState {
  if (entry.status === "needs_human_attention") {
    return entry.resolved_at ? { label: "Resolved", tone: "muted" } : { label: "Needs review", tone: "issue" };
  }
  if (entry.status === "draft") {
    if (entry.delivery_state === "sending") return { label: "Sending…", tone: "muted" };
    if (entry.delivery_state === "uncertain") return { label: "Delivery unconfirmed", tone: "warning" };
    if (entry.delivery_state === "failed") return { label: "Send failed", tone: "issue" };
    return { label: "Draft", tone: "warning" };
  }
  if (entry.status === "sent") return { label: entry.autosent ? "Auto-sent" : "Sent", tone: "sent" };
  return { label: "Received", tone: "received" };
}

// Thread-level state: anything needing a human outranks what happened last.
export function threadMessagesState(messages: EmailLogEntry[]): MessageState {
  if (messages.some((m) => m.status === "needs_human_attention" && !m.resolved_at)) {
    return { label: "Needs review", tone: "issue" };
  }
  const draft = [...messages].reverse().find((m) => m.status === "draft");
  if (draft) return messageState(draft);
  return messageState(messages[messages.length - 1]);
}

const toneText: Record<MessageTone, string> = {
  issue: "text-destructive",
  warning: "text-warning-foreground",
  received: "text-foreground",
  sent: "text-muted-foreground",
  muted: "text-muted-foreground",
};

export function StateLabel({ state, className }: { state: MessageState; className?: string }) {
  const Icon =
    state.tone === "received" ? ArrowDownLeft : state.tone === "sent" ? (state.label === "Auto-sent" ? Sparkles : ArrowUpRight) : null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", toneText[state.tone], className)}>
      {Icon ? (
        <Icon className="size-3" />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            state.tone === "issue" ? "bg-destructive" : state.tone === "warning" ? "bg-warning" : "bg-muted-foreground/50"
          )}
        />
      )}
      {state.label}
    </span>
  );
}
