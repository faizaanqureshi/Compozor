"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AskConversationSummary } from "@/lib/ask";
import { cn } from "@/lib/utils";

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Recent conversations, newest first. Private to the signed-in staff member.
export function AskHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: AskConversationSummary[] | undefined;
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Button variant="outline" className="justify-start" onClick={onNew}>
        <Plus />
        New question
      </Button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <p className="px-2.5 pb-1 text-[0.6875rem] tracking-wider text-muted-foreground uppercase">Recent</p>
        {conversations === undefined ? (
          <div className="flex flex-col gap-2 px-2.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2.5 text-sm text-muted-foreground">Your questions will appear here.</p>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg transition-colors",
                c.id === activeId ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2 text-left"
              >
                <span className="truncate text-sm">{c.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.client_name ? `${c.client_name} · ` : ""}
                  {when(c.updated_at)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onDelete(c.id)}
                aria-label="Delete conversation"
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
