import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeUsername, setAuthSession } from "@/lib/auth-session";
import { hashPassword, sanitizePassword } from "@/lib/password";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type RegisterBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:register"), 10, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as RegisterBody;
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

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, passwordHash: true, username: true },
  });

  const nextHash = hashPassword(password);
  let user: { id: string; username: string; displayName: string | null };

  if (!existing) {
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: nextHash,
      },
      select: { id: true, username: true, displayName: true },
    });
  } else if (!existing.passwordHash) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: nextHash },
      select: { id: true, username: true, displayName: true },
    });
  } else {
    return NextResponse.json({ error: "Username already registered." }, { status: 409 });
  }

  await setAuthSession(user.id, user.username);
  return NextResponse.json({ data: user }, { status: 201 });
}
