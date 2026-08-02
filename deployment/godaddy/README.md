# GoDaddy deployment

Choose one deployment type before building.

## Option A — GoDaddy Web Hosting/cPanel (static site only)

Use this when the hosting dashboard contains **cPanel Admin** and **File Manager**. It publishes the marketing site and Commerce screens. GoDaddy shared hosting does not run this project's Node and Python processes, so quotation submission, AI chat, tracking, storage, and email require a separately hosted HTTPS API.

### Build in Windows PowerShell

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-static.ps1
```

If the API is already hosted elsewhere:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-static.ps1 -CommerceApiUrl "https://api.example.com"
```

The folder to upload is:

```text
deployment-output/godaddy-static/public_html/
```

Upload the **contents** of that folder into GoDaddy's `public_html`:

1. Open GoDaddy **My Products**.
2. Open the Web Hosting product and select **Manage**.
3. Open **cPanel Admin**, then **File Manager**.
4. Open `public_html`.
5. Back up existing website files.
6. Upload everything inside the generated `public_html` folder.
7. Confirm that `public_html/index.html` exists.
8. Test `/`, `/commerce/?intent=buy`, CSS, and JavaScript in a private browser window.

Optional ZIP command:

```powershell
Compress-Archive -Path .\deployment-output\godaddy-static\public_html\* -DestinationPath .\deployment-output\godaddy-static\public_html.zip -Force
```

Extract `public_html.zip` inside the remote `public_html` directory. Do not create an extra `public_html/public_html` nesting level.

## Option B — GoDaddy VPS (complete application)

Use a Linux VPS for working quotations, AI chat, request tracking, Excel/SQL storage, email, and the admin workflow.

### 1. Build the upload folder

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\godaddy\build-vps.ps1
```

The folder to upload is:

```text
deployment-output/godaddy-vps/app/
```

### 2. Upload from PowerShell

Replace the SSH user and server address:

```powershell
scp -r .\deployment-output\godaddy-vps\app\* root@YOUR_SERVER_IP:/var/www/asr/
```

If `/var/www/asr` does not exist, connect first and create it:

```powershell
ssh root@YOUR_SERVER_IP
mkdir -p /var/www/asr
exit
```

### 3. Install runtime packages on the VPS

The following commands target Ubuntu/Debian:

```bash
ssh root@YOUR_SERVER_IP
apt update
apt install -y nginx nodejs npm python3 python3-venv python3-pip
npm install -g pm2
cd /var/www/asr
npm ci --omit=dev
python3 -m venv asr-integration/.venv
asr-integration/.venv/bin/pip install -r asr-integration/requirements.txt
```

### 4. Configure secrets on the VPS

```bash
cd /var/www/asr
cp .env.example .env
cp asr-integration/.env.example asr-integration/.env
nano .env
nano asr-integration/.env
```

At minimum, configure `OPENAI_API_KEY`, a long random `ADMIN_TOKEN`, SMTP settings if email is enabled, and production `ALLOWED_ORIGINS`. Never upload a development `.env` or commit production secrets.

### 5. Start both APIs

```bash
cd /var/www/asr
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the final command printed by `pm2 startup`, then verify:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:8000/health
pm2 status
pm2 logs --lines 100
```

### 6. Configure Nginx and HTTPS

```bash
sed 's/YOUR_DOMAIN/example.com/g' /var/www/asr/nginx-asr.conf.template > /etc/nginx/sites-available/asr
ln -s /etc/nginx/sites-available/asr /etc/nginx/sites-enabled/asr
nginx -t
systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d example.com -d www.example.com
```

Replace `example.com` everywhere with the real domain. Point the domain's DNS **A record** to the VPS public IP before requesting the certificate.

### 7. Update an existing deployment

Build and upload again, then run:

```bash
cd /var/www/asr
npm ci --omit=dev
asr-integration/.venv/bin/pip install -r asr-integration/requirements.txt
pm2 restart ecosystem.config.cjs --update-env
pm2 status
```

## Final verification

- `/` loads the Commerce Engagement application on a VPS.
- `/asr` loads the ASR marketing site on a VPS.
- `/api/health` returns JSON.
- `/asr-api/health` reaches the Python integration.
- Buyer submission returns a `REQ-...` reference.
- Admin authentication rejects an incorrect token.
- No `.env`, database, Excel customer file, or approval record is publicly downloadable.
