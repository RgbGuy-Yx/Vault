import { Redis } from "@upstash/redis";

declare global {
  var __redis__: Redis | undefined;
}

let redis: Redis | undefined;

function initRedis(): Redis {
  if (redis) return redis;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!upstashUrl || !upstashToken) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set",
    );
  }

  redis = globalThis.__redis__ ?? new Redis({ url: upstashUrl, token: upstashToken });
  globalThis.__redis__ = redis;
  return redis;
}

export function getRedis() {
  return initRedis();
}
