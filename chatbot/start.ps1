$ErrorActionPreference = "Stop"
$chatbotDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $chatbotDirectory

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env. Add OPENAI_API_KEY and ADMIN_TOKEN, then run this script again." -ForegroundColor Yellow
    exit 1
}

$environmentText = Get-Content ".env" -Raw
$missingOpenAIKey = $environmentText -match "(?m)^OPENAI_API_KEY=(replace_with|sk-your|your_)"
$missingAdminToken = $environmentText -match "(?m)^ADMIN_TOKEN=(replace_with|change_me|your_)"
if ($missingOpenAIKey -or $missingAdminToken) {
    Write-Host "Add your real OPENAI_API_KEY and ADMIN_TOKEN to .env first." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path ".venv")) {
    py -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host "Starting ASR chatbot at http://localhost:8000" -ForegroundColor Green
& ".\.venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000
