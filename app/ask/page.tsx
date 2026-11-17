"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { History, Plus } from "lucide-react";
import { AskChat } from "@/components/ask/ask-chat";
import { AskHistory } from "@/components/ask/ask-history";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { deleteAskConversation, listAskConversations } from "@/lib/ask";
import { askConversationsKey } from "@/lib/swr-keys";
import { noSubscribe } from "@/lib/deep-link";

function conversationFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const id = Number(new URLSearchParams(window.location.search).get("c"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function AskPage() {
  // The URL's ?c= until staff pick or start a conversation here.
  const urlConversationId = useSyncExternalStore(noSubscribe, conversationFromUrl, () => null);
  const [picked, setConversationId] = useState<number | null | undefined>(undefined);
  const conversationId = picked === undefined ? urlConversationId : picked;
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: conversations, mutate } = useSWR(askConversationsKey(), () => listAskConversations());

  const select = useCallback(
    (id: number | null) => {
      setConversationId(id);
      setHistoryOpen(false);
      window.history.replaceState({}, "", id ? `/ask?c=${id}` : "/ask");
      void mutate();
    },
    [mutate]
  );

  const remove = async (id: number) => {
    await deleteAskConversation(id).catch(() => {});
    if (id === conversationId) select(null);
    else void mutate();
  };

  const history = (
    <AskHistory
      conversations={conversations}
      activeId={conversationId}
      onSelect={select}
      onNew={() => select(null)}
      onDelete={(id) => void remove(id)}
    />
  );

  return (
    // Full-height chat: the page fills the viewport below the mobile top bar
    // (main has p-6 / xl:p-10), so only the transcript scrolls.
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] w-full max-w-[96rem] gap-8 md:h-[calc(100dvh-3rem)] xl:h-[calc(100dvh-5rem)]">
      <aside className="hidden w-64 shrink-0 flex-col xl:flex">{history}</aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 xl:hidden">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setHistoryOpen(true)}>
            <History />
            Recent
          </Button>
          {conversationId !== null && (
            <Button variant="ghost" size="sm" className="-mr-2" onClick={() => select(null)}>
              <Plus />
              New question
            </Button>
          )}
        </div>
        <AskChat conversationId={conversationId} onConversationChange={select} />
      </section>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 p-5 pt-14">
          <SheetTitle className="sr-only">Recent questions</SheetTitle>
          {history}
        </SheetContent>
      </Sheet>
    </div>
  );
}
