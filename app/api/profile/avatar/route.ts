import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

function isAllowedImageMime(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "profile:avatar:patch", session.id), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const form = await request.formData();
    const avatar = form.get("avatar");
    if (!(avatar instanceof File)) {
      return NextResponse.json({ error: "Avatar file is required." }, { status: 400 });
    }

    if (!isAllowedImageMime(avatar.type)) {
      return NextResponse.json({ error: "Only PNG, JPG, or WEBP is allowed." }, { status: 400 });
    }

    if (avatar.size <= 0 || avatar.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Avatar size must be between 1 byte and 1MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await avatar.arrayBuffer());
    const avatarUrl = `data:${avatar.type};base64,${bytes.toString("base64")}`;

    const updated = await prisma.user.update({
      where: { id: session.id },
      data: { avatarUrl },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to upload avatar." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "profile:avatar:delete", session.id), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const updated = await prisma.user.update({
    where: { id: session.id },
    data: { avatarUrl: null },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  return NextResponse.json({ data: updated });
}
