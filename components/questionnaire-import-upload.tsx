"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/panel";
import { ApiError, startQuestionnaireImport } from "@/lib/api";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Problem = { code?: string; message: string; reasons: string[] };

export function QuestionnaireImportUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [confirmBlank, setConfirmBlank] = useState(false);

  const choose = (next: File | null) => {
    setFile(next);
    setProblem(null);
    setConfirmBlank(false);
  };

  const submit = async (confirmed: boolean) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const job = await startQuestionnaireImport(file, confirmed);
      router.push(`/questionnaires/import/${job.id}`);
    } catch (e) {
      setProblem(e instanceof ApiError ? { code: e.code, message: e.message, reasons: e.reasons } : { message: String(e), reasons: [] });
      setBusy(false);
    }
  };

  const needsConfirmation = problem?.code === "confirm_blank";
  const refused = problem?.code === "completed_questionnaire";

  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <Button className="self-start" variant="ghost" size="sm" nativeButton={false} render={<Link href="/questionnaires" />}><ArrowLeft /> Questionnaires</Button>
    <header className="flex flex-col gap-2">
      <h1 className="text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] md:text-5xl">Import a questionnaire</h1>
      <p className="max-w-2xl text-sm text-pretty text-muted-foreground">Upload your firm’s existing blank questionnaire. Compozor reads it, drafts the questions in the builder and suggests document requests. You review everything, and nothing is created until you approve it.</p>
    </header>

    <Panel title="Your questionnaire">
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0] ?? null); }}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center transition-colors hover:bg-muted/40">
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{file ? file.name : "Choose a PDF or Word file"}</span>
          <span className="text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to choose another` : "Or drag it here. PDF or .docx, up to 20 MB and 60 pages."}</span>
        </button>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Questionnaire file" onChange={(e) => choose(e.target.files?.[0] ?? null)} />

        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Only upload blank templates, never a questionnaire a client has filled in. Compozor checks for filled-in answers before AI processing, but that check can’t guarantee a file contains no personal information. The file itself isn’t stored; its extracted text is kept for 7 days so you can review the import.</p>

        {problem && !needsConfirmation && <div role="alert" className={`flex flex-col gap-1 rounded-lg px-4 py-3 text-sm ${refused ? "bg-destructive/10 text-destructive" : "bg-muted/50"}`}>
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden />{refused ? "This looks like a completed questionnaire" : "This file can’t be imported"}</p>
          <p>{problem.message}</p>
          {problem.reasons.length > 0 && <ul className="list-disc pl-5 text-xs">{problem.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>}

        {needsConfirmation && <div role="alert" className="flex flex-col gap-3 rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning-foreground">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden />Is this a blank template?</p>
          <p>{problem!.message}</p>
          {problem!.reasons.length > 0 && <ul className="list-disc pl-5 text-xs">{problem!.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <label className="flex items-center gap-2 text-foreground"><Switch checked={confirmBlank} onCheckedChange={setConfirmBlank} /> I confirm this is a blank template with no client answers</label>
        </div>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/questionnaires/new" />}>Create manually instead</Button>
          <Button disabled={!file || busy || refused || (needsConfirmation && !confirmBlank)} onClick={() => void submit(needsConfirmation)}>
            {busy ? "Checking the file…" : needsConfirmation ? "Continue with import" : "Import questionnaire"}
          </Button>
        </div>
      </div>
    </Panel>
  </div>;
}
