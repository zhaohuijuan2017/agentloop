# Skill：SPEC 编写规范（spec 阶段资产）

> 由 F004 阶段资产注册表绑定到 `spec` 阶段，拼装 spec 上下文时注入。指导 agent/人工把 F 需求文档细化为可门禁的 SPEC。

## 何时用
LoopRun 进入 `spec` 阶段、需要把 F 需求文档细化为 SPEC 草稿时。

## 编写要求
1. **验收标准可测**：每条验收给出可观测判定条件，能映射到脚本门禁（后端单测 / 契约 / E2E），不接受「体验良好」类不可测表述。
2. **边界与非目标显式**：写清范围外的东西，避免镀金。
3. **错误码稳定**：接口失败路径给出稳定 `error` 码，不临场编。
4. **无占位标记**：SPEC 正文不留 `TODO` / `TBD` / `待定` 等，过 `spec_check` 与 `check-issue-format` 的占位判据。
5. **结构对齐**：与项目既有 SPEC（`docs/spec/`）章节风格一致——状态机、门禁、验收、错误码分节可寻。

## 产物
SPEC 草稿落盘到 `docs/features/<F###-slug>/spec-draft.md`（由 H2 执行器产出后细化），过 `spec_check` 方可推进到 design。
