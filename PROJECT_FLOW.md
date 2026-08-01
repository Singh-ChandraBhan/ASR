# ASR AI Commerce Engagement — Project Flow

This guide explains how a browser action travels through the application. The code uses small, named step functions so a future change can be made in one place.

## 1. Applications in this repository

- `public/`: Aira Commerce Engagement browser interface (buy, sell, chat, and tracking).
- `server.js`: Node/Express API used by the Commerce interface.
- `lib/`: storage, email, Excel mirroring, and OpenAI prompt helpers used by `server.js`.
- `asr-integration/`: ASR marketing site plus its separate Python/FastAPI enquiry and chatbot API.
- `test/`: Node tests for storage and Excel behavior.

GitHub Pages can host the browser files only. It cannot run `server.js` or `asr-integration/app.py`. Production forms therefore need a separately hosted HTTPS API.

## 2. Buyer quotation flow

1. `public/index.html` displays the buyer form.
2. `public/app.js` calls `handleIntakeSubmit`.
3. `handleIntakeSubmit` reads the form and creates the human-readable summary.
4. `requestJson` sends `POST /api/requirements` and normalizes API errors.
6. `server.js` calls `createRequirement`.
7. `RequirementRequest.safeParse` checks the payload with Zod.
8. `quotationStore.create` saves the request and creates its reference.
9. `notifyAdminOfRequest` sends the asynchronous admin email.
10. `syncQuotationWorkbook` mirrors the latest requests to Excel.
11. The API returns the reference to the browser.

Modification points:

- Form fields: `public/index.html` and `requirementLabels` in `public/app.js`.
- Validation rules: `RequirementRequest` in `server.js`.
- Stored record format: `lib/quotation-store.js`.
- Admin email: `lib/mailer.js`.
- Excel columns: `lib/excel-request-mirror.js`.

## 3. Tracking flow

1. `handleTrackingSubmit` reads the reference and email.
2. `requestJson` calls `POST /api/requirements/track`.
3. `trackRequirement` validates both values and finds the matching record.
4. `trackRequirement` returns only customer-safe fields.
5. `handleTrackingSubmit` builds the status timeline.

## 4. AI chat flow

1. `handleChatSubmit` appends the visitor message.
2. `requestJson` calls `POST /api/chat`.
3. `processChat` validates conversation history.
4. The catalog and prompt instructions are loaded.
5. OpenAI returns the structured `ChatResult`.
6. Approval-sensitive requests are saved through `ApprovalStore`.
7. The safe reply and optional approval reference return to the browser.

Modification points:

- Assistant rules: `lib/prompt.js`.
- Product data: `data/catalog.json`.
- Model and credentials: `.env` (never commit it).
- Structured output fields: `ChatResult` in `server.js`.

## 5. Admin review flow

1. `public/admin.js` sends the admin bearer token.
2. `requireAdmin` checks it against `ADMIN_TOKEN`.
3. The admin advances a request to `sourcing`.
4. The admin approves/rejects it through `reviewRequirement`.
5. An approved request moves to `confirmed` and triggers `sendQuotation`.
6. Later calls to `advanceRequirementStage` move it to `delivery` and `completed`.

## 6. ASR marketing-site flow

1. `asr-integration/index.html` displays the marketing site.
2. `assets/js/main.js` submits enquiries to `POST /api/customers`.
3. `asr-integration/app.py` validates `CustomerRequest`.
4. `customer_store.py` writes the lead to SQL/SQLite and optionally Excel.
5. `notifications.py` sends the configured email notification.

The floating ASR chatbot calls `POST /api/chat` in the Python API. It uses `knowledge.md` as verified business context and stores approval-sensitive requests for manual review.

## 7. Safe change checklist

1. Change the smallest named step responsible for the behavior.
2. Keep route handlers as orchestration only; move reusable logic into helpers.
3. Validate all browser input on the server even if the HTML marks it required.
4. Never commit `.env`, databases, Excel customer files, or approval records.
5. Run `npm.cmd test` and `node --check` before pushing.
6. Build the Pages artifact and verify all project-relative links.
