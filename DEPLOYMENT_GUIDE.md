# Deploy ASR AI Commerce Engagement on Any Platform

This document is the platform-neutral deployment guide for the complete ASR application. Use it for Azure, AWS, Google Cloud, DigitalOcean, Render, Railway, GoDaddy VPS, cPanel, or another hosting provider.

## 1. Choose the deployment type

| Deployment | Website | Forms | AI chat | Tracking | Admin | Recommended for |
|---|---:|---:|---:|---:|---:|---|
| Static files only | Yes | No | Offline FAQ only | No | No | GitHub Pages, cPanel, S3, Netlify static |
| Node API only | Commerce UI | Yes | Yes | Yes | Yes | Render, Railway, Azure App Service |
| Node + Python APIs | Complete | Yes | Yes | Yes | Yes | VPS, containers, Kubernetes |

GitHub Pages and ordinary static hosting cannot run Node.js or Python. Use a public HTTPS API for live submissions, AI chat, tracking, email, and data storage.

## 2. Project components

```text
AI_Commerce_Engagement_Services/
├── public/                  Node Commerce browser interface
├── server.js                Node/Express API and static server
├── lib/                     storage, email, Excel, and prompt helpers
├── data/catalog.json        safe product/catalog seed data
├── asr-integration/         ASR website and Python/FastAPI API
│   ├── app.py
│   ├── assets/
│   ├── requirements.txt
│   └── data/                runtime data; do not publish as static files
├── deployment/godaddy/      GoDaddy-specific builders and examples
└── DEPLOYMENT_GUIDE.md      this guide
```

The Node API listens on port `3000` by default. The Python API listens on port `8000`. Node forwards `/asr-api/*` requests to the Python API through `ASR_API_URL`.

## 3. Files that must never be publicly uploaded

Do not place these files inside a public web directory or commit them to Git:

```text
.env
asr-integration/.env
node_modules/
.venv/
__pycache__/
data/approvals.json
data/quotation-requests.json
data/customer-requests.xlsx
asr-integration/data/*.db
asr-integration/data/*.xlsx
```

Use the hosting platform's secret/environment-variable settings for credentials.

## 4. Required environment variables

### Node Commerce API

Create these in the platform settings or in a private `.env` on a VPS:

```env
NODE_ENV=production
PORT=3000
OPENAI_API_KEY=replace-with-secret
OPENAI_MODEL=gpt-5.6-sol
ADMIN_TOKEN=replace-with-a-long-random-secret
ASR_API_URL=http://127.0.0.1:8000
```

Add the SMTP variables documented in `.env.example` if quotation emails are enabled.

### Python ASR API

Use `asr-integration/.env.example` as the complete reference. Important production values include:

```env
OPENAI_API_KEY=replace-with-secret
OPENAI_MODEL=gpt-5.6-sol
ADMIN_TOKEN=replace-with-a-long-random-secret
ALLOWED_ORIGINS=https://www.example.com,https://example.com
CUSTOMER_STORAGE=both
NOTIFICATIONS_ENABLED=false
```

When Node and Python run in separate services, set `ASR_API_URL` to the Python service's private HTTPS URL. When they run on one VPS, use `http://127.0.0.1:8000`.

## 5. Pre-deployment verification

Run from the project root on Windows:

```powershell
npm.cmd ci
npm.cmd test
node --check .\server.js
node --check .\public\app.js
```

Validate the Python service on a machine with Python 3.11 or newer:

```powershell
cd .\asr-integration
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m py_compile app.py customer_store.py notifications.py
cd ..
```

Do not deploy if tests or syntax checks fail.

## 6. Option A: static hosting

Use this option for cPanel, GitHub Pages, Netlify static, Azure Static Web Apps, AWS S3, or another file-only host.

Build the existing static package:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-static.ps1
```

Output folder:

```text
deployment-output/godaddy-static/public_html/
```

Upload the **contents** of `public_html`, not the parent folder. The remote document root must contain `index.html`, `assets/`, and `commerce/`.

If a Node API is deployed separately, rebuild with its public HTTPS origin:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-static.ps1 -CommerceApiUrl "https://api.example.com"
```

The API must allow the website origin through CORS. Never use an HTTP API from an HTTPS website.

## 7. Option B: generic Node PaaS

Use this pattern for Render, Railway, Azure App Service, Google Cloud Run buildpacks, Heroku-compatible platforms, or similar Node hosting.

### Platform settings

```text
Runtime: Node.js 20 or newer
Root directory: project root
Install command: npm ci --omit=dev
Start command: npm start
Health check: /api/health
Port: use the platform-provided PORT variable
```

Add the Node environment variables in the platform dashboard. Attach persistent storage if JSON and Excel files remain the production database. For multi-instance or serverless deployments, replace local files with a managed database and object storage.

The Node-only deployment serves:

```text
/                  Commerce interface
/admin.html        Commerce administration
/api/*             Commerce APIs
/asr               ASR website when asr-integration is included
/asr-api/*         proxy to the separately deployed Python API
```

