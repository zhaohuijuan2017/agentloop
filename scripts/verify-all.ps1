# 门禁汇总 verify-all (SPEC §11.7) —— 汇总所有确定性门禁并输出结构化报告。
# 全部 0-LLM 脚本判据；任一门禁失败则整体失败 (exit 1)。
$ErrorActionPreference = "Continue"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = Join-Path $Backend ".venv\bin\python" }
$Spec = Join-Path $Root "docs\spec\iter0-task-crud-state.md"
$Baseline = "583dbab"  # 基线提交（无实现）

$results = @()
function Add-Gate($gate, $ok, $evidence) {
    $status = if ($ok) { "passed" } else { "failed" }
    $script:results += [pscustomobject]@{ gate = $gate; status = $status; evidence = $evidence }
}

# 1. check-spec —— SPEC 无未填占位标记 (TBD/TODO/FIXME/XXX/占位符/待补充/待定)
$specBad = Select-String -Path $Spec -Pattern 'TBD|TODO|FIXME|XXX|占位符|待补充|待定' -ErrorAction SilentlyContinue
Add-Gate "check-spec" (-not $specBad) $(if ($specBad) { "命中 $($specBad.Count) 处" } else { "无占位内容" })

# 2. backend_tests —— ruff + pytest 全部
Push-Location $Backend
& $Python -m ruff check . | Out-Null; $ruff = $LASTEXITCODE
& $Python -m pytest -q | Out-Null; $pyt = $LASTEXITCODE
Pop-Location
Add-Gate "backend_tests" (($ruff -eq 0) -and ($pyt -eq 0)) "ruff=$ruff pytest=$pyt"

# 3. contract_tests —— API 契约
Push-Location $Backend
& $Python -m pytest -q tests\test_api.py | Out-Null; $ct = $LASTEXITCODE
Pop-Location
Add-Gate "contract_tests" ($ct -eq 0) "pytest test_api=$ct"

# 4. e2e_tests —— 前端关键路径 A12/A13
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "test-e2e.ps1") | Out-Null
$e2e = $LASTEXITCODE
Add-Gate "e2e_tests" ($e2e -eq 0) "test-e2e=$e2e"

# 5. check-diff —— 测试/e2e 文件无放松性改动 (baseline..HEAD: 删断言 / 加 skip / xfail)
$diff = git diff "$Baseline..HEAD" -- 'backend/tests' 'e2e' 2>$null
$weaken = $diff | Select-String -Pattern '^-.*\bassert\b|^\+.*(pytest\.skip|@pytest\.mark\.skip|xfail|test\.skip|\.only\()' -ErrorAction SilentlyContinue
Add-Gate "check-diff" (-not $weaken) $(if ($weaken) { "疑似放松测试 $($weaken.Count) 处" } else { "无放松性改动" })

# 汇总报告
Write-Host ""
Write-Host "==== verify-all 门禁汇总 ===="
$results | Format-Table -AutoSize | Out-String | Write-Host
$failed = @($results | Where-Object { $_.status -eq "failed" })
if ($failed.Count -gt 0) {
    Write-Host "VERIFY-ALL: FAILED ($($failed.Count) 个门禁未过)"
    exit 1
}
Write-Host "VERIFY-ALL: PASSED (全部门禁通过)"
exit 0
