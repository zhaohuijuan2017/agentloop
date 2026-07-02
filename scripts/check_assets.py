#!/usr/bin/env python3
"""硬门禁: check-assets —— 校验阶段资产注册表（F004 / docs/assets/registry.yml）。

0-LLM 判据：字段齐全、kind/phase 在枚举内、引用文件存在。退出码 0=通过，1=有失败。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import assets  # noqa: E402


def main() -> int:
    errors = assets.validate_registry()
    print("==== check-assets ====")
    print(f"资产注册表: {assets.registry_path()}")
    for e in errors:
        print(f"  FAIL  {e}")
    if errors:
        print(f"check-assets: FAILED（{len(errors)} 项）")
        return 1
    print("check-assets: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
