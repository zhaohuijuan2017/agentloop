"""LoopForge 迭代 0 后端（SPEC iter0）。

FastAPI + SQLite。核心是 LoopRun 阶段状态机 + GateRecord 脚本硬门禁：
阶段前进只认最新 passed 的 GateRecord（脚本/测试结果），不认 LLM 口头判断。
"""
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import db
from .gate_runner import GATE_PHASE, GateNotRunnable, UnknownGate, run_gate
from .models import (
    GateRecordCreate,
    GateRunRequest,
    LoopRunCreate,
    LoopRunUpdate,
    TransitionRequest,
    now_iso,
)
from .state_machine import Phase, TransitionKind, classify, required_gate


class AppError(Exception):
    """带稳定错误码的领域异常（SPEC §7）。"""

    def __init__(self, status: int, code: str, **extra):
        self.status = status
        self.body = {"error": code, **extra}


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="LoopForge iter0", lifespan=lifespan)


@app.exception_handler(AppError)
async def _app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status, content=exc.body)


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError):
    err = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in err.get("loc", []) if p != "body")
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "field": field, "reason": err.get("msg", "invalid")},
    )


# ---- 行/对象映射 ----
def _row_to_loop_run(r) -> dict:
    return {
        "id": r["id"], "title": r["title"], "description": r["description"],
        "phase": r["phase"], "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def _row_to_gate(r) -> dict:
    return {
        "id": r["id"], "loop_run_id": r["loop_run_id"], "phase": r["phase"],
        "gate_name": r["gate_name"], "status": r["status"],
        "evidence": r["evidence"], "created_at": r["created_at"],
    }


def _get_loop_run_or_404(conn, run_id: str):
    r = conn.execute("SELECT * FROM loop_runs WHERE id=?", (run_id,)).fetchone()
    if r is None:
        raise AppError(404, "loop_run_not_found", id=run_id)
    return r


# ---- LoopRun CRUD ----
@app.post("/api/loop-runs", status_code=201)
def create_loop_run(payload: LoopRunCreate):
    now = now_iso()
    run = {
        "id": str(uuid.uuid4()), "title": payload.title,
        "description": payload.description, "phase": Phase.spec.value,
        "created_at": now, "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO loop_runs VALUES (:id,:title,:description,:phase,:created_at,:updated_at)",
            run,
        )
    return run


@app.get("/api/loop-runs")
def list_loop_runs():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM loop_runs ORDER BY created_at").fetchall()
    return [_row_to_loop_run(r) for r in rows]


@app.get("/api/loop-runs/{run_id}")
def get_loop_run(run_id: str):
    with db.connect() as conn:
        return _row_to_loop_run(_get_loop_run_or_404(conn, run_id))


@app.patch("/api/loop-runs/{run_id}")
def update_loop_run(run_id: str, payload: LoopRunUpdate):
    with db.connect() as conn:
        r = _get_loop_run_or_404(conn, run_id)
        title = payload.title if payload.title is not None else r["title"]
        description = payload.description if payload.description is not None else r["description"]
        now = now_iso()
        conn.execute(
            "UPDATE loop_runs SET title=?, description=?, updated_at=? WHERE id=?",
            (title, description, now, run_id),
        )
        r2 = conn.execute("SELECT * FROM loop_runs WHERE id=?", (run_id,)).fetchone()
        return _row_to_loop_run(r2)


@app.delete("/api/loop-runs/{run_id}", status_code=204)
def delete_loop_run(run_id: str):
    with db.connect() as conn:
        _get_loop_run_or_404(conn, run_id)
        conn.execute("DELETE FROM loop_runs WHERE id=?", (run_id,))
    return None


# ---- GateRecord ----
@app.post("/api/loop-runs/{run_id}/gates", status_code=201)
def create_gate(run_id: str, payload: GateRecordCreate):
    with db.connect() as conn:
        _get_loop_run_or_404(conn, run_id)
        rec = {
            "id": str(uuid.uuid4()), "loop_run_id": run_id, "phase": payload.phase.value,
            "gate_name": payload.gate_name, "status": payload.status,
            "evidence": payload.evidence, "created_at": now_iso(),
        }
        conn.execute(
            "INSERT INTO gate_records VALUES "
            "(:id,:loop_run_id,:phase,:gate_name,:status,:evidence,:created_at)",
            rec,
        )
    return rec


@app.get("/api/loop-runs/{run_id}/gates")
def list_gates(run_id: str):
    with db.connect() as conn:
        _get_loop_run_or_404(conn, run_id)
        rows = conn.execute(
            "SELECT * FROM gate_records WHERE loop_run_id=? ORDER BY created_at", (run_id,)
        ).fetchall()
    return [_row_to_gate(r) for r in rows]


@app.post("/api/loop-runs/{run_id}/gates/run", status_code=201)
def run_gate_endpoint(run_id: str, payload: GateRunRequest):
    """运行门禁：跑真命令，按真实结果写 GateRecord（tier0 B —— 取代手点 passed）。"""
    with db.connect() as conn:
        _get_loop_run_or_404(conn, run_id)
        try:
            status, evidence = run_gate(payload.gate_name)
        except UnknownGate as e:
            raise AppError(
                422, "validation_error", field="gate_name", reason=f"unknown gate: {e.gate_name}"
            ) from e
        except GateNotRunnable as e:
            raise AppError(409, "gate_not_runnable", gate=e.gate_name) from e
        rec = {
            "id": str(uuid.uuid4()), "loop_run_id": run_id,
            "phase": GATE_PHASE[payload.gate_name].value,
            "gate_name": payload.gate_name, "status": status,
            "evidence": evidence, "created_at": now_iso(),
        }
        conn.execute(
            "INSERT INTO gate_records VALUES "
            "(:id,:loop_run_id,:phase,:gate_name,:status,:evidence,:created_at)",
            rec,
        )
    return rec


def _latest_gate_passed(conn, run_id: str, gate_name: str) -> bool:
    r = conn.execute(
        "SELECT status FROM gate_records WHERE loop_run_id=? AND gate_name=? "
        "ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (run_id, gate_name),
    ).fetchone()
    return r is not None and r["status"] == "passed"


# ---- 阶段流转 ----
@app.post("/api/loop-runs/{run_id}/transition")
def transition(run_id: str, payload: TransitionRequest):
    with db.connect() as conn:
        r = _get_loop_run_or_404(conn, run_id)
        frm = Phase(r["phase"])
        to = payload.to
        kind = classify(frm, to)

        if kind == TransitionKind.illegal:
            raise AppError(409, "illegal_transition", **{"from": frm.value, "to": to.value})

        if kind == TransitionKind.forward:
            gate = required_gate(frm, to)
            if not _latest_gate_passed(conn, run_id, gate):
                raise AppError(409, "gate_required", phase=frm.value, gate=gate)

        if kind == TransitionKind.rollback:
            if not (payload.reason and payload.reason.strip()):
                raise AppError(409, "rollback_reason_required", **{"from": frm.value, "to": to.value})

        now = now_iso()
        conn.execute("UPDATE loop_runs SET phase=?, updated_at=? WHERE id=?", (to.value, now, run_id))
        r2 = conn.execute("SELECT * FROM loop_runs WHERE id=?", (run_id,)).fetchone()
        return _row_to_loop_run(r2)
