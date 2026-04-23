#!/usr/bin/env python3
"""Copy the repo-root glossary into the canonical backend glossary path."""

from __future__ import annotations

import json
from pathlib import Path
import sys

TRANSLATION_AGENT_DIR = Path(__file__).resolve().parent.parent
if str(TRANSLATION_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(TRANSLATION_AGENT_DIR))

from backend.storage.migration import sync_root_glossary_to_canonical  # noqa: E402


def main() -> int:
    report = sync_root_glossary_to_canonical()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
