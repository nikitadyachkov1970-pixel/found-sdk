/**
 * found-sdk — expose your business metrics to Found in a few lines.
 *
 * @example
 * import { FoundSnapshot } from "found-sdk";
 * const found = FoundSnapshot.fromEnv();
 * found.kpi("mrr_rub", () => 2740, { label: "MRR", unit: "₽" });
 * app.get(found.snapshotPath, found.expressHandler());
 */
export { DEFAULT_SNAPSHOT_PATH, FoundSnapshot } from "./core.js";
export type { HandleResult } from "./core.js";
export { FoundAuthError, FoundConfigError, FoundSdkError } from "./errors.js";
export type {
  FoundSnapshotOptions,
  HeaderBag,
  HealthProvider,
  Issue,
  IssuesProvider,
  MetricField,
  MetricOptions,
  MetricValue,
  Provider,
  Snapshot,
} from "./types.js";
