# F002 阶段执行器 · 设计（设计阶段产物）

> 对应 LoopRun `design` 阶段。规格见同目录 `spec.md`。

## 组件

### 1. `backend/app/executor.py`（新增）
| 符号 | 职责 |
|---|---|
| `artifacts_dir()` | 产物根目录：env `AGENTLOOP_ARTIFACTS_DIR` 优先，缺省 `<repo>/docs/features` |
| `ExecError` | 执行器内部失败（携带 reason），被 `run_phase` 捕获为 `failed` |
| `PhaseNotExecutable` | 当前 phase 未配置执行器 |
| `_spec_executor(run)` | 读 `f_id` → F 文档 → 产出 `spec-draft.md`；返回 `(artifact_rel, detail)` |
| `EXECUTORS` | `{Phase.spec: _spec_executor}`；可 monkeypatch，真实 agent 接同一形状 |
| `run_phase(run)` | 选执行器跑一次，返回 `(status, artifact_path|None, detail)`；无执行器抛 `PhaseNotExecutable` |

- 执行器接口 `(run: dict) -> (artifact_rel: str, detail: str)`，失败抛 `ExecError`。真实 LLM/agent 后端接入同一签名，与运行时解耦。
- spec 执行器为确定性模板：从 F 文档抽 What / Acceptance Criteria 段拼成 SPEC 草稿，写 `docs/features/<F###-slug>/spec-draft.md`。

### 2. `backend/app/db.py`（改）
- 新增表 `phase_executions(id, loop_run_id, phase, status, artifact_path, detail, created_at, finished_at)`（`CREATE TABLE IF NOT EXISTS`）。

### 3. `backend/app/models.py`（改）
- `PhaseExecution` 响应模型。

### 4. `backend/app/main.py`（改）
- `POST /api/loop-runs/{id}/executions`：取 run → `executor.run_phase` → 写记录 → 201。无执行器 `409 phase_not_executable`。执行不触碰 phase。
- `GET /api/loop-runs/{id}/executions`：按 `created_at` 列出。

## 时序
```
POST /loop-runs/{id}/executions
  → get run (404 if missing)
  → run_phase(run):
      EXECUTORS[phase]?  否 → 409 phase_not_executable
      是 → 跑执行器：成功 (succeeded, artifact, detail) / ExecError (failed, None, reason)
  → INSERT phase_executions
  → 201 record        # phase 不变
```

## 与门禁纪律的关系
执行只产出产物与记录，**绝不改 phase**。推进仍走既有 `POST /transition` + `gates/run`：AC2 用「执行后 transition 无 gate → 409 gate_required」证明执行不旁路门禁。

## 测试策略
- 契约 AC1：filled F 文档 → 建 run（过 H1 门禁）→ dispatch → 201 succeeded，`spec-draft.md` 落盘，`artifact_path` 登记。
- 单测 AC2：dispatch 后 phase 仍 spec；transition→design 无 gate → 409 gate_required。
- 单测 AC3：run 无 `f_id` → spec 执行器 `ExecError` → 记录 `failed` + reason，GET executions 可查。
- 集成：run 推进到 design（写 passed gate + transition）→ dispatch → 409 phase_not_executable。
- 产物目录用 `AGENTLOOP_ARTIFACTS_DIR` 指向 tmp，不污染仓库。
