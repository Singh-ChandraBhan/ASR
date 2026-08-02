$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = if (Test-Path (Join-Path $projectRoot "server.js")) { $projectRoot } else { Join-Path $projectRoot "commerce-service" }
$asrSource = if (Test-Path (Join-Path $sourceRoot "asr-integration\app.py")) { Join-Path $sourceRoot "asr-integration" } else { Join-Path $projectRoot "chatbot" }
$outputRoot = Join-Path $projectRoot "deployment-output\godaddy-vps"
$appOutput = Join-Path $outputRoot "app"

$expectedOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot "deployment-output\godaddy-vps"))
if ([IO.Path]::GetFullPath($outputRoot) -ne $expectedOutput) {
    throw "Refusing to clean an unexpected output path: $outputRoot"
}
if (Test-Path -LiteralPath $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $appOutput | Out-Null

# Step 1: Copy the Node Commerce service.
@("server.js", "package.json", "package-lock.json", ".env.example", "README.md", "PROJECT_FLOW.md") | ForEach-Object {
    $sourceFile = Join-Path $sourceRoot $_
    if (-not (Test-Path $sourceFile) -and $_ -eq "PROJECT_FLOW.md") { $sourceFile = Join-Path $projectRoot $_ }
    Copy-Item -LiteralPath $sourceFile -Destination $appOutput
}
@("public", "lib") | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $_) -Destination (Join-Path $appOutput $_) -Recurse
}

# Step 2: Copy only non-customer seed data.
$dataOutput = Join-Path $appOutput "data"
New-Item -ItemType Directory -Path $dataOutput | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot "data\catalog.json") -Destination $dataOutput
Copy-Item -LiteralPath (Join-Path $sourceRoot "data\approvals.example.json") -Destination $dataOutput

# Step 3: Copy the Python ASR service without secrets, virtual environments,
# databases, Excel files, approval records, or bytecode.
$asrOutput = Join-Path $appOutput "asr-integration"
New-Item -ItemType Directory -Path $asrOutput | Out-Null
Get-ChildItem -LiteralPath $asrSource -Force | Where-Object {
    $_.Name -notin @(".env", ".venv", "__pycache__", "data")
} | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $asrOutput $_.Name) -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $asrOutput "data") | Out-Null

# Step 4: Include server configuration templates beside the upload package.
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "ecosystem.config.cjs") -Destination $appOutput
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "nginx-asr.conf.template") -Destination $appOutput

Write-Host "VPS package created: $appOutput"
Write-Host "Upload the app folder to /var/www/asr on the GoDaddy VPS."
