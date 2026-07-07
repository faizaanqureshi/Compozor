# Frontend context: accounting-saas API

This is the backend API for a tax/accounting document collection and inbox
automation tool for accounting firms. A CPA sets up a checklist of documents
needed from a client, the system emails the client, and when the client
replies, an AI pipeline handles it: documents get classified, verified as
genuine, and matched against the checklist; questions get answered (with
real conversation memory) or escalated or clarified; unrecognized senders
get triaged instead of silently dropped; and clients who go quiet get
automatically re-reminded. Depending on the org's automation setting,
replies can send themselves automatically.

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

CORS is configured to allow `http://localhost:3000` (see `app/main.py`). If your
frontend runs on a different port, that needs to change.

A background scheduler runs inside the app process (APScheduler) with two
recurring jobs — nothing the frontend needs to call, just don't be surprised
if you see them in logs on startup:
- Renews Gmail push-notification watches every 24h.
- Sends overdue checklist re-reminders every 24h (see "Proactive reminders" below).

## Auth status: none yet

**There is no login, no session, no JWT, nothing.** Every endpoint is open.
Multi-tenancy exists at the data level (`organization_id` on `Client`) but is
NOT enforced by auth — it's just a filter you pass explicitly.

For now, the frontend should let the user pick/hardcode an `organization_id`
(e.g. a single hardcoded value, or a simple org switcher) rather than trying to
build a real login flow against this API — there's nothing to log into yet.

## Data model

```
Organization (a firm; has automation_level + reminder_interval_days settings)
  ├── Client (a taxpayer, belongs to one org; tracks last_reminder_sent_at)
  │     ├── ChecklistItem (a document type needed from this client)
  │     │     └── Document (an uploaded/classified file, optionally linked to a ChecklistItem; has its own `year`)
  │     ├── EmailLog (one row per inbound OR outbound message tied to this client - see below)
  │     └── ClientMemoryNote (a durable fact the AI extracted about this client - see "Long-term memory" below)
  ├── InboxConnection (a connected Gmail mailbox, belongs to one org)
  └── UnmatchedInboundEmail (inbound mail whose sender didn't match any client)
```

**Note on `Client`:** there is no `tax_year` on `Client` — a client isn't
scoped to a single tax year, since firms do accounting work throughout the
year, not just tax-season document collection. The **year lives on
`Document`** instead (each uploaded document has its own `year`, taken from
whatever the AI classifier read off the document itself).

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

Set it via `PATCH /organizations/{org_id}` with `{ "automation_level": "medium_automation" }`.

This applies to **every** AI-generated outbound email: checklist reminders
(manual or automatic), document-received acknowledgments, wrong-document
follow-ups, answered client questions, and clarifying questions. Every such
`EmailLog` row carries a full audit trail of the autosend decision made about
it (see `EmailLogOut` fields below) — the frontend should surface this so a
CPA can see exactly why something did or didn't send itself.

**Exception:** a Q&A answer where the AI could only find lower-quality
sources is always excluded from autosend regardless of confidence or
automation level — see Q&A section below.

## Client matching & threading (inbound Gmail mail)

When a real inbound Gmail message arrives (via the Pub/Sub webhook), it's
matched to a `Client` by:
1. **Gmail thread first** — if the message's `threadId` matches a prior
   `EmailLog.thread_id` for a client in that org, it's matched to that client
   even if the sender's address differs (e.g. they replied from a different
   address within an existing conversation).
2. **Sender address fallback** — case-insensitive match against `Client.email`.

If neither matches, the email is **not dropped** — it's recorded as an
`UnmatchedInboundEmail` (see below) instead.

Every real inbound message becomes its own `EmailLog` row (`status=received`),
and AI-drafted replies carry the same `thread_id` (and correct Gmail
`In-Reply-To`/`References` headers under the hood) so conversations thread
correctly both in Gmail and in this system.

## Long-term memory & conversation continuity

The Q&A responder (see below) doesn't treat every question as if from a
stranger. Two mechanisms feed it context:

1. **Recent conversation history** — the last 15 real messages exchanged
   with this client (across *all* their email threads, not just the current
   one), so it won't re-explain something just told to them or lose track
   of a follow-up question.
2. **Long-term memory notes** (`ClientMemoryNote`) — durable facts extracted
   from any inbound email (a life/business change, a stated preference, a
   recurring issue), which don't age out the way the recency window does.
   Most emails produce none; only genuinely durable facts get stored.

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
  client sends something real that just isn't on their checklist (a
  receipt, a CRA letter, anything), they get a warm "thanks, filed for
  reference" acknowledgment, not a problem notice. Only a document that
  fails authenticity verification gets the "there's a problem" framing.
