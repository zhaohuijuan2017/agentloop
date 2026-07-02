"""H1 需求接入闭环（F001）单测 + 契约。对齐 docs/features/F001-req-intake/spec.md 验收映射。"""
import pytest
from fastapi.testclient import TestClient

from app import intake

FILLED_F = """---
id: F001
状态: 待澄清
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/17
---

# F001 测试需求

## Why
价值与背景说明。

## What
范围与边界说明。

## Acceptance Criteria
- AC1：一条可验收条件。

## Key Decisions
关键决策说明。

## Dependencies
无外部依赖。

## Risk
无显著风险。
"""


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """独立临时 DB + 独立临时建档目录（AGENTLOOP_ISSUES_DIR）。"""
    monkeypatch.setenv("AGENTLOOP_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENTLOOP_ISSUES_DIR", str(tmp_path / "issues"))
    from app import db

    db.init_db(str(tmp_path / "test.db"))
    from app.main import app

    with TestClient(app) as c:
        yield c


# ---- AC1：建档骨架生成（后端单测）----
def test_allocate_and_render_skeleton(tmp_path):
    d = tmp_path / "issues"
    assert intake.allocate_f_number(d) == "F001"

    f_id, path = intake.write_f_skeleton(
        "[Feature] H1 需求接入闭环", "https://example.com/issues/17", directory=d, created="2026-07-02"
    )
    assert f_id == "F001"
    assert path.name.startswith("F001-")
    text = path.read_text(encoding="utf-8")
    # 结构合法：frontmatter 字段 + 六段
    for token in ("id: F001", "状态: 待澄清", "创建时间: 2026-07-02", "来源: https://example.com/issues/17"):
        assert token in text
    for sec in ("## Why", "## What", "## Acceptance Criteria",
                "## Key Decisions", "## Dependencies", "## Risk"):
        assert sec in text
    # 标题去掉 [Feature] 前缀
    assert "# F001 H1 需求接入闭环" in text
    # 新骨架含占位标记（喂给 AC3）
    assert "待填写" in text

    # 编号自动递增、不重号
    assert intake.allocate_f_number(d) == "F002"


def test_write_skeleton_conflict_is_atomic(tmp_path):
    d = tmp_path / "issues"
    d.mkdir()
    # 预置 F001 占位，模拟撞号
    (d / "F001-existing.md").write_text("x", encoding="utf-8")
    # allocate 会给 F002，不会覆盖 F001
    f_id, path = intake.write_f_skeleton("需求", "u", directory=d)
    assert f_id == "F002"
    assert (d / "F001-existing.md").read_text(encoding="utf-8") == "x"


def test_slugify_keeps_chinese_strips_unsafe():
    assert intake.slugify("Hello World") == "hello-world"
    assert intake.slugify("需求 接入/闭环") == "需求-接入闭环"
    assert intake.slugify("  a__b  ") == "a-b"


# ---- AC2：过门禁后可建 LoopRun（契约测试，真跑门禁子进程）----
def test_gated_loop_run_creation_passes(client, tmp_path):
    (tmp_path / "issues").mkdir()
    (tmp_path / "issues" / "F001-test.md").write_text(FILLED_F, encoding="utf-8")

    r = client.post(
        "/api/loop-runs",
        json={
            "title": "测试需求",
            "f_id": "F001",
            "source_issue_url": "https://github.com/zhaohuijuan2017/agentloop/issues/17",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["phase"] == "spec"
    assert body["f_id"] == "F001"
    assert body["source_issue_url"].endswith("/issues/17")

    # 回链在 GET 里也稳定带出
    got = client.get(f"/api/loop-runs/{body['id']}").json()
    assert got["f_id"] == "F001"


# ---- AC3：未过门禁则拒绝（后端单测，稳定错误码）----
def test_gated_loop_run_creation_blocked(client, tmp_path):
    # 用真实骨架（含占位标记）→ 必然过不了门禁
    intake.write_f_skeleton(
        "[Feature] 未澄清需求", "https://example.com/issues/99",
        directory=tmp_path / "issues", slug="unclear",
    )
    r = client.post("/api/loop-runs", json={"title": "未澄清需求", "f_id": "F001"})
    assert r.status_code == 409
    assert r.json()["error"] == "issue_format_gate_failed"
    assert r.json()["f_id"] == "F001"


def test_create_loop_run_f_doc_not_found(client):
    r = client.post("/api/loop-runs", json={"title": "x", "f_id": "F404"})
    assert r.status_code == 404
    assert r.json()["error"] == "f_doc_not_found"


# ---- 无 f_id 时维持既有行为（向后兼容）----
def test_create_without_f_id_unchanged(client):
    r = client.post("/api/loop-runs", json={"title": "普通需求"})
    assert r.status_code == 201
    body = r.json()
    assert body["phase"] == "spec"
    assert body["f_id"] is None and body["source_issue_url"] is None


# ---- intake 端点：分配编号 + 写骨架 ----
def test_intake_endpoint_allocates_and_writes(client, tmp_path):
    r = client.post(
        "/api/features/intake",
        json={"title": "[Feature] 导出报表", "source_issue_url": "https://example.com/issues/5"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["f_id"] == "F001"
    assert body["title"] == "导出报表"
    written = tmp_path / "issues" / "F001-导出报表.md"
    assert written.is_file()
