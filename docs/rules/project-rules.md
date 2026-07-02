# LoopForge · 项目军规（Rules）

> AgentHarness 五层的第一层 = Rules（军规）。本文件是项目级软约束；能确定性判定的条目会在后续下沉成脚本 Hook 强制。

## R1. 文档默认语言 = 中文

- **本项目下所有文档（SPEC / Design / 设计说明 / README / 评审记录 / 交付报告等）默认用中文书写。**
- **例外（保持英文，不翻译）**：代码标识符、类型/字段名、API 路径、枚举值（如 `LoopRun` / `phase` / `spec/design/code/test/review/done` / `GateRecord` / 错误码 `illegal_transition` 等）、命令、脚本名、JSON 示例、日志。这些是代码契约，翻译会破坏一致性与可测性。
- 判定：文档正文（叙述性文字）以中文为主；出现的英文仅限上述代码类元素。

## R2.（占位，后续按需增补）

---

> 说明：Rules 是软约束、会被绕过；因此凡"能脚本判"的军规（如 SPEC 无 TBD/TODO、交付件齐全、门禁通过）都会在 Hook 层用脚本硬门禁兜底（见 SPEC §11 与 `scripts/`）。
