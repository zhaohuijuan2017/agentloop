# 门禁: e2e_tests —— 前端关键路径 A12/A13 (SPEC §5.2, §11)
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Tmp = Join-Path $Root ".tmp"
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

$env:AGENTLOOP_DB = Join-Path $Tmp "e2e-agentloop.db"
Remove-Item -LiteralPath $env:AGENTLOOP_DB -ErrorAction SilentlyContinue

$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = Join-Path $BackendDir ".venv\bin\python"
}
if (-not (Test-Path $Python)) {
  throw "Backend venv not found. Run scripts/setup-backend first."
}

$BackendOutLog = Join-Path $Tmp "backend-e2e.out.log"
$BackendErrLog = Join-Path $Tmp "backend-e2e.err.log"
$FrontendOutLog = Join-Path $Tmp "frontend-e2e.out.log"
$FrontendErrLog = Join-Path $Tmp "frontend-e2e.err.log"

function Wait-Url {
  param([string] $Url)

  for ($i = 0; $i -lt 80; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "Timed out waiting for $Url"
}

function Stop-Tree {
  param([System.Diagnostics.Process] $Process)

  if ($null -ne $Process -and -not $Process.HasExited) {
    & taskkill.exe /PID $Process.Id /T /F | Out-Null
  }
}

$Backend = $null
$Frontend = $null

try {
  $Backend = Start-Process `
    -FilePath $Python `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $BackendOutLog `
    -RedirectStandardError $BackendErrLog `
    -WindowStyle Hidden `
    -PassThru

  $Frontend = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
    -WorkingDirectory $FrontendDir `
    -RedirectStandardOutput $FrontendOutLog `
    -RedirectStandardError $FrontendErrLog `
    -WindowStyle Hidden `
    -PassThru

  Wait-Url "http://127.0.0.1:8000/api/loop-runs"
  Wait-Url "http://127.0.0.1:5173"

  Push-Location $FrontendDir
  try {
    $env:PLAYWRIGHT_HTML_OPEN = "never"
    $env:NODE_PATH = Join-Path $FrontendDir "node_modules"
    & npx.cmd playwright test --config ../e2e/playwright.config.js
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
} finally {
  Stop-Tree $Frontend
  Stop-Tree $Backend
}
