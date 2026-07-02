# F001 需求接入闭环 · 规格（需求澄清阶段产物）

> 对应 LoopRun `spec` 阶段。上游需求入口见 `docs/issues/F001-req-intake.md`（#17）。

## 范围
把「GitHub Feature → F### 建档 → LoopRun」三段打通为一条可门禁的准入闭环。只做入口贯通，不做状态回写。

## 行为规格

### S1 建档骨架生成
- 输入：GitHub Feature issue 的 `title` 与 `source_issue_url`（可选显式 `slug`）。
- 输出：`docs/issues/F###-<slug>.md`，含：
  - frontmatter：`id`（= 分配的 `F###`）、`状态: 待澄清`、`创建时间`（ISO 日期）、`来源`（= source_issue_url）。
  - 六段结构标题：`## Why` / `## What` / `## Acceptance Criteria` / `## Key Decisions` / `## Dependencies` / `## Risk`，段内填占位标记 `待填写`。
- 编号：扫描现有 `F*.md` 取最大编号 +1，三位零填充；文件独占创建（撞号即失败）。
- 判据：新骨架结构合法（AC1），但因含 `待填写` 必然过不了 `check-issue-format`（喂给 AC3）。

### S2 门禁准入的 LoopRun 创建
- `POST /api/loop-runs` 增加可选 `f_id` / `source_issue_url`。
- 传 `f_id` 时：定位 `docs/issues/F<id>-*.md` → 跑 `check-issue-format --file`：
  - 通过 → 创建 LoopRun（`phase=spec`），落 `f_id`、`source_issue_url` 回链（AC2）。
  - 失败 → `409 issue_format_gate_failed`，附证据，不建 run（AC3）。
  - F 文件不存在 → `404 f_doc_not_found`。
- 不传 `f_id` 时：维持既有行为（直接建 `phase=spec` run），既有用例不变。

## 错误码（稳定契约）
| 场景 | HTTP | error |
|---|---|---|
| F 文档未过门禁 | 409 | `issue_format_gate_failed` |
| F 文档不存在 | 404 | `f_doc_not_found` |
| 编号撞号（并发） | 409 | `f_number_conflict` |

## 验收映射
- AC1 → 单测 `test_intake.py::test_allocate_and_render_skeleton`
- AC2 → 契约 `test_intake.py::test_gated_loop_run_creation_passes`
- AC3 → 单测 `test_intake.py::test_gated_loop_run_creation_blocked`
