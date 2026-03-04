import { getRedisClient } from "@/lib/redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheStore = Map<string, CacheEntry<unknown>>;
type InflightStore = Map<string, Promise<unknown>>;

declare global {
  // eslint-disable-next-line no-var
  var __fastfingersResponseCache: CacheStore | undefined;
  // eslint-disable-next-line no-var
  var __fastfingersResponseInflight: InflightStore | undefined;
}

const cache: CacheStore = globalThis.__fastfingersResponseCache ?? new Map<string, CacheEntry<unknown>>();
if (!globalThis.__fastfingersResponseCache) {
  globalThis.__fastfingersResponseCache = cache;
}

const inflight: InflightStore = globalThis.__fastfingersResponseInflight ?? new Map<string, Promise<unknown>>();
if (!globalThis.__fastfingersResponseInflight) {
  globalThis.__fastfingersResponseInflight = inflight;
}

let lastCleanupAt = 0;

function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export async function getOrSetCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  cleanupExpiredEntries(now);
  const redisKey = `ff:cache:${key}`;
  const redis = await getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch {
      // Continue with local/in-flight fallback.
    }
  }

  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.value as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return (await pending) as T;
  }

  const nextPromise = loader()
    .then(async (value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      if (redis) {
        try {
          await redis.set(redisKey, JSON.stringify(value), "EX", Math.max(1, Math.ceil(ttlMs / 1000)));
        } catch {
          // Ignore cache set failures.
        }
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, nextPromise);
  return (await nextPromise) as T;
}

export function invalidateCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export async function invalidateCachePrefixAsync(prefix: string) {
  invalidateCachePrefix(prefix);

  const redis = await getRedisClient();
  if (!redis) return;

  let cursor = "0";
  const pattern = `ff:cache:${prefix}*`;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Ignore redis cache invalidation errors.
  }
}
