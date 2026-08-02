param(
    [string]$CommerceApiUrl = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$marketingRoot = if (Test-Path (Join-Path $projectRoot "asr-integration\index.html")) { Join-Path $projectRoot "asr-integration" } else { $projectRoot }
$commerceRoot = if (Test-Path (Join-Path $projectRoot "public\index.html")) { Join-Path $projectRoot "public" } else { Join-Path $projectRoot "commerce" }
$outputRoot = Join-Path $projectRoot "deployment-output\godaddy-static"
$publicHtml = Join-Path $outputRoot "public_html"

# This script owns only deployment-output/godaddy-static. Validate the exact
# path before clearing a previous build.
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot "deployment-output\godaddy-static"))
if ([IO.Path]::GetFullPath($outputRoot) -ne $expectedOutput) {
    throw "Refusing to clean an unexpected output path: $outputRoot"
}
if (Test-Path -LiteralPath $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $publicHtml | Out-Null

# Step 1: Copy the ASR marketing website to the domain root.
Copy-Item -LiteralPath (Join-Path $marketingRoot "index.html") -Destination (Join-Path $publicHtml "index.html")
Copy-Item -LiteralPath (Join-Path $marketingRoot "assets") -Destination (Join-Path $publicHtml "assets") -Recurse

# Step 2: Copy the Commerce Engagement browser app under /commerce/.
$commerceOutput = Join-Path $publicHtml "commerce"
New-Item -ItemType Directory -Path $commerceOutput | Out-Null
Copy-Item -LiteralPath (Join-Path $commerceRoot "index.html") -Destination (Join-Path $commerceOutput "index.html")
Copy-Item -LiteralPath (Join-Path $commerceRoot "app.js") -Destination (Join-Path $commerceOutput "app.js")
Copy-Item -LiteralPath (Join-Path $commerceRoot "styles.css") -Destination (Join-Path $commerceOutput "styles.css")
Copy-Item -LiteralPath (Join-Path $commerceRoot "workflow.css") -Destination (Join-Path $commerceOutput "workflow.css")

# Step 3: Convert local absolute links to hosting-safe relative links.
$marketingPath = Join-Path $publicHtml "index.html"
$marketing = Get-Content -LiteralPath $marketingPath -Raw
$marketing = $marketing.Replace('href="/?intent=', 'href="commerce/?intent=')

$commercePath = Join-Path $commerceOutput "index.html"
$commerce = Get-Content -LiteralPath $commercePath -Raw
$commerce = $commerce.Replace('href="/styles.css"', 'href="styles.css"')
$commerce = $commerce.Replace('href="/workflow.css"', 'href="workflow.css"')
$commerce = $commerce.Replace('src="/app.js"', 'src="app.js"')
$commerce = $commerce.Replace('href="/asr/"', 'href="../"')

# Step 4: Configure the optional public API. Static-only hosting uses a clear
# disabled marker; a VPS/API deployment must use HTTPS.
$apiValue = "disabled"
if ($CommerceApiUrl) {
    $uri = [Uri]$CommerceApiUrl
    if ($uri.Scheme -ne "https") { throw "CommerceApiUrl must use HTTPS." }
    $apiValue = $CommerceApiUrl.TrimEnd('/')
    $marketingApi = "$apiValue/asr-api/api/chat"
    $marketing = [regex]::Replace($marketing, '(<meta name="chatbot-api" content=")[^"]*(">)', "`$1$marketingApi`$2")
}
$commerce = [regex]::Replace($commerce, '(<meta name="commerce-api" content=")[^"]*(">)', "`$1$apiValue`$2")

Set-Content -LiteralPath $marketingPath -Value $marketing -Encoding utf8
Set-Content -LiteralPath $commercePath -Value $commerce -Encoding utf8
Set-Content -LiteralPath (Join-Path $publicHtml ".nojekyll") -Value "" -Encoding ascii

Write-Host "Static package created: $publicHtml"
Write-Host "Upload the CONTENTS of public_html to GoDaddy public_html."
if (-not $CommerceApiUrl) {
    Write-Warning "Static-only build: forms, AI chat, and tracking are disabled until an HTTPS API is configured."
}
