# LoopForge · 迭代 0 SPEC —— LoopRun 阶段状态机 + 脚本门禁（薄纵向切片）

> 状态：**待评审**（SPEC 门禁：@Codex_Jasmine 更新 + @Claude / @huijuan-zhao 复核后才继续编码）
> 这是 AgentHarness 流程的第一个门禁产物。SPEC 未过，不允许继续扩大实现。

## 0. 双循环定位

- **循环 A（产品能力，目标形态）**：LoopForge 接收一个需求 → 自动跑 SPEC → 设计 → 任务 → 编码 → 测试 → 评审 → 完成，把需求交付出来。
- **循环 B（开发方法，当下在做）**：我们用同一套 AgentHarness 纪律，把 LoopForge 本身一层层可验证地建出来。
- **迭代 0 的定位**：直接实现 LoopForge 的核心对象：一个 `LoopRun` 的阶段状态机，以及由脚本结果驱动的硬门禁。
- **本圈只做**：LoopRun 阶段流转 + GateRecord 门禁记录 + API/脚本门禁。暂不实现真实 LLM Agent、设计 Agent、评审 Agent、追踪界面。

一句话面试口径：

> 我用 AgentLoop 的方法，先造出一个能表达 AgentLoop 阶段和硬门禁的最小系统。

## 1. 目标（迭代 0 只做这些）

一个最小可运行的 LoopForge 核心切片，前后端 + 端到端测试全通：

1. **LoopRun 增删改查**：创建、查询（列表 + 单条）、更新标题、删除 LoopRun。
2. **阶段状态机**：`spec / design / code / test / review / done` 的合法推进、合法打回、非法跳阶段拒绝。
3. **脚本门禁**：记录某个 `phase` 的脚本门禁结果；顺序推进必须满足当前 `phase` 的必需门禁已通过。
4. **硬门禁语义**：流转 API 只认 `GateRecord.status = passed` 的证据，不接受 LLM 口头判断。

## 2. 非目标（明确不做，防范围爆炸）

- 不做：真实 LLM Agent 自动执行循环。
- 不做：设计、评审、追踪、记忆的完整平台能力。
- 不做：多用户、权限、鉴权、多租户。
- 不做：评论、统计看板、业务任务看板。
- 不做：复杂门禁编排语言；本圈只做固定必需门禁。
- 不做：生产部署。

## 3. 数据模型

### 3.1 LoopRun

| 字段 | 类型 | 约束 |
|---|---|---|
| id | string(uuid) | 主键，创建时生成 |
| title | string | 必填，1-200 字符 |
| phase | enum | `spec` / `design` / `code` / `test` / `review` / `done`，默认 `spec` |
| created_at | datetime(ISO) | 创建时生成 |
| updated_at | datetime(ISO) | 每次修改刷新 |

### 3.2 GateRecord

| 字段 | 类型 | 约束 |
|---|---|---|
| id | string(uuid) | 主键，创建时生成 |
| loop_run_id | string(uuid) | 关联 LoopRun |
| phase | enum | 记录 gate 对应的 phase |
| gate_name | string | 例如 `spec_check` / `backend_tests` / `contract_tests` / `e2e_tests` |
| status | enum | `passed` / `failed` |
| evidence | string | 脚本输出摘要、测试用例名、报告路径或失败原因 |
| created_at | datetime(ISO) | 创建时生成 |

存储：SQLite（单文件、零基础设施、易测）。

## 4. LoopRun 阶段状态机（核心可测逻辑）

### 4.1 阶段集合

```text
spec -> design -> code -> test -> review -> done
```

`done` 是终态。

### 4.2 合法前进

| 起点 | 终点 | 必需门禁 |
|---|---|---|
| spec | design | `spec_check` passed |
| design | code | `design_check` passed |
| code | test | `backend_tests` passed |
| test | review | `contract_tests` passed |
| review | done | `e2e_tests` passed |

### 4.3 合法打回

打回用于表达上游阶段需要返工。打回不要求门禁已通过，但必须提供 `reason`。

| 起点 | 终点 |
|---|---|
| design | spec |
| code | design |
| test | code |
| review | code |
| review | test |

