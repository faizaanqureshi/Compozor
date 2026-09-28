"use client";

// Schema-driven renderer for published questionnaire definitions. Renders
// any valid definition from the backend; nothing here is specific to a
// practice area. Values are kept in the exact JSON shapes the backend
// validates (numbers as JSON numbers, currency as decimal strings, ISO
// dates at the configured precision, flat contact/address objects, and
// repeating entries carrying stable ids). Partially typed values stay in
// local component state and never enter the answers until they are valid.

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ADDRESS_FIELDS,
  CONTACT_FIELDS,
  MAX_REPEAT_ITEMS,
  addEntry,
  entryIdKey,
  fieldKey,
  moveEntry,
  removeEntry,
  setAnswer,
  type Answers,
  type QuestionDefinition,
  type QuestionnaireContext,
  type Row,
  type RowRef,
  type Scope,
} from "@/lib/questionnaire-logic";

export interface FieldContext {
  ctx: QuestionnaireContext;
  answers: Answers;
  onChange: (answers: Answers) => void;
  // Issues keyed by fieldKey(); shown once the client has reviewed or tried to submit.
  errors: Map<string, string>;
  disabled?: boolean;
}

const CONTACT_LABELS: Record<(typeof CONTACT_FIELDS)[number], string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
};

const ADDRESS_LABELS: Record<(typeof ADDRESS_FIELDS)[number], string> = {
  line1: "Address line 1",
  line2: "Address line 2",
  city: "City",
  region: "State / province / region",
  postal_code: "Postal code",
  country: "Country",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const choiceRow =
  "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors hover:border-foreground/20 has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/8";

export function QuestionList({
  questions,
  chain,
  scope,
  container,
  field,
}: {
  questions: QuestionDefinition[];
  chain: RowRef[];
  scope: Scope;
  container: Row;
  field: FieldContext;
}) {
  return (
    <div className="flex flex-col gap-6">
      {questions.map((q) =>
        field.ctx.isVisible(q, scope) ? (
          <QuestionField key={q.id} q={q} chain={chain} scope={scope} container={container} field={field} />
        ) : null
      )}
    </div>
  );
}

function QuestionField({
  q,
  chain,
  scope,
  container,
  field,
}: {
  q: QuestionDefinition;
  chain: RowRef[];
  scope: Scope;
  container: Row;
  field: FieldContext;
}) {
  const id = useId();
  const key = fieldKey(chain, q.id);
  const error = field.errors.get(key);
  const value = container[q.id];
  const required = field.ctx.isRequired(q, scope);
  const set = (next: unknown) => field.onChange(setAnswer(field.answers, chain, q.id, next));

  if (q.type === "information") {
    return (
      <div className="flex flex-col gap-1 rounded-lg bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">{q.label}</p>
        {q.description && <p className="text-pretty whitespace-pre-line text-muted-foreground">{q.description}</p>}
      </div>
    );
  }

  if (q.type === "repeating_group") {
    return <RepeatingGroup q={q} chain={chain} scope={scope} value={value} required={required} error={error} field={field} />;
  }

  const describedBy = [q.description ? `${id}-desc` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, disabled: field.disabled };
  const grouped = ["yes_no", "single_choice", "multiple_choice", "contact", "address", "confirmation"].includes(q.type)
    || (q.type === "date" && q.date_precision !== "day" && q.date_precision != null);

  const labelContent = (
    <>
      {q.label}
      {!required && q.type !== "confirmation" && <span className="font-normal text-muted-foreground"> Optional</span>}
    </>
  );

  return (
    <div className="flex flex-col gap-1.5" role={grouped ? "group" : undefined} aria-labelledby={grouped ? `${id}-label` : undefined}>
      {q.type !== "confirmation" &&
        (grouped ? (
          <p id={`${id}-label`} className="text-sm leading-snug font-medium">{labelContent}</p>
        ) : (
          <Label htmlFor={id} className="leading-snug">{labelContent}</Label>
        ))}
      {q.description && q.type !== "confirmation" && (
        <p id={`${id}-desc`} className="text-sm text-pretty whitespace-pre-line text-muted-foreground">{q.description}</p>
      )}
      <div className="mt-0.5">
        {q.type === "short_text" && (
          <Input {...common} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || undefined)} />
        )}
        {q.type === "long_text" && (
          <Textarea {...common} rows={4} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || undefined)} />
        )}
        {q.type === "yes_no" && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs" role="radiogroup" aria-labelledby={`${id}-label`}>
            {[true, false].map((option) => (
              <label key={String(option)} className={choiceRow}>
                <input
                  type="radio"
                  name={id}
                  className="size-4 accent-primary"
                  checked={value === option}
                  onChange={() => set(option)}
                  disabled={field.disabled}
                />
                {option ? "Yes" : "No"}
              </label>
            ))}
          </div>
        )}
        {q.type === "single_choice" && <SingleChoice q={q} id={id} value={value} set={set} disabled={field.disabled} common={common} />}
        {q.type === "multiple_choice" && (
          <div className="flex flex-col gap-2">
            {(q.options ?? []).map((option) => {
              const selected = Array.isArray(value) ? (value as string[]) : [];
              const checked = selected.includes(option.value);
              return (
                <label key={option.value} className={choiceRow}>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    disabled={field.disabled}
                    onChange={() => {
                      // Keep the definition's option order and distinct values.
                      const next = (q.options ?? [])
                        .map((o) => o.value)
                        .filter((v) => (v === option.value ? !checked : selected.includes(v)));
                      set(next.length ? next : undefined);
                    }}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        )}
        {q.type === "date" && <DateField key={key} q={q} id={id} value={value} set={set} disabled={field.disabled} invalid={!!error} />}
        {q.type === "number" && <NumberField key={key} id={id} value={value} set={set} common={common} kind="number" />}
        {q.type === "currency" && (
          <NumberField key={key} id={id} value={value} set={set} common={common} kind="currency" currency={q.currency_code ?? undefined} />
        )}
        {q.type === "contact" && (
          <ObjectFields id={id} value={value} set={set} disabled={field.disabled} invalid={!!error}
            fields={CONTACT_FIELDS.map((f) => ({ name: f, label: CONTACT_LABELS[f], type: f === "email" ? "email" : f === "phone" ? "tel" : "text",
              autoComplete: f === "email" ? "email" : f === "phone" ? "tel" : "name" }))} />
        )}
        {q.type === "address" && (
          <ObjectFields id={id} value={value} set={set} disabled={field.disabled} invalid={!!error}
            fields={ADDRESS_FIELDS.map((f) => ({ name: f, label: ADDRESS_LABELS[f], type: "text", wide: f === "line1" || f === "line2",
              autoComplete: { line1: "address-line1", line2: "address-line2", city: "address-level2", region: "address-level1",
                postal_code: "postal-code", country: "country-name" }[f] }))} />
        )}
        {q.type === "confirmation" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card px-3 py-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
            <input
              type="checkbox"
              id={id}
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={value === true}
              disabled={field.disabled}
              aria-invalid={error ? true : undefined}
              onChange={(e) => set(e.target.checked ? true : undefined)}
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium text-foreground">
                {q.label}
                {!required && <span className="font-normal text-muted-foreground"> Optional</span>}
              </span>
              {q.description && <span className="text-pretty whitespace-pre-line text-muted-foreground">{q.description}</span>}
            </span>
          </label>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function SingleChoice({
  q,
  id,
  value,
  set,
  disabled,
  common,
}: {
  q: QuestionDefinition;
  id: string;
  value: unknown;
  set: (v: unknown) => void;
  disabled?: boolean;
  common: Record<string, unknown>;
}) {
  const options = q.options ?? [];
  // Short lists read best as visible choices; long ones as a select.
  if (options.length > 6) {
    return (
      <NativeSelect {...common} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || undefined)}>
        <option value="">Select an option</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
    );
  }
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
      {options.map((o) => (
        <label key={o.value} className={choiceRow}>
          <input type="radio" name={id} className="size-4 accent-primary" checked={value === o.value}
            onChange={() => set(o.value)} disabled={disabled} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function NumberField({
  id,
  value,
  set,
  common,
  kind,
  currency,
}: {
  id: string;
  value: unknown;
  set: (v: unknown) => void;
  common: Record<string, unknown>;
  kind: "number" | "currency";
  currency?: string;
}) {
  const [raw, setRaw] = useState(value === undefined || value === null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  const onChange = (text: string) => {
    setRaw(text);
    const normalized = text.replace(/[\s,]/g, "");
    if (!normalized) {
      setInvalid(false);
      set(undefined);
    } else if (/^-?\d+(\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized))) {
      setInvalid(false);
      // Numbers are JSON numbers; currency keeps its exact decimal string.
      set(kind === "number" ? Number(normalized) : normalized);
    } else {
      setInvalid(true);
      set(undefined);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative sm:max-w-xs">
        {currency && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
        )}
        <Input
          {...common}
          inputMode="decimal"
          value={raw}
          className={cn(currency && "pl-12")}
          aria-invalid={invalid || common["aria-invalid"] ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {invalid && (
        <p className="text-sm text-destructive" id={`${id}-fmt`}>
          {kind === "currency" ? "Enter an amount, for example 1250.00." : "Enter a number, for example 3 or 12.5."}
        </p>
      )}
    </div>
  );
}

function DateField({
  q,
  id,
  value,
  set,
  disabled,
  invalid,
}: {
  q: QuestionDefinition;
  id: string;
  value: unknown;
  set: (v: unknown) => void;
  disabled?: boolean;
  invalid: boolean;
}) {
  const precision = q.date_precision ?? "day";
  const initial = typeof value === "string" ? value.split("-") : [];
  const [year, setYear] = useState(initial[0] ?? "");
  const [month, setMonth] = useState(initial[1] ?? "");
  const [day, setDay] = useState(initial[2] ?? "");

  if (precision === "day") {
    return (
      <Input
        id={id}
        type="date"
        className="sm:max-w-xs"
        value={typeof value === "string" && value.length === 10 ? value : ""}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => set(e.target.value || undefined)}
      />
    );
  }

  const compose = (y: string, m: string, d: string) => {
    if (!/^\d{4}$/.test(y)) return set(undefined);
    if (precision === "year") return set(y);
    if (!m) return set(precision === "partial" ? y : undefined);
    if (precision === "month" || !d) return set(`${y}-${m}`);
    set(`${y}-${m}-${d}`);
  };
  const daysInMonth = year && month ? new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate() : 31;
  const yearInvalid = year !== "" && !/^\d{4}$/.test(year);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[6rem_1fr] gap-2 sm:flex sm:flex-wrap">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="Year"
          aria-label="Year"
          maxLength={4}
          className="sm:w-24"
          value={year}
          disabled={disabled}
          aria-invalid={yearInvalid || invalid || undefined}
          onChange={(e) => {
            const y = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYear(y);
            compose(y, month, day);
          }}
        />
        {precision !== "year" && (
          <NativeSelect
            aria-label="Month"
            className="sm:w-44"
            value={month}
            disabled={disabled}
            onChange={(e) => {
              const m = e.target.value;
              setMonth(m);
              const d = m ? day : "";
              setDay(d);
              compose(year, m, d);
            }}
          >
            <option value="">{precision === "partial" ? "Month (if known)" : "Month"}</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
            ))}
          </NativeSelect>
        )}
        {precision === "partial" && (
          <NativeSelect
            aria-label="Day"
            className="col-span-2 sm:col-span-1 sm:w-36"
            value={day}
            disabled={disabled || !month}
            onChange={(e) => {
              setDay(e.target.value);
              compose(year, month, e.target.value);
            }}
          >
            <option value="">Day (if known)</option>
            {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
              <option key={d} value={d}>{Number(d)}</option>
            ))}
          </NativeSelect>
        )}
      </div>
      {yearInvalid && <p className="text-sm text-destructive">Enter a four-digit year.</p>}
    </div>
  );
}

function ObjectFields({
  id,
  value,
  set,
  fields,
  disabled,
  invalid,
}: {
  id: string;
  value: unknown;
  set: (v: unknown) => void;
  fields: { name: string; label: string; type: string; wide?: boolean; autoComplete?: string }[];
  disabled?: boolean;
  invalid: boolean;
}) {
  const current = value && typeof value === "object" ? (value as Record<string, string>) : {};
  const update = (name: string, text: string) => {
    const next: Record<string, string> = { ...current };
    if (text) next[name] = text;
    else delete next[name];
    // Only supported text fields; an all-empty object is simply unanswered.
    set(Object.values(next).some((v) => v.trim()) ? next : undefined);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.name} className={cn("flex flex-col gap-1.5", f.wide && "sm:col-span-2")}>
          <Label htmlFor={`${id}-${f.name}`} className="text-xs font-normal text-muted-foreground">{f.label}</Label>
          <Input
            id={`${id}-${f.name}`}
            type={f.type}
            autoComplete={f.autoComplete}
            value={current[f.name] ?? ""}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(e) => update(f.name, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function RepeatingGroup({
  q,
  chain,
  scope,
  value,
  required,
  error,
  field,
}: {
  q: QuestionDefinition;
  chain: RowRef[];
  scope: Scope;
  value: unknown;
  required: boolean;
  error?: string;
  field: FieldContext;
}) {
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const rows = Array.isArray(value) ? (value as Row[]) : [];
  const key = entryIdKey(q);
  const max = q.max_items ?? MAX_REPEAT_ITEMS;
  const min = Math.max(q.min_items ?? 0, required ? 1 : 0);

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={q.label}>
      <div className="flex flex-col gap-1">
        <p className="text-sm leading-snug font-medium">
          {q.label}
          {!required && <span className="font-normal text-muted-foreground"> Optional</span>}
        </p>
        {q.description && <p className="text-sm text-pretty whitespace-pre-line text-muted-foreground">{q.description}</p>}
        {min > 1 && <p className="text-xs text-muted-foreground">Add at least {min} entries.</p>}
      </div>

      {rows.map((row, index) => {
        const rowId = String(row[key]);
        const rowChain = [...chain, { group: q, rowId }];
        return (
          <div key={rowId} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium tracking-tight">
                {q.label} {index + 1}
              </p>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${q.label} ${index + 1} up`} disabled={field.disabled || index === 0}
                  onClick={() => field.onChange(moveEntry(field.answers, chain, q, rowId, -1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${q.label} ${index + 1} down`}
                  disabled={field.disabled || index === rows.length - 1}
                  onClick={() => field.onChange(moveEntry(field.answers, chain, q, rowId, 1))}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${q.label} ${index + 1}`} disabled={field.disabled}
                  className="text-muted-foreground hover:text-destructive" onClick={() => setPendingRemoval(rowId)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <QuestionList questions={q.fields ?? []} chain={rowChain} scope={{ ...scope, [q.id]: row }} container={row} field={field} />
          </div>
        );
      })}

      <Button
        variant="outline"
        className="self-start"
        disabled={field.disabled || rows.length >= max}
        onClick={() => field.onChange(addEntry(field.answers, chain, q))}
      >
        <Plus />
        {rows.length === 0 ? `Add ${q.label.toLowerCase()}` : "Add another"}
      </Button>
      {rows.length >= max && <p className="text-xs text-muted-foreground">You can add up to {max} entries.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={pendingRemoval !== null} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this entry?</DialogTitle>
            <DialogDescription>The answers in this entry will be removed from your questionnaire.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>Keep entry</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingRemoval) field.onChange(removeEntry(field.answers, chain, q, pendingRemoval));
                setPendingRemoval(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
