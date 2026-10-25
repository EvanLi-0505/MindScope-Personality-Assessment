# Desktop release tests for the portable build. Each run works in a NEW
# timestamped folder (default D:\MindScopeReleaseTest-<time>) and never
# deletes anything. Uses the app's built-in smoke mode (MINDSCOPE_SMOKE_PDF),
# which creates a demo person, runs tests, prints PDFs, checks backup/restore
# and exits.
#
#   npm run test:release
#   powershell -File scripts/release-tests.ps1 -WorkRoot E:\Tests\MindScope
#
# Tests
#   1  unzip the portable release and run (files stay in the folder, no AppData)
#   2  offline: no network connection from MindScope or its WebView2 processes
#   3  backup -> change -> restore returns the backed-up data
#   4  move the whole folder elsewhere: data comes along
#   5  data root moved with mindscope.portable.json (what "relocate" writes)
#   6  data from every older release upgrades (with a backup first); old
#      versions are read from .build\old-release-folders\<release folder>\
#      (folders where an older portable zip was unzipped and run)
#   7  folder not writable: a clear message, no silent failure
param(
  [string]$WorkRoot = 'D:\MindScopeReleaseTest',
  [string]$Zip,
  [string]$OldReleases
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $repo 'apps\mindscope\src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
if (-not $Zip) { $Zip = Join-Path $repo "release\MindScope-$version-win-x64-portable.zip" }
if (-not $OldReleases) { $OldReleases = Join-Path $repo '.build\old-release-folders' }
if (-not (Test-Path $Zip)) { throw "Missing $Zip - run npm run package:portable first" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$base = "$WorkRoot-$stamp"
New-Item -ItemType Directory -Force $base | Out-Null
$results = New-Object System.Collections.ArrayList
$started = Get-Date

function Add-Result([string]$id, [string]$name, [bool]$ok, [string]$detail) {
  [void]$results.Add([pscustomobject]@{ Id = $id; Test = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
  $c = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} {2} - {3}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $id, $name, $detail) -ForegroundColor $c
}

# Shared read with retries: antivirus scanners briefly lock freshly written files.
function Read-Utf8([string]$path) {
  for ($i = 0; ; $i++) {
    try {
      $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite, Delete')
      try { return (New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)).ReadToEnd() } finally { $fs.Dispose() }
    } catch { if ($i -ge 20) { throw }; Start-Sleep -Milliseconds 250 }
  }
}

# MindScope and its WebView2 processes. Windows reuses process ids and keeps
# a stale parent id on orphaned processes, so a child only counts if it was
# started after MindScope itself.
function Get-Tree([int]$rootPid, [datetime]$since) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, CreationDate
  $tree = @{}
  $tree[$rootPid] = 'MindScope.exe'
  $grew = $true
  while ($grew) {
    $grew = $false
    foreach ($p in $all) {
      if ($tree.ContainsKey([int]$p.ParentProcessId) -and -not $tree.ContainsKey([int]$p.ProcessId) -and $p.CreationDate -ge $since) {
        $tree[[int]$p.ProcessId] = $p.Name
        $grew = $true
      }
    }
  }
  return $tree
}

$LOCAL = @('127.0.0.1', '::1', '0.0.0.0', '::')

# Runs the exe in smoke mode; returns exit code, log text and outside connections seen.
function Invoke-Smoke([string]$dir, [string]$logRoot, [int]$timeoutSec = 240) {
  $env:MINDSCOPE_SMOKE_PDF = Join-Path $dir 'smoke.pdf'
  try {
    $since = (Get-Date).AddSeconds(-1)
    $p = Start-Process (Join-Path $dir 'MindScope.exe') -PassThru
    $seen = @{}
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while (-not $p.HasExited -and (Get-Date) -lt $deadline) {
      try {
        $tree = Get-Tree $p.Id $since
        $pids = [int[]]@($tree.Keys)
        Get-NetTCPConnection -OwningProcess $pids -ErrorAction SilentlyContinue |
          Where-Object { $LOCAL -notcontains $_.RemoteAddress } |
          ForEach-Object { $seen["tcp $($_.RemoteAddress):$($_.RemotePort) $($tree[[int]$_.OwningProcess]) pid=$($_.OwningProcess)"] = 1 }
        Get-NetUDPEndpoint -OwningProcess $pids -ErrorAction SilentlyContinue |
          Where-Object { $LOCAL -notcontains $_.LocalAddress } |
          ForEach-Object { $seen["udp $($_.LocalAddress):$($_.LocalPort) $($tree[[int]$_.OwningProcess]) pid=$($_.OwningProcess)"] = 1 }
      } catch { }
      Start-Sleep -Milliseconds 150
    }
    if (-not $p.HasExited) { $p.Kill(); throw "timed out after $timeoutSec s" }
  } finally {
    Remove-Item Env:MINDSCOPE_SMOKE_PDF -ErrorAction SilentlyContinue
  }
  $logDir = Join-Path $logRoot 'logs'
  $log = ''
  Get-ChildItem $logDir -Filter *.log -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $log += Read-Utf8 $_.FullName }
  return [pscustomobject]@{ ExitCode = $p.ExitCode; Log = $log; Network = @($seen.Keys) }
}

