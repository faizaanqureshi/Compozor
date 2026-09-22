# Frontend context: accounting-saas API

This is the backend API for a document-collection and inbox automation tool.
A firm sets up a checklist of documents needed from a client, the system
emails the client, and when the client replies, an AI pipeline handles it:
documents get classified, verified as genuine, and matched against the
checklist; questions get answered (with real conversation memory) or
escalated or clarified; unrecognized senders get triaged instead of silently
dropped; and clients who go quiet get automatically re-reminded. Depending on
the org's automation setting, replies can send themselves automatically.

**This is no longer accounting-only.** Every AI prompt in the pipeline is now
driven by two fields on `Organization` — `practice_description` (free text,
e.g. "an immigration law firm helping clients gather PR application
documents") and `jurisdiction` (free text, e.g. "Canada") — set during
onboarding (see "Onboarding" below). There's no fixed enum of professions;
the product works for accounting, immigration law, mortgage brokering, or
anything else that fits the "collect documents from clients, answer their
questions" shape.

This doc is written for a frontend project (e.g. a separate `frontend/` repo or
directory) that will call this API. It is NOT meant to duplicate the backend's
own code — treat this as a snapshot; if something looks wrong, the backend
source in `app/` is the source of truth.

## Running the backend

```bash
cd /Users/faizaanqureshi/Documents/accounting-saas
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Base URL: `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

CORS allows whatever's in the `frontend_origins` env setting (defaults to
`["http://localhost:3000"]` - see `app/config.py`/`app/main.py`). The backend
also needs a `frontend_url` setting (a single canonical URL, not a list) for
redirecting the browser back after Gmail OAuth completes (see "Gmail
connection" below) - **if this is misconfigured in a deployed environment it
silently redirects users to `localhost:3000` after connecting Gmail**, which
is a real bug that's bitten this app before. Make sure `frontend_url` is set
to the real deployed frontend URL in every non-local environment.

A background scheduler runs inside the app process (APScheduler) with two
recurring jobs — nothing the frontend needs to call, just don't be surprised
if you see them in logs on startup:
- Renews Gmail push-notification watches every 24h.
- Sends overdue checklist re-reminders every 24h (see "Proactive reminders" below).

## Auth: Clerk, live

**Every endpoint requires a Clerk session token.** Send it as
`Authorization: Bearer <clerk-session-token>` on every request. There is no
`organization_id` query param or path param anywhere in this API anymore -
the organization is derived entirely from the authenticated Clerk user
(`app/auth.py`'s `get_current_organization` dependency, used on every route).

**The organization is auto-created on first authenticated request** - there's
no `POST /organizations` endpoint. The first time a Clerk user hits any
endpoint, the backend looks up an `Organization` by `clerk_user_id`; if none
exists, it creates one (named from the Clerk user's first name or email as a
fallback) and returns it. This is exactly why **onboarding has to be gated on
`Organization.onboarding_completed_at`, not on organization existence** - by
the time your frontend can call anything, the org already exists, just
unconfigured. See "Onboarding" below.

401 with `{"detail": "Not signed in"}` if the token is missing/invalid.

## Onboarding

A new signup has an auto-created but unconfigured `Organization` -
`practice_description`, `jurisdiction`, and `onboarding_completed_at` are all
`null`, `automation_level` defaults to `"no_automation"`. The frontend should
check `onboarding_completed_at` (via `GET /organizations/me`) right after
sign-in and route to an onboarding flow if it's `null`.

**Recommended sequence:**

1. **Firm/company name.** `Organization.name` is auto-populated with a
   placeholder derived from the Clerk user's first name or email (e.g.
   "Faizaan's Organization") when the org is auto-created - it's real data
   from day one, just not what the firm is actually called. Collect the
   real name and send it via `PATCH /organizations/me` with `{ "name": "..." }`.
   `Organization.name` is exclusively the *firm's* name - it is never
   reused for the signed-in person's own name (see `contact_name` below),
   and every deterministic email sign-off/fallback keys off that
   distinction (see "Email sign-off" below).

2. **Practice type, description, and jurisdiction.** `practice_description`
   and `jurisdiction` feed directly into every AI prompt in the system (how
   the AI describes the firm to clients, which government/regulatory
   sources it treats as authoritative when using web search).
   `practice_type` (e.g. "Accounting", "Immigration law", or free custom
   text) is a separate, independently persisted broad classification - not
   derived from `practice_description` and not required to be one of a
   fixed set of values (no enum; arbitrary industries are supported). The
   frontend's category-picker presets and their `practice_description` seed
   text live in one shared place (`lib/practice-types.ts` in the frontend
   repo) reused by both onboarding and Settings, so picking "Immigration
   law" produces the same seeded description sentence wherever it's picked
   from. Selecting a preset sends both `practice_type` (the preset's label,
   or the user's own text if "Other") and the seeded/edited
   `practice_description` via the same `PATCH /organizations/me` call.
   `jurisdiction` is a separate field/question (e.g. a country field) since
   it drives a different thing (source authority) than the practice
   description does. Changing an *already-set* `practice_type` later
   (Settings, not first-time onboarding) is a deliberate action worth a
   confirmation prompt client-side, since it materially changes the AI's
   framing of the business - the backend itself does not gate or warn on
   this, it's a frontend UX concern only.

3. **Connect Gmail.** `GET /organizations/me/gmail/connect` →
   `authorization_url`, redirect the browser there (full page nav, not a
   fetch). After Google consent, the backend redirects back to
   `{frontend_url}/clients?gmail=connected&email=...` (or `?gmail=error&reason=...`
   on failure) - build a page/route that handles those query params. **Right
   after a successful connect, call `POST /inbox-connections/{connection_id}/watch`**
   to start Gmail push notifications for that mailbox - this is not automatic
   on connect, and without it the inbox will never receive real inbound mail
   (only the daily renewal job keeps existing watches alive; it doesn't
   create a first one). Get the `connection_id` from `GET /inbox-connections`
   after the redirect lands.

4. **Automation level.** `PATCH /organizations/me` with
   `{ "automation_level": "..." }`. **Recommend defaulting new orgs to
   `"no_automation"` regardless of what's picked during onboarding, and
   treating a higher level as a deliberate later decision from settings, not
   a first-day checkbox.** A firm that hasn't seen a single AI-drafted email
   yet has no real basis to judge whether they trust `high_automation` -
   presenting it as an onboarding choice tends to produce either
   over-caution or over-trust with no evidence behind either. Whatever the
   onboarding UI collects here can be treated as a soft preference to revisit
   once they've seen drafts in action.

5. **Mark onboarding complete.** `PATCH /organizations/me` with
   `{ "onboarding_completed": true }` - this is a boolean intent on the
   update schema (not a real model field), translated server-side to
   `onboarding_completed_at = now()`. From then on, `GET /organizations/me`
   returns a non-null `onboarding_completed_at` and the frontend can route
   straight to the normal app on sign-in.

**Everything above stays editable after onboarding** (Settings, not just
the onboarding wizard) via the same `PATCH /organizations/me` - editing
these fields later never resets `onboarding_completed_at`, disconnects
mailboxes, or touches clients/packages/workflows/automation settings; it's
a plain partial update of whichever fields are included in the body.

**Profile fields not collected during onboarding, but persisted on
`Organization` and editable via the same endpoint (Settings only):**

- `contact_name` - the signed-in *person's* own name (e.g. "Omar
  Abdulrahman"), distinct from `Organization.name` (the firm, e.g. "Smith &
  Associates"). Never conflate the two. Not sourced from Clerk
  automatically; Clerk's own name (`useUser().fullName` client-side) is a
  reasonable one-time prefill suggestion in a form, nothing more - once
  `contact_name` is saved, it's the only source of truth for it.
- `phone` - canonical stored form is always exactly 10 raw digits, North
  American format only (e.g. `"9057490504"`), never pre-formatted with
  punctuation. The backend normalizes/validates on `PATCH` (strips
  non-digits, drops a leading country-code "1" if 11 digits were given,
  rejects anything that isn't then exactly 10 digits with a 400 rather
  than silently truncating it) - see `_normalize_phone` in
  `app/routers/organizations.py`. Format for display client-side (e.g.
  `"(905) 749-0504"`); never store the formatted form.
- `email_signature` - plain text, user-authored, deterministically
  appended to outbound client-facing emails by the backend (see "Email
  sign-off" below) - the AI never writes its own closing.

## Data model

```
Organization (a firm; has automation_level, reminder_interval_days, practice_type, practice_description, jurisdiction, contact_name, phone, email_signature, onboarding_completed_at)
  ├── Client (belongs to one org; tracks last_reminder_sent_at)
  │     ├── ChecklistItem (a document type needed from this client)
  │     │     └── Document (an uploaded/classified file, optionally linked to a ChecklistItem; has its own `year`)
  │     ├── EmailLog (one row per inbound OR outbound message tied to this client - see below)
  │     └── ClientMemoryNote (a durable fact the AI extracted about this client - see "Long-term memory" below)
  ├── InboxConnection (a connected Gmail mailbox, belongs to one org)
  └── UnmatchedInboundEmail (inbound mail whose sender didn't match any client)
```

**Note on `Client`:** there is no `tax_year` on `Client` — a client isn't
scoped to a single tax year, since firms do work throughout the year, not
just tax-season document collection. The **year lives on `Document`**
instead (each uploaded document has its own `year`, taken from whatever the
AI classifier read off the document itself).

### Enums

- `ClientStatus`: `active` | `inactive` | `pending`
- `ChecklistItemStatus`: `missing` | `received` | `wrong`
- `EmailDirection`: `inbound` | `outbound`
- `EmailStatus`: `received` | `draft` | `sent` | `needs_human_attention`
- `InboxConnectionStatus`: `active` | `needs_reauth`
- `AutomationLevel` (on `Organization`): `no_automation` | `medium_automation` | `high_automation`
- `InboundEmailCategory` (on `UnmatchedInboundEmail`): `potential_new_client` | `spam` | `automated` | `other`
- `InboundEmailReviewStatus` (on `UnmatchedInboundEmail`): `needs_review` | `dismissed`

`EmailStatus` meanings, for UI:
- `received` — a real inbound message from a client, logged as-is (no action needed unless it also needs escalation — see `escalation_reason`/`needs_human_attention` below).
- `draft` — an AI-written email sitting there ready for a human to review and send.
- `sent` — went out, either manually or via autosend (check `autosent` to tell which).
- `needs_human_attention` — the system couldn't resolve something automatically (a document sent wrong 3+ times, an unanswered/unclarifiable client question, an unparseable inbound email) and a human needs to look at it. When set on an inbound (`received`-turned-`needs_human_attention`) row, `escalation_reason` explains why.

## Automation / autosend

Each `Organization` has an `automation_level`:
- `no_automation` (default) — every AI-drafted email always needs a human to click send. Nothing autosends, ever, regardless of confidence.
- `medium_automation` — autosends only when the model is quite confident (high bar).
- `high_automation` — autosends unless the model's confidence is low (low bar, sends most of the time).

Set it via `PATCH /organizations/me` with `{ "automation_level": "medium_automation" }`.

This applies to **every** AI-generated outbound email: checklist reminders
(manual or automatic), document-received acknowledgments, wrong-document
follow-ups, answered client questions, and clarifying questions. Every such
`EmailLog` row carries a full audit trail of the autosend decision made about
it (see `EmailLogOut` fields below) — the frontend should surface this so a
user can see exactly why something did or didn't send itself.

**Exception:** a Q&A answer where the AI could only find lower-quality
sources is always excluded from autosend regardless of confidence or
automation level — see Q&A section below.

## Email sign-off

`Organization.email_signature` (plain text, editable via `PATCH
/organizations/me`) is deterministically appended to every client-facing
outbound email by the backend, never written by the AI. See
`app/services/email_signature.py` (`resolve_signature`,
`append_signature`) and its call sites: `create_checklist_reminder_email`,
`create_commitment_followup_email`, `create_batch_receipt`,
`create_draft_email`, `create_received_acknowledgment_email`,
`create_supplementary_document_email`, `create_unsupported_file_email`
(all in `email_draft.py`/`document_pipeline.py`), and
`create_qa_draft_email` (`email_reply_pipeline.py`) - every one of these
appends the signature exactly once, at the point the `EmailLog` row is
created, never at edit/send/retry time, so what a user reviews in a draft
is exactly what gets sent (no "signature appears only after sending"
mismatch, no duplicate signatures on retry/regenerate).

**Fallback when `email_signature` is unset:** `"Best,\n{contact_name}"` if
`contact_name` is set, else `"Best,\n{name}"` (the firm name). Once a user
explicitly saves a custom `email_signature`, it's authoritative and is
never auto-overwritten by later edits to `contact_name`/`name`/other
profile fields.

The AI-drafted email prompts (`email_draft.py`, `qa_answer.py`) are
explicitly instructed not to write their own closing/sign-off line, since
the backend always appends the real one - don't reintroduce sign-off
language into a prompt without also accounting for this.

## Client matching & threading (inbound Gmail mail)

When a real inbound Gmail message arrives (via the Pub/Sub webhook), it's
matched to a `Client` by:
1. **Gmail thread first** — if the message's `threadId` matches a prior
   `EmailLog.thread_id` for a client in that org, it's matched to that client
   even if the sender's address differs (e.g. they replied from a different
   address within an existing conversation).
2. **Sender address fallback** — case-insensitive match against `Client.email`.

If neither matches, the email is **not dropped** — it's AI-triaged and
recorded as an `UnmatchedInboundEmail` (see below) instead. A narrow,
cheap-model junk pre-filter also runs on text-only inbound mail from already-
matched clients (marketing/subscription/auto-reply content that would
otherwise sit in the escalation queue for no reason) - see
`classify_is_junk` in the backend if you need the exact behavior; nothing
about it is frontend-visible beyond such mail never generating a reply or an
escalation.

Every real inbound message becomes its own `EmailLog` row (`status=received`),
and AI-drafted replies carry the same `thread_id` (and correct Gmail
`In-Reply-To`/`References` headers under the hood) so conversations thread
correctly both in Gmail and in this system.

## Long-term memory & conversation continuity

The Q&A responder (see below) doesn't treat every question as if from a
stranger. Several mechanisms feed it context:

1. **Recent conversation history** — the last 15 real messages exchanged
   with this client (across *all* their email threads, not just the current
   one), so it won't re-explain something just told to them or lose track
   of a follow-up question.
2. **Long-term memory notes** (`ClientMemoryNote`) — durable facts extracted
   from any inbound email (a life/business change, a stated preference, a
   recurring issue), which don't age out the way the recency window does.
   Most emails produce none; only genuinely durable facts get stored.
3. **Tools, for anything the above two aren't enough for** — the Q&A agent
   can also read a client's actual submitted documents (not just a one-line
   label of what they are) and pull the full, untruncated conversation
   history on demand, rather than only ever answering from the eager preview
   above. This is why it can correctly answer specific questions about a
   document's contents (an amount, a line item, a date) instead of just
   acknowledging the document exists.

`GET /clients/{client_id}/memory-notes` → `[{ id, client_id, note, source_email_log_id, created_at }]`, oldest first. **Worth surfacing as a "what we know about this client" panel** — it's a good transparency/debugging view into what the AI is factoring into its answers.

## Multi-turn clarification

If a client's question is genuinely ambiguous (e.g. "do I need to send that
other thing we talked about?" with nothing in context to resolve "that other
thing"), the AI can ask a specific follow-up question instead of guessing or
immediately escalating. That reply is a normal `EmailLog` row like any other
Q&A answer, except `is_clarifying_question` is `true`. When the client
replies (matched to the same thread as always), the conversation history
above naturally includes that clarifying exchange, so the next turn can
resolve to a real answer.

This is capped at 2 clarification rounds per thread (enforced in code, not
just prompted) — if the AI would ask a third time, it escalates instead.
`EmailReplyResult.needs_clarification` (see below) tells you when this path
was taken for a given inbound message.

## Document verification

Uploaded documents (PDF or photo — jpg/png/gif/webp are all accepted) go
through more than just type classification:

- **Authenticity check** — the AI verifies the document actually has the
  real structural hallmarks of its claimed type (e.g. a T4 needs numbered
  boxes, employer/employee info — not just a matching title or vague
  resemblance). A document that doesn't pass gets rejected with a specific
  explanation of what's missing, not just a generic "wrong document" message.
- **Name check** — the name read off the document is loosely matched
  against the client's name on file; a clear mismatch (e.g. it's actually
  someone else's document) is rejected with an explanation.
- **Period-aware matching** — if a client has multiple outstanding items of
  the same document type for different periods (e.g. bank statements for
  both January and February), the document's own date range is used to pick
  the right one rather than always matching whichever same-type item has
  the lowest id.
- **Duplicate detection** — resending a document for an already-`received`
  checklist item is recorded (the `Document` row is still saved) but does
  **not** trigger another "document received" acknowledgment email. This
  also covers multiple attachments in one email that satisfy the same item
  (e.g. two photos of the same multi-page statement) — the second one is
  recognized as "another file for the same submission," not a false
  duplicate warning.
- **Unrequested-but-genuine documents aren't treated as errors** — if a
  client sends something real that just isn't on their checklist, they get a
  warm "thanks, filed for reference" acknowledgment, not a problem notice.
  Only a document that fails authenticity verification gets the "there's a
  problem" framing.
- **Supported file types**: images (`jpg`/`png`/`gif`/`webp`), `.pdf`,
  `.csv`, `.xlsx`, and `.docx` — each of these is empirically confirmed to
  work, not just assumed from vendor docs (which have had inconsistent/
  regressed support for some formats). Anything else (ZIP, legacy `.doc`/
  `.xls`, etc.) skips AI classification entirely and instead gets saved
  with a "needs manual review" marker and a client-facing "we got your
  file, a team member will follow up" acknowledgment, rather than
  erroring out.
- **Inline email signature images are filtered out** before ever reaching
  document processing (real inbound Gmail mail only) — otherwise every
  business email's logo/banner would get treated as a submitted document.
- **Resilient to AI/API failures** — if classification, intent detection,
  or answer generation fails for any reason (rate limit, oversized file,
  transient outage), that specific inbound email gets escalated to
  `needs_human_attention` with a clear reason instead of silently sitting
  unprocessed forever with no trace anything went wrong.

None of this requires anything different from the frontend's `POST
/clients/{client_id}/documents` call — it's all handled server-side and
reflected in the resulting `checklist_item_status` and whether a follow-up
email was drafted.

## Proactive reminders

Each `Organization` has a `reminder_interval_days` (nullable int, `null` =
disabled). When set, a daily background job automatically re-sends a
checklist reminder to any client whose `last_reminder_sent_at` is older than
that interval **and** who still has missing checklist items.

Important safety behavior: **the very first reminder is always manual.**
`last_reminder_sent_at` is `null` until a human explicitly triggers `POST
/clients/{client_id}/checklist-reminder` at least once — the automatic job
only ever re-nudges a client who's already been contacted, never sends a
client's first-ever message. Once a client's checklist is fully complete,
they naturally stop being nudged (the job re-checks current status every
run, not a cached count).

Set it via `PATCH /organizations/me` with `{ "reminder_interval_days": 3 }` (or `null` to disable).

## Endpoints

All request/response bodies are JSON unless noted (file uploads are
multipart/form-data). Every endpoint below requires the `Authorization:
Bearer <clerk-session-token>` header - omitted for brevity.

### Organizations

- `GET /organizations/me` → `{ id, name, automation_level, reminder_interval_days, practice_description, jurisdiction, contact_name, phone, practice_type, email_signature, onboarding_completed_at }`. Auto-creates the org on first call for a new Clerk user (see "Auth" above) - there's no separate create endpoint.
- `PATCH /organizations/me` — body can include any subset: `{ "name", "automation_level", "reminder_interval_days", "practice_description", "jurisdiction", "contact_name", "phone", "practice_type", "email_signature", "onboarding_completed" }`. Only included fields are updated. `onboarding_completed` (bool) is a write-only convenience field, not returned - it sets `onboarding_completed_at` to now (`true`) or clears it (`false`). String fields are trimmed server-side; blank optional strings clear to `null` (blank `name` is rejected - it's required). `phone` is normalized/validated to exactly 10 digits (see "Onboarding" above) - a non-10-digit value is rejected with 400, never silently truncated. `contact_name`, `practice_type`, and `email_signature` each have a generous but real max length, also enforced with a 400 on overflow.
- `DELETE /organizations/me` → 204. **Will 500 if any client, inbox connection, or unmatched email still references it** (FK constraint, no cascade) — delete/reassign those first.

### Clients

- `POST /clients` — body: `{ "name": "Jane Doe", "email": "jane@example.com", "status": "pending" }`. `status` is optional, defaults to `pending`. **No `tax_year` field, no `organization_id`** (derived from auth). Returns the created client. 409 if `email` is already used by another client **within the same organization** (case-insensitive) — the same person can be a client of two different organizations in this system, since email uniqueness is scoped per-org, not global.

- `GET /clients` — no params needed; scoped to your org automatically. Each item includes a `checklist_summary` (eager-loaded, no N+1 per-client request needed for a list page).

- `GET /clients/{client_id}` → client detail, plus nested `checklist_items: []`. 404 if missing or not yours.

- `DELETE /clients/{client_id}` → 204. **Permanently deletes the client and everything tied to it** — documents (including their R2 files), checklist items, email logs, memory notes. Irreversible; gate behind a confirmation dialog.

### Checklist items

- `POST /clients/{client_id}/checklist-items` — body:
  ```json
  {
    "doc_type_needed": "T4",
    "status": "missing",
    "expected_date_range_start": "2025-01-01",
    "expected_date_range_end": "2025-01-31",
    "description": "Statement of remuneration"
  }
  ```
  All fields except `doc_type_needed` are optional. **`doc_type_needed` is free text — there's no fixed list of document types.** The AI matches an uploaded document against whatever's actually written here (using `doc_type_needed` + `description` together), so this works for anything a firm might request across any profession — not just tax slips. If a client has more than one item with the same `doc_type_needed` (e.g. a monthly bank statement requested twice for different months), set `expected_date_range_start`/`end` on each so uploads get matched to the right one by period.

- `GET /clients/{client_id}/checklist-items` → completion summary:
  ```json
  { "total": 3, "missing": 1, "received": 1, "wrong": 1, "items": [ ...ChecklistItemOut ] }
  ```
  Each item also has `wrong_attempt_count` (int) and `last_wrong_doc_type` (string|null) — used for the escalation-after-3-wrong-attempts logic, worth surfacing in a UI so a user can see "this client has messed this up twice."

- `PATCH /clients/{client_id}/checklist-items/{item_id}` — body `{ "status": "received" }`. Manually override a checklist item's status — e.g. accepting a document the AI flagged as wrong (a name mismatch that's actually explained elsewhere in the file) without requiring a re-upload from the client.

- `DELETE /clients/{client_id}/checklist-items/{item_id}` → 204. **Waives** the requirement (e.g. no longer needed) rather than representing a real deletion mistake - any documents already matched to it are kept but unlinked, not deleted.

- `POST /clients/{client_id}/checklist-items/{item_id}/remind` → `EmailLogOut`, 201. Targeted reminder for a single outstanding item, instead of bundling everything into one email. 400 if the item isn't `missing`/`wrong`.

### Documents

- `POST /clients/{client_id}/documents` — multipart form, field `file` (a single PDF, Word/Excel/CSV doc, or photo — see supported formats above). Optional `Idempotency-Key` header (any client-generated unique string, e.g. a UUID per upload attempt) — a retried/double-submitted request with the same key replays the original response instead of reprocessing (this endpoint makes real OpenAI calls and can send real emails, so a duplicate isn't free). Runs the full pipeline: classify → verify authenticity/name → match to a checklist item (period-aware) → update status → draft/escalate/acknowledge email as appropriate, or silently record a duplicate/additional page. Returns:
  ```json
  {
    "document": { "id", "client_id", "checklist_item_id", "email_log_id", "s3_path", "year", "classified_type", "extracted_metadata", "received_at", "download_url" },
    "checklist_item_id": 5,
    "checklist_item_status": "received",
    "draft_email_created": false,
    "status_summary": "Received their T4 - that's checked off. Still outstanding: NOA."
  }
  ```
  `document.year` is the year the AI read off the document itself (nullable). `classified_type` is a free-text description the AI wrote (e.g. `"T4 Statement of Remuneration Paid for tax year 2023"`, `"proof of employment letter"`) rather than a fixed enum value — there's no closed list of document types. `extracted_metadata` includes the full match result, including `looks_genuine`/`authenticity_concern`/`mismatch_reason` if you want to surface verification detail in a UI. `status_summary` is a short plain-English summary of what happened, worth showing directly as upload feedback. `document.email_log_id` links back to the inbound `EmailLog` this document arrived with, when applicable (`null` for a direct upload via this endpoint, which isn't tied to an email).

  **A document that doesn't match anything on the checklist is not automatically treated as an error.** If it's genuine but just isn't something currently requested, `checklist_item_id` comes back `null` and the client gets a warm "thanks, filed for reference" acknowledgment, not a problem notice. Only a document that fails authenticity verification gets the "there's a problem" framing. This endpoint doesn't currently accept a message alongside the file (real inbound Gmail replies do carry the sender's own message as context — see Email replies below).

- `GET /clients/{client_id}/documents` → `[DocumentOut, ...]`, most recent first. Each includes a freshly-signed `download_url` (R2 presigned URL, ~1h expiry) for direct download/preview — good for a "documents" tab.

### Email replies (simulates an inbound client email — mostly for testing; real inbound mail comes through the Gmail webhook instead)

- `POST /clients/{client_id}/email-replies` — multipart form: `email_text` (string, required), `files` (0+ file uploads, optional). Same optional `Idempotency-Key` header support as the documents endpoint above. Logs the inbound message as an `EmailLog` (`status=received`), classifies intent, extracts any durable memory fact, and branches:
  - attachment(s) → runs document pipeline per attachment
  - a question the AI can confidently answer → drafts an answer (with sources woven in naturally — see Q&A below) and evaluates it for autosend
  - a genuinely ambiguous question → asks a specific clarifying question instead (capped at 2 rounds per thread)
  - a question it can't safely answer or clarify → escalates (`needs_human_attention`, with `escalation_reason` set)
  - obvious junk (marketing/subscription/auto-reply) → filed automatically, no reply, no escalation
  - neither attachment nor question, and not junk → generic escalation for manual review

  Returns:
  ```json
  {
    "has_attachment": true,
    "has_question": false,
    "document_results": [ ...DocumentUploadResult, ... ],
    "reply_email_log_id": 42,
    "needs_human_attention": false,
    "needs_clarification": false
  }
  ```
  `reply_email_log_id` points at whichever `EmailLog` row resulted — the drafted/sent answer, the clarifying question, or the escalated inbound row itself. It's `null` when the message was filed as junk (nothing was created to reference).

### Q&A (general questions from clients)

There's no separate endpoint for this — it's part of the email-reply pipeline above. When a client asks a question, the AI:
- Uses recent conversation history and long-term memory notes (see above) so it doesn't treat every question as if from a stranger, and can pull the client's actual documents or full conversation history on demand when that's not enough.
- Uses web search for general regulatory/professional facts, preferring official government/regulatory sources for the org's configured `jurisdiction` (see "Onboarding" above), woven naturally into the email prose (not a bare "Sources:" list).
- If it could only find lower-quality sources, appends a `[Reviewer note - source quality concern: ...]` to the draft, and **that email is always excluded from autosend** regardless of the org's automation level or confidence — it always needs a human look.
- If the question is ambiguous but resolvable with one follow-up, asks a clarifying question instead of guessing (see above).
- If it's not confident enough to answer or clarify safely — including when it can't verify a specific detail (e.g. a figure from a document) - it escalates instead rather than guessing.

### Checklist reminders (the "kick off" email, and the basis for auto re-reminders)

- `POST /clients/{client_id}/checklist-reminder` — no body. Drafts one AI-written email listing all `missing`/`wrong` checklist items for that client, creates it as `EmailLog(status=draft)`, evaluates it for autosend (treated as maximum confidence, since it's a factual listing), and stamps `Client.last_reminder_sent_at`. Returns the resulting `EmailLog` — check `status`/`autosent` to see whether it went out immediately or is waiting for review. 400 if the client has no outstanding items. **This is also what enrolls a client into the automatic re-reminder cycle** — see "Proactive reminders" above.

### Email log & threads (review queue — the main thing a dashboard needs)

- `GET /email-log?status={received|draft|sent|needs_human_attention}` — `status` optional (omit for all), scoped to your org automatically. This is the primary feed for a "needs your attention" / "drafts to approve" dashboard view, across all clients in the org. Each row includes a `documents: []` array (`DocumentOut[]`) of any documents that arrived alongside that specific email.

- `GET /clients/{client_id}/email-threads` — full conversation history per client, grouped for a threaded UI. Returns:
  ```json
  [
    {
      "thread_key": "18r2a9f...",
      "messages": [ ...EmailLogOut, ...EmailLogOut ]
    }
  ]
  ```
  Threads are ordered most-recently-active first; messages within a thread are chronological. A message with no real Gmail `thread_id` (e.g. a standalone checklist reminder) gets its own single-message "thread" (`thread_key` like `"solo-42"`) rather than being dropped or merged with unrelated messages. **This is the endpoint to build a per-client "email thread" view against.**

- `POST /clients/{client_id}/email-log/{email_log_id}/send` — actually sends a `draft` email through the org's connected Gmail account (manual send — same underlying logic as autosend, just human-triggered). 400 if the email isn't in `draft` status or if the org has no active `InboxConnection`. On success flips status to `sent` and records the real Gmail `threadId`.

  **There is no endpoint yet to edit a draft's content before sending, or to mark a `needs_human_attention` row as resolved.** If the UI needs "edit then send" or "dismiss this escalation," those need to be added.

#### `EmailLogOut` shape (used by all endpoints above)

```json
{
  "id": 42,
  "client_id": 7,
  "direction": "outbound",
  "thread_id": "18r2a9f...",
  "status": "sent",
  "subject": "Re: Missing T4",
  "content": "Hi Jane, ...",
  "from_email": "firm@example.com",
  "to_email": "jane@example.com",
  "escalation_reason": null,
  "is_clarifying_question": false,
  "autosend_confidence": 0.91,
  "autosend_threshold": 0.85,
  "automation_level_at_decision": "medium_automation",
  "autosent": true,
  "autosend_error": null,
  "tool_trajectory": null,
  "documents": [],
  "created_at": "2026-07-06T04:22:20Z"
}
```

Notes for UI:
- `escalation_reason` is only set when `status == "needs_human_attention"` — show it as the "why this needs review" text.
- `is_clarifying_question` — `true` when this outbound message is a follow-up question rather than a full answer; worth a distinct visual treatment in a thread view (e.g. a "?" badge) so it's clear the conversation isn't resolved yet.
- The `autosend_*` fields are the audit trail described above. `autosend_threshold`/`automation_level_at_decision` being `null` means the org was on `no_automation` at decision time (no threshold applied — always a human call). If `should_send` was true but it didn't actually go out, `autosend_error` explains why (e.g. no active Gmail connection) — worth a warning icon in the UI, since it means a message the system *intended* to autosend is sitting undelivered as a draft.
- `tool_trajectory` — for a Q&A answer/clarify/escalate that went through the AI agent, this is a list of `{round, tool, arguments, result}` records of what the agent actually did before producing this message (e.g. it read a specific document, or pulled full conversation history) — `null` for anything that didn't go through that path (plain document acknowledgments, etc). **Good candidate for a collapsed "how this was generated" disclosure** on a message, staff-facing only - it's audit/debugging information, not something a client should see.
- `documents` — any `Document` rows that arrived in the same inbound email as this message (empty array otherwise).
- `from_email`/`to_email` may be `null` on some outbound rows until actually sent (from_email in particular is only populated once the send happens, since which mailbox sends it isn't known until then).

### Client memory notes

- `GET /clients/{client_id}/memory-notes` → `[{ id, client_id, note, source_email_log_id, created_at }]`, oldest first. See "Long-term memory" above.

### Unmatched inbound emails (senders that don't match any client)

Mail from an unrecognized sender is AI-triaged and stored, not dropped:

- `GET /unmatched-inbound-emails?review_status={needs_review|dismissed}&category={potential_new_client|spam|automated|other}` — both filters optional, scoped to your org automatically.
- `POST /unmatched-inbound-emails/{id}/dismiss` → marks one reviewed/handled with no other action.
- `POST /unmatched-inbound-emails/{id}/link` — body `{ "client_id": 7 }`. Attaches this unmatched email as a real inbound `EmailLog` on an *existing* client (e.g. staff recognizes it's actually client X emailing from a new address), and marks it dismissed.
- `POST /unmatched-inbound-emails/{id}/create-client` — body `{ "name": "Jane Doe", "status": "pending", "email": "jane@other-address.com" }` (`email` optional, defaults to the sender's actual address). Creates a **new** client from this unmatched email, attaches the email to it the same way `/link` does, and returns the created `ClientOut`. 409 if the email is already used by another client in the org.

Each row includes `category` (AI's classification), `ai_reason` (why), and
`ai_confidence` (0-1). Obvious junk (`spam`/`automated`, high AI confidence) is
auto-marked `dismissed` on arrival so it doesn't clutter a review queue;
everything else — including `potential_new_client`, `other`, or any
low-confidence call — defaults to `needs_review`. **This is a good candidate
for a small "unrecognized senders" inbox view** — surfacing `needs_review` rows
lets a user catch prospective clients or clients emailing from a new address,
which previously vanished with no trace.

### Gmail connection

- `GET /organizations/me/gmail/connect` → `{ "authorization_url": "https://accounts.google.com/..." }`. **Redirect the browser to this URL** (full page navigation, not a fetch) to start Google's OAuth consent flow. 500 if `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` aren't configured in the backend's `.env`. **This is also the reconnect/reauth flow** — re-running it for a mailbox that's already connected updates the existing `InboxConnection` in place (new refresh token, `status` back to `active`) rather than creating a duplicate, so a "Reconnect" button in the UI can just point at this same endpoint.

- `GET /gmail/oauth/callback` — Google redirects here after consent; the backend handles the code exchange itself and then **redirects the browser** to `{frontend_url}/clients?gmail=connected&email=<address>` on success or `{frontend_url}/clients?gmail=error&reason=<text>` on failure. Not something the frontend calls directly - build a route/handler for those query params on whatever page `frontend_url + "/clients"` resolves to. **Immediately after landing on the success case, call `POST /inbox-connections/{connection_id}/watch`** (see "Onboarding" above) - connecting alone does not start push notifications.

- `GET /inbox-connections` → `[{ id, organization_id, email_address, status, watch_expiration, created_at }]`, scoped to your org automatically. Note: `status` can be `needs_reauth` — worth showing a "reconnect" prompt in the UI when you see that (see above). `watch_expiration` tells you when the auto-renewing push subscription expires — normally always a couple days in the future (it's renewed daily); if it's ever in the past while `status` still shows `active`, that's a sign the renewal job itself isn't running, worth a distinct warning in the UI. **There's currently no independent alerting** (e.g. push notification) when a connection needs reauth — the frontend polling/displaying this list is the only signal today.

- `DELETE /inbox-connections/{connection_id}` → 204, 404 if missing.

- `POST /inbox-connections/{connection_id}/watch` — (re)starts Gmail push notifications for that mailbox. **A background job now renews this automatically every 24h** for all active connections, so this manual endpoint is mostly for first-time setup (right after connecting, as part of onboarding — see above) rather than ongoing maintenance — probably still worth exposing as a "connection active" indicator/retry button in case renewal ever fails silently for a specific connection (e.g. revoked refresh token flips it to `needs_reauth`).

## Known gaps that will affect frontend design

- **No consent/opt-out mechanism.** Nothing lets a client stop automatic reminders/autosend from targeting them. Fine for testing against your own addresses; treat this as a blocker before pointing autosend at real clients.
- **No pagination** on any list endpoint.
- **No PATCH/edit for clients** — checklist items can now be updated/waived (see above), but `Client` itself (name, email, status) is create/read/delete only.
- **No way to mark an escalation resolved or edit a draft before sending.**
- **No deadline-driven urgency** — the reminder interval is a flat cadence; nothing tracks an actual filing/application deadline to ramp up frequency/tone as it approaches.
- **English-only.** No bilingual/multi-language handling for AI-drafted or AI-answered content.
- **No backlog visibility for the firm itself** — nothing surfaces "you have N unresolved items" anywhere; the review queues (`/email-log`, `/unmatched-inbound-emails`) are pull-based only. There's also no notification (email/push/etc.) when something lands in either queue - a real gap if nobody's actively checking.
- **No server-side onboarding enforcement** — `onboarding_completed_at` is just a field the frontend reads and gates on; nothing on the backend blocks other endpoints from working before it's set. If a user skips your onboarding flow entirely (e.g. hits the API directly), everything still technically works, just unconfigured (generic prompts, no jurisdiction, no Gmail connection).
- **Document storage**: uploaded files go to Cloudflare R2 (S3-compatible object storage), not local disk. `Document.s3_path` is an R2 **object key**, not a public URL - the bucket isn't public; `download_url` on `DocumentOut` is the presigned link to actually use.

The core AI pipeline (document classification/verification, Q&A with memory,
tool use, and clarification, autosend, reminders) has been exercised against
the live OpenAI and Gmail APIs during development, not just unit-tested — but
only against a small number of test orgs/clients, so don't assume it's been
proven at any real volume or variety.

If you (or Claude Code working on the frontend) hit a wall because an endpoint doesn't exist or doesn't return the right shape, that's expected at this stage — come back to the backend and ask for the specific addition rather than working around it in the frontend.
