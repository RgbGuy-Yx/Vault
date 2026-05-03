import { Redis } from "@upstash/redis";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

declare global {
  var __redis__: Redis | undefined;
}

const redis =
  globalThis.__redis__ ??
  (upstashUrl && upstashToken
    ? new Redis({
        url: upstashUrl,
        token: upstashToken,
      })
    : undefined);

if (redis) {
  globalThis.__redis__ = redis;
}

export function getRedis() {
  if (!redis) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set",
    );
  }

  return redis;
}
