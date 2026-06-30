"""Tests for found-sdk core (framework-agnostic)."""
import pytest

from found_sdk import FoundConfigError, FoundSnapshot
from found_sdk.errors import FoundAuthError

KEY = "a" * 64


def make_sdk(**kwargs):
    sdk = FoundSnapshot(api_key=KEY, business_name="SkyVPN", sandbox=True, **kwargs)

    @sdk.kpi("active_subscribers", label="Активные подписчики", delta="+1")
    def subs():
        return 35

    @sdk.kpi("mrr_rub", label="MRR", unit="₽")
    def mrr():
        return 2740

    @sdk.custom("server_load_pct", label="Загрузка серверов", unit="%")
    def load():
        return 72

    @sdk.issues
    def issues():
        return [{"severity": "warning", "text": "Germany #2 CPU 94%"}, "плоская строка"]

    return sdk


class TestConfig:
    def test_rejects_short_key(self):
        with pytest.raises(FoundConfigError):
            FoundSnapshot(api_key="short")

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("BUSINESS_API_KEY", KEY)
        monkeypatch.setenv("BUSINESS_NAME", "SkyVPN")
        monkeypatch.setenv("FOUND_SANDBOX", "1")
        sdk = FoundSnapshot.from_env()
        assert sdk.business_name == "SkyVPN"
        assert sdk.sandbox is True


class TestAuth:
    def test_bearer_ok(self):
        make_sdk().authorize({"Authorization": f"Bearer {KEY}"})

    def test_x_api_key_ok(self):
        make_sdk().authorize({"X-API-Key": KEY})

    def test_missing_key_rejected(self):
        with pytest.raises(FoundAuthError):
            make_sdk().authorize({})

    def test_wrong_key_rejected(self):
        with pytest.raises(FoundAuthError):
            make_sdk().authorize({"Authorization": "Bearer " + "b" * 64})

    def test_ip_allowlist(self):
        sdk = make_sdk(allowed_ips=["1.2.3.4"])
        sdk.authorize({"X-API-Key": KEY}, remote_addr="1.2.3.4")
        with pytest.raises(FoundAuthError):
            sdk.authorize({"X-API-Key": KEY}, remote_addr="9.9.9.9")


class TestSnapshot:
    def test_self_documenting_structure(self):
        snap = make_sdk().build_snapshot()
        assert snap["meta"]["sandbox"] is True
        assert snap["meta"]["synced_at"]
        assert snap["business_name"] == "SkyVPN"
        # Rich self-documenting fields
        assert snap["kpis"]["active_subscribers"] == {
            "value": 35,
            "label": "Активные подписчики",
            "delta": "+1",
        }
        assert snap["kpis"]["mrr_rub"]["unit"] == "₽"
        assert snap["custom"]["server_load_pct"]["value"] == 72
        # Issues normalized (dict + plain string)
        assert snap["issues"][0]["severity"] == "warning"
        assert snap["issues"][1] == {"severity": "medium", "text": "плоская строка"}
        assert snap["health"] == "warning"  # derived from issues

    def test_failing_provider_is_skipped(self):
        sdk = FoundSnapshot(api_key=KEY)

        @sdk.kpi("good")
        def good():
            return 1

        @sdk.kpi("bad")
        def bad():
            raise RuntimeError("boom")

        snap = sdk.build_snapshot()
        assert "good" in snap["kpis"]
        assert "bad" not in snap["kpis"]

    def test_numeric_delta_formatting(self):
        sdk = FoundSnapshot(api_key=KEY)

        @sdk.kpi("growth", delta=5)
        def growth():
            return 100

        snap = sdk.build_snapshot()
        assert snap["kpis"]["growth"]["delta"] == "+5"


class TestHandle:
    def test_handle_unauthorized(self):
        status, body = make_sdk().handle({})
        assert status == 401
        assert body == {"error": "unauthorized"}

    def test_handle_ok(self):
        status, body = make_sdk().handle({"Authorization": f"Bearer {KEY}"})
        assert status == 200
        assert body["business_name"] == "SkyVPN"


class TestFastAPIAdapter:
    def test_router_serves_snapshot(self):
        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()
        app.include_router(make_sdk().fastapi_router())
        client = TestClient(app)

        assert client.get("/api/found/snapshot").status_code == 401
        resp = client.get("/api/found/snapshot", headers={"Authorization": f"Bearer {KEY}"})
        assert resp.status_code == 200
        assert resp.json()["kpis"]["mrr_rub"]["value"] == 2740


class TestFlaskAdapter:
    def test_blueprint_serves_snapshot(self):
        flask = pytest.importorskip("flask")

        app = flask.Flask(__name__)
        app.register_blueprint(make_sdk().flask_blueprint())
        client = app.test_client()

        assert client.get("/api/found/snapshot").status_code == 401
        resp = client.get("/api/found/snapshot", headers={"Authorization": f"Bearer {KEY}"})
        assert resp.status_code == 200
        assert resp.get_json()["kpis"]["mrr_rub"]["value"] == 2740
