import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { missionCatalog } from "@/lib/user-progress";
import { prisma } from "@/lib/prisma";

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const ACHIEVEMENT_LABELS: Record<string, string> = {
  wpm_100: "Hit 100 WPM",
  accuracy_98: "98% Accuracy",
  zero_mistake: "Zero Mistake Run",
  multiplayer_win: "First Multiplayer Win",
  multiplayer_120: "120 WPM in Multiplayer",
  streak_3: "3-Day Streak",
};
const DISPLAY_NAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      achievements: {
        orderBy: { unlockedAt: "desc" },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const [totalTests, aggregate, recentResults, competitionJoined, competitionWins] = await Promise.all([
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
      select: { createdAt: true, wpm: true, accuracy: true, difficulty: true },
    }),
    prisma.competitionParticipant.count({
      where: { userId: user.id, testsCount: { gt: 0 } },
    }),
    prisma.competitionParticipant.count({
      where: { userId: user.id, isWinner: true },
    }),
  ]);

  const recentCompetitions = await prisma.competitionParticipant.findMany({
    where: {
      userId: user.id,
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

  const todayKey = dayKeyFor(new Date());
  const todayRows = await prisma.userDailyMission.findMany({
    where: { userId: user.id, dayKey: todayKey },
  });
  const missionMap = new Map(todayRows.map((row) => [row.missionKey, row]));

  const missions = missionCatalog.map((mission) => {
    const row = missionMap.get(mission.key);
    return {
      key: mission.key,
      title: mission.title,
      progress: row?.progress ?? 0,
      target: row?.target ?? mission.target,
      completed: row?.completed ?? false,
    };
  });

  return NextResponse.json({
    data: {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        displayNameUpdatedAt: user.displayNameUpdatedAt?.toISOString() ?? null,
        displayNameChangeAvailableAt: user.displayNameUpdatedAt
          ? new Date(user.displayNameUpdatedAt.getTime() + DISPLAY_NAME_COOLDOWN_MS).toISOString()
          : null,
        rating: user.rating,
        trustScore: user.trustScore,
        streakDays: user.streakDays,
      },
      summary: {
        totalTests,
        avgWpm: Math.round(aggregate._avg.wpm ?? 0),
        avgAccuracy: Math.round(aggregate._avg.accuracy ?? 0),
        bestWpm: Math.round(aggregate._max.wpm ?? 0),
        competitionJoined,
        competitionWins,
      },
      achievements: user.achievements.map((achievement) => ({
        code: achievement.code,
        label: ACHIEVEMENT_LABELS[achievement.code] ?? achievement.code,
        unlockedAt: achievement.unlockedAt,
      })),
      missions,
      trend: recentResults
        .reverse()
        .map((row) => ({
          date: row.createdAt.toISOString(),
          wpm: Math.round(row.wpm),
          accuracy: Math.round(row.accuracy),
          mode: row.difficulty === "hard" ? "advanced" : "normal",
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
