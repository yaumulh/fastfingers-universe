import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { createEmailVerificationToken, resolveAppOrigin, sendVerificationEmail } from "@/lib/email-verification";
import { sanitizeUsername } from "@/lib/auth-session";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:resend-verify"), 10, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as { username?: string };
  const username = sanitizeUsername(body.username);
  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, email: true, emailVerifiedAt: true },
  });

  if (!user || !user.email) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ data: { verified: true } });
  }

  const verificationToken = createEmailVerificationToken();
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: verificationToken,
      emailVerifyExpiresAt: verificationExpiresAt,
    },
  });

  const appOrigin = resolveAppOrigin(request.url);
  const verifyUrl = `${appOrigin}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const emailSent = await sendVerificationEmail({
    toEmail: user.email,
    username: user.username,
    verifyUrl,
  });

  return NextResponse.json({
    data: {
      emailSent,
      previewVerifyUrl: emailSent ? null : verifyUrl,
    },
  });
}

