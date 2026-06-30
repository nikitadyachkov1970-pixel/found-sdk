# found-sdk

Отдавай метрики своего бизнеса в [Found](https://found.skyvpn2.online) в несколько строк —
без ручного endpoint'а, без возни с авторизацией и форматом JSON.

```
pip install found-sdk[fastapi]   # или found-sdk[flask]
```

> Не на Python? Есть Node/TypeScript-версия: `npm install found-sdk`
> (в этом репозитории — папка `node/`).

**[→ Полное руководство по Business API](../docs/BUSINESS_API.md)** — архитектура, пошаговая интеграция, формат JSON, примеры по нишам, FAQ.

## Как это работает

Found **читает** (pull) метрики с твоего бэкенда: раз в N часов делает
`GET <твой_url>/api/found/snapshot` с заголовком `Authorization: Bearer <ключ>`.
`found-sdk` поднимает этот endpoint за тебя: проверяет ключ, собирает
самодокументируемый JSON и отдаёт его Found. Всё, что делаешь ты — описываешь метрики.

## Быстрый старт (FastAPI)

```python
import os
from fastapi import FastAPI
from found_sdk import FoundSnapshot

app = FastAPI()
found = FoundSnapshot.from_env()          # читает BUSINESS_API_KEY / BUSINESS_NAME / ...

@found.kpi("active_subscribers", label="Активные подписчики", delta="+1")
def subs():
    return db.count_active()

@found.kpi("mrr_rub", label="MRR", unit="₽")
def mrr():
    return billing.mrr()

@found.custom("server_load_pct", label="Загрузка серверов", unit="%")
def load():
    return monitoring.avg_cpu()

@found.issues
def issues():
    return [{"severity": "warning", "text": "Сервер Germany #2 CPU 94%"}]

app.include_router(found.fastapi_router())   # монтирует GET /api/found/snapshot
```

## Flask

```python
from flask import Flask
from found_sdk import FoundSnapshot

app = Flask(__name__)
found = FoundSnapshot.from_env()

@found.kpi("mrr_rub", label="MRR", unit="₽")
def mrr():
    return 2740

app.register_blueprint(found.flask_blueprint())
```

## Любой другой фреймворк

Используй `handle()` напрямую — он сам делает авторизацию и сборку:

```python
status, body = found.handle(request.headers, remote_addr=request.remote_addr)
return JSONResponse(body, status_code=status)
```

## Настройка

`FoundSnapshot.from_env()` читает переменные из блока `.env`, который выдаёт Found:

| Переменная               | Назначение                                   |
| ------------------------ | -------------------------------------------- |
| `BUSINESS_API_KEY`       | Ключ из Found (обязательно)                  |
| `BUSINESS_SNAPSHOT_PATH` | Путь endpoint'а (по умолчанию `/api/found/snapshot`) |
| `BUSINESS_NAME`          | Название бизнеса                             |
| `FOUND_SANDBOX`          | `1`/`true` → режим только чтения             |

Либо явно:

```python
found = FoundSnapshot(
    api_key=os.environ["BUSINESS_API_KEY"],
    business_name="SkyVPN",
    sandbox=True,
    allowed_ips=["203.0.113.10"],   # необязательно: разрешить только egress-IP Found
    provider_timeout=5.0,           # мягкий тайм-аут на каждый провайдер метрики
)
```

## Безопасность

- **Сравнение ключа** через `hmac.compare_digest` — без тайм-атак.
- **Ключ никогда не логируется** и не попадает в текст ошибок.
- **Sandbox** (`FOUND_SANDBOX=1`) → `meta.sandbox=true`, Found только читает.
- **Read-only**: endpoint ничего не меняет в твоём бизнесе by design.
- **IP-allowlist** (опционально): ограничь доступ egress-адресом Found.
- **Изоляция сбоев**: если один провайдер метрики упал или завис — он пропускается,
  остальной snapshot отдаётся. Один кривой запрос не роняет весь endpoint.

Запускай endpoint **только по HTTPS**.

## Формат ответа

SDK собирает самодокументируемый JSON, который Found понимает автоматически:

```json
{
  "meta":   { "synced_at": "2026-06-30T15:00:00+00:00", "sandbox": true },
  "business_name": "SkyVPN",
  "period": "last_24h",
  "health": "warning",
  "kpis":   { "mrr_rub": { "value": 2740, "label": "MRR", "unit": "₽" } },
  "custom": { "server_load_pct": { "value": 72, "label": "Загрузка серверов", "unit": "%" } },
  "issues": [{ "severity": "warning", "text": "Germany #2 CPU 94%" }]
}
```

Агент видит кастомные поля как `business.custom.server_load_pct` — добавлять новые метрики
можно без правок кода Found.

## Разработка

```
pip install -e .[dev]
pytest
```
