import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, Bucket>;

declare global {
  // eslint-disable-next-line no-var
  var __fastfingersRateLimitStore: RateLimitStore | undefined;
}

const store: RateLimitStore = globalThis.__fastfingersRateLimitStore ?? new Map<string, Bucket>();
if (!globalThis.__fastfingersRateLimitStore) {
  globalThis.__fastfingersRateLimitStore = store;
}

let lastCleanupAt = 0;

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

export function getRateLimitKey(request: Request, namespace: string, identity?: string | null): string {
  const principal = identity?.trim() || getClientIp(request);
  return `${namespace}:${principal}`;
}

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])

local current = redis.call("GET", key)
if not current then
  redis.call("PSETEX", key, windowMs, 1)
  return {1, limit - 1, windowMs}
end

local count = tonumber(current)
local ttl = redis.call("PTTL", key)
if count >= limit then
  return {0, 0, ttl}
end

count = redis.call("INCR", key)
ttl = redis.call("PTTL", key)
return {1, limit - count, ttl}
`;

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const redis = await getRedisClient();
  if (redis) {
    try {
      const rawResult: unknown = await redis.eval(
        RATE_LIMIT_LUA,
        1,
        `ff:rl:${key}`,
        String(limit),
        String(windowMs),
        String(now),
      );
      if (Array.isArray(rawResult) && rawResult.length >= 3) {
        const ok = Number(rawResult[0]) === 1;
        const remaining = Math.max(0, Number(rawResult[1]) || 0);
        const ttlMs = Math.max(1, Number(rawResult[2]) || windowMs);
        return {
          ok,
          remaining,
          retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
        };
      }
    } catch {
      // Fall back to in-memory limiter.
    }
  }

  cleanupExpiredBuckets(now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  store.set(key, current);
  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function createRateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
