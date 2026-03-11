import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLevelProgress } from "@/lib/user-level";

type RouteContext = {
  params: {
    username: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const slug = decodeURIComponent((context.params.username ?? "").trim());
  if (!slug) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: slug }, { displayName: slug }],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isActive: true,
      rating: true,
      trustScore: true,
      totalXp: true,
      streakDays: true,
      createdAt: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const [totalTests, aggregate, recentResults, competitionJoined, competitionWins, recentCompetitions] = await Promise.all([
    prisma.testResult.count({ where: { userId: user.id } }),
    prisma.testResult.aggregate({
      where: { userId: user.id },
      _avg: { wpm: true, accuracy: true },
      _max: { wpm: true },
    }),
    prisma.testResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, wpm: true, accuracy: true, difficulty: true, language: true, duration: true },
    }),
    prisma.competitionParticipant.count({
      where: { userId: user.id, testsCount: { gt: 0 } },
    }),
    prisma.competitionParticipant.count({
      where: { userId: user.id, isWinner: true },
    }),
    prisma.competitionParticipant.findMany({
      where: {
        userId: user.id,
        testsCount: { gt: 0 },
      },
      orderBy: [{ bestResultAt: "desc" }, { joinedAt: "desc" }],
      take: 5,
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
    }),
  ]);

  return NextResponse.json({
    data: {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        rating: user.rating,
        trustScore: user.trustScore,
        totalXp: user.totalXp,
        streakDays: user.streakDays,
        createdAt: user.createdAt.toISOString(),
        level: getLevelProgress(user.totalXp),
      },
      summary: {
        totalTests,
        avgWpm: Math.round(aggregate._avg.wpm ?? 0),
        avgAccuracy: Math.round(aggregate._avg.accuracy ?? 0),
        bestWpm: Math.round(aggregate._max.wpm ?? 0),
        competitionJoined,
        competitionWins,
      },
      trend: recentResults
        .reverse()
        .map((row) => ({
          date: row.createdAt.toISOString(),
          wpm: Math.round(row.wpm),
          accuracy: Math.round(row.accuracy),
          mode: row.difficulty === "hard" ? "advanced" : "normal",
          language: row.language,
          duration: row.duration,
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
        isWinner: row.isWinner || row.competition.winnerUserId === user.id,
      })),
    },
  });
}
