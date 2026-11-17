"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Maximize2, SquarePen, X } from "lucide-react";
import { AskChat } from "@/components/ask/ask-chat";
import { useAskPanel } from "@/components/ask/ask-panel-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SCOPE_NOUN = { client: "About", workflow: "Workflow", run: "Run", email: "Thread" } as const;

// Ask, beside whatever page you're on. Docked (the page narrows) on wide
// screens, over the page on tablets, full screen on phones. Always mounted,
// only hidden when closed, so an answer keeps streaming and the conversation
// follows you between pages.
export function AskPanel() {
  const { open, setOpen, available, conversationId, setConversationId, scope, dismissScope } = useAskPanel();
  const panelRef = useRef<HTMLElement | null>(null);
  // On open, put the cursor in the question box on desktop; on phones, focus
  // the panel itself so the keyboard doesn't jump up over the suggestions.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const target = wide ? panelRef.current?.querySelector<HTMLElement>("#ask-input") : panelRef.current;
    target?.focus({ preventScroll: true });
  }, [open]);
  if (!available) return null;
  const closeOnPhone = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  };
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      data-ask-panel
      aria-label="Ask"
      hidden={!open}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background outline-none",
        "md:inset-y-0 md:right-0 md:left-auto md:w-[26rem] md:border-l md:border-border md:shadow-lg",
        "xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:shrink-0 xl:shadow-none",
        !open && "hidden"
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border/60 pr-2 pl-5">
        <h2 className="flex-1 text-[0.9375rem] font-medium">Ask</h2>
        {conversationId !== null && (
          <PanelButton label="New question" onClick={() => setConversationId(null)}>
            <SquarePen />
          </PanelButton>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                nativeButton={false}
                aria-label="Open full page"
                onClick={() => setOpen(false)}
                render={<Link href={conversationId ? `/ask?c=${conversationId}` : "/ask"} />}
              />
            }
          >
            <Maximize2 />
          </TooltipTrigger>
          <TooltipContent side="bottom">Open full page</TooltipContent>
        </Tooltip>
        <PanelButton label="Close (⌘K)" onClick={() => setOpen(false)}>
          <X />
        </PanelButton>
      </div>
      {scope && (
        <div className="flex shrink-0 items-center px-5 pt-3">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs text-muted-foreground">
            <span className="truncate">
              {SCOPE_NOUN[scope.kind]}: <span className="text-foreground">{scope.label}</span>
            </span>
            <button
              type="button"
              onClick={dismissScope}
              aria-label="Ask without this context"
              className="flex size-4.5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
      <AskChat
        variant="panel"
        scope={scope}
        conversationId={conversationId}
        onConversationChange={setConversationId}
        onNavigate={closeOnPhone}
      />
    </aside>
  );
}

function PanelButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
