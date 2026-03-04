import { prisma } from "@/lib/prisma";

export type UserLanguageTag = {
  code:
    | "role_mod"
    | "lang_daily_1"
    | "lang_weekly_1"
    | "lang_alltime_1"
    | "adv_daily_1"
    | "adv_weekly_1"
    | "adv_alltime_1";
  label: string;
};

type LanguageLeaders = {
  todayUserId: string | null;
  weeklyUserId: string | null;
  allTimeUserId: string | null;
  advTodayUserId: string | null;
  advWeeklyUserId: string | null;
  advAllTimeUserId: string | null;
};

type LeaderCacheEntry = {
  value: LanguageLeaders;
  expiresAt: number;
};

type LeaderCache = Map<string, LeaderCacheEntry>;

declare global {
  // eslint-disable-next-line no-var
  var __fastfingersLanguageLeadersCache: LeaderCache | undefined;
}

const LEADER_CACHE_TTL_MS = 15_000;
const leadersCache: LeaderCache = globalThis.__fastfingersLanguageLeadersCache ?? new Map<string, LeaderCacheEntry>();
if (!globalThis.__fastfingersLanguageLeadersCache) {
  globalThis.__fastfingersLanguageLeadersCache = leadersCache;
}

async function findTopUserIdForLanguage(
  language: string,
  createdAtGte?: Date,
  difficulty?: "medium" | "hard",
): Promise<string | null> {
  const top = await prisma.testResult.findFirst({
    where: {
      language,
      duration: 60,
      ...(difficulty ? { difficulty } : {}),
      ...(createdAtGte ? { createdAt: { gte: createdAtGte } } : {}),
      userId: { not: null },
    },
    orderBy: [{ wpm: "desc" }, { accuracy: "desc" }, { createdAt: "asc" }],
    select: { userId: true },
  });

  return top?.userId ?? null;
}

export async function getLanguageLeadersMap(languages: string[]): Promise<Map<string, LanguageLeaders>> {
  const unique = [...new Set(languages.filter((language) => Boolean(language)))];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const map = new Map<string, LanguageLeaders>();
  const now = Date.now();

  await Promise.all(
    unique.map(async (language) => {
      const cached = leadersCache.get(language);
      if (cached && cached.expiresAt > now) {
        map.set(language, cached.value);
        return;
      }

      const [todayUserId, weeklyUserId, allTimeUserId] = await Promise.all([
        findTopUserIdForLanguage(language, today, "medium"),
        findTopUserIdForLanguage(language, weekStart, "medium"),
        findTopUserIdForLanguage(language, undefined, "medium"),
      ]);
      const [advTodayUserId, advWeeklyUserId, advAllTimeUserId] = await Promise.all([
        findTopUserIdForLanguage(language, today, "hard"),
        findTopUserIdForLanguage(language, weekStart, "hard"),
        findTopUserIdForLanguage(language, undefined, "hard"),
      ]);

      const value = { todayUserId, weeklyUserId, allTimeUserId, advTodayUserId, advWeeklyUserId, advAllTimeUserId };
      leadersCache.set(language, { value, expiresAt: now + LEADER_CACHE_TTL_MS });
      map.set(language, value);
    }),
  );

  return map;
}

export function buildUserLanguageTags(
  userId: string | null | undefined,
  language: string,
  leadersMap: Map<string, LanguageLeaders>,
  role?: string | null,
): UserLanguageTag[] {
  if (!userId) {
    return [];
  }

  const leaders = leadersMap.get(language);
  if (!leaders) {
    return [];
  }

  const prefix = language.toUpperCase();
  const tags: UserLanguageTag[] = [];
  if (role === "mod" || role === "admin") {
    tags.push({ code: "role_mod", label: "Moderator" });
  }

  if (leaders.todayUserId === userId) {
    tags.push({ code: "lang_daily_1", label: `${prefix} Normal Today` });
  }
  if (leaders.weeklyUserId === userId) {
    tags.push({ code: "lang_weekly_1", label: `${prefix} Normal Week` });
  }
  if (leaders.allTimeUserId === userId) {
    tags.push({ code: "lang_alltime_1", label: `${prefix} Normal All-time` });
  }
  if (leaders.advTodayUserId === userId) {
    tags.push({ code: "adv_daily_1", label: `${prefix} Advanced Today` });
  }
  if (leaders.advWeeklyUserId === userId) {
    tags.push({ code: "adv_weekly_1", label: `${prefix} Advanced Week` });
  }
  if (leaders.advAllTimeUserId === userId) {
    tags.push({ code: "adv_alltime_1", label: `${prefix} Advanced All-time` });
  }

  return tags;
}
