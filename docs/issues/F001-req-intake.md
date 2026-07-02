---
id: F001
状态: 开发中
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/17
优先级: P1
---

# F001 需求接入闭环：GitHub Feature → F### 建档 → LoopRun 贯通

## Why
单需求 Harness 的入口目前是断的：GitHub Feature（需求入口）、`docs/issues/F###-*.md` 建档（issue-format 硬门禁）、LoopRun（阶段状态机）三者各自存在但没有贯通，需求从提出到进入 spec 阶段全靠人肉搬运。入口不闭环，后续 agent 在环执行就没有稳定输入源。本需求是单需求 Harness Epic（#27）第一梯队 H1。

## What
- 从一个 GitHub Feature issue 一命令生成 `docs/issues/F###-<slug>.md` 建档骨架：自动分配下一个 F 编号、回填 `来源` 链接、写入六段结构骨架。
- F 文档通过 `check-issue-format` 硬门禁后，才允许创建关联 LoopRun（`phase=spec`）；未过门禁则以稳定错误码阻断。
- LoopRun 与 F 文档、原 GitHub issue 三方可互相回链：LoopRun 落 `f_id` 与 `source_issue_url` 字段。
- 非目标：不做 LoopRun 状态回写 GitHub 的双向同步；不改 `issue-format.md` 规范本身。

## Acceptance Criteria
- AC1：给定一个 GitHub Feature issue，能生成合法 F 建档骨架（文件名、frontmatter 字段、六段结构齐全），编号自动递增且不重号。（后端单测）
- AC2：F 文档过 `check-issue-format` 后，可创建关联 LoopRun（`phase=spec`），且 `f_id`、`source_issue_url` 回链字段齐全。（契约测试）
- AC3：F 文档未过门禁（含占位标记或空章节）时，创建 LoopRun 被拒绝并返回稳定错误码 `issue_format_gate_failed`。（后端单测）

## Key Decisions
- 编号在建档时刻分配，对齐 `docs/rules/issue-format.md` §0「编号是进入开发的信号」。
- 建档骨架刻意保留占位标记，使新生成的骨架必然过不了门禁，直到人工/agent 补齐真实内容——这正是 AC3 的判据来源。
- 门禁复用同一判据：新增 `check-issue-format --file <path>` 单文件模式，后端以子进程调用，保证「建 LoopRun 的准入判据」与「verify-all 里的门禁」是同一个 0-LLM 脚本，不另造一份。
- 编号并发以「文件独占创建」（`open(..., "x")`）为原子锚点，撞号即失败，不静默覆盖。

## Dependencies
- 关联既有 #2（GitHub 任务来源）、`scripts/check_issue_format.py`、后端 LoopRun 创建端点。
- 本 Epic 第一梯队，无前置 H 需求。

## Risk
- 编号并发冲突：两处同时建档可能撞号，以文件存在性做原子校验，撞号返回失败由上层重试。
- 中文标题 slug：保留中文字符入文件名（git/Windows 均可），仅剥离文件系统非法字符并将空白折叠为连字符，保证确定性。
