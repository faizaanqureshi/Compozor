/**
 * Fictional examples for the "How it works" walkthrough. Each one runs the
 * same loop (request, a document that misses a requirement, the correction,
 * the workflow output) for a different kind of firm. Names, dates and
 * figures are invented; nothing here is a client record.
 */
export type StoryExample = {
  id: string;
  /** Switcher label. */
  label: string;
  /** Who the work is for, shown in the example header. */
  client: string;
  /** Who the emails go to. */
  contact: string;
  engagement: string;
  request: { subject: string; body: string };
  reply: { text: string; files: string[] };
  /** Checklist items. The item with `fixed` is the one that needs correcting. */
  checks: { name: string; detail: string; fixed?: string }[];
  correction: string;
  corrected: { text: string; file: string };
  /** What Compozor checked once the replacement arrived. */
  resolved: string;
  workflow: { title: string; inputs: string; instruction: string };
  output: {
    kind: "workbook" | "document";
    file: string;
    title: string;
    metricLabel: string;
    metricValue: string;
    note: string;
  };
};

export const storyExamples: StoryExample[] = [
  {
    id: "bookkeeping",
    label: "Bookkeeping",
    client: "Avery Williams",
    contact: "Avery",
    engagement: "August bookkeeping",
    request: {
      subject: "A quick reminder for August",
      body: "Hi Avery, we’re ready to prepare your monthly report. Please send your August bank statement and expense receipts. You can reply here or use your upload link.",
    },
    reply: {
      text: "Here are my receipts and statement. Is this everything you need?",
      files: ["Statement_July.pdf", "8 receipts"],
    },
    checks: [
      { name: "Expense receipts", detail: "8 files · matched to the checklist" },
      {
        name: "Bank statement",
        detail: "Expected August 2026 · received July 2026",
        fixed: "August 2026 · correct reporting period",
      },
    ],
    correction:
      "Thanks, Avery. I have your receipts, but the statement covers July. We need August for this report. Could you reply with the August statement or use your upload link?",
    corrected: { text: "My mistake. Here’s August.", file: "Statement_August.pdf" },
    resolved: "Compozor checked the August statement.",
    workflow: {
      title: "Monthly expense report",
      inputs: "Statement + receipts + your work sample",
      instruction:
        "Group expenses by category, calculate totals, and prepare the monthly summary in our workbook format.",
    },
    output: {
      kind: "workbook",
      file: "August_expenses.xlsx",
      title: "August expense summary",
      metricLabel: "Total expenses",
      metricValue: "$1,340.00",
      note: "Workbook prepared for your team’s review",
    },
  },
  {
    id: "personal-tax",
    label: "Personal tax",
    client: "Maya Chen",
    contact: "Maya",
    engagement: "2025 personal tax return",
    request: {
      subject: "Your 2025 tax documents",
      body: "Hi Maya, we’re ready to start your 2025 return. Please send your T4, T5 and RRSP contribution receipts. You can reply here or use your upload link.",
    },
    reply: {
      text: "Attached are my slips and my RRSP receipt. Anything else?",
      files: ["T4_2024.pdf", "T5_2025.pdf", "RRSP_receipt.pdf"],
    },
    checks: [
      { name: "T5 slip", detail: "2025 · matched to the checklist" },
      { name: "RRSP contribution receipts", detail: "1 receipt · matched to the checklist" },
      {
        name: "T4 slip",
        detail: "Expected 2025 · received 2024",
        fixed: "2025 · correct tax year",
      },
    ],
    correction:
      "Thanks, Maya. Your T5 and RRSP receipt are here, but the T4 is for 2024. We need your 2025 T4 for this return. Could you reply with it or use your upload link?",
    corrected: { text: "Wrong year, sorry. Here’s 2025.", file: "T4_2025.pdf" },
    resolved: "Compozor checked the 2025 T4.",
    workflow: {
      title: "Personal tax summary",
      inputs: "Slips + receipts + your work sample",
      instruction:
        "List each slip and receipt, total income and RRSP contributions, and prepare the summary in our workbook format.",
    },
    output: {
      kind: "workbook",
      file: "Chen_2025_tax_summary.xlsx",
      title: "2025 tax summary",
      metricLabel: "Employment income (T4)",
      metricValue: "$68,400.00",
      note: "Summary prepared for your team’s review",
    },
  },
  {
    id: "immigration",
    label: "Immigration",
    client: "Daniel Moreau",
    contact: "Daniel",
    engagement: "Work permit renewal",
    request: {
      subject: "Documents for your permit renewal",
      body: "Hi Daniel, we’re preparing your work permit renewal. Please send your passport, your current work permit and a letter from your employer. You can reply here or use your upload link.",
    },
    reply: {
      text: "Here’s everything for the renewal. Let me know if anything is missing.",
      files: ["Passport.pdf", "Work_permit.pdf", "Employer_letter.pdf"],
    },
    checks: [
      { name: "Passport", detail: "Photo page · matched to the checklist" },
      { name: "Current work permit", detail: "Matched to the checklist" },
      {
        name: "Employer letter",
        detail: "Must be dated within 30 days · received a letter from May 2026",
        fixed: "Dated October 2026 · within 30 days",
      },
    ],
    correction:
      "Thanks, Daniel. Your passport and permit are here, but the employer letter is from May. We need one dated within the last 30 days. Could you ask your employer for an updated letter?",
    corrected: {
      text: "My employer sent a new one today.",
      file: "Employer_letter_October.pdf",
    },
    resolved: "Compozor checked the new employer letter.",
    workflow: {
      title: "Renewal application summary",
      inputs: "Passport + permit + letter + your work sample",
      instruction:
        "Summarize the applicant’s details, permit history and current job, index each document, and prepare the summary in our Word format.",
    },
    output: {
      kind: "document",
      file: "Moreau_renewal_summary.docx",
      title: "Work permit renewal summary",
      metricLabel: "Documents indexed",
      metricValue: "3 of 3",
      note: "Summary prepared for legal review",
    },
  },
  {
    id: "year-end",
    label: "Year-end",
    client: "Birchwood Bakery",
    contact: "Lena",
    engagement: "Year-end · fiscal 2026",
    request: {
      subject: "Statements for your year-end",
      body: "Hi Lena, we’re starting Birchwood Bakery’s year-end. Please send the bank and credit card statements from October 2025 to September 2026. You can reply here or use your upload link.",
    },
    reply: {
      text: "All the statements are attached.",
      files: ["11 bank statements", "12 card statements"],
    },
    checks: [
      { name: "Credit card statements", detail: "12 of 12 months · matched to the checklist" },
      {
        name: "Bank statements",
        detail: "Expected 12 months · March 2026 is missing",
        fixed: "12 of 12 months · complete",
      },
    ],
    correction:
      "Thanks, Lena. The card statements are complete, but the bank statements skip March 2026. Could you send March so we can finish the year-end?",
    corrected: { text: "Found it. March is attached.", file: "Bank_March_2026.pdf" },
    resolved: "Compozor checked the March bank statement.",
    workflow: {
      title: "Year-end package",
      inputs: "Statements + your work sample",
      instruction:
        "Match transactions to each statement, group them by account and category, and prepare the year-end package in our workbook format.",
    },
    output: {
      kind: "workbook",
      file: "Birchwood_year_end_2026.xlsx",
      title: "Fiscal 2026 year-end package",
      metricLabel: "Transactions matched",
      metricValue: "1,284",
      note: "Unmatched items listed for your team’s review",
    },
  },
];
