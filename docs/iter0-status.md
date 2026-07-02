# LoopForge 迭代 0 收口状态审计

> 目的：把"哪些完成、哪些部分完成、哪些留到 tier1"一次摊清，作为 iter0 验收基线。
> 本文件为 tier0 过渡产物（手写）；终态应由系统 / verify-all 自动导出（tier1 dogfood，见 GitHub issue #3）。

**当前 HEAD**：`80cd5b3`　**verify-all**：`PASSED`（5 门禁全绿）

## 1. 状态总览

| 项 | 状态 | 证据 | open gap |
|---|---|---|---|
| LoopRun 阶段状态机（前进/打回/非法拒绝） | **done** | `f4b37a3`；`test_api.py` A1–A11 + `test_state_machine.py` 全枚举 | — |
| GateRecord + 前进需最新 passed（不认 LLM） | **done** | `f4b37a3`；`test_forward_without_gate_returns_gate_required` | — |
| 门禁写入源真实化（`/gates/run` 跑真命令写 GateRecord；UI 不再手点 passed） | **partial** | `83961e5`→`834e473`（后端）、`80cd5b3`（前端）；`test_gate_run.py` 6 例 | raw `POST /gates` 仍开放，curl 可写 passed → tier1 |
| 前端关键路径 A12/A13 | **done** | `5b12066`；`80cd5b3`（改运行门禁）；E2E 2 passed | — |
| 汇总门禁 verify-all 入库 | **done** | `ecf818f`；`scripts/verify-all.ps1` | — |
| 状态可见（审计 + 追踪矩阵） | **partial** | 本文件 + `docs/traceability.yml` | 手写，终态应自动导出 → tier1 dogfood |
| 用户指南标注当前限制 | **done** | `docs/user-guide.md` §当前限制 | — |
| task-done 规则收紧 | **done** | `docs/rules/project-rules.md` R3 | — |

## 2. 门禁真实性说明（tier0 收口重点）

- **前进由真实脚本结果驱动**：`/api/loop-runs/{id}/gates/run` 运行门禁对应的真命令，按真实 exit 写 GateRecord。
  - `spec_check` / `design_check`：快速文件判据（SPEC 无占位 / 设计章节齐全）。
  - `backend_tests` / `contract_tests`：子进程跑 `pytest`。
  - `e2e_tests`：过重，不从 web 请求同步跑 → 409 `gate_not_runnable`，由 CLI（`test-e2e.ps1` / `verify-all`）写回。
- **仍存在的旁路（诚实声明，留 tier1）**：`POST /api/loop-runs/{id}/gates` 原始写入端点未做 runner 身份校验，`curl` 仍可直接写 `passed`。tier0 只堵住了产品自己的 UI 自证入口；API 层不可旁路化的硬化在 tier1（GitHub issue #3）。
- `design_check` 目前是最小结构校验（检查 SPEC 含必备章节），**不是** tier1 那个"设计未澄清就不许进 Code"的前置阻断门禁。

## 3. 留到 tier1（GitHub issue #3）

1. API `/gates` runner / 可信写入源收紧（防 curl 旁路）。
2. `check-spec` / `check-design` 独立脚本门禁；`design_check` 升级为前置阻断门禁。
3. Superpowers plan 解析实验：只把 plan 当输入，不信 `- [x]`，重跑 `Run:` 命令生成状态。
4. Dogfood：用 LoopRun / GateRecord 管 LoopForge 自身开发，状态矩阵从手写迁移到系统自动导出。

## 4. 验收建议

按 **A（demo 薄切片）** 验收：iter0 交付"阶段状态机 + 门禁契约 + 真实运行门禁（3 个快门禁）+ 前端演示 + 汇总门禁 + 诚实审计"。上表标 **partial** 的两项对应的闭环（API 不可旁路、状态自动导出）明确留 tier1，不阻塞 iter0 demo 验收。
