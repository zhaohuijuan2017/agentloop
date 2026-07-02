# F004 阶段资产注册与渐进加载 · 规格（需求澄清阶段产物）

> 对应 LoopRun `spec` 阶段。上游需求入口见 `docs/issues/F004-asset-registry.md`（#20）。

## 范围
声明式登记 rules/skills 资产与 phase 的绑定关系，拼装时按 phase 渐进注入，并纳入 manifest 审计。

## 行为规格

### S1 注册表
- `docs/assets/registry.yml`（入 git），每条：`{id, kind, path, phases[]}`。
- `kind ∈ {rules, skill}`；`phases[] ⊆ Phase 枚举`。

### S2 校验
- `check-assets` / `assets.validate_registry()`：字段齐全、`id` 不重、`kind`/`phase` 在枚举内、引用文件存在。任一失败阻断。

### S3 渐进注入（走 F003 通道）
- `context.assemble(run, phase)` 的 `rules`/`skill` 角色改为从注册表按 phase 过滤取文件（非全量扫描 `docs/rules`）。
- 只注入绑定到当前 phase 的资产。

### S4 manifest 审计
- 注入的每个资产在 manifest 登记 `{role(kind), path, sha256, bytes}`。

## 验收映射
- AC1 → `test_assets.py::test_registry_valid` + `test_assets.py::test_registry_detects_errors`
- AC2 → `test_assets.py::test_spec_only_injects_spec_assets`
- AC3 → `test_assets.py::test_manifest_includes_asset_versions`