- **Only PDFs and images can actually be read** (`jpg`/`png`/`gif`/`webp` +
  `application/pdf`) — anything else (Word, Excel, CSV, ZIP, etc.) skips AI
  classification entirely (it would just fail) and instead gets saved with
  a "needs manual review" marker and a client-facing "we got your file, a
  team member will follow up" acknowledgment, rather than erroring out.
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

Set it via `PATCH /organizations/{org_id}` with `{ "reminder_interval_days": 3 }` (or `null` to disable).

## Endpoints

All request/response bodies are JSON unless noted (file uploads are
multipart/form-data).

### Organizations

- `POST /organizations` — body `{ "name": string }` → `{ id, name, automation_level, reminder_interval_days }` (`automation_level` defaults to `"no_automation"`, `reminder_interval_days` defaults to `null`).
- `GET /organizations` → `[{ id, name, automation_level, reminder_interval_days }]` (lists ALL orgs — no auth yet, so this is not scoped to "your" org)
- `GET /organizations/{org_id}` → same shape, 404 if missing
- `PATCH /organizations/{org_id}` — body can include either or both fields: `{ "automation_level": "medium_automation", "reminder_interval_days": 3 }`. Only fields you include get updated (unset fields are left alone; explicitly passing `null` for `reminder_interval_days` disables auto-reminders). **This is where the automation-level picker and the reminder-interval setting should both write to.**
- `DELETE /organizations/{org_id}` → 204, 404 if missing. **Will 500 if any client, inbox connection, or unmatched email still references it** (FK constraint, no cascade) — delete/reassign those first.

### Clients

- `POST /clients` — body:
  ```json
  { "organization_id": 1, "name": "Jane Doe", "email": "jane@example.com", "status": "pending" }
  ```
  `status` is optional, defaults to `pending`. **No `tax_year` field.** Returns the created client. 404 if `organization_id` doesn't exist. 409 if `email` is already used by another client (email is globally unique, not just per-org).

- `GET /clients?organization_id={id}` — **`organization_id` is required.** Returns clients for that org only.

- `GET /clients/{client_id}` → client detail (includes `last_reminder_sent_at`), plus nested `checklist_items: []`. 404 if missing.

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
  All fields except `doc_type_needed` are optional. **`doc_type_needed` is free text — there's no fixed list of document types.** The AI matches an uploaded document against whatever's actually written here (using `doc_type_needed` + `description` together), so this works for anything an accounting firm might request: personal tax slips (`"T4"`), corporate filings (`"T2 Schedule 100"`), recurring engagements (`"GST/HST Return Q1"`), bookkeeping records, payroll documents, whatever — not just the original small set of tax-slip types. If a client has more than one item with the same `doc_type_needed` (e.g. a monthly bank statement requested twice for different months), set `expected_date_range_start`/`end` on each so uploads get matched to the right one by period.

- `GET /clients/{client_id}/checklist-items` → completion summary:
  ```json
  { "total": 3, "missing": 1, "received": 1, "wrong": 1, "items": [ ...ChecklistItemOut ] }
  ```
  Each item also has `wrong_attempt_count` (int) and `last_wrong_doc_type` (string|null) — used for the escalation-after-3-wrong-attempts logic, worth surfacing in a UI so a CPA can see "this client has messed this up twice."

### Documents

- `POST /clients/{client_id}/documents` — multipart form, field `file` (a single PDF **or photo** — jpg/png/gif/webp are all accepted, not just PDF). Runs the full pipeline: classify → verify authenticity/name → match to a checklist item (period-aware) → update status → draft/escalate/acknowledge email as appropriate, or silently record a duplicate/additional page. Returns:
  ```json
  {
    "document": { "id", "client_id", "checklist_item_id", "s3_path", "year", "classified_type", "extracted_metadata", "received_at" },
    "checklist_item_id": 5,
    "checklist_item_status": "received",
    "draft_email_created": false
  }
  ```
  `document.year` is the year the AI read off the document itself (nullable). `classified_type` is now a free-text description the AI wrote (e.g. `"T4 Statement of Remuneration Paid for tax year 2023"`, `"GST/HST return for Q1 2026"`) rather than a fixed enum value — there's no closed list of document types anymore. `extracted_metadata` includes the full match result, including `looks_genuine`/`authenticity_concern`/`mismatch_reason` if you want to surface verification detail in a UI.

  **A document that doesn't match anything on the checklist is not automatically treated as an error.** If it's genuine but just isn't something currently requested (e.g. a client proactively sends a receipt, a CRA letter, anything not on their checklist), `checklist_item_id` comes back `null` and the client gets a warm "thanks, filed for reference" acknowledgment, not a problem notice. Only a document that fails authenticity verification gets the "there's a problem" framing. This endpoint doesn't currently accept a message alongside the file (real inbound Gmail replies do carry the sender's own message as context — see Email replies below); a future "upload with a note" field could pass that through the same way.

