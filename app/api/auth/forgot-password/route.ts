import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { createPasswordResetToken, resolveAppOrigin, sendPasswordResetEmail } from "@/lib/email-verification";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:forgot-password"), 10, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as { email?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, displayName: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ data: { ok: true } });
  }

  const token = createPasswordResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    },
  });

  const appOrigin = resolveAppOrigin(request.url);
  const resetUrl = `${appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  const emailSent = await sendPasswordResetEmail({
    toEmail: user.email ?? email,
    username: user.displayName ?? user.username,
    resetUrl,
  });

  return NextResponse.json({
    data: {
      ok: true,
      emailSent,
      previewResetUrl: emailSent ? null : resetUrl,
    },
  });
}

