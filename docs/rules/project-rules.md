# LoopForge · 项目规则

> AgentHarness 五层的第一层是规则。本文件记录项目级软约束；能确定性判定的条目会在后续下沉为脚本门禁或 Hook 强制。

## R1. 文档默认语言为中文

- 本项目下所有文档默认用中文书写，包括 SPEC、设计说明、评审记录、README、交付报告和项目规则。
- 代码契约类内容保持原文，不做中文化：代码标识符、类型名、字段名、枚举值、API 路径、错误码、命令、脚本名、JSON 示例和日志。
- 示例：`LoopRun`、`GateRecord`、`phase`、`spec/design/code/test/review/done`、`illegal_transition`、`scripts/check-spec` 都属于代码契约，保持英文。
- 判定：文档正文以中文叙述为主；英文只用于上述代码契约或业内固定术语。

## R2. 基线必须用 git 提交记录表达

- 项目基线以 git 提交为准，不以未提交的工作区状态、口头描述或本地临时文件为准。
- 每个阶段或任务开工前，必须先确认当前基线提交；完成后通过新的提交记录说明变更范围。
- 如果工作区存在他人的未提交 WIP，不得把这些文件混入自己的基线或交付提交。
- 基线提交的汇报应包含提交号、变更范围和已运行的验证命令。

## R3. 任务置 done 的判定条件

- 代码写完 ≠ done。一个任务只有同时满足以下条件才能置 `done`：
  1. 需求条目清楚（有明确的验收标准，不含未澄清假设）；
  2. 有自动化测试或脚本门禁覆盖，且已通过；
  3. 相关 commit 记录清楚（红/绿基线可追溯）；
  4. 文档说明了当前限制与已知缺口（如有）；
  5. review 明确通过，且收口的人不是写该代码的人。
- 不满足全部条件时，标 `partial` / `in_review` / `deferred`，并把缺口写进 `docs/iter0-status.md` 与 `docs/traceability.yml`，不得直接 `done`。
- 判定：能脚本化的部分（测试通过、门禁通过、追踪矩阵字段齐全）后续下沉为 `check-traceability` 脚本兜底（tier1）。

## R4. 需求开发按五阶段流程走，阶段产出按 F 编号归档

- 需求开发统一按五个阶段推进，顺序固定、不跳阶段：**需求澄清 → 设计 → 编码 → 验证 → 合入**（对应「阶段时间线」的 feature 流程与 LoopRun 阶段）。
- 每个进入开发的需求分配一个 `F###` 编号（三位零填充，编号规则见 `issue-format.md` §1），其阶段产出统一归档到 `docs/features/F###-<feature-name>/` 目录；`<feature-name>` 与该需求入口文档 `docs/issues/F###-<slug>.md` 的 slug 一致，做到同一需求全程同号同名。
- 各阶段的交付件与落盘位置：

  | 阶段 | 交付件 | 落盘位置 | 对应 superpowers skill |
  |---|---|---|---|
  | 需求澄清 | 规格文档 | `docs/features/F###-<feature-name>/spec.md` | `brainstorming` |
  | 设计 | 设计文档 | `docs/features/F###-<feature-name>/design.md` | `writing-plans` |
  | 编码 | 变更说明（正式变更以 commit / PR 为准） | `docs/features/F###-<feature-name>/code.md` | `executing-plans` / `subagent-driven-development` + `test-driven-development` + `using-git-worktrees` |
  | 验证 | 检视报告 | `docs/features/F###-<feature-name>/review.md` | `verification-before-completion` + `requesting-code-review` + `receiving-code-review` |
  | 合入 | Pull Request | GitHub PR（不落 docs 文件） | `finishing-a-development-branch`（合入前再 `requesting-code-review`） |

- 跨阶段 skill（不绑定单一阶段，按需触发）：`systematic-debugging`（任一阶段出 bug 即用）、`verification-before-completion`（任一阶段宣称完成前的通用纪律，与 R3 同源）。元/工具层 skill（`using-superpowers`、`writing-skills`、`dispatching-parallel-agents`）不落在需求生命周期内。
- 阶段前进以门禁信号为准：只有当前阶段门禁通过，才允许进入下一阶段（对齐 R3 与 SPEC §11 门禁纪律），不得凭工作区状态或口头结论跳阶段。
- 判定：阶段顺序、交付件是否齐全、命名与目录是否符合 `docs/features/F###-<feature-name>/{spec,design,code,review}.md`，能确定性判定的部分后续下沉为脚本门禁（如 `check-feature-artifacts`）兜底。

## R5. 状态类字段只能由真实机制产出，禁止 seed / UI 自报状态

- **状态/进度类字段**（如 `loop_runs.phase`、`gate_records.status`、`phase_executions.status` 及任何 phase/status/progress/gate/result 语义字段）**只能由真实机制产出**：即经 `POST /api/loop-runs` → `/gates/run` → `/transition` 的门禁与状态机推进得到，**不得**由 seed / fixture / dev 脚本或前端直接写入。
- seed / 演示数据若要有阶段层次，必须**驱动真实机制**把状态推出来（真跑门禁、真推进），**不得直写 `phase` 等状态字段**。这与 iter0 "UI 不能手点 passed" 同源——都是"状态由门禁判定，不由自报"。
- **数据来源分级**：真实系统数据 / 后端 API 聚合 / seed-dev fixture / 纯 mock。未经用户明确授权，不得把 mock/seed 当作可交付数据源；UI 若展示假数据必须显式标注 "demo data"，命名/变量需可辨识。
- **交付前 provenance 自查**：页面每个关键字段都要能回答"来自哪个表 / endpoint / 计算逻辑、谁更新、失败如何显示"，答不上即不算"已对接真实系统"。
- 判定：能脚本化的部分下沉为门禁——`check-no-direct-state-write`（扫 seed/fixture/dev 脚本，命中对状态列的直接 `INSERT`/`UPDATE` 即失败），并入 `scripts/verify-all`。

---

> 说明：规则是软约束，可能被绕过；因此凡是能脚本判定的规则，例如 SPEC 无占位内容、交付件齐全、门禁通过，后续都应在 Hook 层用脚本硬门禁兜底。参见 SPEC 第 11 节与 `scripts/`。
