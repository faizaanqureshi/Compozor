"use client";

import { useState } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { ApiError, KnowledgeSuggestion, suggestKnowledgeFromEmail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { KnowledgeEntryDialog } from "@/components/knowledge-entry-dialog";

// "Save this answer": keeps a reply the firm wrote as knowledge, so the next
// client who asks the same thing can be answered without a person.
export function SaveAnswerButton({ emailLogId }: { emailLogId: number }) {
  const [suggestion, setSuggestion] = useState<KnowledgeSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    setError(null);
    try {
      setSuggestion(await suggestKnowledgeFromEmail(emailLogId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="-mr-1.5 text-muted-foreground"
        disabled={loading || saved}
        title={error ?? "Save the question and this answer to Knowledge"}
        onClick={() => void open()}
      >
        {saved ? <Check /> : <BookmarkPlus />}
        {saved ? "Saved" : "Save answer"}
      </Button>
      <KnowledgeEntryDialog
        open={suggestion !== null}
        onOpenChange={(next) => !next && setSuggestion(null)}
        initial={suggestion ?? undefined}
        sourceEmailLogId={suggestion?.source_email_log_id}
        heading="Save this answer"
        description="Next time a client asks, Compozor can answer from this. Trim anything specific to this client."
        onSaved={() => setSaved(true)}
      />
    </>
  );
}
