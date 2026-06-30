"""Core of found-sdk: register metrics, build the self-documenting snapshot,
and authenticate inbound requests from Found — framework agnostic.

The snapshot JSON matches what Found's ``get_business_snapshot`` expects::

    {
      "meta":   {"synced_at": "...", "sandbox": true},
      "business_name": "...",
      "period": "last_24h",
      "health": "ok",
      "kpis":   {"mrr_rub": {"value": 2740, "label": "MRR", "unit": "₽"}},
      "custom": {"server_load_pct": {"value": 72, "label": "...", "unit": "%"}},
      "issues": [{"severity": "warning", "text": "..."}]
    }
"""
from __future__ import annotations

import hmac
import logging
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Mapping

from .errors import FoundAuthError, FoundConfigError

logger = logging.getLogger("found_sdk")

DEFAULT_SNAPSHOT_PATH = "/api/found/snapshot"
Provider = Callable[[], Any]


@dataclass
class _Metric:
    key: str
    provider: Provider
    label: str = ""
    unit: str = ""
    delta: Any = None  # str | number | callable | None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_delta(delta: Any) -> str | None:
    if delta is None:
        return None
    if callable(delta):
        try:
            delta = delta()
        except Exception:  # noqa: BLE001 — never let a delta callable break the snapshot
            return None
    if delta is None or delta == "":
        return None
    if isinstance(delta, (int, float)):
        sign = "+" if delta > 0 else ""
        text = f"{sign}{delta:g}"
    else:
        text = str(delta)
    return text[:60]


def _normalize_headers(headers: Any) -> dict[str, str]:
    """Accept dict / Mapping / objects with .items() and lower-case the keys."""
    result: dict[str, str] = {}
    if headers is None:
        return result
    items: Any
    if hasattr(headers, "items"):
        items = headers.items()
    elif isinstance(headers, Mapping):
        items = headers.items()
    else:
        return result
    for key, value in items:
        try:
            result[str(key).lower()] = str(value)
        except Exception:  # noqa: BLE001
            continue
    return result


def _extract_key(headers: dict[str, str]) -> str:
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token
    api_key = headers.get("x-api-key", "")
    return api_key.strip()


