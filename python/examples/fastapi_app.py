"""Minimal FastAPI integration with found-sdk.

Run:
    pip install found-sdk[fastapi] uvicorn
    BUSINESS_API_KEY=<ключ из Found> FOUND_SANDBOX=1 uvicorn fastapi_app:app

Then in Found: «Подключить API» → «Протестировать».
"""
import os

from fastapi import FastAPI

from found_sdk import FoundSnapshot

app = FastAPI()

found = FoundSnapshot.from_env()  # reads BUSINESS_API_KEY / BUSINESS_SNAPSHOT_PATH / ...
# or explicitly:
# found = FoundSnapshot(api_key=os.environ["BUSINESS_API_KEY"], business_name="SkyVPN", sandbox=True)


@found.kpi("active_subscribers", label="Активные подписчики", delta="+1")
def active_subscribers():
    return 35


@found.kpi("mrr_rub", label="MRR", unit="₽")
def mrr():
    return 2740


@found.kpi("churn_rate_pct", label="Churn rate", unit="%")
def churn():
    return 2.8


@found.custom("server_load_pct", label="Загрузка серверов", unit="%")
def server_load():
    return 72


@found.custom("vpn_nodes_online", label="VPN-узлов онлайн")
def nodes_online():
    return 14


@found.issues
def issues():
    return [{"severity": "warning", "text": "Сервер Germany #2 CPU 94%"}]


app.include_router(found.fastapi_router())
