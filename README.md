# ASR Global Solutions

Professional static Bootstrap homepage for ASR Global Solutions.

## Run locally

Open `index.html` directly, or serve the folder with any static web server.

Example with VS Code: install **Live Server**, right-click `index.html`, then choose **Open with Live Server**.

## Before publishing

- Replace the placeholder phone number in `index.html`.
- Confirm the email address.
- Connect the enquiry form to Formspree, Netlify Forms, or your own backend.
- Replace the Google Fonts and Bootstrap CDN links with local assets if full offline support is required.

## AI chatbot

The floating **Aira** chatbot uses Hugging Face, LangChain and Pinecone. Its backend is in `chatbot/`.

1. Create Hugging Face and Pinecone accounts and obtain API keys.
2. Open `chatbot/.env` and replace the placeholder values for `HF_TOKEN` and `PINECONE_API_KEY`.
3. In PowerShell, run `cd chatbot`, followed by `.\start.ps1`. This creates a virtual environment, installs `requirements.txt`, and starts the API.
4. Before the first chat, activate the environment and run `python ingest.py` once to populate Pinecone.
5. Serve this website on port 5500. For production, deploy the Dockerfile and replace the `chatbot-api` meta value in `index.html` with the public HTTPS API URL. Add the website domain to `ALLOWED_ORIGINS`.

Never add `.env` or API keys to source control. Update `chatbot/knowledge.md` and rerun ingestion whenever company facts change.

## Customer enquiry storage

Website enquiry submissions are saved through `POST /api/customers`. Dual storage is active: SQLite is the primary database at `chatbot/data/asr_customers.db`, and every lead is mirrored to `chatbot/data/customers.xlsx` with the same customer ID. Each record includes its UTC timestamp, contact information, requirement, source and status.

If the Excel file is open or locked, SQLite still saves the lead and the API records the mirror error in its log. After installing requirements, run `python migrate_excel_to_sql.py` from `chatbot/` once to copy any older Excel-only leads into SQLite. The migration is idempotent and skips customer IDs already present.

### Move SQLite to Azure SQL later

The application already talks to the generic SQL repository. Provision Azure SQL Database, install `pyodbc` plus Microsoft ODBC Driver 18 in the API host, and replace `DATABASE_URL` in `chatbot/.env` with the Azure SQLAlchemy connection URL. Keep `CUSTOMER_STORAGE=sql`.

```env
CUSTOMER_STORAGE=both
DATABASE_URL=mssql+pyodbc://USER:PASSWORD@SERVER.database.windows.net/DATABASE?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes
```

Restart the API. SQLAlchemy creates the initial `customer_leads` table automatically. Use Azure Key Vault or the hosting service's secret settings for production credentials rather than committing them to `.env`.

## New-enquiry email notifications

The API can notify the ASR team after a customer is successfully saved. In `chatbot/.env`, provide the SMTP username and app password, set the sender/recipient, and change `NOTIFICATIONS_ENABLED=true`. Gmail accounts should use an App Password rather than the normal account password. For Microsoft 365, use its SMTP host and port settings.

Notification delivery runs after the API response. If SMTP is temporarily unavailable, the customer remains safely stored in Excel or SQL and the error is recorded in the server log.

## Deploy the website to GitHub Pages

The ready-to-use workflow at `.github/workflows/deploy-pages.yml` deploys every push to `main` and supports manual runs. It publishes only the static website; `.env`, databases, Excel files and Python backend code are excluded from the Pages artifact.

1. Push this project to a GitHub repository with `main` as its default branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. If the FastAPI backend is publicly deployed, create the repository variable `PAGES_CHATBOT_API_URL` under **Settings → Secrets and variables → Actions → Variables**. Use only the HTTPS origin, such as `https://asr-api.example.com`—do not append `/api/chat`.
4. Add the final GitHub Pages origin, such as `https://USERNAME.github.io`, to `ALLOWED_ORIGINS` in the backend environment.
5. Push to `main` or manually run **Deploy ASR website to GitHub Pages** from the Actions tab.

Without `PAGES_CHATBOT_API_URL`, the public site still provides the built-in offline FAQ responses. GitHub Pages hosts static files only; FastAPI, SQLite, Excel saving and email notifications require a separately deployed backend.
