// Client-side view of a published questionnaire definition.
//
// Mirrors the backend's declarative semantics (Compozor-API
// app/services/questionnaire_engine.py) only to decide what to *show*: which
// sections/questions are visible, which are currently required, and which
// required answers are still missing. The backend remains authoritative: it
// re-validates every draft save and submission and alone evaluates document
// rules. Nothing here generates requirements or decides upload access.

export type QuestionType =
  | "short_text"
  | "long_text"
  | "yes_no"
  | "single_choice"
  | "multiple_choice"
  | "date"
  | "number"
  | "currency"
  | "contact"
  | "address"
  | "repeating_group"
  | "information"
  | "confirmation";

export interface Condition {
  kind: "comparison" | "all" | "any" | "not" | "repeat";
  question_id?: string | null;
  operator?: string | null;
  value?: unknown;
  conditions?: Condition[] | null;
  condition?: Condition | null;
  group_question_id?: string | null;
  quantifier?: "any" | "all" | null;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface QuestionDefinition {
  id: string;
  type: QuestionType;
  label: string;
  description?: string | null;
  required?: boolean;
  visible_when?: Condition | null;
  required_when?: Condition | null;
  sensitivity?: string;
  options?: ChoiceOption[] | null;
  date_precision?: "day" | "month" | "year" | "partial" | null;
  currency_code?: string | null;
  fields?: QuestionDefinition[] | null;
  entry_id_key?: string | null;
  min_items?: number | null;
  max_items?: number | null;
  input_format?: InputFormat | null;
}

// ---- Answer formats (mirrors app/services/answer_formats.py) --------------------------------
// A closed set of formats, validated identically on the server. A region is set
// only when the questionnaire establishes the jurisdiction.

export type FormatKind = "phone" | "email" | "postal_code" | "national_id";
export interface InputFormat { kind: FormatKind; region?: "CA" | "US" | null }

const digitsOf = (value: string) => value.replace(/\D/g, "");

function luhn(digits: string): boolean {
  let total = 0;
  [...digits].reverse().forEach((ch, i) => {
    let n = Number(ch);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    total += n;
  });
  return total % 10 === 0;
}

/** A value-free problem description, or null when the answer fits the format. */
export function formatIssue(format: InputFormat, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const region = format.region ?? null;
  switch (format.kind) {
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : "Enter a valid email address.";
    case "phone": {
      if (!/^[0-9+().\-\s]+(?:\s*(?:ext\.?|x)\s*\d{1,6})?$/i.test(value)) return "Enter a valid phone number.";
      let digits = digitsOf(value.split(/\s*(?:ext\.?|x)\s*/i)[0]);
      if (region) {
        if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
        return digits.length === 10 && /[2-9]/.test(digits[0]) ? null : "Enter a 10-digit phone number.";
      }
      return digits.length >= 7 && digits.length <= 15 ? null : "Enter a valid phone number.";
    }
    case "postal_code":
      if (region === "CA") return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(value) ? null : "Enter a postal code like A1A 1A1.";
      if (region === "US") return /^\d{5}(?:-\d{4})?$/.test(value) ? null : "Enter a 5-digit ZIP code.";
      return /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(value) ? null : "Enter a valid postal code.";
    case "national_id": {
      const digits = digitsOf(value);
      if (region === "CA") return /^[\d\s-]+$/.test(value) && digits.length === 9 && luhn(digits) ? null : "Enter a valid 9-digit Social Insurance Number.";
      if (region === "US") {
        const valid = /^[\d\s-]+$/.test(value) && digits.length === 9 && !["000", "666"].includes(digits.slice(0, 3)) && digits[0] !== "9"
          && digits.slice(3, 5) !== "00" && digits.slice(5) !== "0000";
        return valid ? null : "Enter a valid 9-digit Social Security Number.";
      }
      return /^[A-Za-z0-9][A-Za-z0-9 -]{3,24}$/.test(value) ? null : "Enter a valid identification number.";
    }
  }
}

/** Presentation hints for an input with a format: shown inside/near the field, never validation by themselves. */
export function formatHint(format: InputFormat): { example: string; inputMode: "tel" | "email" | "numeric" | "text"; autoComplete: string } {
  const region = format.region ?? null;
  switch (format.kind) {
    case "phone": return { example: region === "US" ? "212-555-0100" : region === "CA" ? "416-555-0199" : "", inputMode: "tel", autoComplete: "tel" };
    case "email": return { example: "name@example.com", inputMode: "email", autoComplete: "email" };
    case "postal_code": return { example: region === "CA" ? "A1A 1A1" : region === "US" ? "12345" : "", inputMode: region === "US" ? "numeric" : "text", autoComplete: "postal-code" };
    case "national_id": return { example: region === "CA" ? "123-456-789" : region === "US" ? "123-45-6789" : "", inputMode: region ? "numeric" : "text", autoComplete: "off" };
  }
}

/** Tidy a valid answer into its conventional form (only when it already fits the format). */
export function normalizeFormatted(format: InputFormat, raw: string): string {
  const value = raw.trim();
  if (!value || formatIssue(format, value)) return raw;
  const digits = digitsOf(value);
  const region = format.region ?? null;
  if (format.kind === "phone" && region && !/ext|x/i.test(value)) {
    const local = digits.length === 11 ? digits.slice(1) : digits;
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  if (format.kind === "postal_code" && region === "CA") return `${value.replace(/[ -]/g, "").slice(0, 3)} ${value.replace(/[ -]/g, "").slice(3)}`.toUpperCase();
  if (format.kind === "national_id" && region === "CA") return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (format.kind === "national_id" && region === "US") return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (format.kind === "email") return value;
  return raw;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description?: string | null;
  visible_when?: Condition | null;
  questions: QuestionDefinition[];
}

export interface QuestionnaireDefinition {
  format_version?: string;
  sections: QuestionnaireSection[];
}

export type Answers = Record<string, unknown>;
export type Row = Record<string, unknown>;
// Repeating-group id -> the row currently in scope.
export type Scope = Record<string, Row>;

const MISSING = Symbol("missing");
const UNKNOWN = Symbol("unknown");
type Resolved = unknown | typeof MISSING | typeof UNKNOWN;
type Tri = boolean | typeof UNKNOWN;

export const CONTACT_FIELDS = ["name", "email", "phone"] as const;
export const ADDRESS_FIELDS = ["line1", "line2", "city", "region", "postal_code", "country"] as const;
export const MAX_REPEAT_ITEMS = 500;

export function entryIdKey(q: QuestionDefinition): string {
  return q.entry_id_key || "_id";
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

export class QuestionnaireContext {
  readonly questions = new Map<string, QuestionDefinition>();
  readonly parents = new Map<string, string[]>();
  readonly sectionOf = new Map<string, QuestionnaireSection>();
  private cache = new Map<string, Resolved>();
  private resolving = new Set<string>();
  private rowIds = new WeakMap<object, number>();
  private nextRowId = 1;

  readonly definition: QuestionnaireDefinition;
  readonly answers: Answers;

  constructor(definition: QuestionnaireDefinition, answers: Answers) {
    this.definition = definition;
    this.answers = answers;
    const visit = (questions: QuestionDefinition[], parents: string[], section: QuestionnaireSection) => {
      for (const q of questions) {
        this.questions.set(q.id, q);
        this.parents.set(q.id, parents);
        this.sectionOf.set(q.id, section);
        visit(q.fields ?? [], [...parents, q.id], section);
      }
    };
    for (const section of definition.sections) visit(section.questions, [], section);
  }

  private scopeKey(questionId: string, scope: Scope): string {
    const parts = Object.keys(scope).sort().map((group) => {
      const row = scope[group];
      if (!this.rowIds.has(row)) this.rowIds.set(row, this.nextRowId++);
      return `${group}:${this.rowIds.get(row)}`;
    });
    return `${questionId}|${parts.join(",")}`;
  }

  resolve(questionId: string, scope: Scope): Resolved {
    const q = this.questions.get(questionId);
    if (!q) return UNKNOWN;
    const key = this.scopeKey(questionId, scope);
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.resolving.has(key)) return UNKNOWN; // Publication rejects cycles; never loop.
    this.resolving.add(key);
    try {
      let container: Row = this.answers;
      for (const parent of this.parents.get(questionId) ?? []) {
        if (!(parent in scope) || this.resolve(parent, scope) === UNKNOWN) return UNKNOWN;
        container = scope[parent];
      }
      const section = this.sectionOf.get(questionId)!;
      let result: Resolved;
      if (section.visible_when && this.condition(section.visible_when, scope) !== true) result = UNKNOWN;
      else if (q.visible_when && this.condition(q.visible_when, scope) !== true) result = UNKNOWN;
      else {
        const value = Object.prototype.hasOwnProperty.call(container, questionId) ? container[questionId] : MISSING;
        result = value === null || value === undefined || value === "" ? MISSING : value;
      }
      this.cache.set(key, result);
      return result;
    } finally {
      this.resolving.delete(key);
    }
  }

  condition(condition: Condition, scope: Scope): Tri {
    if (condition.kind === "all" || condition.kind === "any") {
      const values = (condition.conditions ?? []).map((child) => this.condition(child, scope));
      if (condition.kind === "all") return values.includes(false) ? false : values.includes(UNKNOWN) ? UNKNOWN : true;
      return values.includes(true) ? true : values.includes(UNKNOWN) ? UNKNOWN : false;
    }
    if (condition.kind === "not") {
      const value = condition.condition ? this.condition(condition.condition, scope) : UNKNOWN;
      return value === UNKNOWN ? UNKNOWN : !value;
    }
    if (condition.kind === "repeat") {
      const group = condition.group_question_id ?? "";
      const rows = this.resolve(group, scope);
      if (rows === UNKNOWN) return UNKNOWN;
      if (rows === MISSING || !Array.isArray(rows) || !condition.condition) return false;
      const values = rows
        .filter((row): row is Row => !!row && typeof row === "object")
        .map((row) => this.condition(condition.condition!, { ...scope, [group]: row }));
      if (values.length === 0) return false;
      if (condition.quantifier === "any") return values.includes(true) ? true : values.includes(UNKNOWN) ? UNKNOWN : false;
      return values.includes(false) ? false : values.includes(UNKNOWN) ? UNKNOWN : true;
    }
    const actual = this.resolve(condition.question_id ?? "", scope);
    if (actual === UNKNOWN) return UNKNOWN;
    const op = condition.operator;
    const expected = condition.value;
    if (op === "exists" || op === "not_exists") {
      const exists = actual !== MISSING && !(Array.isArray(actual) && actual.length === 0);
      return op === "exists" ? exists : !exists;
    }
    if (actual === MISSING) return false;
    const q = this.questions.get(condition.question_id ?? "")!;
    const numeric = q.type === "number" || q.type === "currency";
    const equal = (value: unknown) => {
      if (numeric) {
        const a = toNumber(actual);
        const b = toNumber(value);
        return a !== null && b !== null && a === b;
      }
      return canonical(actual) === canonical(value);
    };
    switch (op) {
      case "equals":
        return equal(expected);
      case "not_equals":
        return !equal(expected);
      case "in":
      case "not_in": {
        const contained = Array.isArray(expected) && expected.some(equal);
        return op === "in" ? contained : !contained;
      }
      case "contains":
        if (Array.isArray(actual)) return actual.some((item) => canonical(item) === canonical(expected));
        return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    }
    let a: number | string;
    let b: number | string;
    if (numeric) {
      const na = toNumber(actual);
      const nb = toNumber(expected);
      if (na === null || nb === null) return false;
      a = na;
      b = nb;
    } else {
      if (typeof actual !== "string" || typeof expected !== "string") return false;
      a = actual;
      b = expected;
    }
    switch (op) {
      case "greater_than":
        return a > b;
      case "greater_than_or_equal":
        return a >= b;
      case "less_than":
        return a < b;
      case "less_than_or_equal":
        return a <= b;
    }
    return false;
  }

  sectionVisible(section: QuestionnaireSection): boolean {
    return !section.visible_when || this.condition(section.visible_when, {}) === true;
  }

  isVisible(q: QuestionDefinition, scope: Scope = {}): boolean {
    return this.resolve(q.id, scope) !== UNKNOWN;
  }

  isRequired(q: QuestionDefinition, scope: Scope = {}): boolean {
    if (q.type === "information") return false;
    return !!q.required || (!!q.required_when && this.condition(q.required_when, scope) === true);
  }

  visibleSections(): QuestionnaireSection[] {
    return this.definition.sections.filter((s) => this.sectionVisible(s));
  }
}

export interface AnswerIssue {
  questionId: string;
  sectionId: string;
  label: string;
  message: string;
  // Labels of enclosing repeating groups with the 1-based entry number.
  path: string[];
  // Matches fieldKey() for the rendered field instance.
  key: string;
}

/** Stable identity of one rendered field: enclosing entry ids plus question id. */
export function fieldKey(chain: RowRef[], questionId: string): string {
  return chain.map((ref) => `${ref.group.id}:${ref.rowId}/`).join("") + questionId;
}

function isBlankObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Object.values(value as Row).some((v) => typeof v === "string" && v.trim());
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATE_LENGTHS = { day: 10, month: 7, year: 4 } as const;

export function dateIssue(value: string, precision: QuestionDefinition["date_precision"]): string | null {
  if (!/^\d{4}(-\d{2}){0,2}$/.test(value)) return "Enter a complete date.";
  if (precision !== "partial" && value.length !== DATE_LENGTHS[precision ?? "day"]) return "Enter a complete date.";
  const [y, m, d] = value.split("-").map(Number);
  if (m !== undefined && (m < 1 || m > 12)) return "Enter a valid month.";
  if (d !== undefined) {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "Enter a valid date.";
  }
  return null;
}

/** Issues the backend would reject at final submission, in form order. */
export function answerIssues(ctx: QuestionnaireContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const walk = (questions: QuestionDefinition[], scope: Scope, section: QuestionnaireSection, path: string[], prefix: string) => {
    for (const q of questions) {
      const value = ctx.resolve(q.id, scope);
      if (value === UNKNOWN || q.type === "information") continue;
      const required = ctx.isRequired(q, scope);
      const add = (message: string) =>
        issues.push({ questionId: q.id, sectionId: section.id, label: q.label, message, path, key: prefix + q.id });
      if (value === MISSING) {
        if (required) add(q.type === "confirmation" ? "Please confirm to continue." : "This question is required.");
        continue;
      }
      switch (q.type) {
        case "short_text":
        case "long_text":
          if (required && typeof value === "string" && !value.trim()) add("This question is required.");
          if (q.input_format && typeof value === "string") {
            const problem = formatIssue(q.input_format, value);
            if (problem) add(problem);
          }
          break;
        case "confirmation":
          if (required && value !== true) add("Please confirm to continue.");
          break;
        case "multiple_choice":
          if (required && Array.isArray(value) && value.length === 0) add("Choose at least one option.");
          break;
        case "date":
          if (typeof value === "string") {
            const problem = dateIssue(value, q.date_precision);
            if (problem) add(problem);
          }
          break;
        case "contact":
        case "address":
          if (required && isBlankObject(value)) add("This question is required.");
          if (q.type === "contact") {
            const email = (value as Row).email;
            if (typeof email === "string" && email.trim() && !EMAIL_PATTERN.test(email.trim())) add("Enter a valid email address.");
          }
          break;
        case "repeating_group": {
          const rows = Array.isArray(value) ? (value as Row[]) : [];
          const minimum = Math.max(q.min_items ?? 0, required ? 1 : 0);
          if (rows.length < minimum) {
            add(minimum === 1 ? "Add at least one entry." : `Add at least ${minimum} entries.`);
          }
          rows.forEach((row, index) =>
            walk(q.fields ?? [], { ...scope, [q.id]: row }, section, [...path, `${q.label} ${index + 1}`],
              `${prefix}${q.id}:${String(row[entryIdKey(q)])}/`)
          );
          break;
        }
      }
    }
  };
  for (const section of ctx.visibleSections()) walk(section.questions, {}, section, [], "");
  return issues;
}

// ---- Immutable answer updates ------------------------------------------------

/** One level of repeating-group nesting: the group question and the entry's stable id. */
export interface RowRef {
  group: QuestionDefinition;
  rowId: string;
}

function updateContainer(container: Row, chain: RowRef[], update: (row: Row) => Row): Row {
  if (chain.length === 0) return update(container);
  const [head, ...rest] = chain;
  const key = entryIdKey(head.group);
  const rows = Array.isArray(container[head.group.id]) ? (container[head.group.id] as Row[]) : [];
  return {
    ...container,
    [head.group.id]: rows.map((row) => (row[key] === head.rowId ? updateContainer(row, rest, update) : row)),
  };
}

export function readContainer(answers: Answers, chain: RowRef[]): Row | null {
  let container: Row = answers;
  for (const { group, rowId } of chain) {
    const rows = Array.isArray(container[group.id]) ? (container[group.id] as Row[]) : [];
    const row = rows.find((r) => r[entryIdKey(group)] === rowId);
    if (!row) return null;
    container = row;
  }
  return container;
}

/** Sets (or, for undefined, removes) one answer inside the addressed container. */
export function setAnswer(answers: Answers, chain: RowRef[], questionId: string, value: unknown): Answers {
  return updateContainer(answers, chain, (row) => {
    const next = { ...row };
    if (value === undefined) delete next[questionId];
    else next[questionId] = value;
    return next;
  });
}

export function newEntryId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addEntry(answers: Answers, chain: RowRef[], group: QuestionDefinition, id = newEntryId()): Answers {
  return updateContainer(answers, chain, (row) => {
    const rows = Array.isArray(row[group.id]) ? (row[group.id] as Row[]) : [];
    return { ...row, [group.id]: [...rows, { [entryIdKey(group)]: id }] };
  });
}

export function removeEntry(answers: Answers, chain: RowRef[], group: QuestionDefinition, rowId: string): Answers {
  return updateContainer(answers, chain, (row) => {
    const rows = Array.isArray(row[group.id]) ? (row[group.id] as Row[]) : [];
    const remaining = rows.filter((r) => r[entryIdKey(group)] !== rowId);
    const next = { ...row };
    if (remaining.length) next[group.id] = remaining;
    else delete next[group.id];
    return next;
  });
}

/** Reorders entries; identities travel with their rows, never with positions. */
export function moveEntry(answers: Answers, chain: RowRef[], group: QuestionDefinition, rowId: string, offset: -1 | 1): Answers {
  return updateContainer(answers, chain, (row) => {
    const rows = Array.isArray(row[group.id]) ? [...(row[group.id] as Row[])] : [];
    const index = rows.findIndex((r) => r[entryIdKey(group)] === rowId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= rows.length) return row;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    return { ...row, [group.id]: rows };
  });
}

// ---- Display helpers ----------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDate(value: string): string {
  const [y, m, d] = value.split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] ?? m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

export function formatAnswer(q: QuestionDefinition, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const label = (v: unknown) => q.options?.find((o) => o.value === v)?.label ?? String(v);
  switch (q.type) {
    case "yes_no":
      return value === true ? "Yes" : value === false ? "No" : "";
    case "confirmation":
      return value === true ? "Confirmed" : "";
    case "single_choice":
      return label(value);
    case "multiple_choice":
      return Array.isArray(value) ? value.map(label).join(", ") : "";
    case "date":
      return typeof value === "string" ? formatDate(value) : "";
    case "currency":
      return `${q.currency_code ? `${q.currency_code} ` : ""}${String(value)}`;
    case "contact":
      return CONTACT_FIELDS.map((f) => (value as Row)[f]).filter((v) => typeof v === "string" && v.trim()).join(" · ");
    case "address":
      return ADDRESS_FIELDS.map((f) => (value as Row)[f]).filter((v) => typeof v === "string" && v.trim()).join(", ");
    case "repeating_group":
      return Array.isArray(value) ? `${value.length} ${value.length === 1 ? "entry" : "entries"}` : "";
    default:
      return String(value);
  }
}

/** Maps backend "Question <id>: <reason>" messages to the question's label. */
export function describeAnswerError(message: string, definition: QuestionnaireDefinition): string {
  const match = /^Question ([A-Za-z][A-Za-z0-9_.-]*): (.+)$/.exec(message);
  if (!match) return message;
  const ctx = new QuestionnaireContext(definition, {});
  const q = ctx.questions.get(match[1]);
  const reason = match[2].charAt(0).toUpperCase() + match[2].slice(1);
  return q ? `“${q.label}”: ${reason}.` : `${reason}.`;
}

/** Share of visible, answerable top-level questions that have an answer. */
export function completion(ctx: QuestionnaireContext): number {
  let total = 0;
  let answered = 0;
  for (const section of ctx.visibleSections()) {
    for (const q of section.questions) {
      if (q.type === "information" || !ctx.isVisible(q)) continue;
      total += 1;
      const value = ctx.resolve(q.id, {});
      const empty = value === MISSING || (Array.isArray(value) && value.length === 0)
        || ((q.type === "contact" || q.type === "address") && isBlankObject(value));
      if (!empty) answered += 1;
    }
  }
  return total === 0 ? 1 : answered / total;
}

// ---- Condition values authored in the builder -------------------------------

const LIST_OPERATORS = new Set(["in", "not_in"]);
const BOOLEAN_TYPES = new Set<QuestionType>(["yes_no", "confirmation"]);

function coerceConditionItem(question: QuestionDefinition | undefined, raw: string): unknown {
  const text = raw.trim();
  if (question && BOOLEAN_TYPES.has(question.type)) {
    // The backend compares JSON types exactly: the string "true" never equals true.
    if (/^(true|yes)$/i.test(text)) return true;
    if (/^(false|no)$/i.test(text)) return false;
    return text;
  }
  if (question?.type === "number" && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/** Converts builder input into the JSON value the backend evaluator compares against. */
export function conditionValueFromInput(question: QuestionDefinition | undefined, operator: string, raw: string): unknown {
  if (LIST_OPERATORS.has(operator)) {
    return raw.split(",").map((part) => part.trim()).filter(Boolean).map((part) => coerceConditionItem(question, part));
  }
  return coerceConditionItem(question, raw);
}

/** Renders a stored condition value back into editable text. */
export function conditionValueToInput(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => conditionValueToInput(item)).join(", ");
  if (value === undefined || value === null) return "";
  return String(value);
}
