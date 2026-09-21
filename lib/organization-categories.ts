// Shared between onboarding (picking a profession the first time) and
// Settings (viewing/changing it later) so both offer the exact same
// options - see Organization.organization_category on the backend.
export type OrganizationCategory = {
  value: string;
  label: string;
  seed: string;
};

export const organizationCategories: OrganizationCategory[] = [
  {
    value: "accounting",
    label: "Accounting",
    seed: "an accounting firm helping clients gather tax documents",
  },
  {
    value: "immigration",
    label: "Immigration law",
    seed:
      "an immigration law firm helping clients gather PR application documents",
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

export function organizationCategoryLabel(value: string | null): string {
  if (!value) return "Not set";
  return organizationCategories.find((c) => c.value === value)?.label ?? value;
}
