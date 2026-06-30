import { createServer } from "node:http";
import { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { FoundConfigError, FoundSnapshot } from "../src/index.js";
import { FoundAuthError } from "../src/errors.js";

const KEY = "a".repeat(64);

function makeSdk(overrides = {}): FoundSnapshot {
  const sdk = new FoundSnapshot({
    apiKey: KEY,
    businessName: "SkyVPN",
    sandbox: true,
    ...overrides,
  });
  sdk.kpi("active_subscribers", () => 35, { label: "Активные подписчики", delta: "+1" });
  sdk.kpi("mrr_rub", async () => 2740, { label: "MRR", unit: "₽" });
  sdk.custom("server_load_pct", () => 72, { label: "Загрузка серверов", unit: "%" });
  sdk.issues(() => [{ severity: "warning", text: "Germany #2 CPU 94%" }, "плоская строка"]);
  return sdk;
}

describe("config", () => {
  it("rejects a short key", () => {
    expect(() => new FoundSnapshot({ apiKey: "short" })).toThrow(FoundConfigError);
  });

  it("reads from env", () => {
    const sdk = FoundSnapshot.fromEnv(
      {},
      { BUSINESS_API_KEY: KEY, BUSINESS_NAME: "SkyVPN", FOUND_SANDBOX: "1" } as NodeJS.ProcessEnv,
    );
    expect(sdk.businessName).toBe("SkyVPN");
    expect(sdk.sandbox).toBe(true);
  });
});

describe("auth", () => {
  it("accepts a Bearer token", () => {
    expect(() => makeSdk().authorize({ authorization: `Bearer ${KEY}` })).not.toThrow();
  });

  it("accepts X-API-Key", () => {
    expect(() => makeSdk().authorize({ "x-api-key": KEY })).not.toThrow();
  });

  it("rejects a missing key", () => {
    expect(() => makeSdk().authorize({})).toThrow(FoundAuthError);
  });

  it("rejects a wrong key", () => {
    expect(() => makeSdk().authorize({ authorization: `Bearer ${"b".repeat(64)}` })).toThrow(
      FoundAuthError,
    );
  });

  it("enforces the IP allowlist", () => {
    const sdk = makeSdk({ allowedIps: ["1.2.3.4"] });
    expect(() => sdk.authorize({ "x-api-key": KEY }, "1.2.3.4")).not.toThrow();
    expect(() => sdk.authorize({ "x-api-key": KEY }, "9.9.9.9")).toThrow(FoundAuthError);
  });
});

describe("snapshot", () => {
  it("builds self-documenting structure", async () => {
    const snap = await makeSdk().buildSnapshot();
    expect(snap.meta.sandbox).toBe(true);
    expect(snap.meta.synced_at).toBeTruthy();
    expect(snap.business_name).toBe("SkyVPN");
    expect(snap.kpis.active_subscribers).toEqual({
      value: 35,
      label: "Активные подписчики",
      delta: "+1",
    });
    expect(snap.kpis.mrr_rub.unit).toBe("₽");
    expect(snap.custom.server_load_pct.value).toBe(72);
    expect(snap.issues[0].severity).toBe("warning");
    expect(snap.issues[1]).toEqual({ severity: "medium", text: "плоская строка" });
    expect(snap.health).toBe("warning");
  });

  it("skips a failing provider", async () => {
    const sdk = new FoundSnapshot({ apiKey: KEY });
    sdk.kpi("good", () => 1);
    sdk.kpi("bad", () => {
      throw new Error("boom");
    });
    const snap = await sdk.buildSnapshot();
    expect(snap.kpis.good).toBeDefined();
    expect(snap.kpis.bad).toBeUndefined();
  });

  it("formats a numeric delta with a sign", async () => {
    const sdk = new FoundSnapshot({ apiKey: KEY });
    sdk.kpi("growth", () => 100, { delta: 5 });
    const snap = await sdk.buildSnapshot();
    expect(snap.kpis.growth.delta).toBe("+5");
  });
});

describe("handle", () => {
  it("returns 401 without a key", async () => {
    const { status, body } = await makeSdk().handle({});
    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("returns 200 with a key", async () => {
    const { status, body } = await makeSdk().handle({ authorization: `Bearer ${KEY}` });
    expect(status).toBe(200);
    expect((body as { business_name: string }).business_name).toBe("SkyVPN");
  });
});

describe("node http adapter", () => {
  it("serves the snapshot end-to-end", async () => {
    const server = createServer(makeSdk().nodeHandler());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/api/found/snapshot`;
    try {
      const unauth = await fetch(base);
      expect(unauth.status).toBe(401);

      const ok = await fetch(base, { headers: { authorization: `Bearer ${KEY}` } });
      expect(ok.status).toBe(200);
      const json = (await ok.json()) as { kpis: Record<string, { value: number }> };
      expect(json.kpis.mrr_rub.value).toBe(2740);
    } finally {
      server.close();
    }
  });
});
