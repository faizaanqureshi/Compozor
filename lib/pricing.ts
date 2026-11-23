// Public plans for the /pricing page. Prices are fixed per currency (not
// converted from a live rate), so each one is written out exactly as shown.

export type PricingCurrency = "cad" | "usd";

export interface Plan {
  name: string;
  /** Monthly price per currency; null for Enterprise (custom). */
  price: Record<PricingCurrency, string> | null;
  /** Line under the price on the plan card. */
  size: string;
  /** "Team size" cell in the comparison table. */
  teamSize: string;
  features: string[];
  cta: { label: string; href: string };
  recommended?: boolean;
}

// Every plan starts with the 14-day free trial (no card); the plan itself is
// chosen in Settings, under Plan & usage.
const START_HREF = "/sign-up";
export const TRIAL_LINE = "Every plan starts with a 14-day free trial. No card needed.";

export const PLANS: Plan[] = [
  {
    name: "Solo",
    price: { cad: "CA$159", usd: "US$119" },
    size: "1 user",
    teamSize: "1 user",
    features: [
      "Every Compozor feature",
      "Workflows and full automation",
      "Ask, with web search and Knowledge",
      "Generous usage included",
    ],
    cta: { label: "Start free trial", href: START_HREF },
  },
  {
    name: "Team",
    price: { cad: "CA$399", usd: "US$299" },
    size: "Up to 5 users",
    teamSize: "Up to 5",
    features: [
      "Everything in Solo",
      "A mailbox for each person",
      "Assign clients to staff",
      "Admin and staff roles",
    ],
    cta: { label: "Start free trial", href: START_HREF },
    recommended: true,
  },
  {
    name: "Practice",
    price: { cad: "CA$799", usd: "US$599" },
    size: "Up to 10 users",
    teamSize: "Up to 10",
    features: [
      "Everything in Team",
      "We set you up and import your clients",
      "Priority support",
    ],
    cta: { label: "Start free trial", href: START_HREF },
  },
  {
    name: "Firm",
    price: { cad: "CA$1,599", usd: "US$1,199" },
    size: "Up to 20 users",
    teamSize: "Up to 20",
    features: [
      "Everything in Practice",
      "Your branding on the client portal and documents",
      "Audit history export",
      "Early access to new features",
    ],
    cta: { label: "Start free trial", href: START_HREF },
  },
  {
    name: "Enterprise",
    price: null,
    size: "21 users or more",
    teamSize: "21+",
    features: [
      "Everything in Firm",
      "Limits set to your practice",
      "Pay by invoice",
      "A dedicated contact",
    ],
    cta: { label: "Talk to us", href: "mailto:hello@compozor.com" },
  },
];

/** Comparison rows: each is included from the plan at `from` (index into PLANS) upward. */
export const COMPARISON_ROWS: { label: string; from: number }[] = [
  { label: "Every Compozor feature", from: 0 },
  { label: "Workflows and full automation", from: 0 },
  { label: "Ask, with web search and Knowledge", from: 0 },
  { label: "Client portal, reminders, questionnaires", from: 0 },
  { label: "Generous usage included", from: 0 },
  { label: "A mailbox per person, client assignment, roles", from: 1 },
  { label: "Done-for-you setup and client import", from: 2 },
  { label: "Priority support", from: 2 },
  { label: "Your branding on portal and documents", from: 3 },
  { label: "Audit history export", from: 3 },
  { label: "Early access to new features", from: 3 },
  { label: "Custom limits, invoicing, dedicated contact", from: 4 },
];

export const PRICING_FOOTNOTES: Record<PricingCurrency, string> = {
  cad: "Prices in Canadian dollars, billed monthly. HST extra.",
  usd: "Prices in US dollars, billed monthly. Taxes extra where applicable.",
};

export const PRICING_CURRENCY_STORAGE_KEY = "compozor-currency";

/**
 * Currency shown before the visitor picks one, from Vercel's
 * `x-vercel-ip-country` header: CAD for Canada, and when the header is
 * missing (local dev, non-Vercel hosts); USD everywhere else.
 */
export function defaultPricingCurrency(country: string | null | undefined): PricingCurrency {
  const code = country?.trim().toUpperCase();
  return !code || code === "CA" ? "cad" : "usd";
}

export function parsePricingCurrency(value: unknown): PricingCurrency | null {
  return value === "cad" || value === "usd" ? value : null;
}
