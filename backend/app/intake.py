"""H1 需求接入闭环（F001）：F 建档骨架生成 + 编号分配 + 门禁准入。

对齐 docs/rules/issue-format.md §3（F 文档格式）与 docs/features/F001-req-intake/。
建档骨架刻意含占位标记 `待填写`，使新骨架必然过不了 check-issue-format，
直到人工/agent 补齐真实内容 —— 这也是准入门禁（AC3）的判据来源。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

F_FILE_RE = re.compile(r"^F(\d{3})-.+\.md$")
_UNSAFE_FS = re.compile(r'[\\/:*?"<>|]+')
_REQUIRED_SECTIONS = ("Why", "What", "Acceptance Criteria", "Key Decisions", "Dependencies", "Risk")
_SKELETON_PLACEHOLDER = "待填写"


def repo_root() -> Path:
    # backend/app/intake.py -> parents[2] = 仓库根
    return Path(__file__).resolve().parents[2]


def issues_dir() -> Path:
    """建档目录：env AGENTLOOP_ISSUES_DIR 优先，缺省 <repo>/docs/issues。"""
    env = os.environ.get("AGENTLOOP_ISSUES_DIR")
    return Path(env) if env else repo_root() / "docs" / "issues"


def check_script() -> Path:
    return repo_root() / "scripts" / "check_issue_format.py"


def today_iso() -> str:
    return datetime.now(UTC).date().isoformat()


def allocate_f_number(directory: Path) -> str:
    """扫描目录内 F*.md，返回下一个三位零填充编号 F###。"""
    max_n = 0
    if directory.is_dir():
        for f in directory.glob("F*.md"):
            m = F_FILE_RE.match(f.name)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return f"F{max_n + 1:03d}"


def slugify(title: str) -> str:
    """生成文件名 slug：剥离文件系统非法字符，空白/下划线折叠为连字符，
    ascii 转小写，保留中文字符（git/Windows 文件名均可）。"""
    s = _UNSAFE_FS.sub("", title.strip())
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-.")
    s = "".join(c.lower() if c.isascii() else c for c in s)
    return s or "feature"


def clean_feature_title(raw: str) -> str:
    """去掉 GitHub Feature 标题的 `[Feature]` 前缀。"""
    return re.sub(r"^\s*\[Feature\]\s*", "", raw).strip()


def render_f_skeleton(f_id: str, title: str, source_url: str, created: str) -> str:
    """渲染符合 issue-format §3 的六段骨架；段内占位使新骨架过不了门禁。"""
    sections = "\n\n".join(f"## {sec}\n{_SKELETON_PLACEHOLDER}" for sec in _REQUIRED_SECTIONS)
    return (
        "---\n"
        f"id: {f_id}\n"
        "状态: 待澄清\n"
        f"创建时间: {created}\n"
        f"来源: {source_url}\n"
        "---\n\n"
        f"# {f_id} {title}\n\n"
        f"{sections}\n"
    )


def write_f_skeleton(
    title: str,
    source_url: str,
    *,
    directory: Path | None = None,
    slug: str | None = None,
    created: str | None = None,
) -> tuple[str, Path]:
    """分配编号并独占创建骨架文件。返回 (f_id, path)。撞号抛 FileExistsError。"""
    directory = directory or issues_dir()
    directory.mkdir(parents=True, exist_ok=True)
    clean_title = clean_feature_title(title)
    f_id = allocate_f_number(directory)
    file_slug = slug or slugify(clean_title)
    path = directory / f"{f_id}-{file_slug}.md"
    content = render_f_skeleton(f_id, clean_title, source_url, created or today_iso())
    # 独占创建：撞号即失败，不静默覆盖（issue-format §0 原子性）。
    with open(path, "x", encoding="utf-8") as fh:
        fh.write(content)
    return f_id, path


def resolve_f_file(f_id: str, directory: Path | None = None) -> Path | None:
    """在建档目录内定位 F<id>-*.md（取字典序第一个）。找不到返回 None。"""
    directory = directory or issues_dir()
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(f"{f_id}-*.md"))
    return matches[0] if matches else None


def run_issue_format_gate(path: Path) -> tuple[bool, str]:
    """子进程跑 check-issue-format 单文件模式。返回 (ok, evidence)。

    与 verify-all 里的门禁是同一个 0-LLM 脚本（单一真源）。
    """
    cmd = [sys.executable, str(check_script()), "--file", str(path)]
    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60
    )
    ok = proc.returncode == 0
    tail = ((proc.stdout or "") + (proc.stderr or "")).strip()[-2000:]
    return ok, f"$ check-issue-format --file {path.name} (exit {proc.returncode})\n{tail}"
