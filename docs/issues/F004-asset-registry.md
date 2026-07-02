---
id: F004
状态: 开发中
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/20
优先级: P1
---

# F004 阶段资产注册与渐进加载：Rules / Skills 按 phase 绑定注入

## Why
「每个环节沉淀对应的 Rules / Skills / Subagents 资产」是研发流程 Harness 的核心主张。当前仓库只有全局 rules 文档，没有按 phase 绑定与按需注入的机制——资产既无处登记，也无法渐进加载，只能全量堆 prompt 或靠人脑记。本需求是 Epic #27 第四梯队 H4。

## What
- 资产注册表：声明每类资产（rules / skills，后续 subagents）绑定到哪些 phase。
- 拼装时（走 F003 通道）只注入与当前 phase 匹配的资产，渐进加载而非全量注入。
- 注入了什么进 manifest，可审计。
- 起步资产：把现有 `docs/rules/*` 按 phase 归类登记；为 spec 阶段沉淀第一个可复用 skill（SPEC 编写规范）。
- 非目标：不做 skill 自演进（从 trace 蒸馏候选）；subagent 资产的执行语义在 H11。

## Acceptance Criteria
- AC1：资产可声明式注册并绑定 phase，注册表可校验（引用文件存在、kind/phase 在枚举内）。（后端单测 + 脚本判据 check-assets）
- AC2：拼装 `phase=spec` 上下文时只注入 spec 绑定资产，不含其它 phase 独占资产。（后端单测）
- AC3：manifest 含本次注入的资产清单与版本 hash。（后端单测）

## Key Decisions
- 注册表用声明式 yaml 文件入 git，与 loop 编排 registry 风格对齐。
- 资产本体沿用 Markdown 文档，注册表只管绑定关系。
- 注入复用 F003 上下文通道：rules/skills 由「扫描 docs/rules」改为「注册表按 phase 过滤」。

## Dependencies
- 前置：#19（F003 上下文拼装，注入走同一通道）。
- 被 #25（subagent 资产注册复用同一注册表）依赖。

## Risk
- 资产陈旧：注册表引用文档失效无人知——校验只能保「存在」，内容有效性靠 review 纪律。
