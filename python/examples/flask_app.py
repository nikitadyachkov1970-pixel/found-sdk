"""Minimal Flask integration with found-sdk.

Run:
    pip install found-sdk[flask]
    BUSINESS_API_KEY=<ключ из Found> FOUND_SANDBOX=1 python flask_app.py
"""
import os

from flask import Flask

from found_sdk import FoundSnapshot

app = Flask(__name__)

found = FoundSnapshot.from_env()


@found.kpi("active_subscribers", label="Активные подписчики", delta="+1")
def active_subscribers():
    return 35


@found.kpi("mrr_rub", label="MRR", unit="₽")
def mrr():
    return 2740


@found.custom("server_load_pct", label="Загрузка серверов", unit="%")
def server_load():
    return 72


@found.issues
def issues():
    return [{"severity": "warning", "text": "Сервер Germany #2 CPU 94%"}]


app.register_blueprint(found.flask_blueprint())

if __name__ == "__main__":
    app.run(port=8000)
