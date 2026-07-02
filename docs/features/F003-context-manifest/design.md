# F003 阶段上下文拼装 · 设计（设计阶段产物）

> 对应 LoopRun `design` 阶段。规格见同目录 `spec.md`。

## 组件

### 1. `backend/app/context.py`（新增）
| 符号 | 职责 |
|---|---|
| `ContextError` | 必需输入缺失（携带 reason） |
| `Role(name, required, resolve)` | 一个输入角色：`resolve(run) -> list[Path]`，必需缺失时抛 `ContextError` |
| `_resolve_requirement/_resolve_rules/_resolve_prior_spec_draft` | 各角色解析器 |
| `PHASE_INPUTS` | `{Phase.spec: [requirement, rules, prior_artifact]}`；其余 phase 用最小默认 |
| `assemble(run, phase=None)` | 拼装并返回 `{phase, manifest, total_bytes}` |

- manifest 项：`{role, path(repo-rel/绝对), sha256[:16], bytes}`；角色按声明序、同角色内按 path 排序，保证确定性。
- 产物目录复用 `executor.artifacts_dir()`（env `AGENTLOOP_ARTIFACTS_DIR`）；rules 取 `<repo>/docs/rules/*.md`。

### 2. `backend/app/main.py`（改）
- `GET /api/loop-runs/{id}/context?phase=`：取 run → `context.assemble`。
  - `ContextError` → `409 context_input_missing`。
  - 非法 `phase` 枚举 → `422 validation_error`。

## 与相邻需求的关系
- 输入侧前提：拼装结果是 H2 执行器的输入；H2 v0 用硬编码最小上下文，H3 提供可复现 manifest（后续可让执行器记录所用 manifest）。
- 被 H4（资产注入走同一通道，收窄 rules 为 phase 专属）、H6（manifest 进 trace）复用。

## 测试策略
- AC1：filled F 文档 + run(f_id) → assemble → manifest 含 `requirement`（F 文档）与 `rules`（项目规则），每项有 sha256 + bytes。
- AC2：同一 run 连续两次 assemble → manifest 全等。
- AC3：run 无 f_id → `409 context_input_missing`。
- 端点非法 phase → 422。
- 目录用 tmp env 隔离，不污染仓库。
