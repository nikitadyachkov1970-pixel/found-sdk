// Minimal Express integration with found-sdk.
//
//   npm i express found-sdk
//   BUSINESS_API_KEY=<ключ из Found> FOUND_SANDBOX=1 node express-app.mjs
//
import express from "express";
import { FoundSnapshot } from "found-sdk";

const app = express();
const found = FoundSnapshot.fromEnv(); // reads BUSINESS_API_KEY / BUSINESS_NAME / ...

found
  .kpi("active_subscribers", () => 35, { label: "Активные подписчики", delta: "+1" })
  .kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" })
  .custom("server_load_pct", async () => 72, { label: "Загрузка серверов", unit: "%" })
  .issues(() => [{ severity: "warning", text: "Сервер Germany #2 CPU 94%" }]);

app.get(found.snapshotPath, found.expressHandler());

app.listen(8000, () => console.log("listening on :8000" + found.snapshotPath));
