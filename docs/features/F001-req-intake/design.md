# F001 需求接入闭环 · 设计（设计阶段产物）

> 对应 LoopRun `design` 阶段。规格见同目录 `spec.md`。

## 组件

### 1. `backend/app/intake.py`（新增，纯函数为主）
| 函数 | 职责 |
|---|---|
| `issues_dir()` | 解析建档目录：env `AGENTLOOP_ISSUES_DIR` 优先，缺省 `<repo>/docs/issues`（测试指向 tmp） |
| `allocate_f_number(dir)` | 扫描 `F*.md` 取最大编号 +1，返回 `F###` |
| `slugify(title)` | 剥离文件系统非法字符、空白→连字符、ascii 小写，保留中文 |
| `clean_feature_title(raw)` | 去掉 `[Feature]` 前缀 |
| `render_f_skeleton(f_id,title,source_url,created)` | 渲染六段骨架（段内 `待填写`） |
| `write_f_skeleton(...)` | 独占创建文件（`open(...,"x")`），返回 Path；撞号抛 `FileExistsError` |
| `resolve_f_file(f_id)` | 在 `issues_dir()` 中定位 `F<id>-*.md` |
| `run_issue_format_gate(path)` | 子进程跑 `check_issue_format.py --file path`，返回 `(ok, evidence)` |

### 2. `scripts/check_issue_format.py`（改：加 `--file` 单文件模式）
- 抽出 `validate_f_file(f, seen_ids, rep)`，`check_local_f` 循环复用之。
- `--file <path>`：对单个路径构造 `Report` 校验，打印并按 0/1 退出。与本地全量模式同一判据（单一真源）。

### 3. `backend/app/db.py`（改：回链列 + 迁移）
- `loop_runs` 增列 `f_id TEXT`、`source_issue_url TEXT`。
- `init_db` 内幂等迁移：`PRAGMA table_info` 缺列则 `ALTER TABLE ADD COLUMN`（兼容既有 dev 库）。

### 4. `backend/app/models.py`（改）
- `LoopRunCreate` 增可选 `f_id`、`source_issue_url`。
- `FeatureIntakeRequest`：`title`、`source_issue_url`、可选 `slug`。
- `LoopRun` 响应增 `f_id`、`source_issue_url`。

### 5. `backend/app/main.py`（改）
- `POST /api/features/intake`：分配编号+写骨架，返回 `{f_id,path,source_issue_url,title}`；撞号→`409 f_number_conflict`。
- `POST /api/loop-runs`：传 `f_id` 时先定位+跑门禁，失败 `409 issue_format_gate_failed` / 缺档 `404 f_doc_not_found`；通过则落回链字段。
- `_row_to_loop_run` 带出 `f_id`、`source_issue_url`。

### 6. `scripts/req_intake.py` + `scripts/req-intake`（新增，CLI 便捷入口）
- 无需起服务，直接 allocate+write，打印生成路径，供 agent/人工「一命令建档」。

## 门禁准入时序
```
POST /api/loop-runs {f_id}
  → resolve_f_file(f_id)        缺 → 404 f_doc_not_found
  → run_issue_format_gate(path) 失败 → 409 issue_format_gate_failed(+evidence)
  → INSERT loop_run(phase=spec, f_id, source_issue_url) → 201
```

## 测试策略
- 单测（无网络）：`allocate_f_number` 递增/不重号、`render_f_skeleton` 结构合法、独占创建撞号。
- 契约：filled F 文档 → 建 run 成功且回链齐全；skeleton（含 `待填写`）→ 门禁真跑（子进程）→ 409。
- 既有 `test_api.py` 不改仍绿（`f_id` 可选，向后兼容）。
- `check_issue_format.py --file` 直接对 tmp 文件做单测。
