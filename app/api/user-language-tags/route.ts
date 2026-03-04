import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { buildUserLanguageTags, getLanguageLeadersMap } from "@/lib/user-language-tags";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrSetCache } from "@/lib/response-cache";
import type { LanguageCode } from "@/app/typing/word-banks";

const VALID_LANGUAGES = new Set<LanguageCode>([
  "en",
  "id",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ru",
  "zh",
  "ja",
]);

export async function GET(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "user-language-tags:get"), 200, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const languageParam = url.searchParams.get("language");
  const namesParam = url.searchParams.get("names");

  if (!languageParam || !VALID_LANGUAGES.has(languageParam as LanguageCode)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }
  if (!namesParam) {
    return NextResponse.json({ data: {} });
  }

  const usernames = [...new Set(namesParam.split(",").map((n) => n.trim()).filter(Boolean))].slice(0, 80);
  if (usernames.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const cacheKey = `user-language-tags:get:${languageParam}:${usernames.join(",")}`;
  const data = await getOrSetCache(cacheKey, 5_000, async () => {
    const users = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true, role: true },
    });

    const leadersMap = await getLanguageLeadersMap([languageParam]);
    const nextData: Record<string, ReturnType<typeof buildUserLanguageTags>> = {};

    for (const user of users) {
      nextData[user.username] = buildUserLanguageTags(user.id, languageParam, leadersMap, user.role);
    }
    return nextData;
  });

  return NextResponse.json({ data });
}
