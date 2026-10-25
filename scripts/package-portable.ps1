# Builds the Windows portable ("green") release:
#   release\MindScope-<version>-win-x64-portable.zip
#     ├── MindScope.exe
#     └── LICENSE.txt   (module licensing summary + AGPL-3.0 + MIT + notices)
#   release\MindScope\  the latest version, ready to run (only the exe and
#                        LICENSE.txt are replaced; data in it is kept)
#   .build\checksums\<zip>.sha256
# Usage: npm run package:portable   (add -SkipBuild to reuse an existing exe)
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'apps\mindscope'
$version = (Get-Content (Join-Path $app 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version

if (-not $SkipBuild) {
  Push-Location $app
  try {
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
  } finally { Pop-Location }
}

$exe = Join-Path $app 'src-tauri\target\release\MindScope.exe'
if (-not (Test-Path $exe)) { throw "Missing $exe — run without -SkipBuild" }

$name = "MindScope-$version-win-x64-portable"
$releaseDir = Join-Path $repo 'release'
# Stage in a private folder that is rebuilt every time. Never stage in
# release\<name>\: people unzip and run the app there, and the app then
# creates data\, logs\ ... next to the exe, which must not end up in the zip.
$stage = Join-Path $repo ".build\staging\$name"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item $exe (Join-Path $stage 'MindScope.exe') -Force

$header = @"
MindScope $version — portable edition
=====================================

Unzip anywhere you can write to (e.g. D:\MindScope or a USB stick) and run
MindScope.exe. All data, logs and caches are created next to the exe in the
data\, logs\, cache\ and config\ folders. Nothing is written to AppData or
the registry, and the app makes no network requests on its own.

LICENSING
---------
* The MindScope application is licensed under the GNU Affero General Public
  License v3.0 or later (full text below).
* Its scoring engine (@mindscope/core) and storage layer (@mindscope/storage)
  are also available under the MIT License (full text below).
* Item banks, report texts and brand assets: CC BY-SA 4.0.
* Source code: https://github.com/EvanLi-0505/MindScope-Personality-Assessment

"MBTI" is a registered trademark of The Myers-Briggs Company. MindScope is not
affiliated with it and its 16-type test is not the official MBTI instrument.

"@

$sep = "`r`n`r`n" + ('=' * 78) + "`r`n`r`n"
$text = $header + $sep + (Get-Content (Join-Path $repo 'LICENSE') -Raw -Encoding UTF8) + $sep + (Get-Content (Join-Path $repo 'LICENSE-MIT') -Raw -Encoding UTF8) + $sep + (Get-Content (Join-Path $repo 'NOTICE.md') -Raw -Encoding UTF8)
[System.IO.File]::WriteAllText((Join-Path $stage 'LICENSE.txt'), ($text -replace "(?<!`r)`n", "`r`n"), (New-Object System.Text.UTF8Encoding $true))

$zip = Join-Path $releaseDir "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal

# The zip must hold exactly these two files.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try { $entries = ($archive.Entries | ForEach-Object { $_.FullName } | Sort-Object) -join ', ' } finally { $archive.Dispose() }
if ($entries -ne 'LICENSE.txt, MindScope.exe') { Remove-Item $zip -Force; throw "Unexpected zip content: $entries" }

$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
$sums = Join-Path $repo '.build\checksums'
New-Item -ItemType Directory -Force $sums | Out-Null
Set-Content -Path (Join-Path $sums "$name.zip.sha256") -Value "$hash  $name.zip" -Encoding ascii

# Latest version, ready to run: release\MindScope\. Only the program files are
# replaced; data\, logs\ ... created by running it stay (the app upgrades them).
$latest = Join-Path $releaseDir 'MindScope'
New-Item -ItemType Directory -Force $latest | Out-Null
try {
  Copy-Item (Join-Path $stage 'MindScope.exe') $latest -Force
  Copy-Item (Join-Path $stage 'LICENSE.txt') $latest -Force
  Write-Host "Latest: $latest"
} catch {
  Write-Warning "Could not update $latest (is MindScope running from there?): $($_.Exception.Message)"
}
Write-Host "Portable release: $zip"
Write-Host ("Size: {0:N1} MB  SHA256: {1}" -f ((Get-Item $zip).Length / 1MB), $hash)
