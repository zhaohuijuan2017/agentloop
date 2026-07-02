"""SQLite 持久化（SPEC iter0 §3）。DB 路径运行时从 env AGENTLOOP_DB 读取，
方便每个测试用例指向独立临时库。"""
import os
import sqlite3
from contextlib import contextmanager


def get_db_path() -> str:
    return os.environ.get("AGENTLOOP_DB", "agentloop.db")


def init_db(path: str | None = None) -> None:
    conn = sqlite3.connect(path or get_db_path())
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS loop_runs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                phase TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                f_id TEXT,
                source_issue_url TEXT
            );
            CREATE TABLE IF NOT EXISTS gate_records (
                id TEXT PRIMARY KEY,
                loop_run_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                gate_name TEXT NOT NULL,
                status TEXT NOT NULL,
                evidence TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS phase_executions (
                id TEXT PRIMARY KEY,
                loop_run_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                status TEXT NOT NULL,
                artifact_path TEXT,
                detail TEXT,
                created_at TEXT NOT NULL,
                finished_at TEXT
            );
            """
        )
        # 幂等迁移：给既有 dev 库补回链列（IF NOT EXISTS 不会 ALTER）。
        cols = {r[1] for r in conn.execute("PRAGMA table_info(loop_runs)")}
        for col in ("f_id", "source_issue_url"):
            if col not in cols:
                conn.execute(f"ALTER TABLE loop_runs ADD COLUMN {col} TEXT")
        conn.commit()
    finally:
        conn.close()


@contextmanager
def connect(path: str | None = None):
    conn = sqlite3.connect(path or get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
