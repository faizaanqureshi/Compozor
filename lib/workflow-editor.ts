// Pure helpers for the workflow editor: starter ideas per practice, quick
// checks on instruction text, and how each work-sample format is used.

export type WorkflowStarter = { name: string; description: string };

const STARTERS: Record<string, WorkflowStarter[]> = {
  accounting: [
    { name: "Monthly bookkeeping close", description: "Categorize the month's bank and card transactions, reconcile balances, and prepare a summary report of income, expenses and anything unclear." },
    { name: "T1 return package", description: "Review the client's slips and receipts, list every income source and deduction with its amount, and flag missing or inconsistent documents before filing." },
    { name: "Year-end expense report", description: "Total the year's expenses by category from receipts and statements, and prepare a spreadsheet with a chart matching our sample." },
  ],
  immigration: [
    { name: "Case file summary", description: "Summarize the applicant's documents into a case file overview: identity, education, work history and funds, noting anything expired or inconsistent." },
    { name: "Proof of funds review", description: "Check six months of bank statements, confirm the average and closing balances meet the requirement, and prepare a short letter summarizing them." },
    { name: "Document checklist letter", description: "Compare the documents received against the program's requirements and draft a letter to the client listing what is still needed." },
  ],
  law: [
    { name: "Closing summary", description: "Summarize the purchase agreement, mortgage commitment and ID documents into a closing summary with key dates, parties and amounts." },
    { name: "Financial statement draft", description: "Prepare a family law financial statement from the client's income documents, bank statements and debts, marking anything unsupported." },
    { name: "Document index", description: "Produce an index of every document received with its date, type and relevance to the matter." },
  ],
  mortgage: [
    { name: "Income verification", description: "Verify income from pay stubs, employment letter and NOA, calculate qualifying income, and flag any differences between documents." },
    { name: "Down payment review", description: "Trace the down payment through 90 days of bank history, explain large deposits, and summarize the source of funds." },
    { name: "Lender submission package", description: "Assemble the client's verified documents into a lender-ready package with a cover summary in our standard format." },
  ],
};

const GENERAL: WorkflowStarter[] = [
  { name: "Document review report", description: "Review the client's documents and prepare a report of key findings, amounts and missing information." },
  { name: "Client summary letter", description: "Draft a letter to the client summarizing what we received, what we found, and next steps." },
  { name: "Data extraction spreadsheet", description: "Extract the key figures from every document into a spreadsheet with one row per document." },
];

export function startersFor(practiceType: string | null | undefined): WorkflowStarter[] {
  const key = (practiceType ?? "").toLowerCase();
  const match = Object.keys(STARTERS).find((k) => key.includes(k) || (k === "law" && key.includes("legal")));
  return match ? STARTERS[match] : GENERAL;
}

export type InstructionTip = { id: string; label: string; hint: string; met: boolean };

const OUTPUT_WORDS = /\b(report|letter|summary|spreadsheet|workbook|excel|xlsx|word|docx|pdf|table|chart|memo|package|index|csv|presentation|slides?|deck|list)\b/i;
const SOURCE_WORDS = /\b(statements?|receipts?|slips?|documents?|pay ?stubs?|invoices?|records?|files?|uploads?|t4|noa|passport|bank|ledger|agreement|letters? of)\b/i;
const RULE_WORDS = /\b(if|when|unless|except|exclude|only|flag|missing|must|never|always|round|format|order|sort|group)\b/i;

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// Quick, local signals about what the instructions cover. Tips, not rules:
// good instructions can phrase these differently.
export function instructionTips(text: string): InstructionTip[] {
  const words = countWords(text);
  return [
    { id: "output", label: "Says what to produce", hint: "Name the deliverable and its format, e.g. a PDF report or an Excel workbook.", met: OUTPUT_WORDS.test(text) },
    { id: "sources", label: "Says which documents to use", hint: "Mention the client documents the work relies on.", met: SOURCE_WORDS.test(text) },
    { id: "rules", label: "Covers rules and exceptions", hint: "Say what to do when something is missing, unusual or needs flagging.", met: RULE_WORDS.test(text) },
    { id: "detail", label: "Enough detail to repeat", hint: "Most good instructions are 60 to 350 words.", met: words >= 60 },
  ];
}

export type SampleFormat = { kind: "word" | "slides" | "sheet" | "rebuilt" | "data"; label: string; how: string };

export function sampleFormat(filename: string): SampleFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") return { kind: "word", label: "Word", how: "Edited in place. Make a template to lock its formatting." };
  if (ext === "pptx") return { kind: "slides", label: "PowerPoint", how: "Edited in place. Make a template to lock its formatting." };
  if (ext === "xlsx") return { kind: "sheet", label: "Excel", how: "Filled in place, keeping its formulas, charts and styles." };
  if (["pdf", "png", "jpg", "jpeg", "webp"].includes(ext)) {
    return { kind: "rebuilt", label: ext === "pdf" ? "PDF" : "Image", how: "Recreated from its layout. A template rebuilds it once as an editable file." };
  }
  return { kind: "data", label: ext.toUpperCase() || "File", how: "Used as a reference for structure and wording." };
}
