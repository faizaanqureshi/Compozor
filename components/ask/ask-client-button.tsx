"use client";

import { useState } from "react";
import { MessageCircleQuestion, SquarePen } from "lucide-react";
import { AskChat } from "@/components/ask/ask-chat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

// "Ask about Priya": the same chat, opened beside the client's page and
// scoped to them, so staff can dig into one client without leaving it.
export function AskClientButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const firstName = clientName.split(/\s+/)[0];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MessageCircleQuestion />
        Ask about {firstName}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <div className="flex items-center gap-2 border-b border-border/60 py-3 pr-14 pl-5">
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="truncate">Ask about {clientName}</SheetTitle>
              <SheetDescription className="sr-only">Questions about this client&apos;s file</SheetDescription>
            </div>
            {conversationId !== null && (
              <Button variant="ghost" size="icon-sm" onClick={() => setConversationId(null)} aria-label="New question">
                <SquarePen />
              </Button>
            )}
          </div>
          <AskChat
            variant="panel"
            clientId={clientId}
            clientName={clientName}
            conversationId={conversationId}
            onConversationChange={setConversationId}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
