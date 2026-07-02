"""H3 阶段上下文拼装（F003）单测 + 契约。对齐 docs/features/F003-context-manifest/spec.md。"""
import pytest
from fastapi.testclient import TestClient

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
    monkeypatch.setenv("AGENTLOOP_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENTLOOP_ISSUES_DIR", str(tmp_path / "issues"))
    monkeypatch.setenv("AGENTLOOP_ARTIFACTS_DIR", str(tmp_path / "features"))
    from app import db

    db.init_db(str(tmp_path / "test.db"))
    from app.main import app

    with TestClient(app) as c:
        yield c


def _run_with_f_doc(client, tmp_path):
    (tmp_path / "issues").mkdir(exist_ok=True)
    (tmp_path / "issues" / "F001-test.md").write_text(FILLED_F, encoding="utf-8")
    r = client.post(
        "/api/loop-runs",
        json={"title": "测试需求", "f_id": "F001", "source_issue_url": "https://x/issues/17"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- AC1：manifest 列出来源与版本 ----
def test_assemble_spec_lists_sources(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    body = client.get(f"/api/loop-runs/{run['id']}/context").json()
    assert body["phase"] == "spec"
    roles = {m["role"] for m in body["manifest"]}
    assert "requirement" in roles and "rules" in roles
    req = next(m for m in body["manifest"] if m["role"] == "requirement")
    assert req["path"].endswith("F001-test.md")
    assert len(req["sha256"]) == 16 and req["bytes"] > 0
    assert body["total_bytes"] == sum(m["bytes"] for m in body["manifest"])


# ---- AC2：确定性 ----
def test_assemble_is_deterministic(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    a = client.get(f"/api/loop-runs/{run['id']}/context").json()
    b = client.get(f"/api/loop-runs/{run['id']}/context").json()
    assert a == b


# ---- AC3：缺必需输入稳定错误码 ----
def test_missing_requirement_errors(client):
    run = client.post("/api/loop-runs", json={"title": "无 F 文档"}).json()
    r = client.get(f"/api/loop-runs/{run['id']}/context")
    assert r.status_code == 409 and r.json()["error"] == "context_input_missing"


def test_prior_artifact_included_after_execution(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    # 先跑一次执行产出 spec-draft，再拼装应纳入 prior_artifact
    client.post(f"/api/loop-runs/{run['id']}/executions")
    body = client.get(f"/api/loop-runs/{run['id']}/context").json()
    roles = {m["role"] for m in body["manifest"]}
    assert "prior_artifact" in roles


def test_invalid_phase_422(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    r = client.get(f"/api/loop-runs/{run['id']}/context", params={"phase": "nope"})
    assert r.status_code == 422 and r.json()["error"] == "validation_error"
