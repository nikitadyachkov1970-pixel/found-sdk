"""found-sdk — expose your business metrics to Found in a few lines.

>>> from found_sdk import FoundSnapshot
>>> found = FoundSnapshot.from_env()
>>> @found.kpi("mrr_rub", label="MRR", unit="₽")
... def mrr():
...     return 2740
>>> app.include_router(found.fastapi_router())  # FastAPI
"""
from __future__ import annotations

from .core import DEFAULT_SNAPSHOT_PATH, FoundSnapshot
from .errors import FoundAuthError, FoundConfigError, FoundSdkError

__version__ = "0.1.0"

__all__ = [
    "FoundSnapshot",
    "FoundSdkError",
    "FoundConfigError",
    "FoundAuthError",
    "DEFAULT_SNAPSHOT_PATH",
    "__version__",
]
