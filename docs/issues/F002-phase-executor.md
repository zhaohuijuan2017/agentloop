---
id: F002
状态: 开发中
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/18
优先级: P1
---

# F002 阶段执行器：agent 在环执行 phase 并产出落盘产物

## Why
当前 agentloop 是「人推动 + 系统看门」的管控面：阶段产物全靠人在会话里产出，系统只管状态与门禁。单需求 Harness 的核心是把 agent 放进环里——每个 phase 由 agent 执行并产出落盘产物，这是可约束、可回放、可门禁交付流程的执行面地基，也是后续周期 loop（#16/#13）Implementer 环节的前置。本需求是 Epic #27 第二梯队 H2。

## What
- 对处于某 phase 的 LoopRun 派发一次 agent 执行：输入为该阶段上下文，输出为落盘产物加执行记录。
- 执行结果不直接推进 phase：推进仍必须跑对应确定性门禁，不认 agent 自报。
- 执行失败或中断留痕：状态、原因、可重试可查。
- v0 垂直切片先打通 spec 阶段：输入 F 需求文档，agent 产出 SPEC 草稿到约定路径，`spec_check` 可跑。
- 非目标：不含多 subagent 编排（H11）、不含 hook 护栏（H5）、上下文拼装先用最小硬编码版（H3 增强）。

## Acceptance Criteria
- AC1：对 `phase=spec` 的 LoopRun 派发执行后，SPEC 草稿写入约定路径并登记为该次执行的产物。（契约测试）
- AC2：执行完成后 phase 不变；推进仍需 `gates/run` 真实 passed。（后端单测）
- AC3：执行失败时留下含原因的执行记录，LoopRun 的执行历史可查。（后端单测）

## Key Decisions
- 执行器接口与运行时解耦：`EXECUTORS[phase]` 可插拔，真实 agent/LLM 后端接入同一接口形状（为周期 loop #11 tool-agnostic 适配层预留）。
- 产物落盘入 git 而非仅存 DB，保持「基线用 git 表达」的项目纪律。
- v0 的 spec 执行器为确定性模板生成器：读 F 文档产出 SPEC 草稿骨架，把「接入真实 agent」与「执行面管道」解耦，管道先可测可门禁。

## Dependencies
- 前置：#17（F001 需求接入闭环，提供稳定输入源与 `f_id` 回链）。
- 被 #19 #21 #22 #23 #25 依赖。

## Risk
- agent 产物质量不稳定：靠门禁兜底加失败留痕，不追求一次成功。
- 执行时长与 web 请求不匹配：v0 同步执行（spec 轻量）；长执行异步任务化留待后续梯队。
