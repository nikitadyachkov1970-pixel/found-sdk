import type { IncomingMessage, ServerResponse } from "node:http";

import type { FoundSnapshot } from "../core.js";

/**
 * Build a raw Node `http` request handler. Only responds on the configured
 * snapshot path + GET; other requests get 404 so it can be composed.
 *
 * Usage: `http.createServer(found.nodeHandler()).listen(8000);`
 */
export function createNodeHandler(found: FoundSnapshot) {
  return async function foundSnapshot(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = (req.url ?? "").split("?")[0];
    if (req.method !== "GET" || url !== found.snapshotPath) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const remote = req.socket?.remoteAddress ?? null;
    const { status, body } = await found.handle(req.headers, remote);
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
}
