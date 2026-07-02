---
id: F003
状态: 开发中
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/19
优先级: P1
---

# F003 阶段上下文拼装：按 phase 确定性组装输入并生成 manifest

## Why
agent 在环执行的质量取决于喂给它什么。上下文应按 phase 确定性拼装——需求文档、SPEC、上阶段产物、绑定规则——而不是全量堆入或临场随意组装。拼装结果必须可复现、可快照，这是可回放的输入侧前提。本需求是 Epic #27 第三梯队 H3。

## What
- 给定 LoopRun 与 phase，输出确定性上下文包：F 需求文档、上阶段产物、该 phase 绑定的 rules（H4 扩展为 skills/subagents）。
- 生成 manifest 清单：本次拼装包含哪些文件、各自版本（内容 hash），作为执行记录与 trace 的一部分。
- 同输入产生同 manifest（确定性）；缺失必需输入时明确报错而非静默降级。
- 非目标：不做语义检索或向量召回；不做上下文压缩。

## Acceptance Criteria
- AC1：对 `phase=spec` 的 LoopRun 生成上下文包，manifest 列出全部来源与版本 hash。（后端单测）
- AC2：同一 LoopRun 同一基线下重复拼装得到相同 manifest。（后端单测）
- AC3：缺失 F 文档等必需输入时返回稳定错误码 `context_input_missing`。（后端单测）

## Key Decisions
- manifest 以文件加内容 hash 定位，不内嵌全文，快照轻量化。
- 拼装策略按 phase 静态声明（哪个 phase 需要哪些输入角色），不做运行时智能挑选。

## Dependencies
- 前置：#18（F002 阶段执行器，拼装结果是它的输入）。
- 被 #20（资产注入走同一拼装通道）、#22（manifest 进 trace）依赖。

## Risk
- 上下文膨胀：v0 先按 phase 白名单裁剪，膨胀治理（压缩、分层）留后续梯队。