### 4.4 非法流转

非法流转必须拒绝：HTTP 409，响应体 `{"error":"illegal_transition","from":"spec","to":"code"}`，`phase` 不变。

非法集合：

- 任何跳阶段前进，例如 `spec -> code`、`spec -> test`、`design -> test`、`code -> review`、`test -> done`。
- `done -> *`，终态不可再转。
- 任何 `X -> X`，同态流转定义为业务规则拒绝，不是幂等空操作。
- 未列入合法前进或合法打回的任意组合。

### 4.5 Gate 缺失

如果是合法前进路径，但缺少当前 `phase` 已通过的必需门禁，必须拒绝：

HTTP 409，响应体 `{"error":"gate_required","phase":"spec","gate":"spec_check"}`，`phase` 不变。

## 5. 脚本门禁语义

门禁必须来自确定性脚本或测试命令的结果，不来自 LLM 自评。

### 5.1 GateRecord 写入规则

1. `GateRecord.status` 只能是 `passed` 或 `failed`。
2. `GateRecord.evidence` 必填，不能为空。
3. 同一个 `loop_run_id + phase + gate_name` 可以有多条记录，流转时使用最新一条。
4. 只有最新记录为 `passed` 时，该门禁才算通过。
5. `failed` 门禁不能推进 `phase`，但可以作为复盘证据保留。

### 5.2 迭代 0 固定脚本门禁

| 门禁 | 阶段 | 脚本或命令 | 判定 |
|---|---|---|---|
| `spec_check` | spec | `scripts/check-spec` | SPEC 无占位内容，且验收标准可映射到脚本门禁 |
| `design_check` | design | `scripts/check-design` | 校验最小设计说明存在，且包含数据模型、API 契约、阶段流转三段 |
| `backend_tests` | code | `scripts/test-backend` | pytest 全绿，状态机/API/契约全过 |
| `contract_tests` | test | `scripts/test-contract` | API 字段、状态码、错误码契约全过 |
| `e2e_tests` | review | `scripts/test-e2e` | 前端 E2E 关键路径全过 |

### 5.3 门禁输出格式

脚本输出要能被记录为 GateRecord。建议结构：

```json
{
  "gate": "backend_tests",
  "status": "failed",
  "evidence": "tests/test_transitions.py::test_spec_to_code_rejected failed"
}
```

## 6. API 契约（后端）

基础路径：`/api/loop-runs`

| 方法 | 路径 | 请求 | 成功响应 | 错误 |
|---|---|---|---|---|
| POST | `/api/loop-runs` | `{title}` | 201 `{LoopRun}` | 422 |
| GET | `/api/loop-runs` | — | 200 `[LoopRun]` | — |
| GET | `/api/loop-runs/{id}` | — | 200 `{LoopRun}` | 404 |
| PATCH | `/api/loop-runs/{id}` | `{title}` | 200 `{LoopRun}` | 404 / 422 |
| DELETE | `/api/loop-runs/{id}` | — | 204 | 404 |
| POST | `/api/loop-runs/{id}/gates` | `{phase, gate_name, status, evidence}` | 201 `{GateRecord}` | 404 / 422 |
| GET | `/api/loop-runs/{id}/gates` | — | 200 `[GateRecord]` | 404 |
| POST | `/api/loop-runs/{id}/transition` | `{to, reason?}` | 200 `{LoopRun}` | 404 / 409 / 422 |

## 7. 错误响应体约定（契约测试据此稳定断言）

所有错误响应统一形状 `{"error": "<code>", ...}`。

| 错误码 | HTTP | 触发 | 额外字段 |
|---|---|---|---|
| `validation_error` | 422 | `title` 缺失/超长、请求体非法、GateRecord 字段非法 | `field`, `reason` |
| `loop_run_not_found` | 404 | loop run id 不存在 | `id` |
| `illegal_transition` | 409 | 非法阶段流转 | `from`, `to` |
| `gate_required` | 409 | 合法前进但缺少已通过的必需门禁 | `phase`, `gate` |
| `rollback_reason_required` | 409 | 合法打回但未提供 `reason` | `from`, `to` |

