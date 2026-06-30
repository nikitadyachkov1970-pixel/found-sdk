import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createExpressHandler } from "./adapters/express.js";
import { createFastifyPlugin } from "./adapters/fastify.js";
import { createNodeHandler } from "./adapters/node-http.js";
import { FoundAuthError, FoundConfigError } from "./errors.js";
import type {
  FoundSnapshotOptions,
  HeaderBag,
  HealthProvider,
  Issue,
  IssuesProvider,
  MetricField,
  MetricOptions,
  Provider,
  Snapshot,
} from "./types.js";

export const DEFAULT_SNAPSHOT_PATH = "/api/found/snapshot";

interface Metric {
  key: string;
  provider: Provider;
  options: MetricOptions;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatDelta(delta: MetricOptions["delta"]): string | undefined {
  if (delta === undefined || delta === null) return undefined;
  let resolved: string | number;
  if (typeof delta === "function") {
    try {
      resolved = delta();
    } catch {
      return undefined;
    }
  } else {
    resolved = delta;
  }
  if (resolved === "" || resolved === null || resolved === undefined) return undefined;
  if (typeof resolved === "number") {
    const sign = resolved > 0 ? "+" : "";
    return `${sign}${resolved}`.slice(0, 60);
  }
  return String(resolved).slice(0, 60);
}

/** Normalize any supported header container to a lower-cased plain object. */
function normalizeHeaders(headers: HeaderBag | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  // Web/Fetch Headers or anything exposing get() — handled via known keys below.
  if (typeof (headers as { get?: unknown }).get === "function") {
    const getter = headers as { get(name: string): string | null };
    for (const name of ["authorization", "x-api-key"]) {
      const value = getter.get(name);
      if (value != null) out[name] = String(value);
    }
    return out;
  }

  // Iterable of [key, value] pairs.
  if (typeof (headers as Iterable<[string, string]>)[Symbol.iterator] === "function") {
    for (const [key, value] of headers as Iterable<[string, string]>) {
      out[String(key).toLowerCase()] = String(value);
    }
    return out;
  }

  // Plain object (e.g. Node's req.headers).
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value == null) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

function extractKey(headers: Record<string, string>): string {
  const auth = headers["authorization"] ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return (headers["x-api-key"] ?? "").trim();
}

/** Constant-time string comparison that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison to keep timing roughly constant, then fail.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return promise;
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface HandleResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Configure once, register metrics, mount on your framework.
 *
 * @example
 * const found = new FoundSnapshot({ apiKey: process.env.BUSINESS_API_KEY!, sandbox: true });
 * found.kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" });
 * app.get(found.snapshotPath, found.expressHandler());
 */
export class FoundSnapshot {
  readonly snapshotPath: string;
  readonly businessName: string;
  readonly period: string;
  readonly sandbox: boolean;
  readonly allowedIps: Set<string> | null;
  readonly providerTimeoutMs: number;

  private readonly apiKey: string;
  private readonly kpis = new Map<string, Metric>();
  private readonly customMetrics = new Map<string, Metric>();
  private issuesProvider: IssuesProvider | null = null;
  private healthProvider: HealthProvider | null = null;

  constructor(options: FoundSnapshotOptions) {
    const apiKey = (options.apiKey ?? "").trim();
    if (apiKey.length < 8) {
      throw new FoundConfigError(
        "apiKey is missing or too short — paste the Business API key from Found",
      );
    }
    this.apiKey = apiKey;
    this.businessName = options.businessName ?? "";
    this.period = options.period ?? "last_24h";
    this.sandbox = Boolean(options.sandbox);
    const path = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
    this.snapshotPath = path.startsWith("/") ? path : `/${path}`;
    this.allowedIps = options.allowedIps ? new Set(options.allowedIps) : null;
    this.providerTimeoutMs = options.providerTimeoutMs ?? 5000;
  }

  /** Build from environment variables produced by Found's `.env` block. */
  static fromEnv(
    overrides: Partial<FoundSnapshotOptions> = {},
    env: NodeJS.ProcessEnv = process.env,
  ): FoundSnapshot {
    const sandbox = ["1", "true", "yes"].includes(String(env.FOUND_SANDBOX ?? "").toLowerCase());
    return new FoundSnapshot({
      apiKey: env.BUSINESS_API_KEY ?? "",
      businessName: env.BUSINESS_NAME ?? "",
      snapshotPath: env.BUSINESS_SNAPSHOT_PATH ?? DEFAULT_SNAPSHOT_PATH,
      sandbox,
      ...overrides,
    });
  }

