# found-sdk (Node / TypeScript)

Отдавай метрики своего бизнеса в [Found](https://found.skyvpn2.online) в несколько строк —
без ручного endpoint'а, без возни с авторизацией и форматом JSON.

```
npm install found-sdk
```

> Python-версия живёт в [`found-sdk`](https://pypi.org/project/found-sdk/) (`pip install found-sdk`).

## Как это работает

Found **читает** (pull) метрики с твоего бэкенда: раз в N часов делает
`GET <твой_url>/api/found/snapshot` с заголовком `Authorization: Bearer <ключ>`.
`found-sdk` поднимает этот endpoint за тебя: проверяет ключ, собирает
самодокументируемый JSON и отдаёт его Found. Ты только описываешь метрики.

## Быстрый старт (Express)

```ts
import express from "express";
import { FoundSnapshot } from "found-sdk";

const app = express();
const found = FoundSnapshot.fromEnv(); // читает BUSINESS_API_KEY / BUSINESS_NAME / ...

found
  .kpi("active_subscribers", () => db.countActive(), { label: "Активные подписчики", delta: "+1" })
  .kpi("mrr_rub", () => billing.mrr(), { label: "MRR", unit: "₽" })
  .custom("server_load_pct", async () => monitoring.avgCpu(), { label: "Загрузка серверов", unit: "%" })
  .issues(() => [{ severity: "warning", text: "Сервер Germany #2 CPU 94%" }]);

app.get(found.snapshotPath, found.expressHandler());
app.listen(8000);
```

## Fastify

```ts
import Fastify from "fastify";
import { FoundSnapshot } from "found-sdk";

const fastify = Fastify();
const found = FoundSnapshot.fromEnv();
found.kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" });

fastify.register(found.fastifyPlugin());
fastify.listen({ port: 8000 });
```

## Raw Node http / любой фреймворк

```ts
import http from "node:http";
http.createServer(found.nodeHandler()).listen(8000);

// или вручную в своём роутере:
const { status, body } = await found.handle(req.headers, req.socket.remoteAddress);
res.writeHead(status, { "content-type": "application/json" });
res.end(JSON.stringify(body));
```

## Настройка

`FoundSnapshot.fromEnv()` читает переменные из блока `.env`, который выдаёт Found:

| Переменная               | Назначение                                   |
| ------------------------ | -------------------------------------------- |
| `BUSINESS_API_KEY`       | Ключ из Found (обязательно)                  |
| `BUSINESS_SNAPSHOT_PATH` | Путь endpoint'а (по умолчанию `/api/found/snapshot`) |
| `BUSINESS_NAME`          | Название бизнеса                             |
| `FOUND_SANDBOX`          | `1`/`true` → режим только чтения             |

Либо явно:

```ts
const found = new FoundSnapshot({
  apiKey: process.env.BUSINESS_API_KEY!,
  businessName: "SkyVPN",
  sandbox: true,
  allowedIps: ["203.0.113.10"], // необязательно: разрешить только egress-IP Found
  providerTimeoutMs: 5000,       // мягкий тайм-аут на каждый провайдер метрики
});
```

Провайдеры метрик могут быть **синхронными или async** — SDK их дождётся.

## Безопасность

- **Сравнение ключа** через `crypto.timingSafeEqual` — без тайм-атак.
- **Ключ никогда не логируется** и не попадает в ошибки.
- **Sandbox** (`FOUND_SANDBOX=1`) → `meta.sandbox=true`, Found только читает.
- **Read-only**: endpoint ничего не меняет в твоём бизнесе by design.
- **IP-allowlist** (опционально): ограничь доступ egress-адресом Found.
- **Изоляция сбоев**: упавший или зависший провайдер пропускается, остальной snapshot отдаётся.

Запускай endpoint **только по HTTPS**.

## Формат ответа

```json
{
  "meta":   { "synced_at": "2026-06-30T15:00:00.000Z", "sandbox": true },
  "business_name": "SkyVPN",
  "period": "last_24h",
  "health": "warning",
  "kpis":   { "mrr_rub": { "value": 2740, "label": "MRR", "unit": "₽" } },
  "custom": { "server_load_pct": { "value": 72, "label": "Загрузка серверов", "unit": "%" } },
  "issues": [{ "severity": "warning", "text": "Germany #2 CPU 94%" }]
}
```

Агент видит кастомные поля как `business.custom.server_load_pct` — новые метрики
добавляются без правок кода Found.

## Разработка

```
npm install
npm run build
npm test
```
