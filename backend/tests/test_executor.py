"""H2 阶段执行器（F002）单测 + 契约。对齐 docs/features/F002-phase-executor/spec.md 验收映射。"""
import pytest
from fastapi.testclient import TestClient

from app import intake
from tests.conftest import pass_gate

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
范围与边界说明：做 X 与 Y。

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
    """独立临时 DB + 建档目录 + 产物目录，均指向 tmp，不污染仓库。"""
    monkeypatch.setenv("AGENTLOOP_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("AGENTLOOP_ISSUES_DIR", str(tmp_path / "issues"))
    monkeypatch.setenv("AGENTLOOP_ARTIFACTS_DIR", str(tmp_path / "features"))
    from app import db

    db.init_db(str(tmp_path / "test.db"))
    from app.main import app

    with TestClient(app) as c:
        c._tmp = tmp_path
        yield c


def _run_with_f_doc(client, tmp_path):
    """写一份 filled F 文档并建关联 LoopRun（过 H1 门禁）。返回 run。"""
    (tmp_path / "issues").mkdir(exist_ok=True)
    (tmp_path / "issues" / "F001-test.md").write_text(FILLED_F, encoding="utf-8")
    r = client.post(
        "/api/loop-runs",
        json={"title": "测试需求", "f_id": "F001", "source_issue_url": "https://x/issues/17"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- AC1：spec 派发产出落盘产物并登记 ----
def test_dispatch_spec_produces_artifact(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    r = client.post(f"/api/loop-runs/{run['id']}/executions")
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["status"] == "succeeded"
    assert rec["phase"] == "spec"
    assert rec["artifact_path"].endswith("F001-test/spec-draft.md")

    # 产物真的落盘，且内容源自 F 文档
    draft = tmp_path / "features" / "F001-test" / "spec-draft.md"
    assert draft.is_file()
    text = draft.read_text(encoding="utf-8")
    assert "SPEC 草稿" in text and "做 X 与 Y" in text

    # 执行历史可查
    ex = client.get(f"/api/loop-runs/{run['id']}/executions").json()
    assert len(ex) == 1 and ex[0]["status"] == "succeeded"


# ---- AC2：执行不推进 phase；推进仍需门禁 ----
def test_execution_does_not_advance_phase(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    client.post(f"/api/loop-runs/{run['id']}/executions")
    # phase 仍是 spec
    assert client.get(f"/api/loop-runs/{run['id']}").json()["phase"] == "spec"
    # 无 gate 直接推进被拒
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "design"})
    assert r.status_code == 409 and r.json()["error"] == "gate_required"


# ---- AC3：执行失败留痕含原因 ----
def test_failed_execution_records_reason(client):
    # 建一个不带 f_id 的普通 run → spec 执行器缺输入 → 失败
    run = client.post("/api/loop-runs", json={"title": "无 F 文档"}).json()
    r = client.post(f"/api/loop-runs/{run['id']}/executions")
    assert r.status_code == 201
    rec = r.json()
    assert rec["status"] == "failed"
    assert rec["artifact_path"] is None
    assert "缺 f_id" in rec["detail"]

    ex = client.get(f"/api/loop-runs/{run['id']}/executions").json()
    assert ex[0]["status"] == "failed" and "缺 f_id" in ex[0]["detail"]


# ---- 无执行器的 phase 派发被拒 ----
def test_phase_without_executor_rejected(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    # 手动写 passed 门禁并推进到 design（design 无执行器）
    pass_gate(client, run["id"], "spec", "spec_check")
    assert client.post(
        f"/api/loop-runs/{run['id']}/transition", json={"to": "design"}
    ).status_code == 200
    r = client.post(f"/api/loop-runs/{run['id']}/executions")
    assert r.status_code == 409 and r.json()["error"] == "phase_not_executable"


def test_dispatch_missing_run_404(client):
    r = client.post("/api/loop-runs/nope/executions")
    assert r.status_code == 404 and r.json()["error"] == "loop_run_not_found"


def test_spec_executor_missing_f_doc_fails(client, tmp_path):
    # run 带 f_id 但对应文件在建档目录不存在（此处 f_id 通不过创建门禁，故直接构造 run 再手改不便）——
    # 用 intake 直接验证 resolve 行为的边界：executor 失败路径已由 AC3 覆盖，这里覆盖 resolve 缺档。
    assert intake.resolve_f_file("F999") is None
