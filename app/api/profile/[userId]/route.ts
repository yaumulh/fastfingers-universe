import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";

type RouteContext = {
  params: {
    userId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUserId = context.params.userId;
  if (!targetUserId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const [target, isFriend, isCompetitionPeer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        rating: true,
        trustScore: true,
        streakDays: true,
      },
    }),
    prisma.friendRequest.findFirst({
      where: {
        status: "accepted",
        OR: [
          { fromUserId: session.id, toUserId: targetUserId },
          { fromUserId: targetUserId, toUserId: session.id },
        ],
      },
      select: { id: true },
    }),
    prisma.competitionParticipant.findFirst({
      where: {
        userId: session.id,
        competition: {
          participants: {
            some: { userId: targetUserId },
          },
        },
      },
      select: { id: true },
    }),
  ]);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.id !== session.id && !isFriend && !isCompetitionPeer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalTests, aggregate, recentResults, competitionJoined, competitionWins] = await Promise.all([
    prisma.testResult.count({ where: { userId: target.id } }),
    prisma.testResult.aggregate({
      where: { userId: target.id },
      _avg: { wpm: true, accuracy: true },
      _max: { wpm: true },
    }),
    prisma.testResult.findMany({
      where: { userId: target.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { createdAt: true, wpm: true, accuracy: true },
    }),
    prisma.competitionParticipant.count({
      where: { userId: target.id, testsCount: { gt: 0 } },
    }),
    prisma.competitionParticipant.count({
      where: { userId: target.id, isWinner: true },
    }),
  ]);

  const recentCompetitions = await prisma.competitionParticipant.findMany({
    where: {
      userId: target.id,
      testsCount: { gt: 0 },
    },
    orderBy: [{ bestResultAt: "desc" }, { joinedAt: "desc" }],
    take: 8,
    select: {
      bestWpm: true,
      bestAccuracy: true,
      bestResultAt: true,
      isWinner: true,
      competition: {
        select: {
          id: true,
          title: true,
          language: true,
          endsAt: true,
          status: true,
          winnerUserId: true,
        },
      },
    },
  });

  return NextResponse.json({
    data: {
      user: target,
      summary: {
        totalTests,
        avgWpm: Math.round(aggregate._avg.wpm ?? 0),
        avgAccuracy: Math.round(aggregate._avg.accuracy ?? 0),
        bestWpm: Math.round(aggregate._max.wpm ?? 0),
        competitionJoined,
        competitionWins,
      },
      trend: recentResults.map((row) => ({
        date: row.createdAt.toISOString(),
        wpm: Math.round(row.wpm),
        accuracy: Math.round(row.accuracy),
      })),
      recentCompetitions: recentCompetitions.map((row) => ({
        competitionId: row.competition.id,
        title: row.competition.title,
        language: row.competition.language,
        endedAt: row.competition.endsAt.toISOString(),
        status: row.competition.status,
        bestWpm: Math.round(row.bestWpm),
        bestAccuracy: Math.round(row.bestAccuracy),
        bestResultAt: row.bestResultAt?.toISOString() ?? null,
        isWinner: row.isWinner || row.competition.winnerUserId === target.id,
      })),
    },
  });
}
