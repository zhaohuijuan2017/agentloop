"""Pydantic 模型与请求体（SPEC iter0 §3, §6）。"""
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from .state_machine import Phase


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ---- 请求体 ----
class LoopRunCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    # H1 需求接入（F001）：传 f_id 触发 check-issue-format 准入门禁；缺省维持既有行为。
    f_id: str | None = Field(default=None, pattern=r"^F\d{3}$")
    source_issue_url: str | None = Field(default=None, max_length=500)


class FeatureIntakeRequest(BaseModel):
    """H1：从 GitHub Feature issue 生成 F 建档骨架。"""

    title: str = Field(min_length=1, max_length=200)
    source_issue_url: str = Field(min_length=1, max_length=500)
    slug: str | None = Field(default=None, max_length=100)


class LoopRunUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class GateRecordCreate(BaseModel):
    phase: Phase
    gate_name: str = Field(min_length=1, max_length=100)
    status: str = Field(pattern="^(passed|failed)$")
    evidence: str = Field(min_length=1, max_length=4000)


class TransitionRequest(BaseModel):
    to: Phase
    reason: str | None = Field(default=None, max_length=2000)


class GateRunRequest(BaseModel):
    gate_name: str = Field(min_length=1, max_length=100)


# ---- 响应体 ----
class LoopRun(BaseModel):
    id: str
    title: str
    description: str | None
    phase: Phase
    created_at: str
    updated_at: str
    f_id: str | None = None
    source_issue_url: str | None = None


class GateRecord(BaseModel):
    id: str
    loop_run_id: str
    phase: Phase
    gate_name: str
    status: str
    evidence: str
    created_at: str


class PhaseExecution(BaseModel):
    """H2 阶段执行记录（F002）。"""

    id: str
    loop_run_id: str
    phase: Phase
    status: str
    artifact_path: str | None
    detail: str | None
    created_at: str
    finished_at: str | None
