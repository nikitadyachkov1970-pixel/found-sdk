# found-sdk

Официальный SDK для [Found](https://found.skyvpn2.online): отдавай метрики своего бизнеса
в Found в несколько строк — без ручного endpoint'а, без возни с авторизацией и форматом JSON.

| Язык              | Установка                     | Папка             |
| ----------------- | ----------------------------- | ----------------- |
| Python            | `pip install found-sdk`       | [`python/`](python) |
| Node / TypeScript | `npm install found-sdk`       | [`node/`](node)   |

## Документация

**[→ Полное руководство по Business API и интеграции](docs/BUSINESS_API.md)**

Там пошагово: как работает pull-модель, формат JSON snapshot, примеры для VPN / магазина / SaaS,
безопасность, устранение 401 и FAQ.

| Документ | Содержание |
| --- | --- |
| [docs/BUSINESS_API.md](docs/BUSINESS_API.md) | Архитектура, пошаговая интеграция, формат ответа, примеры по нишам |
| [python/README.md](python/README.md) | Python SDK: FastAPI, Flask, `handle()` |
| [node/README.md](node/README.md) | Node SDK: Express, Fastify, raw http |

## Зачем

Found **читает** (pull) метрики с твоего бэкенда: раз в N часов делает
`GET <твой_url>/api/found/snapshot` с заголовком `Authorization: Bearer <ключ>`.
SDK поднимает этот endpoint за тебя: проверяет ключ (constant-time), собирает
самодокументируемый JSON и отдаёт его Found. Ты только описываешь метрики.

## Python

```python
from found_sdk import FoundSnapshot

found = FoundSnapshot.from_env()

@found.kpi("mrr_rub", label="MRR", unit="₽")
def mrr():
    return billing.mrr()

app.include_router(found.fastapi_router())  # FastAPI; есть и Flask
```

Подробнее → [`python/README.md`](python/README.md).

## Node / TypeScript

```ts
import { FoundSnapshot } from "found-sdk";

const found = FoundSnapshot.fromEnv();
found.kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" });

app.get(found.snapshotPath, found.expressHandler()); // Express; есть Fastify и raw http
```

Подробнее → [`node/README.md`](node/README.md).

## Формат ответа (одинаковый для обоих SDK)

```json
{
  "meta":   { "synced_at": "2026-06-30T15:00:00Z", "sandbox": true },
  "business_name": "SkyVPN",
  "period": "last_24h",
  "health": "warning",
  "kpis":   { "mrr_rub": { "value": 2740, "label": "MRR", "unit": "₽" } },
  "custom": { "server_load_pct": { "value": 72, "label": "Загрузка серверов", "unit": "%" } },
  "issues": [{ "severity": "warning", "text": "Germany #2 CPU 94%" }]
}
```

Любое поле из `kpis` и `custom` Found показывает автоматически — добавлять метрики
можно без правок кода Found.

## Безопасность

- Сравнение ключа в постоянное время; ключ не логируется.
- `sandbox` → Found только читает.
- Опциональный IP-allowlist, тайм-аут и изоляция сбоев провайдеров метрик.

## Публикация

- PyPI: [`python/PUBLISHING.md`](python/PUBLISHING.md) — тег `py-v*`.
- npm: [`node/PUBLISHING.md`](node/PUBLISHING.md) — тег `js-v*`.

## Лицензия

[MIT](LICENSE).
