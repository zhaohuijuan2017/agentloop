# F003 阶段上下文拼装 · 规格（需求澄清阶段产物）

> 对应 LoopRun `spec` 阶段。上游需求入口见 `docs/issues/F003-context-manifest.md`（#19）。

## 范围
按 phase 确定性拼装 LoopRun 的执行输入，并生成轻量 manifest（来源 + 内容 hash）。v0 覆盖 spec 阶段的输入角色。

## 行为规格

### S1 按 phase 静态声明输入角色
- `PHASE_INPUTS[phase]` 声明该 phase 需要哪些输入角色（白名单，不做运行时智能挑选）。
- spec 阶段角色：
  - `requirement`（必需）：F 需求文档。
  - `rules`（可选）：`docs/rules/*.md`，v0 绑定全部项目规则（H4 收窄为 phase 专属）。
  - `prior_artifact`（可选）：`docs/features/<F###-slug>/spec-draft.md`（若已产出）。

### S2 拼装与 manifest
- 每个命中文件登记一条 manifest 项：`{role, path, sha256（前 16 位）, bytes}`。
- 排序确定：角色按声明序，同角色内按 path 排序 → 同输入产出同 manifest。
- manifest 只登记定位信息与内容 hash，不内嵌全文。

### S3 缺失必需输入
- `requirement` 缺失（无 `f_id` 或 F 文档不存在）→ `ContextError` → `409 context_input_missing`，不静默降级。

### S4 端点
- `GET /api/loop-runs/{id}/context?phase=<可选>`：返回 `{phase, manifest, total_bytes}`。
- `phase` 非法枚举 → `422 validation_error`。

## 验收映射
- AC1 → `test_context.py::test_assemble_spec_lists_sources`
- AC2 → `test_context.py::test_assemble_is_deterministic`
- AC3 → `test_context.py::test_missing_requirement_errors`
