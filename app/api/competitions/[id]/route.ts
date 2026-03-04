import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { difficultyFromMode, finalizeCompetitionIfNeeded, isCompetitionEnded } from "@/lib/competition";
import { buildUserLanguageTags, getLanguageLeadersMap } from "@/lib/user-language-tags";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache, invalidateCachePrefixAsync } from "@/lib/response-cache";
import { toApiErrorResponse } from "@/lib/api-error";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  const competitionId = context.params.id;
  const rate = await enforceRateLimit(getRateLimitKey(request, "competition:get"), 200, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const data = await getOrSetCache(`competition:get:${competitionId}`, 3_000, async () => {
      const competition = await prisma.competition.findUnique({
        where: { id: competitionId },
        include: {
          host: { select: { id: true, username: true, displayName: true, role: true } },
          participants: {
            include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
            orderBy: [{ bestWpm: "desc" }, { bestAccuracy: "desc" }, { joinedAt: "asc" }],
          },
        },
      });

      if (!competition) {
        return null;
      }

      if (competition.status !== "finished" && isCompetitionEnded(competition.endsAt)) {
        await finalizeCompetitionIfNeeded(competitionId);
        const fresh = await prisma.competition.findUnique({
          where: { id: competitionId },
          include: {
            host: { select: { id: true, username: true, displayName: true, role: true } },
            participants: {
              include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
              orderBy: [{ bestWpm: "desc" }, { bestAccuracy: "desc" }, { joinedAt: "asc" }],
            },
          },
        });
        if (!fresh) {
          return null;
        }
        const freshLeadersMap = await getLanguageLeadersMap([fresh.language]);
        return {
          id: fresh.id,
          title: fresh.title,
          language: fresh.language,
          mode: fresh.mode,
          hostEditUsed: fresh.hostEditUsed,
          status: fresh.status,
          startsAt: fresh.startsAt,
          endsAt: fresh.endsAt,
          winnerUserId: fresh.winnerUserId,
          winnerName: fresh.winnerName,
          host: {
            id: fresh.host.id,
            username: fresh.host.username,
            displayName: fresh.host.displayName,
            tags: buildUserLanguageTags(fresh.host.id, fresh.language, freshLeadersMap, fresh.host.role),
          },
          participants: fresh.participants.map((item) => ({
            id: item.id,
            userId: item.userId,
            username: item.user.username,
            displayName: item.user.displayName,
            tags: buildUserLanguageTags(item.userId, fresh.language, freshLeadersMap, item.user.role),
            bestWpm: item.bestWpm,
            bestAccuracy: item.bestAccuracy,
            bestResultAt: item.bestResultAt,
            testsCount: item.testsCount,
            isWinner: item.isWinner,
          })),
        };
      }

      const leadersMap = await getLanguageLeadersMap([competition.language]);

      return {
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
      };
    });

    if (!data) {
      return NextResponse.json({ error: "Competition not found." }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return toApiErrorResponse(error, "Failed to load competition room.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rate = await enforceRateLimit(getRateLimitKey(request, "competition:patch", session.id), 240, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const competitionId = context.params.id;
    const body = (await request.json()) as {
    action?: "join" | "sync-best" | "submit-attempt" | "delete-room";
    wpm?: number;
    accuracy?: number;
    duration?: number;
    wordCount?: number;
    mistakes?: number;
  };
  const action = body.action;

    const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      language: true,
      mode: true,
      status: true,
      hostUserId: true,
      hostEditUsed: true,
      startsAt: true,
      endsAt: true,
    },
  });

    if (!competition) {
      return NextResponse.json({ error: "Competition not found." }, { status: 404 });
    }
    const ended = competition.status === "finished" || isCompetitionEnded(competition.endsAt);

    if (action === "join") {
    if (ended) {
      if (competition.status !== "finished") {
        await finalizeCompetitionIfNeeded(competition.id);
      }
      return NextResponse.json({ error: "Competition has ended." }, { status: 409 });
    }

    await prisma.competitionParticipant.upsert({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: session.id,
        },
      },
      update: {},
      create: {
        competitionId: competition.id,
        userId: session.id,
      },
    });
    await invalidateCachePrefixAsync(`competition:get:${competition.id}`);
    await invalidateCachePrefixAsync("competitions:get");

    return NextResponse.json({ data: { joined: true } });
  }

    if (action === "delete-room") {
    if (competition.hostUserId !== session.id) {
      return NextResponse.json({ error: "Only host can delete this room." }, { status: 403 });
    }

    const elapsedMs = Date.now() - competition.startsAt.getTime();
    if (elapsedMs > 60_000) {
      return NextResponse.json({ error: "Delete room is only available within 1 minute after creation." }, { status: 409 });
    }

    await prisma.competition.delete({
      where: { id: competition.id },
    });
    await invalidateCachePrefixAsync(`competition:get:${competition.id}`);
    await invalidateCachePrefixAsync("competitions:get");
    await invalidateCachePrefixAsync("home-snapshot:get");

    return NextResponse.json({ data: { deleted: true } });
  }

    if (action === "sync-best") {
    const participant = await prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: session.id,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Join the competition first." }, { status: 409 });
    }

    if (ended) {
      if (competition.status !== "finished") {
        await finalizeCompetitionIfNeeded(competition.id);
      }
      return NextResponse.json({ error: "Competition has ended." }, { status: 409 });
    }

    const difficulty = difficultyFromMode(competition.mode as "normal" | "advanced");

    const best = await prisma.testResult.findFirst({
      where: {
        userId: session.id,
        language: competition.language,
        difficulty,
        createdAt: {
          gte: competition.startsAt,
          lte: competition.endsAt,
        },
      },
      orderBy: [{ wpm: "desc" }, { accuracy: "desc" }, { createdAt: "desc" }],
      select: { wpm: true, accuracy: true, createdAt: true },
    });

    if (!best) {
      return NextResponse.json(
        { error: "No typing result found for this competition settings in the last 24h." },
        { status: 404 },
      );
    }

    const shouldUpdate =
      best.wpm > participant.bestWpm ||
      (best.wpm === participant.bestWpm && best.accuracy > participant.bestAccuracy);

    await prisma.competitionParticipant.update({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: session.id,
        },
      },
      data: {
        testsCount: { increment: 1 },
        ...(shouldUpdate
          ? {
              bestWpm: best.wpm,
              bestAccuracy: best.accuracy,
              bestResultAt: best.createdAt,
            }
          : {}),
      },
    });
    await invalidateCachePrefixAsync(`competition:get:${competition.id}`);
    await invalidateCachePrefixAsync("competitions:get");

    return NextResponse.json({ data: { synced: true, updatedBest: shouldUpdate } });
  }

    if (action === "submit-attempt") {
    const participant = await prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: session.id,
        },
      },
      select: {
        bestWpm: true,
        bestAccuracy: true,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Join the competition first." }, { status: 409 });
    }

    if (ended) {
      if (competition.status !== "finished") {
        await finalizeCompetitionIfNeeded(competition.id);
      }
      return NextResponse.json({ error: "Competition has ended." }, { status: 409 });
    }

    const wpm = Number(body.wpm);
    const accuracy = Number(body.accuracy);
    const duration = Number(body.duration);
    const wordCount = Number(body.wordCount);
    const mistakes = Number(body.mistakes);

    if (
      !Number.isFinite(wpm) ||
      !Number.isFinite(accuracy) ||
      !Number.isInteger(duration) ||
      !Number.isInteger(wordCount) ||
      !Number.isInteger(mistakes)
    ) {
      return NextResponse.json({ error: "Invalid attempt payload." }, { status: 400 });
    }

    if (duration !== 60) {
      return NextResponse.json({ error: "Competition attempt must use 60 seconds." }, { status: 400 });
    }

    const shouldUpdate =
      wpm > participant.bestWpm ||
      (wpm === participant.bestWpm && accuracy > participant.bestAccuracy);

    await prisma.competitionParticipant.update({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: session.id,
        },
      },
      data: {
        testsCount: { increment: 1 },
        ...(shouldUpdate
          ? {
              bestWpm: wpm,
              bestAccuracy: accuracy,
              bestResultAt: new Date(),
            }
          : {}),
      },
    });
    await invalidateCachePrefixAsync(`competition:get:${competition.id}`);
    await invalidateCachePrefixAsync("competitions:get");
    await invalidateCachePrefixAsync("home-snapshot:get");

    return NextResponse.json({ data: { submitted: true, updatedBest: shouldUpdate } });
  }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return toApiErrorResponse(error, "Failed to update competition room.");
  }
}
