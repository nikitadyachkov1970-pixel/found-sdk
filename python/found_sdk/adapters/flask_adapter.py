"""Flask adapter — register the Found snapshot endpoint as a blueprint."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..core import FoundSnapshot


def build_flask_blueprint(found: "FoundSnapshot", name: str = "found_sdk"):
    try:
        from flask import Blueprint, jsonify, request
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Flask is not installed — run `pip install found-sdk[flask]`"
        ) from exc

    bp = Blueprint(name, __name__)

    @bp.route(found.snapshot_path, methods=["GET"])
    def found_snapshot():  # noqa: ANN202
        status, body = found.handle(request.headers, request.remote_addr)
        return jsonify(body), status

    return bp