## 8. Option C: generic Python PaaS

Deploy `asr-integration/` as a separate FastAPI service.

```text
Runtime: Python 3.11 or newer
Root directory: asr-integration
Install command: pip install -r requirements.txt
Start command: uvicorn app:app --host 0.0.0.0 --port $PORT
Health check: /health
```

On platforms that do not expand `$PORT` in a start-command field, use the platform's documented port syntax or a small startup script.

After deployment:

1. Set the Node service's `ASR_API_URL` to the Python service URL.
2. Add the public website and Node origins to Python `ALLOWED_ORIGINS`.
3. Restart both services.

## 9. Option D: Linux VPS

Build a clean VPS upload package:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-vps.ps1
```

Upload folder:

```text
deployment-output/godaddy-vps/app/
```

Upload it from PowerShell:

```powershell
scp -r .\deployment-output\godaddy-vps\app\* root@YOUR_SERVER_IP:/var/www/asr/
```

Install and start on Ubuntu/Debian:

```bash
apt update
apt install -y nginx nodejs npm python3 python3-venv python3-pip
npm install -g pm2
cd /var/www/asr
npm ci --omit=dev
python3 -m venv asr-integration/.venv
asr-integration/.venv/bin/pip install -r asr-integration/requirements.txt
cp .env.example .env
cp asr-integration/.env.example asr-integration/.env
nano .env
nano asr-integration/.env
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`. Configure Nginx as a reverse proxy to `127.0.0.1:3000`, then obtain an HTTPS certificate with the provider's certificate manager or Certbot.

## 10. Option E: container platform

The Python integration already contains a Dockerfile. The Node service can use this Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
COPY lib ./lib
COPY data/catalog.json ./data/catalog.json
COPY data/approvals.example.json ./data/approvals.example.json
COPY asr-integration ./asr-integration
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run locally:

```powershell
docker build -t asr-commerce:latest .
docker run --rm -p 3000:3000 --env-file .env asr-commerce:latest
```

For Kubernetes, ECS, Azure Container Apps, Cloud Run, or another container service:

1. Push images to a private container registry.
2. Store secrets in the platform secret manager.
3. Expose only the Node service publicly.
4. Keep the Python service private when possible.
5. Configure persistent volumes or managed storage for runtime data.
6. Configure liveness/readiness checks using `/api/health` and `/health`.

## 11. Database and persistent-storage requirements

Local JSON, SQLite, and Excel files are suitable for one persistent server. They are not safe for ephemeral/serverless filesystems or multiple replicas.

Before scaling beyond one instance:

1. Move customer and quotation data to PostgreSQL, Azure SQL, or another managed database.
2. Move generated workbooks to object storage.
3. Keep API instances stateless.
4. Use a shared email/notification queue if volume increases.
5. Back up the database and test restoration.

## 12. DNS and HTTPS

1. Add the domain to the hosting platform.
2. Create the DNS record requested by the platform—usually an `A`, `AAAA`, or `CNAME` record.
3. Wait for DNS propagation.
4. Enable a managed TLS certificate or Certbot.
5. Redirect HTTP to HTTPS.
6. Update `ALLOWED_ORIGINS` with the final HTTPS origins.
7. Never expose an API key in browser JavaScript or HTML.

## 13. Post-deployment checks

Replace `https://example.com` with the deployed domain:

```powershell
Invoke-WebRequest https://example.com/ -UseBasicParsing
Invoke-RestMethod https://example.com/api/health
Invoke-RestMethod https://example.com/asr-api/health
```

Manually verify:

- Marketing and Commerce pages load without 404 errors.
- Browser developer tools show no failed CSS or JavaScript requests.
- A buyer request returns a `REQ-...` reference.
- Tracking works with the reference and matching email.
- Incorrect admin tokens return HTTP 401.
- The AI returns JSON, not an HTML error page.
- SMTP failure does not delete a saved request.
- Secret and customer files cannot be downloaded from public URLs.

## 14. Updating a deployment

```bash
cd /var/www/asr
npm ci --omit=dev
asr-integration/.venv/bin/pip install -r asr-integration/requirements.txt
pm2 restart ecosystem.config.cjs --update-env
pm2 status
```

For PaaS/container platforms, deploy a new immutable version and wait for health checks before moving traffic.

## 15. Rollback

1. Keep the previous working Git commit or container image tag.
2. Back up persistent data before schema/storage changes.
3. Redeploy the previous commit/image.
4. Restart the services.
5. Run all health and buyer-flow checks.
6. Restore data only when the rollback requires it; never overwrite newer customer data casually.

## 16. Recommended production architecture

```text
Browser
   |
 HTTPS
   |
Node Commerce API (public)
   |-- Managed SQL database
   |-- Object/file storage
   |-- SMTP/email provider
   |-- OpenAI API
   |
   +-- Python ASR API (private)
          |-- Managed SQL database
          |-- OpenAI API
```

This architecture works across most cloud and VPS providers and avoids exposing databases, private files, or the Python service directly to the internet.
