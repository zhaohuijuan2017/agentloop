"""LoopRun 阶段状态机（SPEC iter0 §4）。

阶段：spec -> design -> code -> test -> review -> done（done 为终态）。
- 合法前进（5 条）：每条绑定一个 required gate（脚本门禁），推进前该 gate 必须有最新 passed 记录。
- 合法打回（5 条）：不需要 gate，但必须提供 reason。
- 其余全部非法（含跳阶段 / done->* / X->X），一律拒绝，phase 不变。

X->X 是业务规则拒绝（illegal），不是幂等 no-op。
"""
from enum import StrEnum


class Phase(StrEnum):
    spec = "spec"
    design = "design"
    code = "code"
    test = "test"
    review = "review"
    done = "done"


# 合法前进： (from, to) -> required gate name
_FORWARD: dict[tuple[Phase, Phase], str] = {
    (Phase.spec, Phase.design): "spec_check",
    (Phase.design, Phase.code): "design_check",
    (Phase.code, Phase.test): "backend_tests",
    (Phase.test, Phase.review): "contract_tests",
    (Phase.review, Phase.done): "e2e_tests",
}

# 合法打回： (from, to)，需要 reason，无 gate
_ROLLBACK: set[tuple[Phase, Phase]] = {
    (Phase.design, Phase.spec),
    (Phase.code, Phase.design),
    (Phase.test, Phase.code),
    (Phase.review, Phase.code),
    (Phase.review, Phase.test),
}


class TransitionKind(StrEnum):
    forward = "forward"
    rollback = "rollback"
    illegal = "illegal"


def classify(frm: Phase, to: Phase) -> TransitionKind:
    if (frm, to) in _FORWARD:
        return TransitionKind.forward
    if (frm, to) in _ROLLBACK:
        return TransitionKind.rollback
    return TransitionKind.illegal


def required_gate(frm: Phase, to: Phase) -> str | None:
    """合法前进所需的 gate 名；非前进返回 None。"""
    return _FORWARD.get((frm, to))
