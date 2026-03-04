import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateAfterMultiplayerMatch } from "@/lib/user-progress";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache, invalidateCachePrefixAsync } from "@/lib/response-cache";

type FinishedPayload = {
  roomId: string;
  startedAt: number | null;
  finishedAt: number;
  winnerId: string | null;
  winnerName: string | null;
  participants: Array<{
    playerId: string;
    name: string;
    progress: number;
    wpm: number;
    finishedAt: number | null;
  }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "multiplayer-matches:get"), 180, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "all";
  const limitRaw = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 30;
  const sort = url.searchParams.get("sort") ?? "recent";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const seasonStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const createdAtFilter =
    period === "today"
      ? { gte: today }
      : period === "weekly"
        ? { gte: weekAgo }
        : period === "season"
          ? { gte: seasonStart }
          : undefined;

  const cacheKey = `multiplayer-matches:get:${url.searchParams.toString()}`;
  const data = await getOrSetCache(cacheKey, 5_000, async () => {
    return prisma.multiplayerMatch.findMany({
      where: createdAtFilter ? { createdAt: createdAtFilter } : undefined,
      orderBy: sort === "top" ? [{ participants: { _count: "desc" } }, { finishedAt: "desc" }] : [{ finishedAt: "desc" }],
      take: limit,
      include: {
        participants: {
          orderBy: [{ isWinner: "desc" }, { progress: "desc" }, { wpm: "desc" }],
        },
      },
    });
  });

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "multiplayer-matches:post"), 120, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as Partial<FinishedPayload>;

  if (
    typeof body.roomId !== "string" ||
    !isFiniteNumber(body.finishedAt) ||
    !Array.isArray(body.participants) ||
    body.participants.length < 1
  ) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const normalizedParticipants = body.participants
    .filter((item) => typeof item?.playerId === "string" && typeof item?.name === "string")
    .map((item) => ({
      playerId: item.playerId.slice(0, 64),
      playerName: item.name.trim().slice(0, 32) || "Player",
      progress: isFiniteNumber(item.progress) ? Math.min(Math.max(item.progress, 0), 100) : 0,
      wpm: isFiniteNumber(item.wpm) ? Math.max(item.wpm, 0) : 0,
      finishedAt: isFiniteNumber(item.finishedAt) ? new Date(item.finishedAt) : null,
      isWinner: item.playerId === body.winnerId,
    }));

  if (normalizedParticipants.length < 1) {
    return NextResponse.json({ error: "Participants missing." }, { status: 400 });
  }

  const existing = await prisma.multiplayerMatch.findFirst({
    where: {
      roomId: body.roomId.slice(0, 12),
      finishedAt: new Date(body.finishedAt),
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ data: existing, duplicate: true }, { status: 200 });
  }

  const created = await prisma.multiplayerMatch.create({
    data: {
      roomId: body.roomId.slice(0, 12),
      startedAt: isFiniteNumber(body.startedAt) ? new Date(body.startedAt) : null,
      finishedAt: new Date(body.finishedAt),
      winnerId: typeof body.winnerId === "string" ? body.winnerId.slice(0, 64) : null,
      winnerName: typeof body.winnerName === "string" ? body.winnerName.slice(0, 32) : null,
      participants: {
        create: normalizedParticipants,
      },
    },
    include: {
      participants: true,
    },
  });

  await updateAfterMultiplayerMatch({
    winnerName: created.winnerName,
    participants: normalizedParticipants.map((participant) => ({
      name: participant.playerName,
      wpm: participant.wpm,
    })),
  });

  await invalidateCachePrefixAsync("multiplayer-matches:get:");
  await invalidateCachePrefixAsync("home-snapshot:get");

  return NextResponse.json({ data: created }, { status: 201 });
}
