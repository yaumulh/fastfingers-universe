import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache } from "@/lib/response-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "home-snapshot:get"), 240, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const data = await getOrSetCache("home-snapshot:get", 8_000, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const seasonStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalUsers, testsTodayAgg, testsTodayCount, activeChallenges, seasonTop, languageToday, languageWeekly, languageAllTime] = await Promise.all([
      prisma.user.count(),
      prisma.testResult.aggregate({
        where: { createdAt: { gte: today } },
        _avg: { wpm: true },
      }),
      prisma.testResult.count({
        where: { createdAt: { gte: today } },
      }),
      prisma.challengeLink.count({
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.testResult.findFirst({
        where: { createdAt: { gte: seasonStart } },
        orderBy: [{ wpm: "desc" }, { accuracy: "desc" }],
        include: { user: { select: { username: true, displayName: true } } },
      }),
      prisma.testResult.groupBy({
        by: ["language"],
        where: { createdAt: { gte: today } },
        _count: { language: true },
        orderBy: { _count: { language: "desc" } },
        take: 5,
      }),
      prisma.testResult.groupBy({
        by: ["language"],
        where: { createdAt: { gte: weekStart } },
        _count: { language: true },
        orderBy: { _count: { language: "desc" } },
        take: 5,
      }),
      prisma.testResult.groupBy({
        by: ["language"],
        _count: { language: true },
        orderBy: { _count: { language: "desc" } },
        take: 5,
      }),
    ]);

    return {
      totalUsers,
      testsTodayCount,
      avgWpmToday: Math.round(testsTodayAgg._avg.wpm ?? 0),
      activeChallenges,
      seasonTopWpm: seasonTop ? Math.round(seasonTop.wpm) : 0,
      seasonTopUser: seasonTop?.user?.displayName ?? seasonTop?.user?.username ?? "N/A",
      globalLanguageTop: {
        today: languageToday.map((row, index) => ({
          rank: index + 1,
          language: row.language,
          count: row._count.language,
        })),
        weekly: languageWeekly.map((row, index) => ({
          rank: index + 1,
          language: row.language,
          count: row._count.language,
        })),
        allTime: languageAllTime.map((row, index) => ({
          rank: index + 1,
          language: row.language,
          count: row._count.language,
        })),
      },
    };
  });

  return NextResponse.json({ data });
}
