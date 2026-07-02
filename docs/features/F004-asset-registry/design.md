# F004 阶段资产注册与渐进加载 · 设计（设计阶段产物）

> 对应 LoopRun `design` 阶段。规格见同目录 `spec.md`。

## 组件

### 1. `docs/assets/registry.yml`（新增，入 git）
- 声明 rules/skills → phase 绑定。起步登记 project-rules（全阶段）、issue-format（spec）、spec-writing-skill（spec）。

### 2. `docs/assets/skills/spec-writing.md`（新增）
- spec 阶段第一个可复用 skill 资产。

### 3. `backend/app/assets.py`（新增）
| 符号 | 职责 |
|---|---|
| `registry_path()` | env `AGENTLOOP_ASSET_REGISTRY` 优先，缺省 `docs/assets/registry.yml` |
| `load_registry()` | 读 yaml，返回 assets 列表 |
| `validate_registry()` | 字段/枚举/文件存在校验，返回错误列表 |
| `asset_paths(phase, kind)` | 绑定到 phase（且 kind 匹配）的存在文件，按路径排序 |

### 4. `backend/app/context.py`（改）
- `_resolve_rules`/`_resolve_skills` 改为 `assets.asset_paths(phase, kind)`；resolver 签名加 `phase`。
- `PHASE_INPUTS[spec]` 增 `skill` 角色；默认角色也带 rules/skill。

### 5. `scripts/check_assets.py` + `scripts/check-assets`（新增）
- 0-LLM 注册表校验门禁，可后续纳入 verify-all。

### 6. `backend/pyproject.toml`（改）
- 依赖加 `pyyaml`。

## 与 F003 的关系
注入通道不变（manifest 结构不变）；仅把 rules/skill 来源从「扫描 docs/rules」换成「注册表按 phase 过滤」。F003 既有测试保持绿（project-rules 绑定 spec → rules 角色仍在）。

## 测试策略
- AC1：真实注册表 `validate_registry()` 无错；构造坏注册表（非法 phase / 缺文件 / 重 id）→ 报错。
- AC2：spec 上下文含 issue-format（spec 独占）；design 上下文不含 issue-format（只含全阶段的 project-rules）。
- AC3：spec manifest 含 skill 资产（spec-writing.md），带 sha256 + bytes。
- 用 tmp 注册表 env 隔离坏例，不动仓库真实注册表。