class FoundSnapshot:
    """Configure once, register metrics, mount on your framework.

    Example
    -------
    >>> found = FoundSnapshot(api_key=os.environ["BUSINESS_API_KEY"], sandbox=True)
    >>> @found.kpi("mrr_rub", label="MRR", unit="₽")
    ... def mrr():
    ...     return 2740
    >>> app.include_router(found.fastapi_router())
    """

    def __init__(
        self,
        api_key: str,
        *,
        business_name: str = "",
        period: str = "last_24h",
        sandbox: bool = False,
        snapshot_path: str = DEFAULT_SNAPSHOT_PATH,
        allowed_ips: list[str] | tuple[str, ...] | None = None,
        provider_timeout: float = 5.0,
    ) -> None:
        api_key = (api_key or "").strip()
        if len(api_key) < 8:
            raise FoundConfigError(
                "api_key is missing or too short — paste the Business API key from Found"
            )
        self._api_key = api_key
        self.business_name = business_name
        self.period = period
        self.sandbox = bool(sandbox)
        self.snapshot_path = snapshot_path if snapshot_path.startswith("/") else f"/{snapshot_path}"
        self.allowed_ips = set(allowed_ips) if allowed_ips else None
        self.provider_timeout = float(provider_timeout) if provider_timeout else 0.0

        self._kpis: dict[str, _Metric] = {}
        self._custom: dict[str, _Metric] = {}
        self._issues_provider: Provider | None = None
        self._health_provider: Provider | None = None

    # ------------------------------------------------------------------ #
    # Configuration helpers
    # ------------------------------------------------------------------ #
    @classmethod
    def from_env(
        cls,
        *,
        provider_timeout: float = 5.0,
        allowed_ips: list[str] | None = None,
    ) -> "FoundSnapshot":
        """Build from env vars produced by Found's ``.env`` block:

        ``BUSINESS_API_KEY``, ``BUSINESS_SNAPSHOT_PATH``, ``BUSINESS_NAME``,
        and ``FOUND_SANDBOX`` (``1``/``true`` enables read-only sandbox).
        """
        sandbox = str(os.environ.get("FOUND_SANDBOX", "")).lower() in ("1", "true", "yes")
        return cls(
            api_key=os.environ.get("BUSINESS_API_KEY", ""),
            business_name=os.environ.get("BUSINESS_NAME", ""),
            snapshot_path=os.environ.get("BUSINESS_SNAPSHOT_PATH", DEFAULT_SNAPSHOT_PATH),
            sandbox=sandbox,
            provider_timeout=provider_timeout,
            allowed_ips=allowed_ips,
        )

    # ------------------------------------------------------------------ #
    # Registration decorators
    # ------------------------------------------------------------------ #
    def kpi(self, key: str, *, label: str = "", unit: str = "", delta: Any = None):
        """Register a typed KPI provider (shown on the Found dashboard)."""

        def decorator(fn: Provider) -> Provider:
            self._kpis[key] = _Metric(key=key, provider=fn, label=label, unit=unit, delta=delta)
            return fn

        return decorator

    def custom(self, key: str, *, label: str = "", unit: str = "", delta: Any = None):
        """Register an arbitrary custom metric provider.

        Found displays it automatically and the agent sees it as
        ``business.custom.<key>`` — no Found code changes required.
        """

        def decorator(fn: Provider) -> Provider:
            self._custom[key] = _Metric(key=key, provider=fn, label=label, unit=unit, delta=delta)
            return fn

        return decorator

    def issues(self, fn: Provider) -> Provider:
        """Register a provider returning a list of problems.

        Each item is ``{"severity": "warning|high|low", "text": "..."}`` or a
        plain string (treated as ``medium``).
        """
        self._issues_provider = fn
        return fn

    def health(self, fn: Provider) -> Provider:
        """Register a provider returning ``ok`` | ``warning`` | ``critical``."""
        self._health_provider = fn
        return fn

    # ------------------------------------------------------------------ #
    # Authentication (shared key, constant-time)
    # ------------------------------------------------------------------ #
    def authorize(self, headers: Any, remote_addr: str | None = None) -> None:
        """Validate an inbound request. Raises :class:`FoundAuthError` on failure.

        The key is compared in constant time and never logged.
        """
        norm = _normalize_headers(headers)
        provided = _extract_key(norm)
        if not provided or not hmac.compare_digest(provided, self._api_key):
            raise FoundAuthError("invalid or missing API key")
        if self.allowed_ips is not None and remote_addr not in self.allowed_ips:
            raise FoundAuthError("request IP is not allowed")

    # ------------------------------------------------------------------ #
    # Snapshot assembly
    # ------------------------------------------------------------------ #
    def _call(self, fn: Provider) -> Any:
        if self.provider_timeout and self.provider_timeout > 0:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(fn)
                return future.result(timeout=self.provider_timeout)
        return fn()

    def _emit(self, metric: _Metric) -> dict[str, Any] | None:
        try:
            value = self._call(metric.provider)
        except FutureTimeout:
            logger.warning("found_sdk: metric %r timed out", metric.key)
            return None
        except Exception:  # noqa: BLE001 — one bad metric must not break the snapshot
            logger.warning("found_sdk: metric %r failed", metric.key, exc_info=True)
            return None
        field_obj: dict[str, Any] = {"value": value}
        if metric.label:
            field_obj["label"] = metric.label
        if metric.unit:
            field_obj["unit"] = metric.unit
        delta = _format_delta(metric.delta)
        if delta is not None:
            field_obj["delta"] = delta
        return field_obj

    def _build_issues(self) -> list[dict[str, str]]:
        if not self._issues_provider:
            return []
        try:
            raw = self._call(self._issues_provider) or []
        except Exception:  # noqa: BLE001
            logger.warning("found_sdk: issues provider failed", exc_info=True)
            return []
        issues: list[dict[str, str]] = []
        for item in raw:
            if isinstance(item, dict) and item.get("text"):
                issues.append(
                    {
                        "severity": str(item.get("severity", "medium")),
                        "text": str(item["text"]),
                    }
                )
            elif isinstance(item, str) and item.strip():
                issues.append({"severity": "medium", "text": item.strip()})
        return issues

    def build_snapshot(self) -> dict[str, Any]:
        """Assemble the self-documenting snapshot dict (no auth performed)."""
        kpis: dict[str, Any] = {}
        for key, metric in self._kpis.items():
            emitted = self._emit(metric)
            if emitted is not None:
                kpis[key] = emitted

        custom: dict[str, Any] = {}
        for key, metric in self._custom.items():
            emitted = self._emit(metric)
            if emitted is not None:
                custom[key] = emitted

        issues = self._build_issues()

        if self._health_provider:
            try:
                health = str(self._call(self._health_provider) or "").lower()
            except Exception:  # noqa: BLE001
                health = ""
            if health not in ("ok", "warning", "critical"):
                health = "warning" if issues else "ok"
        else:
            # No explicit health — derive it from the presence of issues.
            health = "warning" if issues else "ok"

        return {
            "meta": {"synced_at": _now_iso(), "sandbox": self.sandbox},
            "business_name": self.business_name or "Бизнес",
            "period": self.period,
            "health": health,
            "kpis": kpis,
            "custom": custom,
            "issues": issues,
        }

    # ------------------------------------------------------------------ #
    # Framework-agnostic request handler
    # ------------------------------------------------------------------ #
    def handle(self, headers: Any, remote_addr: str | None = None) -> tuple[int, dict[str, Any]]:
        """Authenticate, then build the snapshot.

        Returns ``(status_code, body)``. Use this directly from any framework
        if there is no dedicated adapter.
        """
        try:
            self.authorize(headers, remote_addr)
        except FoundAuthError:
            return 401, {"error": "unauthorized"}
        return 200, self.build_snapshot()

    # ------------------------------------------------------------------ #
    # Adapters (lazy imports so fastapi/flask stay optional)
    # ------------------------------------------------------------------ #
    def fastapi_router(self):
        """Return a FastAPI ``APIRouter`` serving ``GET <snapshot_path>``."""
        from .adapters.fastapi_adapter import build_fastapi_router

        return build_fastapi_router(self)

    def flask_blueprint(self, name: str = "found_sdk"):
        """Return a Flask ``Blueprint`` serving ``GET <snapshot_path>``."""
        from .adapters.flask_adapter import build_flask_blueprint

        return build_flask_blueprint(self, name=name)
