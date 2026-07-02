"""H3 阶段上下文拼装（F003）：按 phase 确定性组装输入并生成 manifest。

拼装策略按 phase 静态声明（PHASE_INPUTS），不做运行时智能挑选；manifest 以
文件 + 内容 hash 定位，不内嵌全文。同输入 → 同 manifest（可回放的输入侧前提）。
"""
from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from . import intake
from .executor import artifacts_dir
from .state_machine import Phase


class ContextError(Exception):
    """必需输入缺失，映射为 409 context_input_missing。"""

    def __init__(self, reason: str):
        self.reason = reason


@dataclass(frozen=True)
class Role:
    name: str
    required: bool
    resolve: Callable[[dict], list[Path]]


def _rel(path: Path) -> str:
    root = intake.repo_root()
    p = path.relative_to(root) if path.is_relative_to(root) else path
    return str(p).replace("\\", "/")


def _resolve_requirement(run: dict) -> list[Path]:
    f_id = run.get("f_id")
    if not f_id:
        raise ContextError("LoopRun 未关联 F 文档（缺 f_id）")
    p = intake.resolve_f_file(f_id)
    if p is None:
        raise ContextError(f"F 需求文档不存在: {f_id}")
    return [p]


def _resolve_rules(_run: dict) -> list[Path]:
    d = intake.repo_root() / "docs" / "rules"
    return sorted(d.glob("*.md")) if d.is_dir() else []


def _resolve_prior_spec_draft(run: dict) -> list[Path]:
    f_id = run.get("f_id")
    if not f_id:
        return []
    p = intake.resolve_f_file(f_id)
    if p is None:
        return []
    draft = artifacts_dir() / p.stem / "spec-draft.md"
    return [draft] if draft.is_file() else []


PHASE_INPUTS: dict[Phase, list[Role]] = {
    Phase.spec: [
        Role("requirement", True, _resolve_requirement),
        Role("rules", False, _resolve_rules),
        Role("prior_artifact", False, _resolve_prior_spec_draft),
    ],
}
_DEFAULT_ROLES = [
    Role("requirement", True, _resolve_requirement),
    Role("rules", False, _resolve_rules),
]


def assemble(run: dict, phase: str | None = None) -> dict:
    """按 phase 拼装上下文并返回 {phase, manifest, total_bytes}。

    必需输入缺失抛 ContextError；phase 非法枚举抛 ValueError。
    """
    ph = Phase(phase) if phase else Phase(run["phase"])
    roles = PHASE_INPUTS.get(ph, _DEFAULT_ROLES)
    manifest: list[dict] = []
    for role in roles:
        for p in sorted(role.resolve(run)):
            data = p.read_bytes()
            manifest.append({
                "role": role.name,
                "path": _rel(p),
                "sha256": hashlib.sha256(data).hexdigest()[:16],
                "bytes": len(data),
            })
    return {"phase": ph.value, "manifest": manifest, "total_bytes": sum(m["bytes"] for m in manifest)}
