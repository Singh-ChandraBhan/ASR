# Aira — ASR Commerce Engagement Chatbot

Aira collects buyer and seller requirements, recommends only entries from the local verified catalog, and routes quotations, negotiations, payments, contracts, availability, and delivery commitments to a human approval queue.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and a long random `ADMIN_TOKEN`.
2. Add verified products and suppliers to `data/catalog.json`.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`. Review requests at `http://localhost:3000/admin.html`.

The default model is `gpt-5.6-sol`; change `OPENAI_MODEL` if your account uses another supported model.

## Approval design

The model emits a structured approval decision. The server intercepts flagged actions, stores them as `pending`, and returns only a review reference to the visitor. An authenticated reviewer can approve or reject the request. Approval does not automatically send a quote, payment, or contract; connect that final action to your authenticated CRM or back-office workflow after defining authorization and audit requirements.

For production, replace the JSON approval store with a transactional database, put the admin route behind company SSO/RBAC, add rate limiting and CSRF protection, encrypt sensitive data, define retention rules, and log reviewer identity.
