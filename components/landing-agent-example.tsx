import { Check, FileSpreadsheet, FileText } from "lucide-react";

/** Fictional, completed exchange—not a live agent or a promise of universal autonomy. */
export function LandingAgentExample() {
  return (
    <div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        August bookkeeping · automatic replies and workflow enabled
      </p>
      <ol className="mt-5 space-y-5">
        <li>
          <p className="text-xs text-muted-foreground">Avery · client reply</p>
          <p className="mt-2 text-sm leading-relaxed">
            Here are my receipts and statement. Is this everything you need?
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            Statement_July.pdf · 8 receipts
          </p>
        </li>
        <li className="border-l-2 border-accent bg-card px-4 py-4">
          <p className="text-xs text-marketing-forest dark:text-marketing-brass">
            Compozor · replying on your firm’s behalf
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Thanks, Avery. I have your receipts, but the statement covers July.
            We need August for this report. Could you reply with the August
            statement or use your upload link?
          </p>
        </li>
        <li>
          <p className="text-xs text-muted-foreground">Avery · corrected document</p>
          <p className="mt-2 text-sm leading-relaxed">
            My mistake—here’s August.
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            Statement_August.pdf
          </p>
        </li>
      </ol>
      <div className="mt-5 border-t border-border pt-5">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          Compozor checked the corrected statement. Requirements satisfied;
          your configured workflow started automatically.
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-marketing-forest dark:text-marketing-brass" aria-hidden />
          <div className="min-w-0">
            <p className="break-words text-sm">August_expenses.xlsx</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Prepared in your format · checks and review notes included
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
