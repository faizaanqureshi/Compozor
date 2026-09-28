import test from "node:test";
import assert from "node:assert/strict";
import {
  documentCategoryId,
  documentCategoryOptions,
  filterDocumentsByCategory,
} from "../lib/document-categories.ts";

const doc = (classified_type, extra = {}) => ({ classified_type, source_channel: "email", ...extra });
const category = (classified_type) => documentCategoryId(doc(classified_type));

test("classifier descriptions group into industry categories", () => {
  const expected = {
    // Accounting
    "T4 slip": "tax",
    "T4A(OAS)": "tax",
    "Notice of Assessment (NOA)": "tax",
    "GST/HST Return Filings": "tax",
    "bank_statement": "financial",
    "Bank statement for March": "financial",
    "Credit card statement": "financial",
    "Medical Expense Receipts": "receipts",
    "Payroll Summary": "employment",
    "Trial Balance & General Ledger": "business",
    // Immigration
    "passport bio page": "identity",
    "IELTS / CELPIP Test Results": "language_tests",
    "ECA Report": "education",
    "Birth Certificates": "civil",
    "Police Clearance Certificates": "police_medical",
    // Law
    "Agreement of Purchase and Sale (APS)": "property",
    "Separation agreement": "family_law",
    "Sworn affidavit": "legal_filings",
    "Government Issued ID": "identity",
    // Mortgage
    "Most Recent Pay Stub": "employment",
    "Letter of Employment": "employment",
    "90-Day Bank History": "financial",
    "Current Mortgage Statement": "property",
  };
  for (const [description, id] of Object.entries(expected)) {
    assert.equal(category(description), id, description);
  }
});

test("specific phrases win over generic words", () => {
  assert.equal(category("Property tax bill"), "property");
  assert.equal(category("Mortgage commitment letter"), "property");
  assert.equal(category("Visa credit card statement"), "financial");
  assert.equal(category("Student work visa"), "identity");
  assert.equal(category("RRSP contribution receipt"), "tax");
});

test("keywords match whole words only", () => {
  assert.equal(category("Courtesy letter from landlord"), "other");
  assert.equal(category("Photo of a cat"), "other");
});

test("unclassified documents are Other and generated questionnaires have their own group", () => {
  assert.equal(category(null), "other");
  assert.equal(category("   "), "other");
  assert.equal(
    documentCategoryId(doc("Questionnaire PDF", { source_channel: "generated_questionnaire" })),
    "questionnaires"
  );
});

test("options list only present categories, ordered and named for the practice type, with Other last", () => {
  const docs = [doc("Passport"), doc("T4 slip"), doc("T5 slip"), doc("Pay stub"), doc("Holiday photo")];
  assert.deepEqual(documentCategoryOptions(docs, "Accounting"), [
    { id: "tax", label: "Tax Documents", count: 2 },
    { id: "employment", label: "Payroll & Employment", count: 1 },
    { id: "identity", label: "Identity Documents", count: 1 },
    { id: "other", label: "Other", count: 1 },
  ]);
  assert.deepEqual(
    documentCategoryOptions(docs, "Mortgage Broker").map((o) => o.label),
    ["Income & Employment", "Tax Documents", "Identity Documents", "Other"]
  );
  assert.deepEqual(
    documentCategoryOptions(docs, "Immigration Consultant").map((o) => o.label),
    ["Identity Documents", "Employment", "Tax Documents", "Other"]
  );
  // Unknown or custom practice types keep default names and rule order.
  assert.deepEqual(
    documentCategoryOptions(docs, "Dental clinic").map((o) => o.id),
    ["identity", "tax", "employment", "other"]
  );
  assert.deepEqual(documentCategoryOptions([doc("T4 slip")], null).at(-1), { id: "other", label: "Other", count: 0 });
});

test("filtering never drops or duplicates a document", () => {
  const docs = [doc("Passport"), doc("T4 slip"), doc("Bank statement"), doc(null), doc("Unknown scan")];
  assert.deepEqual(filterDocumentsByCategory(docs, new Set()), docs);
  assert.deepEqual(filterDocumentsByCategory(docs, new Set(["tax", "other"])), [docs[1], docs[3], docs[4]]);
  const ids = documentCategoryOptions(docs, "Accounting").map((o) => o.id);
  const union = ids.flatMap((id) => filterDocumentsByCategory(docs, new Set([id])));
  assert.equal(union.length, docs.length);
  assert.deepEqual(new Set(union), new Set(docs));
});
