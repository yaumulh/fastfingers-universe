import { getRedisClient } from "@/lib/redis";

type TypingStore = Map<string, number>;

declare global {
  // eslint-disable-next-line no-var
  var __fastfingersTypingStore: TypingStore | undefined;
}

const memoryStore: TypingStore = globalThis.__fastfingersTypingStore ?? new Map<string, number>();
if (!globalThis.__fastfingersTypingStore) {
  globalThis.__fastfingersTypingStore = memoryStore;
}

function key(conversationId: string, userId: string): string {
  return `ff:msg:typing:${conversationId}:${userId}`;
}

function nowMs(): number {
  return Date.now();
}

function cleanupMemoryStore(now: number): void {
  for (const [k, expiresAt] of memoryStore.entries()) {
    if (expiresAt <= now) {
      memoryStore.delete(k);
    }
  }
}

export async function setTypingPresence(conversationId: string, userId: string, ttlSeconds = 6): Promise<void> {
  const redis = await getRedisClient();
  const redisKey = key(conversationId, userId);
  if (redis) {
    try {
      await redis.set(redisKey, String(nowMs()), "EX", Math.max(1, ttlSeconds));
      return;
    } catch {
      // Fall back to in-memory presence.
    }
  }

  const now = nowMs();
  cleanupMemoryStore(now);
  memoryStore.set(redisKey, now + ttlSeconds * 1000);
}

export async function clearTypingPresence(conversationId: string, userId: string): Promise<void> {
  const redis = await getRedisClient();
  const redisKey = key(conversationId, userId);
  if (redis) {
    try {
      await redis.del(redisKey);
      return;
    } catch {
      // Fall back to in-memory presence.
    }
  }
  memoryStore.delete(redisKey);
}

export async function isTypingPresent(conversationId: string, userId: string): Promise<boolean> {
  const redis = await getRedisClient();
  const redisKey = key(conversationId, userId);
  if (redis) {
    try {
      const value = await redis.get(redisKey);
      return Boolean(value);
    } catch {
      // Fall back to in-memory presence.
    }
  }

  const now = nowMs();
  cleanupMemoryStore(now);
  const expiresAt = memoryStore.get(redisKey);
  return Boolean(expiresAt && expiresAt > now);
}

