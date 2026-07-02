"""API + 契约测试（SPEC 验收 A1–A11）。字段 / 状态码 / 错误码稳定断言。"""
from tests.conftest import advance, create_run, pass_gate


# A1
def test_create_returns_201_and_defaults_to_spec(client):
    r = client.post("/api/loop-runs", json={"title": "需求 A", "description": "desc"})
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "需求 A"
    assert body["description"] == "desc"
    assert body["phase"] == "spec"
    assert body["id"] and body["created_at"] and body["updated_at"]


# A2
def test_create_missing_title_422(client):
    r = client.post("/api/loop-runs", json={})
    assert r.status_code == 422
    assert r.json()["error"] == "validation_error"


def test_create_title_too_long_422(client):
    r = client.post("/api/loop-runs", json={"title": "x" * 201})
    assert r.status_code == 422
    assert r.json()["error"] == "validation_error"


# A3
def test_list_get_and_not_found(client):
    run = create_run(client)
    assert any(x["id"] == run["id"] for x in client.get("/api/loop-runs").json())
    assert client.get(f"/api/loop-runs/{run['id']}").json()["id"] == run["id"]
    r = client.get("/api/loop-runs/nope")
    assert r.status_code == 404
    assert r.json() == {"error": "loop_run_not_found", "id": "nope"}


# A4
def test_patch_updates_and_touches_updated_at(client):
    run = create_run(client)
    r = client.patch(f"/api/loop-runs/{run['id']}", json={"title": "改了", "description": "新"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "改了" and body["description"] == "新"
    assert body["updated_at"] >= run["updated_at"]


# A5
def test_create_gate_and_validation(client):
    run = create_run(client)
    r = client.post(
        f"/api/loop-runs/{run['id']}/gates",
        json={"phase": "spec", "gate_name": "spec_check", "status": "passed", "evidence": "报告"},
    )
    assert r.status_code == 201 and r.json()["status"] == "passed"
    bad = client.post(
        f"/api/loop-runs/{run['id']}/gates",
        json={"phase": "spec", "gate_name": "spec_check", "status": "maybe", "evidence": "x"},
    )
    assert bad.status_code == 422 and bad.json()["error"] == "validation_error"
    empty = client.post(
        f"/api/loop-runs/{run['id']}/gates",
        json={"phase": "spec", "gate_name": "spec_check", "status": "passed", "evidence": ""},
    )
    assert empty.status_code == 422


# A6
def test_forward_with_passed_gate_succeeds(client):
    run = create_run(client)
    pass_gate(client, run["id"], "spec", "spec_check")
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "design"})
    assert r.status_code == 200
    assert r.json()["phase"] == "design"


# A7
def test_forward_without_gate_returns_gate_required(client):
    run = create_run(client)
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "design"})
    assert r.status_code == 409
    assert r.json() == {"error": "gate_required", "phase": "spec", "gate": "spec_check"}
    assert client.get(f"/api/loop-runs/{run['id']}").json()["phase"] == "spec"


# A8
def test_rollback_with_reason_succeeds(client):
    run = create_run(client)
    advance(client, run["id"], "spec", "spec_check", "design")
    r = client.post(
        f"/api/loop-runs/{run['id']}/transition", json={"to": "spec", "reason": "需求要返工"}
    )
    assert r.status_code == 200 and r.json()["phase"] == "spec"


# A9
def test_rollback_without_reason_rejected(client):
    run = create_run(client)
    advance(client, run["id"], "spec", "spec_check", "design")
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "spec"})
    assert r.status_code == 409
    assert r.json() == {"error": "rollback_reason_required", "from": "design", "to": "spec"}
    assert client.get(f"/api/loop-runs/{run['id']}").json()["phase"] == "design"


# A10
def test_illegal_skip_transition_rejected(client):
    run = create_run(client)
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "code"})
    assert r.status_code == 409
    assert r.json() == {"error": "illegal_transition", "from": "spec", "to": "code"}
    assert client.get(f"/api/loop-runs/{run['id']}").json()["phase"] == "spec"


def test_illegal_same_phase_rejected(client):
    run = create_run(client)
    r = client.post(f"/api/loop-runs/{run['id']}/transition", json={"to": "spec"})
    assert r.status_code == 409
    assert r.json()["error"] == "illegal_transition"


def test_transition_on_missing_run_404(client):
    r = client.post("/api/loop-runs/nope/transition", json={"to": "design"})
    assert r.status_code == 404 and r.json()["error"] == "loop_run_not_found"


# A11
def test_delete_then_404(client):
    run = create_run(client)
    assert client.delete(f"/api/loop-runs/{run['id']}").status_code == 204
    assert client.get(f"/api/loop-runs/{run['id']}").status_code == 404
