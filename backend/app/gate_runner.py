"""tier0: 门禁运行器 —— 每个门禁对应一个真实判据（脚本/命令），
运行后按真实结果产出 (status, evidence)。GateRecord 只由此写入，杜绝手点 passed。

- spec_check / design_check：快速文件判据（无子进程）。
- backend_tests / contract_tests：子进程跑 pytest（sys.executable = 后端 venv 解释器）。
- e2e_tests：过重，不从 web 请求同步跑，抛 GateNotRunnable（由 CLI/verify-all 写回）。

RUNNERS 可在测试中 monkeypatch 替换，避免在 pytest 里递归执行 pytest。
真实的 runner 身份/权限收紧属于 tier1（见 GitHub issue #3），此处不做鉴权。
"""
import re
import subprocess
import sys
from pathlib import Path

from .state_machine import Phase

# gate_name -> 该门禁归属的 phase（写 GateRecord 用）
GATE_PHASE: dict[str, Phase] = {
    "spec_check": Phase.spec,
    "design_check": Phase.design,
    "backend_tests": Phase.code,
    "contract_tests": Phase.test,
    "e2e_tests": Phase.review,
}

_PLACEHOLDER = re.compile(r"TBD|TODO|FIXME|XXX|占位符|待补充|待定")
_REQUIRED_DESIGN_SECTIONS = ("状态机", "门禁", "验收", "错误码")


class GateNotRunnable(Exception):
    """已知门禁，但不适合从 endpoint 同步跑（如 e2e）。"""

    def __init__(self, gate_name: str):
        self.gate_name = gate_name


class UnknownGate(Exception):
    """gate_name 不是已知门禁。"""

    def __init__(self, gate_name: str):
        self.gate_name = gate_name


def _repo_root() -> Path:
    # backend/app/gate_runner.py -> parents[2] = 仓库根
    return Path(__file__).resolve().parents[2]


def _spec_path() -> Path:
    return _repo_root() / "docs" / "spec" / "iter0-task-crud-state.md"


def _spec_check() -> tuple[str, str]:
    hits = _PLACEHOLDER.findall(_spec_path().read_text(encoding="utf-8"))
    if hits:
        return "failed", f"check-spec: SPEC 命中占位标记 {len(hits)} 处"
    return "passed", "check-spec: SPEC 无占位标记"


def _design_check() -> tuple[str, str]:
    text = _spec_path().read_text(encoding="utf-8")
    missing = [s for s in _REQUIRED_DESIGN_SECTIONS if s not in text]
    if missing:
        return "failed", f"check-design: 缺少必备设计章节 {missing}"
    return "passed", "check-design: 必备设计章节齐全"


def _pytest(args: list[str]) -> tuple[str, str]:
    cmd = [sys.executable, "-m", "pytest", "-q", *args]
    proc = subprocess.run(
        cmd,
        cwd=str(_repo_root() / "backend"),
        capture_output=True,
        text=True,
        timeout=600,
    )
    status = "passed" if proc.returncode == 0 else "failed"
    tail = ((proc.stdout or "")[-1200:] + (proc.stderr or "")[-400:]).strip()
    return status, f"$ {' '.join(cmd)} (exit {proc.returncode})\n{tail}"[:4000]


def _backend_tests() -> tuple[str, str]:
    return _pytest([])


def _contract_tests() -> tuple[str, str]:
    return _pytest(["tests/test_api.py"])


# gate_name -> 无参运行器，返回 (status, evidence)。测试可 monkeypatch.setitem 替换。
RUNNERS = {
    "spec_check": _spec_check,
    "design_check": _design_check,
    "backend_tests": _backend_tests,
    "contract_tests": _contract_tests,
    # e2e_tests 故意不在此 -> GateNotRunnable
}


def run_gate(gate_name: str) -> tuple[str, str]:
    """运行门禁并返回 (status, evidence)。未知门禁抛 UnknownGate；已知但不可跑抛 GateNotRunnable。"""
    if gate_name not in GATE_PHASE:
        raise UnknownGate(gate_name)
    runner = RUNNERS.get(gate_name)
    if runner is None:
        raise GateNotRunnable(gate_name)
    return runner()
