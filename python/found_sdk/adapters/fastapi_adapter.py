"""FastAPI adapter — mount the Found snapshot endpoint with one line."""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..core import FoundSnapshot


def build_fastapi_router(found: "FoundSnapshot"):
    try:
        from fastapi import APIRouter, Request
        from fastapi.responses import JSONResponse
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "FastAPI is not installed — run `pip install found-sdk[fastapi]`"
        ) from exc

    router = APIRouter()

    @router.get(found.snapshot_path)
    async def found_snapshot(request: Request):  # noqa: ANN202
        remote = request.client.host if request.client else None
        status, body = found.handle(request.headers, remote)
        return JSONResponse(status_code=status, content=body)

    return router
