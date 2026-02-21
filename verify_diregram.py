#!/usr/bin/env python3
"""
Diregram markdown verifier (repo-local).

This is a thin wrapper that runs the verifier implementation shipped in this repo.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def main() -> None:
    here = Path(__file__).resolve().parent
    self_name = Path(__file__).name
    candidates = [p for p in here.glob("verify_*.py") if p.name != self_name]
    if not candidates:
        print("FAIL: verifier implementation not found (expected another verify_*.py next to this file).")
        raise SystemExit(1)

    # If multiple exist, heuristically pick the largest (implementation).
    impl = sorted(candidates, key=lambda p: p.stat().st_size, reverse=True)[0]

    # Preserve CLI argv while presenting this filename in help/errors.
    sys.argv[0] = self_name
    runpy.run_path(str(impl), run_name="__main__")


if __name__ == "__main__":
    main()

