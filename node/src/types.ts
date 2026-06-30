/** Public types for found-sdk. */

export type MetricValue = number | string | boolean | null;

/** A provider returns a metric value; it may be sync or async. */
export type Provider<T = MetricValue> = () => T | Promise<T>;

export interface MetricOptions {
  label?: string;
  unit?: string;
  /** Static string/number, or a function returning one (e.g. "+1"). */
  delta?: string | number | (() => string | number);
}

export interface Issue {
  severity: string;
  text: string;
}

/** Provider returning the list of current problems. */
export type IssuesProvider = () => (Issue | string)[] | Promise<(Issue | string)[]>;

/** Provider returning health: "ok" | "warning" | "critical". */
export type HealthProvider = () => string | Promise<string>;

export interface FoundSnapshotOptions {
  apiKey: string;
  businessName?: string;
  period?: string;
  sandbox?: boolean;
  snapshotPath?: string;
  /** Restrict inbound requests to these IPs (e.g. Found egress IP). */
  allowedIps?: string[];
  /** Per-provider soft timeout in milliseconds (0 disables). */
  providerTimeoutMs?: number;
}

/** A self-documenting metric field as understood by Found. */
export interface MetricField {
  value: MetricValue;
  label?: string;
  unit?: string;
  delta?: string;
}

export interface Snapshot {
  meta: { synced_at: string; sandbox: boolean };
  business_name: string;
  period: string;
  health: string;
  kpis: Record<string, MetricField>;
  custom: Record<string, MetricField>;
  issues: Issue[];
}

/** Minimal header bag accepted by handle() — values may be string or string[]. */
export type HeaderBag =
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null }
  | Iterable<[string, string]>;