  // ---------------------------------------------------------------- //
  // Registration
  // ---------------------------------------------------------------- //
  kpi(key: string, provider: Provider, options: MetricOptions = {}): this {
    this.kpis.set(key, { key, provider, options });
    return this;
  }

  custom(key: string, provider: Provider, options: MetricOptions = {}): this {
    this.customMetrics.set(key, { key, provider, options });
    return this;
  }

  issues(provider: IssuesProvider): this {
    this.issuesProvider = provider;
    return this;
  }

  health(provider: HealthProvider): this {
    this.healthProvider = provider;
    return this;
  }

  // ---------------------------------------------------------------- //
  // Auth (shared key, constant-time)
  // ---------------------------------------------------------------- //
  authorize(headers: HeaderBag, remoteAddr?: string | null): void {
    const norm = normalizeHeaders(headers);
    const provided = extractKey(norm);
    if (!provided || !safeEqual(provided, this.apiKey)) {
      throw new FoundAuthError("invalid or missing API key");
    }
    if (this.allowedIps && (!remoteAddr || !this.allowedIps.has(remoteAddr))) {
      throw new FoundAuthError("request IP is not allowed");
    }
  }

  // ---------------------------------------------------------------- //
  // Snapshot assembly
  // ---------------------------------------------------------------- //
  private async emit(metric: Metric): Promise<MetricField | null> {
    let value: MetricField["value"];
    try {
      value = (await withTimeout(
        Promise.resolve().then(() => metric.provider()),
        this.providerTimeoutMs,
      )) as MetricField["value"];
    } catch {
      return null; // one bad metric must not break the snapshot
    }
    const field: MetricField = { value };
    if (metric.options.label) field.label = metric.options.label;
    if (metric.options.unit) field.unit = metric.options.unit;
    const delta = formatDelta(metric.options.delta);
    if (delta !== undefined) field.delta = delta;
    return field;
  }

  private async buildIssues(): Promise<Issue[]> {
    if (!this.issuesProvider) return [];
    let raw: (Issue | string)[];
    try {
      raw = (await withTimeout(
        Promise.resolve().then(() => this.issuesProvider!()),
        this.providerTimeoutMs,
      )) ?? [];
    } catch {
      return [];
    }
    const issues: Issue[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        if (item.trim()) issues.push({ severity: "medium", text: item.trim() });
      } else if (item && item.text) {
        issues.push({ severity: String(item.severity ?? "medium"), text: String(item.text) });
      }
    }
    return issues;
  }

  async buildSnapshot(): Promise<Snapshot> {
    const kpis: Record<string, MetricField> = {};
    for (const [key, metric] of this.kpis) {
      const field = await this.emit(metric);
      if (field) kpis[key] = field;
    }

    const custom: Record<string, MetricField> = {};
    for (const [key, metric] of this.customMetrics) {
      const field = await this.emit(metric);
      if (field) custom[key] = field;
    }

    const issues = await this.buildIssues();

    let health: string;
    if (this.healthProvider) {
      try {
        health = String(
          (await withTimeout(
            Promise.resolve().then(() => this.healthProvider!()),
            this.providerTimeoutMs,
          )) ?? "",
        ).toLowerCase();
      } catch {
        health = "";
      }
      if (!["ok", "warning", "critical"].includes(health)) {
        health = issues.length ? "warning" : "ok";
      }
    } else {
      health = issues.length ? "warning" : "ok";
    }

    return {
      meta: { synced_at: nowIso(), sandbox: this.sandbox },
      business_name: this.businessName || "Бизнес",
      period: this.period,
      health,
      kpis,
      custom,
      issues,
    };
  }

  // ---------------------------------------------------------------- //
  // Framework-agnostic handler
  // ---------------------------------------------------------------- //
  async handle(headers: HeaderBag, remoteAddr?: string | null): Promise<HandleResult> {
    try {
      this.authorize(headers, remoteAddr);
    } catch {
      return { status: 401, body: { error: "unauthorized" } };
    }
    return { status: 200, body: (await this.buildSnapshot()) as unknown as Record<string, unknown> };
  }

  // ---------------------------------------------------------------- //
  // Adapters (lazy imports so express/fastify stay optional)
  // ---------------------------------------------------------------- //
  /** Express request handler — mount with `app.get(found.snapshotPath, found.expressHandler())`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expressHandler(): (req: any, res: any) => Promise<void> {
    return createExpressHandler(this);
  }

  /** Fastify plugin — register with `fastify.register(found.fastifyPlugin())`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastifyPlugin(): (fastify: any, opts: any, done: (err?: Error) => void) => void {
    return createFastifyPlugin(this);
  }

  /** Raw Node http handler — `http.createServer(found.nodeHandler())`. */
  nodeHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    return createNodeHandler(this);
  }
}
