// Minimal Fastify integration with found-sdk.
//
//   npm i fastify found-sdk
//   BUSINESS_API_KEY=<ключ из Found> FOUND_SANDBOX=1 node fastify-app.mjs
//
import Fastify from "fastify";
import { FoundSnapshot } from "found-sdk";

const fastify = Fastify();
const found = FoundSnapshot.fromEnv();

found
  .kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" })
  .custom("server_load_pct", () => 72, { label: "Загрузка серверов", unit: "%" });

fastify.register(found.fastifyPlugin());

fastify.listen({ port: 8000 }, () => console.log("listening on :8000" + found.snapshotPath));
