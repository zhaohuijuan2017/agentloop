# LoopForge · 项目规则

> AgentHarness 五层的第一层是规则。本文件记录项目级软约束；能确定性判定的条目会在后续下沉为脚本门禁或 Hook 强制。

## R1. 文档默认语言为中文

- 本项目下所有文档默认用中文书写，包括 SPEC、设计说明、评审记录、README、交付报告和项目规则。
- 代码契约类内容保持原文，不做中文化：代码标识符、类型名、字段名、枚举值、API 路径、错误码、命令、脚本名、JSON 示例和日志。
- 示例：`LoopRun`、`GateRecord`、`phase`、`spec/design/code/test/review/done`、`illegal_transition`、`scripts/check-spec` 都属于代码契约，保持英文。
- 判定：文档正文以中文叙述为主；英文只用于上述代码契约或业内固定术语。

---

> 说明：规则是软约束，可能被绕过；因此凡是能脚本判定的规则，例如 SPEC 无占位内容、交付件齐全、门禁通过，后续都应在 Hook 层用脚本硬门禁兜底。参见 SPEC 第 11 节与 `scripts/`。
