# LoopForge · 迭代 0 SPEC —— 任务 CRUD + 状态流转（薄纵向切片）

> 状态：**待评审**（SPEC 门禁：@Codex_Jasmine 复核 + @huijuan-zhao 确认后才进 Design/Code）
> 这是 AgentHarness 流程的第一个门禁产物。SPEC 未过，不允许写代码。

## 0. 双 Loop 定位（为什么先做这个）

- **Loop A（产品能力，目标形态）**：LoopForge 接收一个需求 → 自动跑 SPEC→Design→Task→Code→Review→Test 把它交付。
- **Loop B（开发方法，当下在做）**：我们用同一套 AgentHarness 纪律，把 LoopForge 本身一层层可验证地建出来。
- **迭代 0 的定位**：用 Loop B 的纪律，交付**业务载体（团队任务看板）的第一条最薄纵向切片**，同时把 Harness 的门禁机器（SPEC 验收标准 / git 基线 / 测试门禁 / E2E）在真实特性上立起来。后续迭代再在此之上叠加 LoopForge 的平台能力（Loop 引擎、Tool Gateway、Guardrails、Trace）。
- **本圈只走**：SPEC → Code → Test（Design / Review / Trace loop 后续迭代加）。

## 1. 目标（迭代 0 只做这些）

一个团队任务看板的最小可用纵向切片，前后端 + E2E 全通：

1. **任务 CRUD**：创建、查询（列表 + 单条）、更新（标题/描述）、删除任务。
2. **状态流转**：任务状态机 `todo → doing → done`，**非法流转必须被拒绝**（返回明确错误码，不改状态）。

## 2. 非目标（明确不做，防范围爆炸）

- 不做：评论、统计看板、负责人/指派、权限、鉴权、多租户、分页排序过滤。
- 不做：Design / Review / Trace loop（本圈只 SPEC→Code→Test）。
- 不做：真实 LLM Agent 自动跑 loop（那是 LoopForge 的 Loop A 能力，后续迭代实现）。本圈是"人用 Harness 纪律造平台"。

## 3. 数据模型

`Task`
| 字段 | 类型 | 约束 |
|---|---|---|
| id | string(uuid) | 主键，创建时生成 |
| title | string | 必填，1–200 字符 |
| description | string | 可选，≤2000 字符 |
| status | enum | `todo` / `doing` / `done`，默认 `todo` |
| created_at | datetime(ISO) | 创建时生成 |
| updated_at | datetime(ISO) | 每次修改刷新 |

存储：SQLite（单文件、零基础设施、易测）。

## 4. 状态机（核心可测逻辑）

合法流转：
- `todo → doing`
- `doing → done`
- `doing → todo`（撤回）
- `done → doing`（重开）

**非法流转（必须拒绝）**：
- `todo → done`（不能跳过 doing）
- `done → todo`（不能直接回退到 todo）
- 任何 `X → X`（同态流转，无意义，拒绝）

拒绝时：HTTP 409，body `{"error":"illegal_transition","from":"todo","to":"done"}`，**状态不变**。

## 5. API 契约（后端）

Base: `/api/tasks`

| 方法 | 路径 | 请求 | 成功响应 | 错误 |
|---|---|---|---|---|
| POST | `/api/tasks` | `{title, description?}` | 201 `{Task}` | 422 校验失败 |
| GET | `/api/tasks` | — | 200 `[Task]` | — |
| GET | `/api/tasks/{id}` | — | 200 `{Task}` | 404 |
| PATCH | `/api/tasks/{id}` | `{title?, description?}` | 200 `{Task}` | 404 / 422 |
| POST | `/api/tasks/{id}/transition` | `{to}` | 200 `{Task}` | 404 / 409 非法流转 / 422 |
| DELETE | `/api/tasks/{id}` | — | 204 | 404 |

状态流转走独立 `/transition` 端点（而非 PATCH status），把"状态机规则"作为一等公民、便于契约与门禁定位。

## 6. 前端（最小）

- 任务列表页：展示所有任务（title + status 徽标）。
- 新建任务：输入 title/description，创建。
- 任务详情/操作：切状态按钮（只显示合法目标态）；非法流转（若触发）显示错误提示。
- 删除任务。
不追求样式，追求 E2E 可覆盖三条关键路径。

## 7. 技术选型（可评审的决策，优先"可验证 + 快"）

- 后端：**Python + FastAPI + SQLite**（原生易测、契约清晰、无外部基础设施）。
- 前端：**React + Vite**（最小页面）。
- 测试：后端 **pytest + httpx**（单测 + 契约）；E2E **Playwright**。
- 〔如需换栈（如 Node 全栈）在此门禁提出〕

## 8. 验收标准 → 门禁映射（SPEC 的灵魂：每条需求都能被测）

| # | 验收标准 | 门禁类型（确定性） |
|---|---|---|
| A1 | 能创建任务，返回 201 + 完整 Task，默认 status=todo | 后端单测 + 契约测试 |
| A2 | title 缺失/超长返回 422，不落库 | 后端单测 |
| A3 | 列表/单条查询返回正确数据，不存在返回 404 | 后端单测 + 契约测试 |
| A4 | PATCH 能改 title/description，updated_at 刷新 | 后端单测 |
| A5 | 合法流转（todo→doing→done、doing→todo、done→doing）成功改状态 | 状态机单测 |
| A6 | **非法流转（todo→done、done→todo、X→X）返回 409 且状态不变** | 状态机单测（合法+非法全覆盖） |
| A7 | 删除任务返回 204，再查 404 | 后端单测 |
| A8 | 前端能创建任务、切状态、看到状态变化 | E2E |
| A9 | 前端非法流转按钮不出现 / 触发时有明确提示 | E2E |

## 9. 本圈的 Harness 门禁（Definition of Done）

迭代 0 完成 = 以下全绿（能脚本判的绝不靠人说）：
1. **基线前移**：动代码前在干净仓库采一次 `pytest` + lint 基线并持久化；完成后只做前后对比，证明"新增失败都是本轮引入的、且已清零"。
2. 后端：`pytest` 全过（A1–A7 全覆盖，含状态机合法/非法全枚举），lint（ruff）0 告警，类型检查（可选 mypy）。
3. 契约：API 契约测试全过（字段 + 状态码 + 错误码）。
4. 前端：E2E（Playwright）覆盖 A8/A9 三条关键路径全过。
5. **禁止改测试逃避**：diff 命中测试文件的"放松性改动"（删断言/跳过）→ 直接判不过。
6. 交付物：可运行的前后端 + 一键跑测试脚本 + test result + 简单 trace（本圈 trace = 测试报告 + git diff 范围）。

---

> 评审关注点：① 薄 slice 范围是否合适（够小能跑通、又够完整能展示 Harness）；② 状态机合法/非法集合是否合理；③ 验收标准→门禁映射有没有漏"能脚本判"的；④ 技术选型。过了这个门禁再进 Code。
