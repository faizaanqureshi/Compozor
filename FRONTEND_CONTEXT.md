# Frontend context: accounting-saas API

This is the backend API for a tax document collection tool for accounting firms.
A CPA sets up a checklist of documents needed from a client, the system emails
the client, and when the client replies (with an attachment and/or a question),
an AI vision model classifies the document, matches it against the checklist,
and either marks it received, flags a mismatch, or escalates to a human.

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

## Auth status: none yet

**There is no login, no session, no JWT, nothing.** Every endpoint is open.
Multi-tenancy exists at the data level (`organization_id` on `Client`) but is
NOT enforced by auth — it's just a filter you pass explicitly.

For now, the frontend should let the user pick/hardcode an `organization_id`
(e.g. a single hardcoded value, or a simple org switcher) rather than trying to
build a real login flow against this API — there's nothing to log into yet.

## Data model

```
Organization (a firm)
  └── Client (a taxpayer, belongs to one org)
        ├── ChecklistItem (a document type needed from this client)
        │     └── Document (an uploaded/classified file, optionally linked to a ChecklistItem)
        └── EmailLog (a drafted/sent/escalated email tied to this client)

InboxConnection (a connected Gmail mailbox, belongs to one org)
```

### Enums

- `ClientStatus`: `active` | `inactive` | `pending`
- `ChecklistItemStatus`: `missing` | `received` | `wrong`
- `EmailDirection`: `inbound` | `outbound`
- `EmailStatus`: `draft` | `sent` | `needs_human_attention`
- `InboxConnectionStatus`: `active` | `needs_reauth`

`needs_human_attention` is the important one for UI: it means the system
couldn't resolve something automatically (a document sent wrong 3+ times, an
unanswered client question, or an unparseable inbound email) and a human needs
to look at it. `draft` means an AI-written email is sitting there ready to be
reviewed and sent.

## Endpoints

All request/response bodies are JSON unless noted (file uploads are
multipart/form-data).

### Organizations

- `POST /organizations` — body `{ "name": string }` → `{ id, name }`
- `GET /organizations` → `[{ id, name }]` (lists ALL orgs — no auth yet, so this is not scoped to "your" org)
- `GET /organizations/{org_id}` → `{ id, name }`, 404 if missing
- `DELETE /organizations/{org_id}` → 204, 404 if missing. **Will 500 if any client still references it** (FK constraint, no cascade) — delete/reassign clients first.

### Clients

- `POST /clients` — body:
  ```json
  { "organization_id": 1, "name": "Jane Doe", "email": "jane@example.com", "tax_year": 2025, "status": "pending" }
  ```
  `status` is optional, defaults to `pending`. Returns the created client. 404 if `organization_id` doesn't exist. 409 if `email` is already used by another client (email is globally unique, not just per-org).

- `GET /clients?organization_id={id}` — **`organization_id` is required.** Returns clients for that org only.

- `GET /clients/{client_id}` → client detail, including nested `checklist_items: []`. 404 if missing.

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
  All fields except `doc_type_needed` are optional. `doc_type_needed` should match one of the classifier's known types for auto-matching to work: `T4`, `T4A`, `T5`, `NOA`, `bank_statement`, `qbo_export`, `receipt`, `unknown` (see `app/services/document_classifier.py` — this list can grow, check there if unsure).

- `GET /clients/{client_id}/checklist-items` → completion summary:
  ```json
  { "total": 3, "missing": 1, "received": 1, "wrong": 1, "items": [ ...ChecklistItemOut ] }
  ```
  Each item also has `wrong_attempt_count` (int) and `last_wrong_doc_type` (string|null) — used for the escalation-after-3-wrong-attempts logic, worth surfacing in a UI so a CPA can see "this client has messed this up twice."

### Documents

