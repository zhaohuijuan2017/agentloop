#!/usr/bin/env python3
"""硬门禁: check-issue-format —— 校验 issue 是否符合 docs/rules/issue-format.md 规范。

- 默认（本地模式）: 校验 docs/issues/F*.md，确定性、阻断。
- --github: 额外用 `gh issue list` 拉取 GitHub issue 校验 F/BUG 格式；
  gh 不可用（未安装/未鉴权/网络失败）时降级为 warn，不阻断（保证 verify-all 确定性）。

退出码: 0 = 通过（含仅 warn）；1 = 有阻断性失败。
0-LLM 判据，纯 stdlib。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# ---- 规范常量（对齐 docs/rules/issue-format.md）----
STATUS_ENUM = ("草稿", "待澄清", "澄清中", "开发中", "已完成", "已关闭")
BUG_TYPES = ("功能", "数据", "接口", "流程", "安全", "性能", "UI")
REQUIRED_FM = ("id", "状态", "创建时间", "来源")
REQUIRED_SECTIONS_F = ("Why", "What", "Acceptance Criteria", "Key Decisions", "Dependencies", "Risk")
REQUIRED_SECTIONS_BUG = ("问题", "证据", "影响", "期望")
# 未填标记：代码式标记用词边界，中文用独特的「未填」措辞。
# 不含常见名词「占位符」，避免误伤讨论门禁/SPEC 机制的正文（false-green 的反面：false-fail）。
PLACEHOLDER = re.compile(r"\bTBD\b|\bTODO\b|\bFIXME\b|\bXXX\b|待补充|待填写|待填|待定")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
F_FILE_RE = re.compile(r"^F(\d{3})-.+\.md$")
F_TITLE_RE = re.compile(r"^F(\d{3})\b")
FEATURE_TITLE_RE = re.compile(r"^\[Feature\]\s*\S")
BUG_TITLE_RE = re.compile(r"^\[BUG(\d{3})\]\[([^\]]+)\]")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_frontmatter(text: str) -> dict[str, str] | None:
    """解析简单 YAML frontmatter（key: value，单层）。无 frontmatter 返回 None。"""
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    block = text[3:end].strip("\n")
    fm: dict[str, str] = {}
    for line in block.splitlines():
        line = line.split("#", 1)[0].rstrip() if not line.strip().startswith("#") else ""
        if not line.strip():
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        fm[k.strip()] = v.strip()
    return fm


def section_bodies(text: str, levels: tuple[str, ...] = ("##",)) -> dict[str, str]:
    """按二级标题切分，返回 {标题: 该段正文}。"""
    bodies: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m and m.group(1) == "##":
            if current is not None:
                bodies[current] = "\n".join(buf).strip()
            current = m.group(2).strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        bodies[current] = "\n".join(buf).strip()
    return bodies


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []   # 阻断
        self.warns: list[str] = []    # 不阻断

    def err(self, scope: str, msg: str) -> None:
        self.errors.append(f"[{scope}] {msg}")

    def warn(self, scope: str, msg: str) -> None:
        self.warns.append(f"[{scope}] {msg}")


def check_local_f(rep: Report) -> int:
    """校验 docs/issues/F*.md。返回校验的文件数。"""
    issues_dir = repo_root() / "docs" / "issues"
    if not issues_dir.is_dir():
        rep.warn("local", f"目录不存在: {issues_dir}（无本地 F 需求可校验）")
        return 0
    files = sorted(issues_dir.glob("F*.md"))
    seen_ids: dict[str, str] = {}
    for f in files:
        scope = f"docs/issues/{f.name}"
        fm_match = F_FILE_RE.match(f.name)
        if not fm_match:
            rep.err(scope, "文件名不匹配 F<NNN>-<slug>.md")
            continue
        num = fm_match.group(1)
        text = f.read_text(encoding="utf-8")

        # 占位标记
        hits = PLACEHOLDER.findall(text)
        if hits:
            rep.err(scope, f"命中占位标记 {len(hits)} 处: {sorted(set(hits))}")

        # frontmatter
        fm = parse_frontmatter(text)
        if fm is None:
            rep.err(scope, "缺少可解析的 YAML frontmatter")
        else:
            for key in REQUIRED_FM:
                if not fm.get(key):
                    rep.err(scope, f"frontmatter 缺字段或为空: {key}")
            fid = fm.get("id", "")
            if fid and fid != f"F{num}":
                rep.err(scope, f"id={fid} 与文件名编号 F{num} 不一致")
            if fid:
                if fid in seen_ids:
                    rep.err(scope, f"编号 {fid} 重复（另见 {seen_ids[fid]}）")
                else:
                    seen_ids[fid] = f.name
            st = fm.get("状态", "")
            if st and st not in STATUS_ENUM:
                rep.err(scope, f"状态『{st}』不在枚举内 {STATUS_ENUM}")
            ct = fm.get("创建时间", "")
            if ct and not DATE_RE.match(ct):
                rep.err(scope, f"创建时间『{ct}』不是合法 ISO 日期 YYYY-MM-DD")

        # 必备章节
        bodies = section_bodies(text)
        for sec in REQUIRED_SECTIONS_F:
            if sec not in bodies:
                rep.err(scope, f"缺必备章节: ## {sec}")
            elif not bodies[sec].strip():
                rep.err(scope, f"章节为空: ## {sec}")
        ac = bodies.get("Acceptance Criteria", "")
        if ac and not any(line.strip() for line in ac.splitlines()):
            rep.err(scope, "Acceptance Criteria 无有效条目")
    return len(files)


def check_github(rep: Report) -> None:
    """--github 模式：拉取 GitHub issue 校验格式。gh 不可用时降级 warn。"""
    try:
        proc = subprocess.run(
            ["gh", "issue", "list", "--state", "open", "--limit", "200",
             "--json", "number,title,body"],
            cwd=str(repo_root()), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        rep.warn("github", f"gh 不可用，跳过 GitHub 校验: {e}")
        return
    if proc.returncode != 0:
        rep.warn("github", f"gh 调用失败（可能未鉴权/无网络），跳过: {proc.stderr.strip()[:200]}")
        return
    try:
        items = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError as e:
        rep.warn("github", f"gh 输出非法 JSON，跳过: {e}")
        return

    for it in items:
        num = it.get("number")
        title = (it.get("title") or "").strip()
        body = it.get("body") or ""
        scope = f"gh#{num}"
        if F_TITLE_RE.match(title):
            # 已进入开发、回链到 GitHub 的 F 需求：要求六段齐全
            bodies = section_bodies(body)
            for sec in REQUIRED_SECTIONS_F:
                if not bodies.get(sec, "").strip():
                    rep.err(scope, f"F 需求缺/空章节: ## {sec}  «{title[:40]}»")
        elif FEATURE_TITLE_RE.match(title):
            # 未编号 Feature 入口：仅要求 Why / What
            bodies = section_bodies(body)
            for sec in ("Why", "What"):
                if not bodies.get(sec, "").strip():
                    rep.err(scope, f"Feature 入口缺/空章节: ## {sec}  «{title[:40]}»")
        elif BUG_TITLE_RE.match(title):
            m = BUG_TITLE_RE.match(title)
            btype = m.group(2)
            if btype not in BUG_TYPES:
                rep.err(scope, f"bug 类型『{btype}』不在枚举内 {BUG_TYPES}  «{title[:40]}»")
            bodies = section_bodies(body)
            for sec in REQUIRED_SECTIONS_BUG:
                if not bodies.get(sec, "").strip():
                    rep.err(scope, f"BUG 缺/空章节: ## {sec}  «{title[:40]}»")
        else:
            rep.warn("github", f"#{num} 标题未规范化（非 F/BUG 前缀）: «{title[:50]}»")


def main() -> int:
    ap = argparse.ArgumentParser(description="check-issue-format 硬门禁")
    ap.add_argument("--github", action="store_true", help="额外校验 GitHub issue（gh 不可用降级 warn）")
    args = ap.parse_args()

    rep = Report()
    n = check_local_f(rep)
    if args.github:
        check_github(rep)

    print("==== check-issue-format ====")
    print(f"本地 F 文件: {n} 个" + ("，含 GitHub 校验" if args.github else ""))
    for w in rep.warns:
        print(f"  warn  {w}")
    for e in rep.errors:
        print(f"  FAIL  {e}")

    if rep.errors:
        print(f"check-issue-format: FAILED（{len(rep.errors)} 项阻断）")
        return 1
    print(f"check-issue-format: PASSED" + (f"（{len(rep.warns)} 项 warn）" if rep.warns else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
