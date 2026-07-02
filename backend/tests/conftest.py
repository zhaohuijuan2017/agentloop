import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """每个用例一个独立临时 SQLite 库。"""
    dbp = str(tmp_path / "test.db")
    monkeypatch.setenv("AGENTLOOP_DB", dbp)
    from app import db

    db.init_db(dbp)
    from app.main import app

    with TestClient(app) as c:
        yield c


def create_run(client, title="需求：任务 CRUD + 状态流转"):
    r = client.post("/api/loop-runs", json={"title": title})
    assert r.status_code == 201
    return r.json()


def pass_gate(client, run_id, phase, gate_name):
    r = client.post(
        f"/api/loop-runs/{run_id}/gates",
        json={"phase": phase, "gate_name": gate_name, "status": "passed", "evidence": "ok"},
    )
    assert r.status_code == 201


def advance(client, run_id, phase, gate_name, to):
    """通过写 passed gate + forward 推进一个阶段。"""
    pass_gate(client, run_id, phase, gate_name)
    r = client.post(f"/api/loop-runs/{run_id}/transition", json={"to": to})
    assert r.status_code == 200, r.text
    return r.json()
