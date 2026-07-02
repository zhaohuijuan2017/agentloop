# F002 阶段执行器 · 规格（需求澄清阶段产物）

> 对应 LoopRun `spec` 阶段。上游需求入口见 `docs/issues/F002-phase-executor.md`（#18）。

## 范围
把「对某 phase 的 LoopRun 派发一次 agent 执行、产出落盘产物与执行记录」做成可测可门禁的执行面管道，v0 只打通 spec 阶段。执行不推进 phase。

## 行为规格

### S1 派发执行
- `POST /api/loop-runs/{id}/executions`：对 run 的当前 phase 派发一次执行。
- 按 phase 选执行器 `EXECUTORS[phase]`：
  - 有执行器 → 跑之，产出落盘产物 + 写 `phase_executions` 记录（`succeeded`/`failed`）。
  - 无执行器（v0 仅 spec）→ `409 phase_not_executable`。
- 执行**不改 phase**。返回执行记录（201）。

### S2 spec 阶段执行器（v0，确定性）
- 输入：run 的 `f_id` → 定位 `docs/issues/F###-*.md`。
- 输出：SPEC 草稿写入约定路径 `docs/features/<F###-slug>/spec-draft.md`（落盘入 git）。
- 缺 `f_id` 或 F 文档不存在 → 执行 `failed`，记录原因（喂给 AC3）。

### S3 执行历史
- `GET /api/loop-runs/{id}/executions`：按时间列出执行记录（状态、产物路径、原因可查）。

## 数据：phase_executions
| 字段 | 说明 |
|---|---|
| `id` | 执行记录 id |
| `loop_run_id` | 关联 LoopRun |
| `phase` | 执行时所处 phase |
| `status` | `succeeded` / `failed` |
| `artifact_path` | 产物仓库相对路径（失败为空） |
| `detail` | 成功摘要或失败原因 |
| `created_at` / `finished_at` | 时间戳 |

## 错误码（稳定契约）
| 场景 | HTTP | error |
|---|---|---|
| 当前 phase 无执行器 | 409 | `phase_not_executable` |
| run 不存在 | 404 | `loop_run_not_found` |

## 验收映射
- AC1 → 契约 `test_executor.py::test_dispatch_spec_produces_artifact`
- AC2 → 单测 `test_executor.py::test_execution_does_not_advance_phase`
- AC3 → 单测 `test_executor.py::test_failed_execution_records_reason`
