"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, downloadQuestionnairePdf, requestQuestionnairePdf, type QuestionnairePdfSnapshot } from "@/lib/api";

export function QuestionnairePdfAccess({ clientId, assignmentId, submissionId, snapshot, onChanged }: {
  clientId: number; assignmentId: number; submissionId: number;
  snapshot: QuestionnairePdfSnapshot | null; onChanged?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = snapshot?.status === "ready";

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      await requestQuestionnairePdf(clientId, assignmentId, submissionId);
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not request this PDF.");
    } finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await downloadQuestionnairePdf(clientId, assignmentId, submissionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `questionnaire-submission-${submissionId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setConfirmOpen(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not retrieve this PDF.");
    } finally { setBusy(false); }
  };

  return <div className="flex flex-col items-start gap-1">
    {ready ? <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={busy}><Download /> Download PDF</Button>
      : snapshot?.status === "pending" ? <span className="text-xs text-muted-foreground">PDF generation pending</span>
      : <Button size="sm" variant="outline" onClick={generate} disabled={busy}><RefreshCw /> {snapshot ? "Retry PDF" : "Generate historical PDF"}</Button>}
    {snapshot?.status === "failed" && <span className="text-xs text-destructive">{snapshot.failure_code === "unsupported_text"
      ? "This PDF needs a font for the submitted characters; the submission remains saved."
      : "PDF generation failed; the submission remains saved."}</span>}
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    <Dialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
      <DialogContent><DialogHeader><DialogTitle>Reveal completed questionnaire?</DialogTitle>
        <DialogDescription>This PDF includes every submitted answer, including confidential and restricted information. Download it only when you need to review the full record.</DialogDescription>
      </DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
        <Button onClick={download} disabled={busy}>{busy ? "Preparing…" : "Reveal and download"}</Button>
      </DialogFooter></DialogContent>
    </Dialog>
  </div>;
}
