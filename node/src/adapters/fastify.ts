import type { FoundSnapshot } from "../core.js";

interface FastifyReqLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}
interface FastifyReplyLike {
  code(statusCode: number): FastifyReplyLike;
  send(body: unknown): unknown;
}
interface FastifyLike {
  get(path: string, handler: (req: FastifyReqLike, reply: FastifyReplyLike) => unknown): unknown;
}

/**
 * Build a Fastify plugin that registers `GET <snapshotPath>`.
 * Usage: `fastify.register(found.fastifyPlugin());`
 */
export function createFastifyPlugin(found: FoundSnapshot) {
  return function foundPlugin(
    fastify: FastifyLike,
    _opts: unknown,
    done: (err?: Error) => void,
  ): void {
    fastify.get(found.snapshotPath, async (req, reply) => {
      const { status, body } = await found.handle(req.headers, req.ip ?? null);
      return reply.code(status).send(body);
    });
    done();
  };
}
