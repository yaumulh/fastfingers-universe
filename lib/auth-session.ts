import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_COOKIE_NAME = "ff_auth";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  u: string;
  n: string;
  t: number;
  s: string;
};

const AUTH_SIGNING_SECRET = process.env.AUTH_SIGNING_SECRET || "fastfingers-dev-signing-secret";

function signSession(userId: string, username: string, issuedAt: number): string {
  return createHmac("sha256", AUTH_SIGNING_SECRET)
    .update(`${userId}.${username}.${issuedAt}`)
    .digest("base64url");
}

function verifySignature(userId: string, username: string, issuedAt: number, signature: string): boolean {
  const expected = signSession(userId, username, issuedAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodeSession(value: string): SessionPayload | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as Partial<SessionPayload>;
    if (
      typeof parsed.u !== "string" ||
      typeof parsed.n !== "string" ||
      typeof parsed.t !== "number" ||
      typeof parsed.s !== "string"
    ) {
      return null;
    }
    if (!verifySignature(parsed.u, parsed.n, parsed.t, parsed.s)) {
      return null;
    }
    return { u: parsed.u, n: parsed.n, t: parsed.t, s: parsed.s };
  } catch {
    return null;
  }
}

export function sanitizeUsername(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
}

export function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 12);
}

export async function setAuthSession(userId: string, username: string): Promise<void> {
  const store = await cookies();
  const issuedAt = Date.now();
  const value = encodeSession({
    u: userId,
    n: username,
    t: issuedAt,
    s: signSession(userId, username, issuedAt),
  });
  store.set(AUTH_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAuthSession(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<{ id: string; username: string } | null> {
  const store = await cookies();
  const raw = store.get(AUTH_COOKIE_NAME)?.value;
  if (!raw) {
    return null;
  }

  const payload = decodeSession(raw);
  if (!payload) {
    return null;
  }

  return { id: payload.u, username: payload.n };
}
