"""Backward-compatible aliases for the old top-level `routers` imports."""

from __future__ import annotations

import sys

from backend.routers import dataset, glossary, translate, upload

sys.modules[__name__ + ".dataset"] = dataset
sys.modules[__name__ + ".glossary"] = glossary
sys.modules[__name__ + ".translate"] = translate
sys.modules[__name__ + ".upload"] = upload

__all__ = ["dataset", "glossary", "translate", "upload"]
