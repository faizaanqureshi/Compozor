// Groups a client's files into broad categories for the Files card filter.
// Presentation only - it reads the classification the backend already
// stored (`classified_type`, the classifier's free-text description such as
// "T4 slip" or "bank statement for March") and never changes a document,
// its checklist match, or anything sent to the backend.
//
// Every document lands in exactly one category: the first rule whose
// keywords match wins, and anything unmatched (or unclassified) is "Other",
// so filtering can never make a file unreachable. Rules for every industry
// always apply - an accounting firm that receives a passport still sees it
// under Identity Documents - while the firm's practice type decides the
// category names and order (see lib/practice-types.ts).

export type DocumentCategoryId =
  | "questionnaires"
  | "identity"
  | "language_tests"
  | "education"
  | "civil"
  | "police_medical"
  | "family_law"
  | "legal_filings"
  | "property"
  | "tax"
  | "receipts"
  | "employment"
  | "financial"
  | "business"
  | "other";

type CategoryRule = {
  id: Exclude<DocumentCategoryId, "other">;
  label: string;
  keywords: RegExp;
};

// Whole words/phrases only, case-insensitive: each entry is a regex
// fragment wrapped in word boundaries, so "court" never matches "courtesy".
const words = (...fragments: string[]) => new RegExp(`\\b(?:${fragments.join("|")})\\b`, "i");

// Order is match priority: more specific phrases come before generic ones
// ("property tax bill" is Real Estate, not Tax; "mortgage commitment letter"
// is Real Estate, not Employment; "Visa credit card statement" is Financial,
// because Identity only matches visa phrases like "work visa").
const RULES: CategoryRule[] = [
  { id: "questionnaires", label: "Questionnaires", keywords: words("questionnaires?") },
  {
    id: "property",
    label: "Real Estate",
    keywords: words(
      "agreement of purchase(?: and sale)?", "purchase (?:and )?sale agreements?", "aps", "deeds?", "land title",
      "title (?:search|certificate|insurance)", "property tax(?:es)?", "property insurance", "home insurance",
      "mortgages?", "commitment letter", "appraisals?", "property valuations?", "status certificates?",
      "listing agreement", "mls", "feature sheet", "lease(?: agreement)?s?", "rental agreements?", "tenancy",
      "condo fees?", "property management", "direction of funds", "gift letters?"
    ),
  },
  {
    id: "police_medical",
    label: "Police & Medical",
    keywords: words(
      "police (?:clearance|certificate|check)s?", "criminal record(?: check)?", "background check",
      "medical (?:exam|examination|report|certificate)s?", "immigration medical", "vaccination(?: record)?s?"
    ),
  },
  {
    id: "language_tests",
    label: "Language Tests",
    keywords: words("ielts", "celpip", "tef", "tcf", "toefl", "pte", "duolingo", "language (?:test|proficiency)"),
  },
  {
    id: "education",
    label: "Education",
    keywords: words(
      "eca", "educational credential assessment", "wes", "diplomas?", "degrees?", "transcripts?",
      "letter of acceptance", "acceptance letter", "enrol(?:l)?ment(?: letter)?", "study permit",
      "provincial attestation letter", "pal", "statement of purpose", "study plan"
    ),
  },
  {
    id: "family_law",
    label: "Family Law",
    keywords: words(
      "separation agreement", "divorce (?:order|application|decree)", "custody", "parenting (?:plan|agreement)",
      "child support", "spousal support", "marriage contract", "prenup(?:tial agreement)?", "cohabitation agreement"
    ),
  },
  {
    id: "civil",
    label: "Civil Documents",
    keywords: words(
      "birth certificates?", "marriage certificates?", "death certificates?", "divorce certificates?",
      "name change(?: certificate)?", "adoption(?: order| certificate)?"
    ),
  },
  {
    id: "identity",
    label: "Identity Documents",
    keywords: words(
      "passports?", "driver'?s'? licen[cs]e", "government[- ]issued(?: photo)? id", "photo id", "government id",
      "identification", "id card", "national id", "health card", "pr card", "permanent resident card",
      "citizenship (?:card|certificate)", "sin (?:card|letter)",
      "(?:visitor|student|work|travel|entry|temporary resident|tourist) visa", "visa (?:page|stamp|approval|document)",
      "work permit", "biometrics?"
    ),
  },
  {
    id: "legal_filings",
    label: "Court & Legal Filings",
    keywords: words(
      "court", "affidavits?", "statutory declaration", "pleadings?", "statement of claim", "judge?ments?",
      "subpoena", "last will", "will and testament", "power of attorney", "retainer(?: agreement)?",
      "engagement letter", "legal notice", "notari[sz]ed"
    ),
  },
  {
    id: "tax",
    label: "Tax Documents",
    keywords: words(
      // CRA slips and forms: T1, T4, T4A, T4FHSA, T2125, T5008...
      "t\\d{1,4}[a-z]*", "t1 generals?", "rl ?\\d+", "noas?", "notices? of (?:re)?assessment",
      "tax (?:return|slip|form)s?", "rrsp", "tfsa", "fhsa", "gst", "hst", "w ?2", "1099", "tax(?:es)?"
    ),
  },
  { id: "receipts", label: "Receipts", keywords: words("receipts?", "donations?", "charitable") },
  {
    id: "employment",
    label: "Payroll & Employment",
    keywords: words(
      "pay ?stubs?", "pay ?slips?", "payroll", "employment letter", "letter of employment",
      "employment (?:verification|confirmation|reference)", "job offer", "offer letter",
      "record of employment", "roe", "reference letter"
    ),
  },
  {
    id: "financial",
    label: "Financial Documents",
    keywords: words(
      "bank", "banking", "credit card", "void(?:ed)? che(?:que|ck)", "investments?", "brokerage",
      "account statements?", "proof of (?:funds|financial support)", "financial support", "net worth",
      "pensions?", "annuity", "loans?", "line of credit"
    ),
  },
  {
    id: "business",
    label: "Business Records",
    keywords: words(
      "financial statements?", "balance sheet", "income statement", "profit and loss", "p&l",
      "general ledger", "trial balance", "ledgers?", "bookkeeping", "qbo", "quickbooks", "xero", "invoices?",
      "revenue", "sales", "rental income", "expense (?:summary|ledger|log|report)s?", "(?:vehicle|mileage) logs?",
      "articles of incorporation", "incorporation", "minute book", "business licen[cs]e", "shareholders?"
    ),
  },
];

