import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:verify-email"), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as { token?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Verification token required." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      emailVerifyToken: token,
      emailVerifyExpiresAt: { gt: new Date() },
    },
    select: { id: true, username: true, emailVerifiedAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired verification link." }, { status: 400 });
  }

  if (user.emailVerifiedAt) {
    return NextResponse.json({ data: { verified: true, username: user.username, alreadyVerified: true } });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    },
  });

  return NextResponse.json({ data: { verified: true, username: user.username, alreadyVerified: false } });
}

