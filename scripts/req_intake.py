#!/usr/bin/env python3
"""CLI: req-intake —— 从 GitHub Feature 生成 F 建档骨架（H1 / F001）。无需起服务。

用法:
  req-intake --title "<Feature 标题>" --source <issue_url> [--slug <slug>]

生成的骨架含占位标记，必然过不了 check-issue-format；补齐六段内容后方可建 LoopRun。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import intake  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="req-intake：F 建档骨架生成（H1）")
    ap.add_argument("--title", required=True, help="Feature 标题（可含 [Feature] 前缀）")
    ap.add_argument("--source", required=True, help="来源 GitHub issue 链接")
    ap.add_argument("--slug", default=None, help="可选文件名 slug；缺省从标题推导")
    args = ap.parse_args()

    f_id, path = intake.write_f_skeleton(args.title, args.source, slug=args.slug)
    rel = path.relative_to(intake.repo_root()) if path.is_relative_to(intake.repo_root()) else path
    print(f"created {f_id}: {str(rel).replace(chr(92), '/')}")
    print("下一步：补齐六段内容 → check-issue-format 过后再建关联 LoopRun。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
