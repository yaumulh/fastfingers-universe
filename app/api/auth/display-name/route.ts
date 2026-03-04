import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sanitizeDisplayName } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type Body = {
  displayName?: string;
};

const DISPLAY_NAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "auth:display-name:patch", session.id), 30, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as Body;
  const displayName = sanitizeDisplayName(body.displayName);

  if (!displayName || displayName.length < 3) {
    return NextResponse.json({ error: "Display name must be 3-12 characters." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, displayName: true, displayNameUpdatedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.displayName && user.displayName.toLowerCase() === displayName.toLowerCase()) {
    return NextResponse.json({
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        displayNameUpdatedAt: user.displayNameUpdatedAt,
      },
    });
  }

  if (user.displayName && user.displayNameUpdatedAt) {
    const nextAllowedAt = new Date(user.displayNameUpdatedAt.getTime() + DISPLAY_NAME_COOLDOWN_MS);
    if (nextAllowedAt.getTime() > Date.now()) {
      return NextResponse.json(
        {
          error: `Display name can be changed every 7 days. Next change: ${nextAllowedAt.toISOString()}.`,
          nextAllowedAt: nextAllowedAt.toISOString(),
        },
        { status: 429 },
      );
    }
  }

  let updated: { id: string; username: string; displayName: string | null; displayNameUpdatedAt: Date | null };
  try {
    updated = await prisma.user.update({
      where: { id: session.id },
      data: { displayName, displayNameUpdatedAt: new Date() },
      select: { id: true, username: true, displayName: true, displayNameUpdatedAt: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Display name is already used." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ data: updated });
}