const OTHER_LABEL = "Other";

// Practice-specific names and ordering. Keys are the stored
// Organization.practice_type labels from lib/practice-types.ts; a category
// not listed keeps its default label and follows the listed ones.
const PRACTICE_PRESENTATION: Record<
  string,
  { order: DocumentCategoryId[]; labels?: Partial<Record<DocumentCategoryId, string>> }
> = {
  Accounting: {
    order: ["tax", "financial", "receipts", "employment", "business"],
  },
  "Immigration Consultant": {
    order: ["identity", "language_tests", "education", "employment", "civil", "police_medical"],
    labels: { employment: "Employment" },
  },
  "Law Firm": {
    order: ["identity", "property", "family_law", "legal_filings", "financial"],
  },
  "Mortgage Broker": {
    order: ["employment", "tax", "financial", "property", "identity"],
    labels: {
      employment: "Income & Employment",
      financial: "Bank & Assets",
      property: "Property Documents",
    },
  },
};

type CategorizableDocument = {
  classified_type: string | null;
  source_channel?: string | null;
};

export function documentCategoryId(doc: CategorizableDocument): DocumentCategoryId {
  if (doc.source_channel === "generated_questionnaire") return "questionnaires";
  // "bank_statement", "Purchase/Sale Agreement" and "RL-1" read as words.
  const text = doc.classified_type?.replace(/[_/-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "other";
  return RULES.find((rule) => rule.keywords.test(text))?.id ?? "other";
}

export type DocumentCategoryOption = {
  id: DocumentCategoryId;
  label: string;
  count: number;
};

// The categories present in `documents`, named and ordered for the firm's
// practice type, with "Other" always last (and always present, even at 0,
// so the option is stable). "All docs" is the filter's own default and
// isn't part of this list.
export function documentCategoryOptions(
  documents: CategorizableDocument[],
  practiceType: string | null | undefined
): DocumentCategoryOption[] {
  const counts = new Map<DocumentCategoryId, number>();
  for (const doc of documents) {
    const id = documentCategoryId(doc);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const presentation = (practiceType && PRACTICE_PRESENTATION[practiceType]) || null;
  const rank = (id: DocumentCategoryId) => {
    const i = presentation?.order.indexOf(id) ?? -1;
    return i === -1 ? presentation?.order.length ?? 0 : i;
  };
  const categories = RULES.filter((rule) => counts.has(rule.id))
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => rank(a.rule.id) - rank(b.rule.id) || a.i - b.i)
    .map(({ rule }) => ({
      id: rule.id,
      label: presentation?.labels?.[rule.id] ?? rule.label,
      count: counts.get(rule.id) ?? 0,
    }));
  return [...categories, { id: "other", label: OTHER_LABEL, count: counts.get("other") ?? 0 }];
}

// An empty selection means "All docs".
export function filterDocumentsByCategory<T extends CategorizableDocument>(
  documents: T[],
  selected: ReadonlySet<DocumentCategoryId>
): T[] {
  if (selected.size === 0) return documents;
  return documents.filter((doc) => selected.has(documentCategoryId(doc)));
}
