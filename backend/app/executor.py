"""H2 阶段执行器（F002）：对某 phase 的 LoopRun 派发一次 agent 执行，
产出落盘产物 + 执行记录。执行绝不推进 phase —— 推进仍认确定性门禁。

执行器接口 (run: dict) -> (artifact_rel: str, detail: str)，失败抛 ExecError。
EXECUTORS[phase] 可插拔：v0 仅接确定性 spec 执行器；真实 agent/LLM 后端
接入同一签名，与运行时解耦（对齐周期 loop #11 tool-agnostic 适配层）。
测试可 monkeypatch EXECUTORS。
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from . import intake
from .state_machine import Phase


class ExecError(Exception):
    """执行器内部失败，携带 reason，被 run_phase 捕获为 failed 记录。"""

    def __init__(self, reason: str):
        self.reason = reason


class PhaseNotExecutable(Exception):
    """当前 phase 未配置执行器（v0 仅 spec）。"""

    def __init__(self, phase: str):
        self.phase = phase


def artifacts_dir() -> Path:
    """产物根目录：env AGENTLOOP_ARTIFACTS_DIR 优先，缺省 <repo>/docs/features。"""
    env = os.environ.get("AGENTLOOP_ARTIFACTS_DIR")
    return Path(env) if env else intake.repo_root() / "docs" / "features"


def _rel(path: Path) -> str:
    root = intake.repo_root()
    p = path.relative_to(root) if path.is_relative_to(root) else path
    return str(p).replace("\\", "/")


def _section(text: str, name: str) -> str:
    """从 markdown 抽取二级标题 name 下的正文（到下一个二级标题为止）。"""
    m = re.search(rf"^##\s+{re.escape(name)}\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return m.group(1).strip() if m else ""


def _render_spec_draft(f_id: str, f_name: str, f_text: str) -> str:
    what = _section(f_text, "What") or "（源 F 文档 What 段为空）"
    ac = _section(f_text, "Acceptance Criteria") or "（源 F 文档 Acceptance Criteria 段为空）"
    return (
        f"# {f_id} SPEC 草稿（阶段执行器产出）\n\n"
        f"> 由 H2 阶段执行器基于 `docs/issues/{f_name}` 生成的 spec 阶段产物；"
        f"供 agent/人工细化后过 spec_check。\n\n"
        f"## 来源需求\n{f_id}（见 `docs/issues/{f_name}`）\n\n"
        f"## 范围（源自 What）\n{what}\n\n"
        f"## 验收（源自 Acceptance Criteria）\n{ac}\n"
    )


def _spec_executor(run: dict) -> tuple[str, str]:
    """spec 阶段 v0 执行器：读 F 文档 → 产出 SPEC 草稿。返回 (artifact_rel, detail)。"""
    f_id = run.get("f_id")
    if not f_id:
        raise ExecError("LoopRun 未关联 F 文档（缺 f_id），无法产出 SPEC 草稿")
    f_path = intake.resolve_f_file(f_id)
    if f_path is None:
        raise ExecError(f"F 文档不存在: {f_id}")
    out_dir = artifacts_dir() / f_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "spec-draft.md"
    draft = _render_spec_draft(f_id, f_path.name, f_path.read_text(encoding="utf-8"))
    out.write_text(draft, encoding="utf-8")
    rel = _rel(out)
    return rel, f"spec 草稿已产出: {rel}（源 F 文档 {f_path.name}）"


# phase -> 执行器。v0 仅 spec；其余 phase 派发 -> PhaseNotExecutable。
EXECUTORS = {
    Phase.spec: _spec_executor,
}


def run_phase(run: dict) -> tuple[str, str | None, str]:
    """对 run 当前 phase 跑一次执行。返回 (status, artifact_path|None, detail)。

    无执行器抛 PhaseNotExecutable。执行器失败落 (failed, None, reason)，不抛。
    """
    phase = Phase(run["phase"])
    ex = EXECUTORS.get(phase)
    if ex is None:
        raise PhaseNotExecutable(phase.value)
    try:
        artifact, detail = ex(run)
        return "succeeded", artifact, detail
    except ExecError as e:
        return "failed", None, e.reason
