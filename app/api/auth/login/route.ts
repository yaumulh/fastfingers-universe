import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeUsername, setAuthSession } from "@/lib/auth-session";
import { sanitizePassword, verifyPassword } from "@/lib/password";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:login"), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as LoginBody;
  const username = sanitizeUsername(body.username);
  const password = sanitizePassword(body.password);

  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Username must be at least 3 characters." },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true, passwordHash: true, isActive: true },
  });
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Account not found. Please register first." },
      { status: 404 },
    );
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Account is disabled. Contact admin." }, { status: 403 });
  }

  await setAuthSession(user.id, user.username);
  return NextResponse.json({
    data: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
  });
}
