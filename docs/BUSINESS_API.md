# Business API — полное руководство по интеграции с Found

Found **читает** (pull) метрики с вашего бэкенда. Вы поднимаете один HTTP-endpoint, Found периодически запрашивает его и использует данные в дашборде, агенте и утреннем брифинге.

Официальный SDK [`found-sdk`](../README.md) делает это за несколько строк. Можно и без SDK — главное, чтобы endpoint отдавал JSON нужного формата.

---

## Содержание

1. [Как это работает](#как-это-работает)
2. [Что нужно с вашей стороны](#что-нужно-с-вашей-стороны)
3. [Пошаговая интеграция](#пошаговая-интеграция)
4. [Формат snapshot (JSON)](#формат-snapshot-json)
5. [Интеграция через SDK](#интеграция-через-sdk)
6. [Интеграция без SDK](#интеграция-без-sdk)
7. [Примеры по нишам](#примеры-по-нишам)
8. [Безопасность](#безопасность)
9. [Что делает Found с данными](#что-делает-found-с-данными)
10. [Устранение неполадок](#устранение-неполадок)
11. [FAQ](#faq)

---

## Как это работает

```
┌─────────────────┐         GET /api/found/snapshot          ┌──────────────────┐
│  Ваш бэкенд     │  ◄──── Authorization: Bearer <ключ> ──── │  Found           │
│  (любой стек)   │  ──── JSON snapshot (метрики, issues) ──► │  (found.skyvpn…) │
└─────────────────┘                                          └──────────────────┘
        ▲                                                              │
        │  SDK или свой код                                            ▼
   БД, биллинг,                                              Дашборд, агент,
   мониторинг, CRM                                           Telegram-брифинг
```

**Важно:** Found не лезет в вашу БД и не знает ваш стек. Он знает только один URL и один ключ. Вся адаптация — на вашей стороне: вы агрегируете данные из своих источников и отдаёте единый JSON.

### Модель pull

| Кто | Что делает |
| --- | --- |
| **Вы** | Поднимаете `GET`-endpoint, проверяете ключ, отдаёте JSON |
| **Found** | Сохраняет URL и ключ, запрашивает snapshot по кнопке «Обновить», при вопросах агента и в брифинге |
| **SDK** | Проверяет ключ (constant-time), собирает JSON, монтирует endpoint |

Шаблоны в настройках Found (SaaS, магазин, VPN…) — **только примеры**. Контракт один для всех ниш.

---

## Что нужно с вашей стороны

| Требование | Описание |
| --- | --- |
| HTTPS | Endpoint доступен из интернета по `https://` |
| Метод | `GET` |
| Авторизация | `Authorization: Bearer <ключ>` или `X-API-Key: <ключ>` |
| Ответ | `200` + `Content-Type: application/json` |
| Ошибка ключа | `401 Unauthorized` |
| Read-only | Endpoint **не меняет** данные бизнеса — только читает |

Ключ генерируется в Found: **Настройки → Мой бизнес → Сгенерировать Business API key**. Один и тот же ключ должен быть в Found и в `.env` вашего сервера.

---

## Пошаговая интеграция

### Часть A — в Found

1. Откройте [Found → Настройки → Мой бизнес](https://found.skyvpn2.online/dashboard/settings/business).
2. Укажите **название бизнеса** (`BUSINESS_NAME`).
3. Укажите **API URL** — публичный адрес вашего бэкенда, например `https://api.example.com` (без пути snapshot).
4. Укажите **путь snapshot** — по умолчанию `/api/found/snapshot`.
5. Нажмите **«Сгенерировать Business API key»** и скопируйте блок `.env`.
6. Выберите тип бизнеса (шаблон) — опционально, только для примера JSON.

### Часть B — на вашем сервере

7. Установите SDK или реализуйте endpoint вручную (см. ниже).
8. Добавьте в `.env` (ключ **не коммитьте**):

```bash
BUSINESS_API_KEY=<ключ из Found>
BUSINESS_SNAPSHOT_PATH=/api/found/snapshot
BUSINESS_NAME=Мой бизнес
FOUND_SANDBOX=1   # пока тестируете
```

9. Опишите метрики — подключите реальные источники (БД, биллинг, мониторинг).
10. Перезапустите сервис.

### Часть C — проверка и подключение

11. Локально:

```bash
curl -sS "https://api.example.com/api/found/snapshot" \
  -H "Authorization: Bearer $BUSINESS_API_KEY" | jq .
```

12. Запрос без ключа должен вернуть **401**.
13. В Found: **«Подключить API»** → **«Протестировать»** → **«Обновить данные»**.
14. Когда всё работает — уберите `FOUND_SANDBOX` / `sandbox: true`.

### Ротация ключа

При генерации нового ключа в Found:

1. Скопируйте новый блок `.env` на сервер бизнеса.
2. Перезапустите бэкенд.
3. В Found нажмите **«Протестировать»** или **«Подключить API»** снова.

Ключ в Found и на сервере бизнеса **должен совпадать**, иначе будет `401`.

---

## Формат snapshot (JSON)

### Минимальный контракт

```json
{
  "business_name": "Мой бизнес",
  "period": "last_24h",
  "health": "ok",
  "kpis": {},
  "issues": []
}
```

### Полный рекомендуемый формат

```json
{
  "meta": {
    "synced_at": "2026-06-30T15:00:00+03:00",
    "sandbox": false
  },
  "business_name": "Мой бизнес",
  "period": "last_24h",
  "health": "ok",
  "kpis": {
    "revenue_rub": { "value": 185000, "label": "Выручка", "unit": "₽", "delta": "+12%" }
  },
  "custom": {
    "returns_count": { "value": 8, "label": "Возвраты" }
  },
  "issues": [
    { "severity": "high", "text": "Возвраты выросли на 40%" }
  ],
  "suggested_actions": [
    "Разобрать причины возвратов"
  ]
}
```

### Поля верхнего уровня

| Поле | Обязательно | Описание |
| --- | --- | --- |
| `business_name` | да | Название бизнеса |
| `period` | да | `last_24h`, `last_7d` и т.п. |
| `health` | да | `ok` \| `warning` \| `critical` |
| `kpis` | да | Основные числовые метрики |
| `issues` | да | Массив проблем (может быть пустым) |
| `custom` | нет | Любые свои метрики — Found покажет автоматически |
| `meta` | нет | `synced_at`, `sandbox` |
| `suggested_actions` | нет | Рекомендации для агента |

### Самодокументируемые метрики

Каждая метрика — число **или** объект:

```json
"mrr_rub": 2740
```

```json
"mrr_rub": { "value": 2740, "label": "MRR", "unit": "₽", "delta": "+5%" }
```

Found берёт `label` и `unit` из ответа. **Не нужно** заранее регистрировать имена полей в Found.

### Куда класть метрики

| Тип | Куда | Примеры |
| --- | --- | --- |
| Универсальные KPI | `kpis` | `revenue_rub`, `orders_count`, `mrr_rub`, `active_subscribers` |
| Специфика бизнеса | `custom` | `vpn_nodes_online`, `returns_pct`, `warehouse_fill_pct` |
| Текст / категории | `custom` | `"top_category": { "value": "Обувь", "label": "Топ-категория" }` |
| Проблемы | `issues` | `[{ "severity": "warning", "text": "…" }]` |

Лимиты: до **60** полей в `kpis`, до **40** в `custom`.

### Известные KPI (красивые подписи по умолчанию)

Found знает эти имена «из коробки» (но любые другие тоже работают):

`active_subscribers`, `new_subscribers`, `churned`, `churn_rate_pct`, `mrr_rub`, `revenue_rub`, `support_tickets_open`, `server_issues`, `website_visits`, `conversion_rate_pct`, `expense_rub`, `turnover_rub`, `net_profit_rub`, `tax_estimate_rub`, `orders_count`, `stock_units`

---

## Интеграция через SDK

### Python (FastAPI)

```bash
pip install "found-sdk[fastapi]"
```

```python
from found_sdk import FoundSnapshot

found = FoundSnapshot.from_env()

@found.kpi("revenue_rub", label="Выручка", unit="₽")
def revenue():
    return shop.today_revenue()

@found.custom("returns_count", label="Возвраты")
def returns():
    return shop.returns_today()

@found.issues
def issues():
    return [{"severity": "high", "text": "Много возвратов"}]

app.include_router(found.fastapi_router())
```

Подробнее: [python/README.md](../python/README.md)

### Node (Express)

```bash
npm install found-sdk
```

```ts
import { FoundSnapshot } from "found-sdk";

const found = FoundSnapshot.fromEnv();
found
  .kpi("revenue_rub", () => shop.todayRevenue(), { label: "Выручка", unit: "₽" })
  .custom("returns_count", () => shop.returnsToday(), { label: "Возвраты" })
  .issues(() => [{ severity: "high", text: "Много возвратов" }]);

app.get(found.snapshotPath, found.expressHandler());
```

Подробнее: [node/README.md](../node/README.md)

### Что делает SDK

- Проверяет `Authorization: Bearer` и `X-API-Key` (constant-time)
- Собирает JSON с `meta.synced_at` и `meta.sandbox`
- Вызывает ваши функции-провайдеры с тайм-аутом
- Если один провайдер упал — остальные метрики всё равно отдаются
- Монтирует endpoint на FastAPI / Flask / Express / Fastify / raw http

### Переменные окружения

| Переменная | Описание |
| --- | --- |
| `BUSINESS_API_KEY` | Ключ из Found (обязательно) |
| `BUSINESS_SNAPSHOT_PATH` | Путь endpoint (по умолчанию `/api/found/snapshot`) |
| `BUSINESS_NAME` | Название бизнеса |
| `FOUND_SANDBOX` | `1` / `true` → режим только чтения |

---

## Интеграция без SDK

Любой язык и фреймворк. Псевдокод:

```python
@app.get("/api/found/snapshot")
def snapshot(request):
    key = extract_bearer_or_x_api_key(request.headers)
    if not secure_compare(key, os.environ["BUSINESS_API_KEY"]):
        return Response(status=401)

    return {
        "meta": {"synced_at": now_iso(), "sandbox": False},
        "business_name": "Мой бизнес",
        "period": "last_24h",
        "health": "ok",
        "kpis": {
            "revenue_rub": {"value": get_revenue(), "label": "Выручка", "unit": "₽"}
        },
        "custom": {},
        "issues": []
    }
```

Заголовки от Found:

```
Authorization: Bearer <BUSINESS_API_KEY>
X-API-Key: <BUSINESS_API_KEY>
Accept: application/json
User-Agent: Found/1.0
```

---

## Примеры по нишам

### VPN / SaaS (подписка)

```json
{
  "kpis": {
    "active_subscribers": { "value": 35, "label": "Платящие" },
    "mrr_rub": { "value": 2740, "label": "MRR", "unit": "₽" },
    "churn_rate_pct": { "value": 2.8, "label": "Churn", "unit": "%" }
  },
  "custom": {
    "trial_active": { "value": 12, "label": "Активных триалов" },
    "vpn_nodes_online": { "value": 14, "label": "VPN-узлов онлайн" },
    "node_uptime_pct": { "value": 99.9, "label": "Аптайм", "unit": "%" }
  }
}
```

### Интернет-магазин

```json
{
  "kpis": {
    "revenue_rub": { "value": 185000, "label": "Выручка", "unit": "₽" },
    "orders_count": { "value": 34, "label": "Заказы" },
    "conversion_rate_pct": { "value": 1.8, "label": "Конверсия", "unit": "%" },
    "website_visits": { "value": 5400, "label": "Визиты" }
  },
  "custom": {
    "returns_count": { "value": 8, "label": "Возвраты" },
    "avg_check_rub": { "value": 5440, "label": "Средний чек", "unit": "₽" },
    "out_of_stock_skus": { "value": 3, "label": "Нет в наличии" }
  }
}
```

### Услуги / офлайн

```json
{
  "kpis": {
    "revenue_rub": { "value": 420000, "label": "Выручка", "unit": "₽" },
    "new_subscribers": { "value": 18, "label": "Новых заявок" }
  },
  "custom": {
    "bookings_today": { "value": 7, "label": "Записей на сегодня" },
    "team_load_pct": { "value": 85, "label": "Загрузка команды", "unit": "%" }
  }
}
```

---

## Безопасность

- Ключ — секрет. Храните в `.env`, не коммитьте в git.
- Endpoint только по **HTTPS**.
- Сравнивайте ключ в **постоянное время** (`hmac.compare_digest` / `crypto.timingSafeEqual`).
- Не логируйте ключ и не возвращайте его в ошибках.
- `FOUND_SANDBOX=1` помечает интеграцию как read-only на стороне Found.
- Опционально: IP-allowlist в SDK (`allowed_ips` / `allowedIps`) — разрешить только egress-IP Found.
- Endpoint по дизайну **read-only** — не выполняйте записи в БД по запросу Found.

---

## Что делает Found с данными

| Действие | Когда |
| --- | --- |
| Кэширует snapshot | После «Подключить API» / «Обновить данные» |
| Показывает KPI и custom | Страница «Мой бизнес», дашборд |
| Агент `get_business_snapshot` | В чате, когда спрашивают про бизнес |
| Утренний брифинг | Telegram, если включён |
| История метрик | Для графиков по стандартным KPI |

Found **не** подключается к произвольным API вашего бизнеса — только к одному snapshot-endpoint. Для других API есть отдельный модуль BYOAPI в Found.

---

## Устранение неполадок

### 401 Unauthorized

| Причина | Решение |
| --- | --- |
| Ключ на сервере ≠ ключ в Found | Скопируйте свежий ключ из Found в `.env`, перезапустите бэкенд |
| Сгенерировали новый ключ, не обновили сервер | Обновите `.env` на бэкенде |
| Неверный заголовок | Принимайте `Authorization: Bearer` и `X-API-Key` |

### Found не может достучаться

| Причина | Решение |
| --- | --- |
| Endpoint только localhost | Нужен публичный HTTPS URL |
| Фаервол | Откройте путь snapshot или добавьте IP Found в allowlist |
| Неверный URL в настройках | Проверьте `API URL` + `snapshot path` |

### Пустые метрики в Found

| Причина | Решение |
| --- | --- |
| Провайдер метрики упал | SDK пропускает поле; проверьте логи бэкенда |
| Не число в `kpis` | Числовые KPI должны быть number; строки — в `custom` |
| Не нажали «Обновить данные» | Snapshot кэшируется — обновите вручную |

### curl работает, Found — нет

- Проверьте, что в Found указан тот же публичный URL, что в curl (не `localhost`).
- Нажмите «Подключить API» заново после смены ключа.

---

## FAQ

**Нужен ли шаблон из настроек Found?**  
Нет. Шаблон — только пример. Любой JSON в формате snapshot работает.

**Можно ли без Python/Node SDK?**  
Да. Любой язык, главное — GET + JSON + проверка ключа.

**Сколько метрик можно передать?**  
До 60 в `kpis`, до 40 в `custom`. Лишние обрезаются.

**Found сам опрашивает endpoint по расписанию?**  
Сейчас — по кнопке «Обновить данные», при подключении и когда агент запрашивает `refresh=true`. Авто-опрос по cron может быть добавлен отдельно.

**Что если бэкенд на Go/PHP/Java?**  
Реализуйте endpoint вручную по контракту выше. SDK пока только Python и Node.

**Где взять ключ?**  
[Found → Настройки → Мой бизнес](https://found.skyvpn2.online/dashboard/settings/business) → «Сгенерировать Business API key».

---

## Ссылки

- [Found](https://found.skyvpn2.online)
- [Python SDK](../python/README.md) · [PyPI](https://pypi.org/project/found-sdk/)
- [Node SDK](../node/README.md) · [npm](https://www.npmjs.com/package/found-sdk)
- [Репозиторий](https://github.com/nikitadyachkov1970-pixel/found-sdk)