- `GET /clients/{client_id}/documents` → `[DocumentOut, ...]`, most recent first. Each includes a freshly-signed `download_url` (R2 presigned URL, ~1h expiry) for direct download/preview — good for a "documents" tab.

### Email replies (simulates an inbound client email — mostly for testing; real inbound mail comes through the Gmail webhook instead)

- `POST /clients/{client_id}/email-replies` — multipart form: `email_text` (string, required), `files` (0+ file uploads, optional). Logs the inbound message as an `EmailLog` (`status=received`), classifies intent, extracts any durable memory fact, and branches:
  - attachment(s) → runs document pipeline per attachment
  - a question the AI can confidently answer → drafts an answer (with sources woven in naturally — see Q&A below) and evaluates it for autosend
  - a genuinely ambiguous question → asks a specific clarifying question instead (capped at 2 rounds per thread)
  - a question it can't safely answer or clarify → escalates (`needs_human_attention`, with `escalation_reason` set)
  - neither attachment nor question → generic escalation for manual review

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
  `reply_email_log_id` points at whichever `EmailLog` row resulted — the drafted/sent answer, the clarifying question, or the escalated inbound row itself.

### Q&A (general questions from clients)

There's no separate endpoint for this — it's part of the email-reply pipeline above. When a client asks a question, the AI:
- Uses recent conversation history and long-term memory notes (see above) so it doesn't treat every question as if from a stranger.
- Uses web search for general tax/accounting facts, preferring official sources (`canada.ca`, `cra-arc.gc.ca`), woven naturally into the email prose (not a bare "Sources:" list).
- If it could only find lower-quality sources, appends a `[Reviewer note - source quality concern: ...]` to the draft, and **that email is always excluded from autosend** regardless of the org's automation level or confidence — it always needs a human look.
- If the question is ambiguous but resolvable with one follow-up, asks a clarifying question instead of guessing (see above).
- If it's not confident enough to answer or clarify safely, it escalates instead rather than guessing.

### Checklist reminders (the "kick off" email, and the basis for auto re-reminders)

