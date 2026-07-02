# Issue 格式规范（Feature / F 需求 / BUG）

> AgentHarness 规则层文档。定义需求/缺陷 issue 的生命周期、编号、标题、正文格式与硬门禁判据。
> 能确定性判定的条目由 `scripts/check-issue-format` 脚本硬门禁兜底（见 §7、SPEC §11 门禁纪律）。

## 0. 核心模型：编号是「进入开发」的信号

- **Feature（GitHub，未编号）**：需求/想法先提到 GitHub，**不带编号**。这是入口，尚未决定开发。
- **进入开发**：决定开发某个 Feature 时，才分配下一个 `F###` 编号，并在 `docs/issues/F###-<slug>.md` 新建正式文档；该文档过硬门禁后才进入需求澄清（对应 LoopRun `spec` 阶段）。
- **BUG（GitHub，直接编号）**：缺陷直接在 GitHub 编号 `[BUG###]`，不走开发决策、不建 docs 文件。

| 阶段 | 载体 | 标题 | 编号 | 走设计流程 |
|---|---|---|---|---|
| 需求入口 | GitHub issue | `[Feature] <描述>` | 无 | 否（待决策） |
| 进入开发 | `docs/issues/F###-<slug>.md`（入 git） | `F### <描述>` | `F###` 三位 | 是（过硬门禁 → 需求澄清） |
| 缺陷 | GitHub issue | `[BUG###][<类型>] <描述>` | `BUG###` 三位 | 否 |

**核心纪律**：只有 `docs/issues/F*.md` 过 `check-issue-format` 硬门禁，对应需求才允许进入需求澄清。

## 1. 编号规则

- F 与 BUG 各自独立递增，均为三位零填充：`F001`…；`BUG001`…。
- 编号在各自序列内全局唯一，不复用。
- Feature 在 GitHub 阶段**不占用**编号；编号在「进入开发」建 docs 文件时分配。进入开发后可把对应 GitHub issue 标题补上 `F###` 前缀以便回链。

## 2. Feature 入口格式（GitHub，未编号）

- 标题：`[Feature] <一句话描述>`（不带 F 编号）。
- 正文至少包含：`## Why`、`## What`。
- 状态与创建时间用 GitHub 原生（open/closed + created）承载，不在正文重复。
- `Acceptance Criteria` / `Key Decisions` / `Dependencies` / `Risk` 在「进入开发」建 docs 文件时补齐（见 §3）。

## 3. F 需求正文格式（`docs/issues/F###-<slug>.md`，进入开发后）

用 YAML frontmatter 承载元数据，正文承载结构化章节。

```markdown
---
id: F001
状态: 待澄清
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/2
优先级: P1
---

# F001 <标题>

## Why
（为什么做：价值、背景、动机）

## What
（做什么：范围、边界、非目标）

## Acceptance Criteria
（验收标准，逐条列出；每条应可映射到确定性门禁——见 §4）

## Key Decisions
（关键决策与取舍）

## Dependencies
（依赖：其他 F 编号、模块、外部系统）

## Risk
（风险与缓解措施）
```

### 3.1 frontmatter 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 与文件名编号一致，如 `F001-*.md` 的 `id: F001` |
| `状态` | 是 | 取值见 §5 状态枚举 |
| `创建时间` | 是 | ISO 日期 `YYYY-MM-DD`（该需求进入开发建档的日期） |
| `来源` | 是 | 需求来源，通常为原 GitHub Feature issue 链接 |
| `优先级` | 否 | `P0` / `P1` / `P2`；缺省不阻断 |

### 3.2 必备章节

六个二级标题必须全部存在且非空：
`## Why`、`## What`、`## Acceptance Criteria`、`## Key Decisions`、`## Dependencies`、`## Risk`。`Acceptance Criteria` 至少一条。

## 4. Acceptance Criteria → 门禁映射（硬要求）

对齐 SPEC §5.2「验收标准可映射到脚本门禁」：F 需求每条验收标准都应能映射到确定性门禁（后端单测 / 契约测试 / E2E / 脚本判据），不接受只能靠人工或 LLM 主观判断的验收标准。当前建议该映射（不阻断），后续下沉为强校验。

## 5. 状态枚举（F 需求，仅 docs 文件）

`草稿` → `待澄清` → `澄清中` → `开发中` → `已完成` → `已关闭`

- 硬门禁只校验「状态取值在枚举内」，不校验流转合法性。

## 6. BUG 格式（GitHub）

- 标题：`[BUG###][<类型>] <描述>`，`<类型>` 取自 §6.1 枚举。
- 正文必含四段且各段非空：`## 问题`、`## 证据`、`## 影响`、`## 期望`。

### 6.1 bug 类型枚举

`功能` / `数据` / `接口` / `流程` / `安全` / `性能` / `UI`

## 7. 硬门禁判据（`scripts/check-issue-format`）

全部 0-LLM 确定性判据。任一阻断项失败则门禁 `failed`。

### 7.1 本地 F 文件校验（默认，阻断进入需求澄清）

对 `docs/issues/F*.md` 每个文件：

1. 文件名匹配 `F\d{3}-*.md`。
2. frontmatter 可解析，含 `id` / `状态` / `创建时间` / `来源`。
3. `id` 与文件名编号一致，且在所有 F 文件中唯一（无重号）。
4. `状态` 取值在 §5 枚举内。
5. `创建时间` 为合法 ISO 日期 `YYYY-MM-DD`。
6. §3.2 六个必备章节全部存在且非空；`Acceptance Criteria` 至少一条。
7. 全文无未填标记：`TBD` / `TODO` / `FIXME` / `XXX`（词边界匹配）、`待补充` / `待填写` / `待填` / `待定`。刻意不含常见名词「占位符」，以免误伤讨论门禁/SPEC 机制的正文（false-fail）。

### 7.2 GitHub 校验（`--github` 模式，gh 不可用降级 warn）

用 `gh issue list --json number,title,body` 拉取，逐条校验：

- 标题 `[Feature] ...`（未编号 Feature）：正文含 `## Why`、`## What`。
- 标题 `F### ...`（已进入开发、回链到 GitHub）：正文含 §3.2 六段。
- 标题 `[BUG###][<类型>] ...`：`<类型>` 在 §6.1 枚举内；正文含 §6 四段。
- 其它前缀：报告为「未规范化 issue」（warn）。
- `gh` 未安装 / 未鉴权 / 网络不可用：整体降级 warn，不阻断（保证 verify-all 确定性）。

## 8. 与 verify-all 集成

`scripts/check-issue-format`（本地 F 文件模式）作为一条门禁纳入 `scripts/verify-all.ps1`；失败则 verify-all 整体失败。GitHub 校验（`--github`）为独立/CI 用途，不纳入 verify-all，避免网络依赖破坏确定性。
