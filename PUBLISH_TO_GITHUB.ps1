# IceBreaker: non-destructive publisher for Windows PowerShell 5.1 and PowerShell 7.
# Run from the extracted repository: powershell -ExecutionPolicy Bypass -File .\PUBLISH_TO_GITHUB.ps1
[CmdletBinding()]
param(
  [string]$Repository = 'https://github.com/jeffadickson/IceBreaker.git',
  [string]$Branch = 'main',
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$Source = $PSScriptRoot
$Stage = Join-Path ([System.IO.Path]::GetTempPath()) ("IceBreaker-publish-" + [guid]::NewGuid().ToString('N'))

function Require-Executable([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required program '$Name' not found. Install it and reopen PowerShell."
  }
}
function Check-Last([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit code $LASTEXITCODE). Repository was not pushed." }
}

Write-Host 'IceBreaker GitHub Publisher' -ForegroundColor Cyan
Write-Host "Source: $Source"
Write-Host "Target: $Repository ($Branch)"
Require-Executable git
Require-Executable robocopy
if (-not (Test-Path (Join-Path $Source 'apps\rink-local\server\rink-server.js'))) {
  throw 'Expected IceBreaker backend is missing. Extract the entire ZIP before publishing.'
}
if (-not (Test-Path (Join-Path $Source 'apps\rink-local\web\league.html'))) {
  throw 'Expected IceBreaker league website is missing.'
}
if (-not (Test-Path (Join-Path $Source 'apps\rink-local\web\team.html'))) {
  throw 'Expected IceBreaker team website is missing.'
}
if (-not $SkipTests) {
  Require-Executable node
  Push-Location $Source
  try {
    Write-Host 'Running complete Node test suite...'
    # npm runs the package's tested Node test suite.
    Require-Executable npm
    & npm test
    Check-Last 'Node test suite'
  } finally { Pop-Location }
}

Write-Host 'Cloning current GitHub repository (preserves all remote history)...'
& git clone --branch $Branch --single-branch $Repository $Stage
Check-Last 'Git clone'
try {
  Write-Host 'Copying source files (excluding Git metadata, secrets, dependencies and runtime data)...'
  $excludeDirs = @('.git','node_modules','bin','obj','__pycache__','coverage','.vscode','.idea','data')
  $excludeFiles = @('.env','.env.*','*.db','*.db-shm','*.db-wal','*.actions.jsonl','*.events.jsonl','*.events.log')
  $copyArgs = @($Source, $Stage, '/E','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD') + $excludeDirs + @('/XF') + $excludeFiles
  & robocopy @copyArgs | Out-Host
  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed ($LASTEXITCODE); nothing pushed." }
  # .env.example is documentation/configuration only; the above secret exclusion omits it.
  Get-ChildItem -Path $Source -Filter '.env.example' -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $relative = $_.FullName.Substring($Source.Length).TrimStart('\','/')
    if ($relative -notmatch '(^|[\\/])(node_modules|\.git|data)([\\/]|$)') {
      $dest = Join-Path $Stage $relative
      New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
      Copy-Item $_.FullName $dest -Force
    }
  }
  Push-Location $Stage
  try {
    & git add -A
    Check-Last 'Git add'
    $changeNames = & git diff --cached --name-only
    Check-Last 'Git diff'
    if (-not $changeNames) {
      Write-Host 'Already up to date: no changes to publish.' -ForegroundColor Green
      return
    }
    Write-Host "Ready to publish $(@($changeNames).Count) changed files."
    & git diff --cached --stat
    & git commit -m 'Publish complete IceBreaker backend, league site, team accounts and manuals'
    Check-Last 'Git commit (set git config user.name/user.email if required)'
    & git push origin "HEAD:$Branch"
    Check-Last 'Git push'
    $published = (& git rev-parse HEAD).Trim()
    Write-Host "SUCCESS: https://github.com/jeffadickson/IceBreaker/commit/$published" -ForegroundColor Green
    Write-Host "Repository: https://github.com/jeffadickson/IceBreaker" -ForegroundColor Green
  } finally { Pop-Location }
} finally {
  # Retain staged checkout on failure for inspection and repair; remove on success manually if desired.
  Write-Host "Temporary Git checkout: $Stage"
}
