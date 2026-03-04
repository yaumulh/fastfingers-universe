import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

function clampLimit(value: string | null, fallback = 40): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "notifications:get", session.id), 180, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"), 40);
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";

  const where = {
    userId: session.id,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        isRead: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.notification.count({ where: { userId: session.id, isRead: false } }),
  ]);

  return NextResponse.json({ data: rows, summary: { unreadCount } });
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "notifications:patch", session.id), 120, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const body = (await request.json()) as { all?: boolean; ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

  if (!body.all && ids.length === 0) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const where = body.all
    ? { userId: session.id, isRead: false }
    : { userId: session.id, id: { in: ids }, isRead: false };

  const result = await prisma.notification.updateMany({
    where,
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: session.id, isRead: false },
  });

  return NextResponse.json({ data: { updated: result.count, unreadCount } });
}

