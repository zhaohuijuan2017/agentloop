"""H4 阶段资产注册与渐进加载（F004）单测 + 契约。对齐 docs/features/F004-asset-registry/spec.md。"""
import pytest
from fastapi.testclient import TestClient

from app import assets
from app.state_machine import Phase

FILLED_F = """---
id: F001
状态: 待澄清
创建时间: 2026-07-02
来源: https://github.com/zhaohuijuan2017/agentloop/issues/17
---

# F001 测试需求

## Why
价值。

## What
范围。

## Acceptance Criteria
- AC1：一条。

## Key Decisions
决策。

## Dependencies
无。

## Risk
无。
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
    return client.post(
        "/api/loop-runs",
        json={"title": "测试需求", "f_id": "F001", "source_issue_url": "https://x/issues/17"},
    ).json()


# ---- AC1：注册表可校验 ----
def test_registry_valid():
    # 仓库真实注册表应通过校验
    assert assets.validate_registry() == []


def test_registry_detects_errors(tmp_path):
    bad = tmp_path / "registry.yml"
    missing = str(tmp_path / "nope.md").replace("\\", "/")
    bad.write_text(
        "assets:\n"
        f"  - id: dup\n    kind: rules\n    path: {missing}\n    phases: [spec]\n"
        f"  - id: dup\n    kind: bogus\n    path: {missing}\n    phases: [nope]\n",
        encoding="utf-8",
    )
    errs = assets.validate_registry(bad)
    joined = " ".join(errs)
    assert "id 重复" in joined
    assert "kind" in joined and "bogus" in joined
    assert "phase" in joined and "nope" in joined
    assert "引用文件不存在" in joined


# ---- AC2：spec 只注入 spec 绑定资产 ----
def test_spec_only_injects_spec_assets(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    spec_ctx = client.get(f"/api/loop-runs/{run['id']}/context", params={"phase": "spec"}).json()
    design_ctx = client.get(f"/api/loop-runs/{run['id']}/context", params={"phase": "design"}).json()

    spec_paths = {m["path"] for m in spec_ctx["manifest"]}
    design_paths = {m["path"] for m in design_ctx["manifest"]}

    # issue-format 与 spec-writing skill 是 spec 独占，design 不应含
    assert any(p.endswith("issue-format.md") for p in spec_paths)
    assert any(p.endswith("spec-writing.md") for p in spec_paths)
    assert not any(p.endswith("issue-format.md") for p in design_paths)
    assert not any(p.endswith("spec-writing.md") for p in design_paths)
    # project-rules 全阶段，两处都在
    assert any(p.endswith("project-rules.md") for p in spec_paths)
    assert any(p.endswith("project-rules.md") for p in design_paths)


# ---- AC3：manifest 含注入资产与版本 ----
def test_manifest_includes_asset_versions(client, tmp_path):
    run = _run_with_f_doc(client, tmp_path)
    ctx = client.get(f"/api/loop-runs/{run['id']}/context").json()
    skill = next(m for m in ctx["manifest"] if m["role"] == "skill")
    assert skill["path"].endswith("spec-writing.md")
    assert len(skill["sha256"]) == 16 and skill["bytes"] > 0


def test_asset_paths_kind_filter():
    rules = assets.asset_paths(Phase.spec, "rules")
    skills = assets.asset_paths(Phase.spec, "skill")
    assert any(p.name == "project-rules.md" for p in rules)
    assert any(p.name == "spec-writing.md" for p in skills)
    assert all(p.name != "spec-writing.md" for p in rules)
