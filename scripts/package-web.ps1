# Builds the web release: a static site that can be served from any folder of
# any static host.
#   release\MindScope-<version>-web.zip
#     ├── index.html, assets\...   (the site)
#     ├── DEPLOY.txt               (how to host it)
#     └── LICENSE.txt
# Usage: npm run package:web   (add -SkipBuild to reuse apps\mindscope\dist)
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'apps\mindscope'
$version = (Get-Content (Join-Path $app 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version

if (-not $SkipBuild) {
  Push-Location $app
  try {
    # vue-tsc + vite build + check that no test-only code is included
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "web build failed ($LASTEXITCODE)" }
  } finally { Pop-Location }
}

$dist = Join-Path $app 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw "Missing $dist\index.html — run without -SkipBuild" }

$name = "MindScope-$version-web"
$releaseDir = Join-Path $repo 'release'
# Private staging folder, rebuilt every time (never a folder people work in).
$stage = Join-Path $repo ".build\staging\$name"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $dist '*') $stage -Recurse

$deploy = @"
MindScope $version — web edition
================================

This folder is a complete static website. There is no server-side code and
no database server: every visitor's data stays in their own browser
(SQLite in the browser's private file system, OPFS).

HOW TO HOST
-----------
1. Copy all files (index.html, assets\ ...) to any static host, in any folder,
   e.g. https://example.org/mindscope/ — paths are relative.
2. Serve it over HTTPS (browsers only allow the private file system on secure
   pages; http://localhost also works for testing).
3. Make sure .wasm files are served as "application/wasm" (most hosts do).
4. No special headers are required. The page already carries a strict
   Content-Security-Policy <meta> tag (it may only talk to its own origin);
   you may also send the same policy as an HTTP header.

Quick local test (needs Node.js):  npx serve .   then open the printed address.

WHAT TO TELL USERS
------------------
* MindScope is AGPL-3.0: if you host it, keep the link to the source code
  (https://github.com/EvanLi-0505/MindScope-Personality-Assessment, also shown under Settings -> About).
* Data lives in their browser only. Clearing the site's data in the browser
  deletes it. Use "Data & storage -> Back up now" to download a .db backup.
* Only one tab can use the database at a time.
* AI features are not available in the web edition (use the desktop app).

"@
[System.IO.File]::WriteAllText((Join-Path $stage 'DEPLOY.txt'), ($deploy -replace "(?<!`r)`n", "`r`n"), (New-Object System.Text.UTF8Encoding $true))

$sep = "`r`n`r`n" + ('=' * 78) + "`r`n`r`n"
$license = "MindScope $version — source code: https://github.com/EvanLi-0505/MindScope-Personality-Assessment — licensing: application AGPL-3.0-or-later; @mindscope/core and @mindscope/storage also MIT; item banks, texts and brand assets CC BY-SA 4.0; questionnaires as listed in the notices below." + $sep + (Get-Content (Join-Path $repo 'LICENSE') -Raw -Encoding UTF8) + $sep + (Get-Content (Join-Path $repo 'LICENSE-MIT') -Raw -Encoding UTF8) + $sep + (Get-Content (Join-Path $repo 'NOTICE.md') -Raw -Encoding UTF8)
[System.IO.File]::WriteAllText((Join-Path $stage 'LICENSE.txt'), ($license -replace "(?<!`r)`n", "`r`n"), (New-Object System.Text.UTF8Encoding $true))

$zip = Join-Path $releaseDir "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
$sums = Join-Path $repo '.build\checksums'
New-Item -ItemType Directory -Force $sums | Out-Null
Set-Content -Path (Join-Path $sums "$name.zip.sha256") -Value "$hash  $name.zip" -Encoding ascii
Write-Host "Web release: $zip"
Write-Host ("Size: {0:N1} MB  SHA256: {1}" -f ((Get-Item $zip).Length / 1MB), $hash)
