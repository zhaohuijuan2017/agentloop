# LoopForge 迭代 0 用户指南

本文面向本地体验、验收和演示 LoopForge 迭代 0 的用户。迭代 0 是一个最小可运行切片：创建 `LoopRun`，写入脚本门禁记录，并按门禁推进阶段。

## 1. 当前能力

迭代 0 支持：

- 创建、查看、更新、删除 `LoopRun`。
- 查看 `LoopRun.phase`：`spec -> design -> code -> test -> review -> done`。
- 写入 `GateRecord`，用最新的 `passed` 记录作为阶段前进证据。
- 阶段合法前进、合法打回、非法流转拒绝。
- 前端页面完成 A12/A13：创建 `LoopRun`、写入通过门禁、推进阶段、缺门禁时显示 `gate_required`。

迭代 0 不包含：

- 真实 LLM Agent 自动执行。
- 完整 Design / Review / Trace / Memory 平台能力。
- 多用户、鉴权、部署、评论和统计看板。

## 2. 本地准备

前置环境：

- Python 3.11 或更高版本。
- Node.js 与 npm。
- Windows PowerShell。当前机器的 `bash` 是 WSL 1，不适合直接运行 Windows venv 与 npm，所以端到端门禁以 PowerShell 脚本为准。

首次准备后端依赖：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" httpx pytest ruff
cd ..
```

如果在可运行项目 bash 脚本的环境中，也可以使用 `bash scripts/setup-backend` 完成同一件事。

首次准备前端依赖：

```powershell
cd frontend
npm install
cd ..
```

## 3. 启动后端

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

后端基础路径：

```text
http://127.0.0.1:8000/api/loop-runs
```

默认数据库文件是 `backend/agentloop.db`。测试和门禁脚本会通过 `AGENTLOOP_DB` 使用临时数据库，避免污染手动体验数据。

## 4. 启动前端

另开一个 PowerShell：

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

浏览器打开：

```text
http://127.0.0.1:5173
```

## 5. 页面操作流程

### 5.1 创建 LoopRun

1. 在“标题”输入框填写名称。
2. 点击“创建 LoopRun”。
3. 页面会进入 `LoopRun` 详情，初始阶段为 `spec`。

### 5.2 运行门禁并推进阶段

1. 在详情区点击“运行门禁”。
2. 后端会**运行当前阶段对应门禁的真命令**（如 `spec_check`），并按**真实结果**写入 `GateRecord`（passed / failed）——页面不能再手动标 `passed`。
3. 结果为 passed 后，点击“推进到 design”。
4. 当前阶段会从 `spec` 变为 `design`。

> `e2e_tests` 过重、不从页面同步运行，点击会提示改用 CLI（`scripts/test-e2e.ps1` / `verify-all`）。

后续阶段的前进门禁如下：

| 当前阶段 | 目标阶段 | 必需门禁 |
|---|---|---|
| `spec` | `design` | `spec_check` |
| `design` | `code` | `design_check` |
| `code` | `test` | `backend_tests` |
| `test` | `review` | `contract_tests` |
| `review` | `done` | `e2e_tests` |

### 5.3 缺门禁时的表现

如果没有先写入通过门禁，直接点击前进按钮，后端会拒绝流转，页面显示：

```text
gate_required
```

此时 `phase` 不变。

### 5.4 合法打回

当 `LoopRun` 进入可打回阶段时，页面会显示“打回到 ...”按钮和“打回原因”输入框。打回不要求门禁通过，但必须提供 `reason`。

## 6. 常用 API

创建 `LoopRun`：

```http
POST /api/loop-runs
Content-Type: application/json

{"title":"演示 LoopRun"}
```

运行门禁（推荐 —— 后端跑真命令，按真实结果写入 `GateRecord`）：

```http
POST /api/loop-runs/{id}/gates/run
Content-Type: application/json

{"gate_name":"spec_check"}
```

写入门禁记录（原始端点，tier0 未做身份收紧，见 §10 限制）：

```http
POST /api/loop-runs/{id}/gates
Content-Type: application/json

{
  "phase": "spec",
  "gate_name": "spec_check",
  "status": "passed",
  "evidence": "manual demo passed"
}
```

推进阶段：

```http
POST /api/loop-runs/{id}/transition
Content-Type: application/json

{"to":"design"}
```

打回阶段：

```http
POST /api/loop-runs/{id}/transition
Content-Type: application/json

