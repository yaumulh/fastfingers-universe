import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, stored] = passwordHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(stored, "hex");
  if (storedBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(derived, storedBuffer);
}

export function sanitizePassword(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}
