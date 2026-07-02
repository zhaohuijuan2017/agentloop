"""H4 阶段资产注册表（F004）：声明式绑定 rules/skills 到 phase，渐进注入。

注册表（docs/assets/registry.yml，入 git）只管绑定关系；资产本体是 Markdown。
拼装时（走 F003 通道）只注入与当前 phase 匹配的资产。
"""
from __future__ import annotations

import os
from pathlib import Path

import yaml

from . import intake
from .state_machine import Phase

KINDS = ("rules", "skill")
_PHASES = {p.value for p in Phase}


def registry_path() -> Path:
    env = os.environ.get("AGENTLOOP_ASSET_REGISTRY")
    return Path(env) if env else intake.repo_root() / "docs" / "assets" / "registry.yml"


def load_registry(path: Path | None = None) -> list[dict]:
    p = path or registry_path()
    if not p.is_file():
        return []
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    return data.get("assets", []) or []


def _abs(asset_path: str) -> Path:
    p = Path(asset_path)
    return p if p.is_absolute() else intake.repo_root() / p


def validate_registry(path: Path | None = None) -> list[str]:
    """校验注册表：字段齐全、kind/phase 在枚举内、引用文件存在。返回错误列表（空=通过）。"""
    p = path or registry_path()
    errors: list[str] = []
    if not p.is_file():
        return [f"注册表不存在: {p}"]
    assets = load_registry(p)
    seen: set[str] = set()
    for i, a in enumerate(assets):
        scope = a.get("id") or f"#{i}"
        for field in ("id", "kind", "path", "phases"):
            if not a.get(field):
                errors.append(f"[{scope}] 缺字段: {field}")
        aid = a.get("id")
        if aid:
            if aid in seen:
                errors.append(f"[{scope}] id 重复")
            seen.add(aid)
        if a.get("kind") and a["kind"] not in KINDS:
            errors.append(f"[{scope}] kind『{a['kind']}』不在枚举内 {KINDS}")
        for ph in a.get("phases") or []:
            if ph not in _PHASES:
                errors.append(f"[{scope}] phase『{ph}』不在枚举内")
        if a.get("path") and not _abs(a["path"]).is_file():
            errors.append(f"[{scope}] 引用文件不存在: {a['path']}")
    return errors


def asset_paths(phase: Phase, kind: str | None = None, path: Path | None = None) -> list[Path]:
    """返回绑定到 phase（且 kind 匹配）的资产文件路径（仅存在的），按路径排序。"""
    out: list[Path] = []
    for a in load_registry(path):
        if kind and a.get("kind") != kind:
            continue
        if phase.value in (a.get("phases") or []):
            fp = _abs(a["path"])
            if fp.is_file():
                out.append(fp)
    return sorted(out)
