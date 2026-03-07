import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache } from "@/lib/response-cache";
import { buildUserLanguageTags, getLanguageLeadersMap } from "@/lib/user-language-tags";

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

    const [totalUsers, testsTodayAgg, testsTodayCount, activeChallenges, seasonTop, languageToday, languageWeekly, languageAllTime, latestTypingRuns] = await Promise.all([
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
      prisma.testResult.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          wpm: true,
          language: true,
          difficulty: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      }),
    ]);

    const languageLeadersMap = await getLanguageLeadersMap(
      latestTypingRuns.map((row) => row.language),
    );

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
      latestTypingRuns: latestTypingRuns.map((row) => ({
        id: row.id,
        wpm: Math.round(row.wpm),
        language: row.language,
        mode: row.difficulty === "hard" ? "advanced" : "normal",
        createdAt: row.createdAt.toISOString(),
        user: {
          id: row.user?.id ?? null,
          username: row.user?.username ?? "guest",
          displayName: row.user?.displayName ?? null,
          avatarUrl: row.user?.avatarUrl ?? null,
          tags: buildUserLanguageTags(
            row.user?.id,
            row.language,
            languageLeadersMap,
            row.user?.role,
          ),
        },
      })),
    };
  });

  return NextResponse.json({ data });
}
