"""Run the engine suite and surface each failing test as a GitHub Actions annotation."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))


def main() -> int:
    suite = unittest.defaultTestLoader.discover(
        start_dir=str(ENGINE / "tests"), top_level_dir=str(ENGINE)
    )
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    for test, trace in [*result.failures, *result.errors]:
        tail = " ".join(line.strip() for line in trace.strip().splitlines()[-3:])
        message = f"{test.id()}: {tail[-1200:]}"
        for old, escaped in (("%", "%25"), ("\r", "%0D"), ("\n", "%0A"),
                             (":", "%3A"), (",", "%2C")):
            message = message.replace(old, escaped)
        print(f"::error title=Unit test failure::{message}", flush=True)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