- `POST /clients/{client_id}/documents` — multipart form, field `file` (single PDF). Runs the full pipeline: classify → match to checklist item → update status → draft/escalate email if needed. Returns:
  ```json
  {
    "document": { "id", "client_id", "checklist_item_id", "s3_path", "classified_type", "extracted_metadata", "received_at" },
    "checklist_item_id": 5,
    "checklist_item_status": "received",
    "draft_email_created": false
  }
  ```
  There is currently **no endpoint to list documents for a client** — if you need a "documents" tab, that'll need to be added (ask for it, it's a quick addition).

### Email replies (simulates an inbound client email — mostly for testing; real inbound mail comes through the Gmail webhook instead)

- `POST /clients/{client_id}/email-replies` — multipart form: `email_text` (string, required), `files` (0+ file uploads, optional). Classifies intent (has a question? has an attachment already known from whether files were sent) and branches:
  - attachment only → runs document pipeline
  - question only → escalates (`needs_human_attention`), no auto-answer
  - both → does both, independently
  - neither → generic escalation for manual review

  Returns:
  ```json
  {
    "has_attachment": true,
    "has_question": false,
    "document_results": [ ...DocumentUploadResult, ... ],
    "escalation_email_log_id": null
  }
  ```

### Checklist reminders (the "kick off" email)

- `POST /clients/{client_id}/checklist-reminder` — no body. Drafts one AI-written email listing all `missing` checklist items for that client, creates it as `EmailLog(status=draft)`. 400 if the client has no missing items.

### Email log (review queue — the main thing a CPA dashboard needs)

- `GET /email-log?organization_id={id}&status={draft|sent|needs_human_attention}` — `organization_id` required, `status` optional (omit for all). This is the primary feed for a "needs your attention" / "drafts to approve" dashboard view.

- `POST /clients/{client_id}/email-log/{email_log_id}/send` — actually sends a `draft` email through the org's connected Gmail account. 400 if the email isn't in `draft` status (already sent, or is an escalation) or if the org has no active `InboxConnection`. On success flips status to `sent` and records the real Gmail `threadId`.

  **There is no endpoint yet to edit a draft's content before sending, or to mark a `needs_human_attention` row as resolved.** If the UI needs "edit then send" or "dismiss this escalation," those need to be added.

### Gmail connection

- `GET /organizations/{org_id}/gmail/connect` → `{ "authorization_url": "https://accounts.google.com/..." }`. **Redirect the browser to this URL** (full page navigation, not a fetch) to start Google's OAuth consent flow. 500 if `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` aren't configured in the backend's `.env`.

- `GET /gmail/oauth/callback` — Google redirects here after consent; the backend handles the code exchange itself. Not something the frontend calls directly, but after redirecting the user to `authorization_url`, they'll land back on this URL (currently just returns raw JSON — `{ id, organization_id, email_address, status }` — since there's no frontend page for it yet. **You'll probably want the backend to redirect to a frontend success/failure page instead of returning raw JSON** — ask for that change when you get to this flow.

- `GET /inbox-connections?organization_id={id}` → `[{ id, organization_id, email_address, status }]`. Note: `status` can be `needs_reauth` — worth showing a "reconnect" prompt in the UI when you see that.

- `DELETE /inbox-connections/{connection_id}` → 204, 404 if missing.

- `POST /inbox-connections/{connection_id}/watch` — (re)starts Gmail push notifications for that mailbox. Must be called at least every 7 days or notifications silently stop (currently manual, no cron yet). Probably not something the frontend needs to expose directly unless you want a "renew connection" button.

## Known gaps that will affect frontend design

- **No auth** — see above. Design around a hardcoded/selectable `organization_id` for now.
- **No pagination** on any list endpoint.
- **No PATCH/edit or DELETE for clients or checklist items** — create/read only right now.
- **No document-list endpoint per client.**
- **No way to mark an escalation resolved or edit a draft before sending.**
- Local disk storage for uploaded files (not S3) — irrelevant to the frontend's contract, just don't expect `s3_path` to be a real S3 URL.

If you (or Claude Code working on the frontend) hit a wall because an endpoint doesn't exist or doesn't return the right shape, that's expected at this stage — come back to the backend and ask for the specific addition rather than working around it in the frontend.