- `POST /clients/{client_id}/checklist-reminder` — no body. Drafts one AI-written email listing all `missing` checklist items for that client, creates it as `EmailLog(status=draft)`, evaluates it for autosend (treated as maximum confidence, since it's a factual listing), and stamps `Client.last_reminder_sent_at`. Returns the resulting `EmailLog` — check `status`/`autosent` to see whether it went out immediately or is waiting for review. 400 if the client has no missing items. **This is also what enrolls a client into the automatic re-reminder cycle** — see "Proactive reminders" above.

### Email log & threads (review queue — the main thing a CPA dashboard needs)

- `GET /email-log?organization_id={id}&status={received|draft|sent|needs_human_attention}` — `organization_id` required, `status` optional (omit for all). This is the primary feed for a "needs your attention" / "drafts to approve" dashboard view, across all clients in the org.

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
  "created_at": "2026-07-06T04:22:20Z"
}
```

Notes for UI:
- `escalation_reason` is only set when `status == "needs_human_attention"` — show it as the "why this needs review" text.
- `is_clarifying_question` — `true` when this outbound message is a follow-up question rather than a full answer; worth a distinct visual treatment in a thread view (e.g. a "?" badge) so it's clear the conversation isn't resolved yet.
- The `autosend_*` fields are the audit trail described above. `autosend_threshold`/`automation_level_at_decision` being `null` means the org was on `no_automation` at decision time (no threshold applied — always a human call). If `should_send` was true but it didn't actually go out, `autosend_error` explains why (e.g. no active Gmail connection) — worth a warning icon in the UI, since it means a message the system *intended* to autosend is sitting undelivered as a draft.
- `from_email`/`to_email` may be `null` on some outbound rows until actually sent (from_email in particular is only populated once the send happens, since which mailbox sends it isn't known until then).

### Client memory notes

- `GET /clients/{client_id}/memory-notes` → `[{ id, client_id, note, source_email_log_id, created_at }]`, oldest first. See "Long-term memory" above.

### Unmatched inbound emails (senders that don't match any client)

Previously, mail from an unrecognized sender was silently dropped. Now it's
AI-triaged and stored:

- `GET /unmatched-inbound-emails?organization_id={id}&review_status={needs_review|dismissed}&category={potential_new_client|spam|automated|other}` — `organization_id` required, both other filters optional.
- `POST /unmatched-inbound-emails/{id}/dismiss` — marks one reviewed/handled.

Each row includes `category` (AI's classification), `ai_reason` (why), and
`ai_confidence` (0-1). Obvious junk (`spam`/`automated`, high AI confidence) is
auto-marked `dismissed` on arrival so it doesn't clutter a review queue;
everything else — including `potential_new_client`, `other`, or any
low-confidence call — defaults to `needs_review`. **This is a good candidate
for a small "unrecognized senders" inbox view** — surfacing `needs_review` rows
lets a CPA catch prospective clients or clients emailing from a new address,
which previously vanished with no trace.

There's currently no "convert to client" action — dismissing is the only
state transition. If the UI wants a one-click "this is actually client X" or
"create a new client from this," that needs to be added.

### Gmail connection

- `GET /organizations/{org_id}/gmail/connect` → `{ "authorization_url": "https://accounts.google.com/..." }`. **Redirect the browser to this URL** (full page navigation, not a fetch) to start Google's OAuth consent flow. 500 if `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` aren't configured in the backend's `.env`.

- `GET /gmail/oauth/callback` — Google redirects here after consent; the backend handles the code exchange itself. Not something the frontend calls directly, but after redirecting the user to `authorization_url`, they'll land back on this URL (currently just returns raw JSON — `{ id, organization_id, email_address, status }` — since there's no frontend page for it yet. **You'll probably want the backend to redirect to a frontend success/failure page instead of returning raw JSON** — ask for that change when you get to this flow.

- `GET /inbox-connections?organization_id={id}` → `[{ id, organization_id, email_address, status }]`. Note: `status` can be `needs_reauth` — worth showing a "reconnect" prompt in the UI when you see that.

- `DELETE /inbox-connections/{connection_id}` → 204, 404 if missing.

- `POST /inbox-connections/{connection_id}/watch` — (re)starts Gmail push notifications for that mailbox. **A background job now renews this automatically every 24h** for all active connections, so this manual endpoint is mostly for first-time setup (right after connecting) rather than ongoing maintenance — probably still worth exposing as a "connection active" indicator/retry button in case renewal ever fails silently for a specific connection (e.g. revoked refresh token flips it to `needs_reauth`).

## Known gaps that will affect frontend design

- **No auth** — see above. Design around a hardcoded/selectable `organization_id` for now.
- **No consent/opt-out mechanism.** Nothing lets a client stop automatic reminders/autosend from targeting them. Fine for testing against your own addresses; treat this as a blocker before pointing autosend at real clients.
- **No pagination** on any list endpoint.
- **No PATCH/edit or DELETE for clients or checklist items** — create/read only right now.
- **No document-list endpoint per client.**
- **No way to mark an escalation resolved or edit a draft before sending.**
- **No "convert unmatched email to client" action** — see Unmatched inbound emails above.
- **No deadline-driven urgency** — the reminder interval is a flat cadence; nothing tracks an actual filing deadline to ramp up frequency/tone as it approaches.
- **English-only.** No bilingual (French) handling for AI-drafted or AI-answered content.
- **No backlog visibility for the firm itself** — nothing surfaces "you have N unresolved items" anywhere; the review queues (`/email-log`, `/unmatched-inbound-emails`) are pull-based only.
- **Document storage**: uploaded files now go to Cloudflare R2 (S3-compatible object storage), not local disk. `Document.s3_path` is an R2 **object key** (e.g. `"3/6c1f..._t4.jpg"`), not a public URL - the bucket isn't public. There's no download endpoint yet; `app/services/storage.py` has `generate_presigned_download_url(object_key)` ready to use (temporary signed URL, default 1h expiry) once a `GET /clients/{id}/documents` or `GET /documents/{id}/download` endpoint is added - ask for that when you build a documents tab.

The core AI pipeline (document classification/verification, Q&A with memory
and clarification, autosend, reminders) has been exercised against the live
OpenAI and Gmail APIs during development, not just unit-tested — but only
with a single test org/client, so don't assume it's been proven at any real
volume or variety.

If you (or Claude Code working on the frontend) hit a wall because an endpoint doesn't exist or doesn't return the right shape, that's expected at this stage — come back to the backend and ask for the specific addition rather than working around it in the frontend.
