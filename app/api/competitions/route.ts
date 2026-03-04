import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { cleanupStaleEmptyCompetitions, COMPETITION_DURATION_HOURS, EMPTY_ROOM_AUTO_DELETE_HOURS } from "@/lib/competition";
import { buildUserLanguageTags, getLanguageLeadersMap } from "@/lib/user-language-tags";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache, invalidateCachePrefixAsync } from "@/lib/response-cache";
import { toApiErrorResponse } from "@/lib/api-error";

type CreateCompetitionBody = {
  title?: string;
  language?: string;
};

const ALLOWED_LANGUAGES = new Set(["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"]);

function sanitizeTitle(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 50);
}

export async function GET(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "competitions:get"), 180, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const deletedCount = await cleanupStaleEmptyCompetitions();
    if (deletedCount > 0) {
      await invalidateCachePrefixAsync("competitions:get");
      await invalidateCachePrefixAsync("competition:get:");
    }

    const data = await getOrSetCache("competitions:get:list", 4_000, async () => {
      const now = Date.now();
      const fresh = await prisma.competition.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          host: { select: { id: true, username: true, displayName: true, role: true } },
          participants: {
            include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
            orderBy: [{ bestWpm: "desc" }, { bestAccuracy: "desc" }, { joinedAt: "asc" }],
          },
        },
        take: 40,
      });

      const languagesInList = fresh.map((competition) => competition.language);
      const leadersMap = await getLanguageLeadersMap(languagesInList);

      return fresh.map((competition) => ({
        ...(function () {
          const hasAnyJoined = competition.participants.some((item) => item.testsCount > 0);
          if (competition.status !== "active" || hasAnyJoined) {
            return {
              pendingAutoDelete: false,
              autoDeleteAt: null as string | null,
            };
          }
          const autoDeleteAtMs = competition.createdAt.getTime() + EMPTY_ROOM_AUTO_DELETE_HOURS * 60 * 60 * 1000;
          const pendingAutoDelete = now < autoDeleteAtMs;
          return {
            pendingAutoDelete,
            autoDeleteAt: new Date(autoDeleteAtMs).toISOString(),
          };
        })(),
        id: competition.id,
        title: competition.title,
        language: competition.language,
        mode: competition.mode,
        hostEditUsed: competition.hostEditUsed,
        status: competition.status,
        startsAt: competition.startsAt,
        endsAt: competition.endsAt,
        winnerUserId: competition.winnerUserId,
        winnerName: competition.winnerName,
          createdAt: competition.createdAt,
          host: {
            id: competition.host.id,
            username: competition.host.username,
            displayName: competition.host.displayName,
            tags: buildUserLanguageTags(competition.host.id, competition.language, leadersMap, competition.host.role),
          },
          participants: competition.participants.map((item) => ({
            id: item.id,
            userId: item.userId,
            username: item.user.username,
            displayName: item.user.displayName,
            tags: buildUserLanguageTags(item.userId, competition.language, leadersMap, item.user.role),
            bestWpm: item.bestWpm,
          bestAccuracy: item.bestAccuracy,
          bestResultAt: item.bestResultAt,
          testsCount: item.testsCount,
          isWinner: item.isWinner,
        })),
      }));
    });

    return NextResponse.json({ data });
  } catch (error) {
    return toApiErrorResponse(error, "Failed to load competition list.");
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rate = await enforceRateLimit(getRateLimitKey(request, "competitions:post", session.id), 20, 60 * 60 * 1000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const createdInLast24Hours = await prisma.competition.count({
      where: {
        hostUserId: session.id,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    if (createdInLast24Hours >= 5) {
      return NextResponse.json(
        { error: "Create room limit reached (max 5 rooms per 24 hours)." },
        { status: 429 },
      );
    }

    const profile = await prisma.user.findUnique({
      where: { id: session.id },
      select: { displayName: true, username: true },
    });
    const ownerName = profile?.displayName || profile?.username || session.username;
    const body = (await request.json()) as CreateCompetitionBody;
    const title = sanitizeTitle(body.title) || `${ownerName}'s Competition`;
    const language = typeof body.language === "string" && ALLOWED_LANGUAGES.has(body.language) ? body.language : "en";
    const mode = "normal";

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + COMPETITION_DURATION_HOURS * 60 * 60 * 1000);

    const created = await prisma.competition.create({
      data: {
        title,
        language,
        mode,
        hostUserId: session.id,
        startsAt,
        endsAt,
        status: "active",
        participants: {
          create: {
            userId: session.id,
          },
        },
      },
      include: {
        host: { select: { id: true, username: true, displayName: true } },
      },
    });

    await invalidateCachePrefixAsync("competitions:get");
    await invalidateCachePrefixAsync("competition:get:");
    await invalidateCachePrefixAsync("home-snapshot:get");

    return NextResponse.json(
      {
        data: {
          id: created.id,
          title: created.title,
          language: created.language,
          mode: created.mode,
          hostEditUsed: created.hostEditUsed,
          status: created.status,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          host: {
            id: created.host.id,
            username: created.host.username,
            displayName: created.host.displayName,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toApiErrorResponse(error, "Failed to create competition room.");
  }
}