{"to":"spec","reason":"设计需要返工"}
```

稳定错误码：

| 错误码 | HTTP | 含义 |
|---|---|---|
| `validation_error` | 422 | 请求体字段非法 |
| `loop_run_not_found` | 404 | `LoopRun` 不存在 |
| `illegal_transition` | 409 | 非法阶段流转 |
| `gate_required` | 409 | 缺少已通过的必需门禁 |
| `rollback_reason_required` | 409 | 打回缺少 `reason` |
| `gate_not_runnable` | 409 | 该门禁（如 `e2e_tests`）不从 endpoint 跑，请用 CLI |

## 7. 验收与门禁

如果当前分支已包含 `scripts/verify-all.ps1`，推荐先运行汇总门禁：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-all.ps1
```

汇总门禁会串起 5 个确定性检查：

| 门禁 | 内容 |
|---|---|
| `check-spec` | SPEC 无未填占位标记 |
| `backend_tests` | `ruff check` + `pytest -q` |
| `contract_tests` | API 字段、状态码、错误码契约 |
| `e2e_tests` | 前端 A12/A13 端到端场景 |
| `check-diff` | 基线到当前提交之间无删断言、加 skip/xfail 等放松性测试改动 |

全部通过时输出：

```text
VERIFY-ALL: PASSED
```

任一门禁失败时，脚本以非 0 退出。

如果当前分支暂未包含汇总门禁脚本，可按下面的单项门禁分别运行。

后端门禁：

```powershell
bash scripts/test-backend
```

契约门禁：

```powershell
bash scripts/test-contract
```

端到端门禁：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-e2e.ps1
```

当前端到端门禁覆盖：

- A12：前端能创建 `LoopRun`、写入 `passed` 门禁、推进 `phase`、看到 `phase` 变化。
- A13：前端只显示合法目标 `phase`；缺门禁前进时显示 `gate_required`。

如果新增或修改 PowerShell 脚本，文件编码应保持 UTF-8 with BOM，避免 Windows PowerShell 5.1 按 GBK 解析中文时出现语法错误。

## 8. 基线与提交记录

本项目用 git 提交记录表达基线：

- 规则与 SPEC 基线：`583dbab` 之后的提交记录项目约束和实现。
- 后端交付：`f4b37a3`。
- 前端/E2E 红基线：`63c76c3`。
- 前端/E2E 绿提交：`5b12066`。

后续开发应继续遵守：

- 开工前确认当前基线提交。
- 先用红基线提交记录测试或门禁。
- 实现后用绿提交记录交付范围和验证结果。
- 不把他人的未提交 WIP 混入自己的提交。

## 9. 常见问题

### 为什么 `scripts/test-e2e` 不是当前机器的推荐入口？

当前机器上的 `bash` 解析到 WSL 1，无法可靠运行 Windows 的 Python venv 和 npm。端到端门禁在本机请使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-e2e.ps1
```

### 为什么前进阶段必须先写入 GateRecord？

迭代 0 的核心约束是硬门禁：阶段前进只承认确定性脚本或测试命令写入的最新 `passed` 证据，不承认口头判断。

### 为什么页面不提供任意跳阶段入口？

非法流转由后端状态机和测试覆盖。前端只暴露当前阶段的合法目标，避免为了测试非法场景而提供坏入口。

## 10. 当前限制（tier0）

tier0 收口已经把"页面手点 passed 自证"堵掉，但硬门禁尚未完全不可旁路。诚实声明如下（完整审计见 `docs/iter0-status.md`，机器可读矩阵见 `docs/traceability.yml`）：

- **门禁写入源已真实化**：页面"运行门禁"经 `POST /gates/run` 让后端跑真命令、按真实结果写 `GateRecord`，页面不能再手动标 `passed`。
- **仍可旁路（留 tier1，GitHub issue #3）**：原始 `POST /gates` 端点未做 runner 身份校验，`curl` 仍可直接写 `passed`。tier0 只堵住产品自己的 UI 自证入口；API 层不可旁路化的硬化在 tier1。
- **`design_check`**：目前是最小结构校验（SPEC 含必备章节），不是"设计未澄清就不许进 Code"的前置阻断门禁（tier1）。
- **`e2e_tests`**：过重，由 CLI（`test-e2e.ps1` / `verify-all`）产出，不从页面运行；页面点击会提示改用 CLI。
- **状态可见性**：`docs/iter0-status.md` / `docs/traceability.yml` 目前手写维护，终态计划由 verify-all / dogfood 自动导出（tier1）。