## 8. 前端（最小）

- LoopRun 列表页：展示 `title` + `phase` 徽标。
- 新建 LoopRun：输入 `title`，创建后默认 `phase=spec`。
- LoopRun 详情/操作：
  - 展示当前 `phase`。
  - 展示最新 GateRecord 列表。
  - 允许新增 GateRecord（模拟脚本结果写入）。
  - 只显示当前 `phase` 的合法目标按钮。
  - 合法前进缺门禁时，显示 `gate_required` 错误。
  - 合法打回必须输入 `reason`。
- 不为了测试非法流转而暴露坏入口。非法跳阶段由 API/状态机测试覆盖。

## 9. 技术选型（可评审的决策）

- 后端：**Python + FastAPI + SQLite**（原生易测、契约清晰、无外部基础设施）。
- 前端：**React + Vite**（最小页面）。
- 测试：后端 **pytest + httpx**（单测 + 契约）；端到端测试使用 **Playwright**。

## 10. 验收标准 → 门禁映射

| # | 验收标准 | 门禁类型（确定性） |
|---|---|---|
| A1 | 能创建 LoopRun，返回 201 + 完整 LoopRun，默认 `phase=spec` | 后端单测 + 契约测试 |
| A2 | `title` 缺失/超长返回 422，不落库 | 后端单测 |
| A3 | 列表/单条查询返回正确数据，不存在返回 404 `loop_run_not_found` | 后端单测 + 契约测试 |
| A4 | PATCH 能改 `title`，`updated_at` 刷新 | 后端单测 |
| A5 | 能创建 GateRecord，`status`/`evidence` 校验正确 | 后端单测 + 契约测试 |
| A6 | 合法前进在必需门禁通过后成功改 `phase` | 状态机单测 |
| A7 | 合法前进缺门禁返回 409 `gate_required` 且 `phase` 不变 | 状态机单测 |
| A8 | 合法打回提供 `reason` 后成功改 `phase` | 状态机单测 |
| A9 | 合法打回缺 `reason` 返回 409 `rollback_reason_required` 且 `phase` 不变 | 状态机单测 |
| A10 | 非法跳阶段、`done` 后流转、`X→X` 返回 409 `illegal_transition` 且 `phase` 不变 | 状态机单测（全枚举） |
| A11 | 删除 LoopRun 返回 204，再查 404 | 后端单测 |
| A12 | 前端能创建 LoopRun、写入已通过门禁、推进 `phase`、看到 `phase` 变化 | 端到端测试 |
| A13 | 前端只显示合法目标 `phase`；缺门禁前进时显示 `gate_required` 错误 | 端到端测试 |

## 11. 本圈的 Harness 门禁（完成定义）

迭代 0 完成 = 以下全绿（能脚本判的绝不靠人说）：

1. **基线前移（可执行时点）**：脚手架 + 测试命令 + 空测试骨架落地之后、业务实现之前采一次 `pytest` + lint 基线并持久化；此后每个编码任务开始前再采一次当时测试状态，完成后做前后对比。
2. `scripts/check-spec` 通过。
3. `scripts/test-backend` 通过：A1-A11 全覆盖，含合法前进、合法打回、缺门禁、`done` 终态、`X→X` 全枚举。
4. `scripts/test-contract` 通过：字段、状态码、错误码契约全过。
5. `scripts/test-e2e` 通过：A12-A13 前端关键路径全过。
6. `scripts/check-diff` 通过：禁止删断言、skip 测试、放松门禁、绕过 GateRecord。
7. `scripts/verify-all` 汇总以上门禁并输出结构化报告。
8. 交付物包含：可运行的前后端、一键跑门禁脚本、测试结果、简单追踪记录（本圈追踪记录 = 门禁报告 + git diff 范围）。

---

> 评审关注点：① `LoopRun.phase` 是否比业务任务状态更贴 AgentLoop；② GateRecord 是否足够表达脚本硬门禁；③ 合法/非法阶段流转是否完整；④ 验收标准到脚本门禁是否都能确定性判定。
