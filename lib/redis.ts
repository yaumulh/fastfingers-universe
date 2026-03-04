type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<number | string>;
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
  quit(): Promise<unknown>;
};

declare global {
  // eslint-disable-next-line no-var
  var __fastfingersRedisClientPromise: Promise<RedisClient | null> | undefined;
}

async function createRedisClient(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  try {
    const mod = await import("ioredis");
    const RedisCtor = mod.default;
    const client = new RedisCtor(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: () => null,
      reconnectOnError: () => false,
    }) as unknown as RedisClient & { connect?: () => Promise<unknown> };
    // Prevent noisy unhandled error events when optional Redis is unavailable.
    (client as unknown as { on?: (event: string, listener: (...args: unknown[]) => void) => void }).on?.("error", () => {});

    if (typeof client.connect === "function") {
      await client.connect();
    }
    return client;
  } catch {
    return null;
  }
}

export async function getRedisClient(): Promise<RedisClient | null> {
  if (!globalThis.__fastfingersRedisClientPromise) {
    globalThis.__fastfingersRedisClientPromise = createRedisClient();
  }
  return globalThis.__fastfingersRedisClientPromise;
}
