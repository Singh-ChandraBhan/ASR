$ErrorActionPreference = "Stop"
$chatbotDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $chatbotDirectory

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env. Add HF_TOKEN and PINECONE_API_KEY, then run this script again." -ForegroundColor Yellow
    exit 1
}

$environmentText = Get-Content ".env" -Raw
$missingHuggingFaceKey = $environmentText -match "(?m)^HF_TOKEN=(hf_replace_with|hf_your_token)"
$missingPineconeKey = $environmentText -match "(?m)^PINECONE_API_KEY=(pcsk_replace_with|pcsk_your_key)"
if ($missingHuggingFaceKey -or $missingPineconeKey) {
    Write-Host "Add your real HF_TOKEN and PINECONE_API_KEY to chatbot/.env first." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path ".venv")) {
    py -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host "Starting ASR chatbot at http://localhost:8000" -ForegroundColor Green
& ".\.venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000
