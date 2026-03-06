import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { updateAfterTypingResult } from "@/lib/user-progress";
import { buildUserLanguageTags, getLanguageLeadersMap } from "@/lib/user-language-tags";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache, invalidateCachePrefixAsync } from "@/lib/response-cache";
import type { Difficulty, LanguageCode } from "@/app/typing/word-banks";

type CreateResultBody = {
  wpm: number;
  accuracy: number;
  duration: number;
  wordCount: number;
  mistakes: number;
  language: LanguageCode;
  difficulty: Difficulty;
  username?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLanguage(value: unknown): value is LanguageCode {
  const allowed = ["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"];
  return typeof value === "string" && allowed.includes(value);
}

function isDifficulty(value: unknown): value is Difficulty {
  const allowed = ["easy", "medium", "hard"];
  return typeof value === "string" && allowed.includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rate = await enforceRateLimit(getRateLimitKey(request, "test-results:get"), 180, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }
  const cacheKey = `test-results:get:${url.searchParams.toString()}`;
  const data = await getOrSetCache(cacheKey, 4_000, async () => getFilteredResults(url.searchParams));
  return NextResponse.json({ data });
}

async function getFilteredResults(searchParams: URLSearchParams) {
  const period = searchParams.get("period") ?? "all";
  const language = searchParams.get("language");
  const difficulty = searchParams.get("difficulty");
  const durationRaw = searchParams.get("duration");
  const durationParam = durationRaw === null ? null : Number(durationRaw);
  const duration =
    durationRaw === null || !Number.isInteger(durationParam) ? null : durationParam;
  const sort = searchParams.get("sort") ?? "recent";
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), 100) : 20;

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

  const where = {
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(isLanguage(language) ? { language } : {}),
    ...(isDifficulty(difficulty) ? { difficulty } : {}),
    ...(duration !== null ? { duration } : {}),
  };

  const orderBy = sort === "top" ? [{ wpm: "desc" as const }, { accuracy: "desc" as const }] : [{ createdAt: "desc" as const }];

  const latest = await prisma.testResult.findMany({
    take: limit,
    where,
    orderBy,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
        },
      },
    },
  });

  const languagesInRows = latest.map((row) => row.language);
  const leadersMap = await getLanguageLeadersMap(languagesInRows);

  const enriched = latest.map((row) => ({
    ...row,
    user: row.user
      ? {
          ...row.user,
          tags: buildUserLanguageTags(row.user.id, row.language, leadersMap, row.user.role),
        }
      : null,
  }));

  return enriched;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CreateResultBody>;
  const duration = Number(body.duration);
  const wordCount = Number(body.wordCount);
  const mistakes = Number(body.mistakes);

  if (
    !isFiniteNumber(body.wpm) ||
    !isFiniteNumber(body.accuracy) ||
    !Number.isInteger(duration) ||
    !Number.isInteger(wordCount) ||
    !Number.isInteger(mistakes) ||
    !isLanguage(body.language) ||
    !isDifficulty(body.difficulty)
  ) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json(
      { error: "Unauthorized. Login required to submit leaderboard results." },
      { status: 401 },
    );
  }
  const rate = await enforceRateLimit(getRateLimitKey(request, "test-results:post", sessionUser.id), 45, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const created = await prisma.testResult.create({
    data: {
      wpm: body.wpm,
      accuracy: body.accuracy,
      duration,
      wordCount,
      mistakes,
      language: body.language,
      difficulty: body.difficulty,
      userId: sessionUser.id,
    },
  });

  const progress = await updateAfterTypingResult({
    userId: sessionUser.id,
    wpm: body.wpm,
    accuracy: body.accuracy,
    mistakes,
    duration,
  });

  await invalidateCachePrefixAsync("test-results:get:");
  await invalidateCachePrefixAsync("home-snapshot:get");
  await invalidateCachePrefixAsync("user-language-tags:get:");
  await invalidateCachePrefixAsync("competitions:get");
  await invalidateCachePrefixAsync("competition:get:");

  return NextResponse.json({ data: created, progress }, { status: 201 });
}
