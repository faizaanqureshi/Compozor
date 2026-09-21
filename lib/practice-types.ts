// Single source of truth for the practice-type presets and their default
// practice_description seeds. Used by both the onboarding wizard
// (app/onboarding/page.tsx) and Settings' Organization section
// (app/settings/page.tsx) so the two never drift into separate preset
// lists or mismatched seed text - see PRACTICE_TYPE_LABELS below for how
// a stored `practice_type` (an onboarding `value`, or free custom text if
// "Other" was picked) maps back to a display label.

export type PracticeCategory = {
  value: string;
  label: string;
  seed: string;
};

export const PRACTICE_CATEGORIES: PracticeCategory[] = [
  {
    value: "accounting",
    label: "Accounting",
    seed: "an accounting firm helping clients gather tax documents",
  },
  {
    value: "immigration",
    label: "Immigration law",
    seed: "an immigration law firm helping clients gather PR application documents",
  },
  {
    value: "mortgage",
    label: "Mortgage / lending",
    seed: "a mortgage brokerage helping clients gather loan application documents",
  },
  {
    value: "other",
    label: "Other",
    seed: "",
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
