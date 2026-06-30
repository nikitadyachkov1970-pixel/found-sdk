import type { FoundSnapshot } from "../core.js";

// Minimal structural types so we don't depend on @types/express.
interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}
interface ResLike {
  status(code: number): ResLike;
  json(body: unknown): unknown;
}

/** Build an Express-compatible request handler for the snapshot endpoint. */
export function createExpressHandler(found: FoundSnapshot) {
  return async function foundSnapshot(req: ReqLike, res: ResLike): Promise<void> {
    const remote = req.ip ?? req.socket?.remoteAddress ?? null;
    const { status, body } = await found.handle(req.headers, remote);
    res.status(status).json(body);
  };
}
