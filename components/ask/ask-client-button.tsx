"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useAskPanel } from "@/components/ask/ask-panel-context";
import { Button } from "@/components/ui/button";

// "Ask about Priya": opens the shared Ask panel, which the client page has
// already scoped to this client.
export function AskClientButton({ clientName }: { clientName: string }) {
  const { openForPage } = useAskPanel();
  return (
    <Button variant="outline" onClick={openForPage}>
      <MessageCircleQuestion />
      Ask about {clientName.split(/\s+/)[0]}
    </Button>
  );
}
