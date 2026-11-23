import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARISON_ROWS,
  PLANS,
  PRICING_FOOTNOTES,
  defaultPricingCurrency,
  parsePricingCurrency,
} from "../lib/pricing.ts";

test("visitors in Canada, or with no country header, see CAD first", () => {
  for (const country of ["CA", "ca", " CA ", null, undefined, ""]) {
    assert.equal(defaultPricingCurrency(country), "cad", String(country));
  }
});

test("visitors elsewhere see USD first", () => {
  for (const country of ["US", "GB", "IN", "MX"]) {
    assert.equal(defaultPricingCurrency(country), "usd", country);
  }
});

test("only known currencies are restored from storage", () => {
  assert.equal(parsePricingCurrency("cad"), "cad");
  assert.equal(parsePricingCurrency("usd"), "usd");
  for (const value of [null, "", "CAD", "eur", undefined]) {
    assert.equal(parsePricingCurrency(value), null, String(value));
  }
});

test("plans show the approved prices in both currencies", () => {
  const prices = Object.fromEntries(PLANS.map((plan) => [plan.name, plan.price]));
  assert.deepEqual(prices, {
    Solo: { cad: "CA$159", usd: "US$119" },
    Team: { cad: "CA$399", usd: "US$299" },
    Practice: { cad: "CA$799", usd: "US$599" },
    Firm: { cad: "CA$1,599", usd: "US$1,199" },
    Enterprise: null,
  });
  assert.equal(PLANS.filter((plan) => plan.recommended).map((plan) => plan.name).join(), "Team");
  assert.equal(PLANS.at(-1).cta.href, "mailto:hello@compozor.com");
  for (const plan of PLANS.slice(0, -1)) assert.equal(plan.cta.href, "/sign-up");
  for (const row of COMPARISON_ROWS) assert.ok(row.from >= 0 && row.from < PLANS.length, row.label);
  assert.match(PRICING_FOOTNOTES.cad, /Canadian dollars.*HST extra/);
  assert.match(PRICING_FOOTNOTES.usd, /US dollars/);
});
