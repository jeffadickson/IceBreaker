# Windows development launcher. The rink authority is deliberately started
# as a separate OS process: exiting/crashing the Avalonia UI does NOT kill it.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$rink = Join-Path $root 'apps\rink-local'
$project = Join-Path $rink 'src\Icebreaker.Timekeeper.Desktop\Icebreaker.Timekeeper.Desktop.csproj'
$health = 'http://127.0.0.1:8090/api/health'
function AuthorityReady {
  try {
    $response = Invoke-WebRequest -Uri $health -TimeoutSec 2 -UseBasicParsing
    return $response.StatusCode -eq 200
  } catch { return $false }
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Install .NET SDK 8 or later.' }
if (-not (AuthorityReady)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.13 or later.' }
  $logDir = Join-Path $rink 'data'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $out = Join-Path $logDir 'timekeeper-authority.stdout.log'
  $err = Join-Path $logDir 'timekeeper-authority.stderr.log'
  $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/rink-server.js' -WorkingDirectory $rink -WindowStyle Minimized -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  Set-Content -Path (Join-Path $logDir 'timekeeper-authority.pid') -Value $proc.Id
  $ready = $false
  for ($i=0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (AuthorityReady) { $ready = $true; break }
    if ($proc.HasExited) { break }
  }
  if (-not $ready) { throw "Rink authority failed to start; see $err" }
}
Write-Host 'Local rink authority ready; starting native Avalonia timekeeper.'
Write-Host 'Closing the desktop window will NOT terminate the rink authority.'
# Resolve only the committed NuGet dependency graph before launching.
& dotnet restore $project --locked-mode --nologo
if ($LASTEXITCODE -ne 0) { throw 'Locked NuGet restore failed; run bootstrap and review the committed package locks.' }
& dotnet run --project $project -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Desktop app exited with code $LASTEXITCODE" }
