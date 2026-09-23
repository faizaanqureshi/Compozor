// Single source of truth for the practice-type presets, their default
// practice_description seeds, and example document-type text for the
// checklist/package "doc type" placeholders. Used by onboarding
// (app/onboarding/page.tsx), Settings' Organization section
// (app/settings/page.tsx), and the two "Add requirement" style form
// placeholders so none of them drift into separate lists - see
// practiceCategoryForLabel below for how a stored `practice_type` (a
// preset's `label`, or free custom text if "Other" was picked) maps back
// to the matching preset.
//
// `label` is what's actually persisted as Organization.practice_type, and
// must exactly match the keys in the backend's
// app/services/package_seeds.py PACKAGES_BY_PRACTICE_TYPE - that's what
// decides which starter Packages a new (or type-switching) org gets.

export type PracticeCategory = {
  value: string;
  label: string;
  seed: string;
  exampleDocTypes: string;
};

const DEFAULT_EXAMPLE_DOC_TYPES = "e.g. T4, T4A, T5, NOA, bank_statement, qbo_export, receipt";

export const PRACTICE_CATEGORIES: PracticeCategory[] = [
  {
    value: "accounting",
    label: "Accounting",
    seed: "an accounting firm helping clients gather tax documents",
    exampleDocTypes: DEFAULT_EXAMPLE_DOC_TYPES,
  },
  {
    value: "immigration",
    label: "Immigration Consultant",
    seed: "an immigration consulting firm helping clients gather application documents",
    exampleDocTypes: "e.g. Passport, IELTS, ECA Report, Police Clearance, Letter of Acceptance",
  },
  {
    value: "law",
    label: "Law Firm",
    seed: "a law firm helping clients gather documents for real estate closings and family law matters",
    exampleDocTypes: "e.g. Government ID, Agreement of Purchase and Sale, Mortgage Commitment Letter, NOA",
  },
  {
    value: "mortgage",
    label: "Mortgage Broker",
    seed: "a mortgage brokerage helping clients gather loan application documents",
    exampleDocTypes: "e.g. Pay Stub, Letter of Employment, 90-Day Bank History, NOA, T1 General",
  },
  {
    value: "other",
    label: "Other",
    seed: "",
    exampleDocTypes: DEFAULT_EXAMPLE_DOC_TYPES,
  },
];

// `Organization.practice_type` stores the preset's label (e.g. "Accounting")
// for a non-"Other" choice, or the user's own custom text for "Other" - see
// app/onboarding/page.tsx's submit handler. This looks a stored value back
// up against the preset list by label, since that's what's actually persisted.
export function practiceCategoryForLabel(label: string | null | undefined): PracticeCategory | null {
  if (!label) return null;
  return PRACTICE_CATEGORIES.find((c) => c.label === label) ?? null;
}

// For the checklist/package "doc type" placeholders - falls back to the
// generic example for "Other", a custom-typed practice_type, or no
// practice_type set yet (brand-new org, still mid-onboarding).
export function exampleDocTypesFor(practiceType: string | null | undefined): string {
  return practiceCategoryForLabel(practiceType)?.exampleDocTypes ?? DEFAULT_EXAMPLE_DOC_TYPES;
}

// Just the first term from exampleDocTypesFor's list, no "e.g." prefix -
// for a compact inline placeholder (e.g. a package-builder row) where the
// full "e.g. A, B, C" text would be too long.
export function exampleDocTypeFor(practiceType: string | null | undefined): string {
  const withoutPrefix = exampleDocTypesFor(practiceType).replace(/^e\.g\.\s*/i, "");
  return withoutPrefix.split(",")[0]?.trim() ?? withoutPrefix;
}