function Count-Rows([string]$db) {
  $js = "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});" +
    "const c=(t)=>d.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;" +
    "let v=0;try{v=d.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v}catch{};" +
    "console.log(JSON.stringify({profiles:c('profiles'),results:c('results'),schema:v}))"
  $out = node -e $js $db 2>$null
  return $out | ConvertFrom-Json
}

$exeName = 'MindScope.exe'
Write-Host "MindScope $version release tests in $base`n"

# ── 1-3: fresh unzip, offline, backup/restore ───────────────────────────
$fresh = Join-Path $base 'fresh'
Expand-Archive $Zip $fresh
$zipFiles = (Get-ChildItem $fresh | Select-Object -ExpandProperty Name | Sort-Object) -join ', '
$r = Invoke-Smoke $fresh $fresh
$pdfs = @(Get-ChildItem $fresh -Filter 'smoke*.pdf').Count
$top = (Get-ChildItem $fresh | Select-Object -ExpandProperty Name | Where-Object { $_ -notlike 'smoke*.pdf' } | Sort-Object) -join ', '
$appData = @(Get-ChildItem "$env:LOCALAPPDATA", "$env:APPDATA" -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt $started -and $_.FullName -match 'mindscope' -and $_.FullName -notmatch 'claude' }).Count
Add-Result '1' 'unzip and run' ($r.ExitCode -eq 0 -and $zipFiles -eq "LICENSE.txt, $exeName" -and $pdfs -eq 4 -and $top -eq "cache, config, data, LICENSE.txt, logs, $exeName" -and $appData -eq 0) `
  "zip: [$zipFiles]; after run: [$top] + $pdfs PDFs; new AppData items: $appData"
Add-Result '2' 'offline (no outside connections)' ($r.Network.Count -eq 0) $(if ($r.Network.Count) { $r.Network -join '; ' } else { 'none seen from MindScope.exe or its WebView2 processes' })
$br = [regex]::Match($r.Log, 'smoke: backup-restore (\w+) ([^\r\n]*)')
Add-Result '3' 'backup -> change -> restore' ($br.Success -and $br.Groups[1].Value -eq 'ok') $(if ($br.Success) { $br.Groups[2].Value } else { 'no backup-restore line in log' })

# ── 4: move the whole folder ────────────────────────────────────────────
$moved = Join-Path $base 'moved\MindScope'
New-Item -ItemType Directory -Force (Split-Path $moved) | Out-Null
Move-Item $fresh $moved
$r = Invoke-Smoke $moved $moved
$prof = [regex]::Matches($r.Log, 'smoke: profiles=(\d+)') | ForEach-Object { [int]$_.Groups[1].Value }
$rootOk = $r.Log.Contains("root=$moved ")
Add-Result '4' 'move whole folder' ($r.ExitCode -eq 0 -and $rootOk -and ($prof | Select-Object -Last 1) -eq 2) "root follows the folder: $rootOk; people after 2nd run: $($prof -join ' -> ')"

# ── 5: data root via pointer file ───────────────────────────────────────
$pdir = Join-Path $base 'pointer\app'
$pdata = Join-Path $base 'pointer\data-elsewhere'
New-Item -ItemType Directory -Force $pdir | Out-Null
Copy-Item (Join-Path $moved $exeName) $pdir
[System.IO.File]::WriteAllText((Join-Path $pdir 'mindscope.portable.json'), '{ "dataRoot": "..\\data-elsewhere" }')
$r = Invoke-Smoke $pdir $pdata
$ok5 = $r.ExitCode -eq 0 -and $r.Log.Contains('relocated=true') -and (Test-Path (Join-Path $pdata 'data\database\mindscope.db')) -and -not (Test-Path (Join-Path $pdir 'data'))
Add-Result '5' 'data root via pointer file' $ok5 "data in $pdata; nothing created next to the exe: $(-not (Test-Path (Join-Path $pdir 'data')))"

# ── 6: upgrade data from every older release ────────────────────────────
$latest = (Count-Rows (Join-Path $pdata 'data\database\mindscope.db')).schema
Get-ChildItem $OldReleases -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^MindScope-(\d+\.\d+\.\d+)-win-x64-portable$' -and $Matches[1] -ne $version } | Sort-Object Name | ForEach-Object {
  $old = $_.FullName
  $ver = [regex]::Match($_.Name, '\d+\.\d+\.\d+').Value
  if (-not (Test-Path (Join-Path $old 'data\database\mindscope.db'))) { Add-Result '6' "upgrade from $ver" $true 'skipped: that release folder holds no data'; return }
  $dst = Join-Path $base "upgrade-$ver"
  New-Item -ItemType Directory -Force $dst | Out-Null
  foreach ($d in 'data', 'config') { if (Test-Path (Join-Path $old $d)) { Copy-Item (Join-Path $old $d) $dst -Recurse } }
  Copy-Item (Join-Path $moved $exeName) $dst
  $before = Count-Rows (Join-Path $dst 'data\database\mindscope.db')
  $r = Invoke-Smoke $dst $dst
  $after = Count-Rows (Join-Path $dst 'data\database\mindscope.db')
  $mig = [regex]::Match($r.Log, 'schema migrated v(\d+) -> v(\d+)')
  $bak = @(Get-ChildItem (Join-Path $dst 'data\backups') -Filter "*pre-migration-v$($before.schema).db" -ErrorAction SilentlyContinue).Count
  $ok = $r.ExitCode -eq 0 -and $after.schema -eq $latest -and $after.profiles -eq ($before.profiles + 1) -and ($before.schema -eq $latest -or $bak -ge 1)
  Add-Result '6' "upgrade from $ver" $ok ("schema v{0} -> v{1}; people {2} -> {3} (+1 smoke); results {4} -> {5}; pre-migration backup: {6}" -f $before.schema, $after.schema, $before.profiles, $after.profiles, $before.results, $after.results, $bak)
}

# ── 7: folder not writable ──────────────────────────────────────────────
$ro = Join-Path $base 'readonly'
New-Item -ItemType Directory -Force $ro | Out-Null
Copy-Item (Join-Path $moved $exeName) $ro
$who = "$env:USERDOMAIN\$env:USERNAME"
$text = ''
$code = $null
try {
  # Deny creating files/folders in this test folder only (removed below).
  icacls $ro /deny "${who}:(WD,AD)" | Out-Null
  $p = Start-Process (Join-Path $ro $exeName) -PassThru
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $win = $null
  for ($i = 0; $i -lt 40 -and -not $win; $i++) {
    Start-Sleep -Milliseconds 250
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $win = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  }
  if ($win) {
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $text = ($all | ForEach-Object { $_.Current.Name }) -join ' '
    # Close the message box like a user would; the app then exits with code 1.
    $win.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
  }
  if (-not $p.WaitForExit(10000)) { $p.Kill() }
  $code = $p.ExitCode
} finally {
  icacls $ro /remove:d $who | Out-Null
}
# The message is bilingual; match its English half (this script may be read as ANSI).
$shown = $text.Contains('MindScope cannot write to this folder') -and $text.Contains($ro)
$ok7 = $shown -and $code -eq 1 -and -not (Test-Path (Join-Path $ro 'data'))
Add-Result '7' 'folder not writable' $ok7 ("message shown with the folder path: {0}; exit code {1}; nothing created: {2}" -f $shown, $code, (-not (Test-Path (Join-Path $ro 'data'))))

# ── summary ─────────────────────────────────────────────────────────────
$failed = @($results | Where-Object { $_.Result -eq 'FAIL' }).Count
$md = "# MindScope $version release tests`n`n- Run: $stamp`n- Folder: $base`n- Package: $(Split-Path $Zip -Leaf)`n`n| # | Test | Result | Detail |`n|---|---|---|---|`n"
foreach ($x in $results) { $md += "| $($x.Id) | $($x.Test) | $($x.Result) | $($x.Detail -replace '\|', '/') |`n" }
[System.IO.File]::WriteAllText((Join-Path $base 'release-test-results.md'), $md, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("`n{0} passed, {1} failed. Results: {2}" -f ($results.Count - $failed), $failed, (Join-Path $base 'release-test-results.md'))
if ($failed) { exit 1 }
