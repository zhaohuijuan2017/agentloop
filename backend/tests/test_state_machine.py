"""LoopRun 阶段状态机全枚举（SPEC §4, 验收 A6/A10 的单元层）。

6 阶段共 36 条有向对：5 合法前进 + 5 合法打回 + 26 非法（含 6 条 X->X）。
"""
import itertools

from app.state_machine import Phase, TransitionKind, classify, required_gate

ALL = list(Phase)

FORWARD = {
    (Phase.spec, Phase.design): "spec_check",
    (Phase.design, Phase.code): "design_check",
    (Phase.code, Phase.test): "backend_tests",
    (Phase.test, Phase.review): "contract_tests",
    (Phase.review, Phase.done): "e2e_tests",
}
ROLLBACK = {
    (Phase.design, Phase.spec),
    (Phase.code, Phase.design),
    (Phase.test, Phase.code),
    (Phase.review, Phase.code),
    (Phase.review, Phase.test),
}


def test_forward_transitions_and_required_gate():
    for (frm, to), gate in FORWARD.items():
        assert classify(frm, to) == TransitionKind.forward
        assert required_gate(frm, to) == gate


def test_rollback_transitions():
    for frm, to in ROLLBACK:
        assert classify(frm, to) == TransitionKind.rollback
        assert required_gate(frm, to) is None


def test_everything_else_is_illegal():
    legal = set(FORWARD) | ROLLBACK
    for frm, to in itertools.product(ALL, ALL):
        if (frm, to) in legal:
            continue
        assert classify(frm, to) == TransitionKind.illegal, f"{frm.value}->{to.value} 应为非法"
        assert required_gate(frm, to) is None


def test_same_phase_is_illegal_not_noop():
    for p in ALL:
        assert classify(p, p) == TransitionKind.illegal


def test_done_is_terminal():
    for to in ALL:
        if to == Phase.done:
            continue
        assert classify(Phase.done, to) == TransitionKind.illegal


def test_full_enumeration_counts():
    kinds = [classify(frm, to) for frm in ALL for to in ALL]
    assert kinds.count(TransitionKind.forward) == 5
    assert kinds.count(TransitionKind.rollback) == 5
    assert kinds.count(TransitionKind.illegal) == 26
