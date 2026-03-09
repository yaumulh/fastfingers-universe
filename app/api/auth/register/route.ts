import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeUsername } from "@/lib/auth-session";
import { hashPassword, sanitizePassword } from "@/lib/password";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
  createEmailVerificationToken,
  normalizeEmail,
  resolveAppOrigin,
  sendVerificationEmail,
} from "@/lib/email-verification";

type RegisterBody = {
  username?: string;
  password?: string;
  email?: string;
};

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:register"), 10, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as RegisterBody;
  const username = sanitizeUsername(body.username);
  const password = sanitizePassword(body.password);
  let email: string | null = null;
  try {
    email = normalizeEmail(body.email);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid email format." },
      { status: 400 },
    );
  }

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
  if (!email) {
    return NextResponse.json(
      { error: "Email is required." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, passwordHash: true, username: true },
  });

  const nextHash = hashPassword(password);
  const verificationToken = createEmailVerificationToken();
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; email: string | null };

  try {
    if (!existing) {
      user = await prisma.user.create({
        data: {
          username,
          passwordHash: nextHash,
          email,
          emailVerifiedAt: null,
          emailVerifyToken: verificationToken,
          emailVerifyExpiresAt: verificationExpiresAt,
        },
        select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
      });
    } else if (!existing.passwordHash) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: nextHash,
          email,
          emailVerifiedAt: null,
          emailVerifyToken: verificationToken,
          emailVerifyExpiresAt: verificationExpiresAt,
        },
        select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
      });
    } else {
      return NextResponse.json({ error: "Username already registered." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Username or email already registered." }, { status: 409 });
  }

  const appOrigin = resolveAppOrigin(request.url);
  const verifyUrl = `${appOrigin}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const emailSent = await sendVerificationEmail({
    toEmail: email,
    username: user.displayName ?? user.username,
    verifyUrl,
  });

  return NextResponse.json(
    {
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        email: user.email,
        verificationRequired: true,
        emailSent,
        previewVerifyUrl: emailSent ? null : verifyUrl,
      },
    },
    { status: 201 },
  );
}
