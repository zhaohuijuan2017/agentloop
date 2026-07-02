"""tier0: 运行门禁 endpoint —— GateRecord 只由真实脚本结果写入，杜绝手点 passed。

真实的 spec_check / design_check 是快速文件判据，测试里真跑；
backend_tests / contract_tests 用 monkeypatch 替换，避免在 pytest 里递归跑 pytest。
"""
from app import gate_runner
from tests.conftest import create_run


def _run(client, run_id, gate_name):
    return client.post(f"/api/loop-runs/{run_id}/gates/run", json={"gate_name": gate_name})


# 运行 spec_check（真实检查 SPEC 无占位）→ passed，且能驱动 spec->design
def test_run_spec_check_passes_and_enables_forward(client):
    run = create_run(client)
    r = _run(client, run["id"], "spec_check")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["gate_name"] == "spec_check"
    assert body["phase"] == "spec"
    assert body["status"] == "passed"
    assert "check-spec" in body["evidence"]
    t = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "design"})
    assert t.status_code == 200


# 运行 design_check（真实检查设计章节齐全）→ passed
def test_run_design_check_passes(client):
    run = create_run(client)
    r = _run(client, run["id"], "design_check")
    assert r.status_code == 201
    assert r.json()["status"] == "passed"
    assert r.json()["phase"] == "design"


# e2e 太重，不从 endpoint 跑 → 409 gate_not_runnable
def test_run_e2e_gate_not_runnable(client):
    run = create_run(client)
    r = _run(client, run["id"], "e2e_tests")
    assert r.status_code == 409
    assert r.json()["error"] == "gate_not_runnable"
    assert r.json()["gate"] == "e2e_tests"


# 未知 gate → 422 validation_error
def test_run_unknown_gate_422(client):
    run = create_run(client)
    r = _run(client, run["id"], "bogus_gate")
    assert r.status_code == 422
    assert r.json()["error"] == "validation_error"


# 不存在的 run → 404
def test_run_gate_missing_run_404(client):
    r = _run(client, "nope", "spec_check")
    assert r.status_code == 404
    assert r.json()["error"] == "loop_run_not_found"


# 失败门禁不能驱动前进；重跑通过才行（monkeypatch 替换真实命令，避免递归跑 pytest）
def test_failed_gate_blocks_and_pass_unblocks(client, monkeypatch):
    run = create_run(client)
    rid = run["id"]
    assert _run(client, rid, "spec_check").json()["status"] == "passed"
    assert client.post(f"/api/loop-runs/{rid}/transition", json={"to": "design"}).status_code == 200
    assert _run(client, rid, "design_check").json()["status"] == "passed"
    assert client.post(f"/api/loop-runs/{rid}/transition", json={"to": "code"}).status_code == 200

    monkeypatch.setitem(gate_runner.RUNNERS, "backend_tests", lambda: ("failed", "boom"))
    assert _run(client, rid, "backend_tests").json()["status"] == "failed"
    blocked = client.post(f"/api/loop-runs/{rid}/transition", json={"to": "test"})
    assert blocked.status_code == 409 and blocked.json()["error"] == "gate_required"

    monkeypatch.setitem(gate_runner.RUNNERS, "backend_tests", lambda: ("passed", "ok"))
    assert _run(client, rid, "backend_tests").json()["status"] == "passed"
    assert client.post(f"/api/loop-runs/{rid}/transition", json={"to": "test"}).status_code == 200
