import { prisma } from "@/lib/prisma";

type TypingPayload = {
  userId: string;
  wpm: number;
  accuracy: number;
  mistakes: number;
};

type MultiplayerPayload = {
  winnerName: string | null;
  participants: Array<{ name: string; wpm: number }>;
};

const DAILY_MISSIONS = [
  { key: "typing_runs", title: "Complete 3 typing runs", target: 3 },
  { key: "typing_300_wpm", title: "Reach total 300 WPM today", target: 300 },
  { key: "multiplayer_join", title: "Play 1 multiplayer race", target: 1 },
] as const;

const ACHIEVEMENTS = {
  WPM_100: "wpm_100",
  ACCURACY_98: "accuracy_98",
  ZERO_MISTAKE: "zero_mistake",
  MULTI_WIN: "multiplayer_win",
  MULTI_120: "multiplayer_120",
  STREAK_3: "streak_3",
} as const;

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yesterdayKeyFor(date: Date): string {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return dayKeyFor(prev);
}

async function ensureMissionRows(userId: string, dayKey: string) {
  await Promise.all(
    DAILY_MISSIONS.map((mission) =>
      prisma.userDailyMission.upsert({
        where: {
          userId_dayKey_missionKey: {
            userId,
            dayKey,
            missionKey: mission.key,
          },
        },
        update: {},
        create: {
          userId,
          dayKey,
          missionKey: mission.key,
          target: mission.target,
        },
      }),
    ),
  );
}

async function addAchievement(userId: string, code: string) {
  await prisma.userAchievement.upsert({
    where: { userId_code: { userId, code } },
    update: {},
    create: { userId, code },
  });
}

export async function updateAfterTypingResult(payload: TypingPayload) {
  const now = new Date();
  const dayKey = dayKeyFor(now);
  const yesterdayKey = yesterdayKeyFor(now);

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, lastTestAt: true, streakDays: true, trustScore: true },
  });
  if (!user) {
    return;
  }

  const lastDayKey = user.lastTestAt ? dayKeyFor(user.lastTestAt) : null;
  const nextStreak =
    lastDayKey === dayKey
      ? user.streakDays
      : lastDayKey === yesterdayKey
        ? user.streakDays + 1
        : 1;

  await prisma.user.update({
    where: { id: payload.userId },
    data: {
      lastTestAt: now,
      streakDays: nextStreak,
      trustScore: Math.max(20, Math.min(100, user.trustScore + (payload.accuracy >= 95 ? 1 : 0))),
    },
  });

  await ensureMissionRows(payload.userId, dayKey);
  await prisma.userDailyMission.update({
    where: {
      userId_dayKey_missionKey: { userId: payload.userId, dayKey, missionKey: "typing_runs" },
    },
    data: {
      progress: { increment: 1 },
    },
  });
  await prisma.userDailyMission.update({
    where: {
      userId_dayKey_missionKey: { userId: payload.userId, dayKey, missionKey: "typing_300_wpm" },
    },
    data: {
      progress: { increment: Math.round(payload.wpm) },
    },
  });

  const missions = await prisma.userDailyMission.findMany({
    where: { userId: payload.userId, dayKey },
  });
  await Promise.all(
    missions
      .filter((mission) => !mission.completed && mission.progress >= mission.target)
      .map((mission) =>
        prisma.userDailyMission.update({
          where: { id: mission.id },
          data: { completed: true },
        }),
      ),
  );

  if (payload.wpm >= 100) {
    await addAchievement(payload.userId, ACHIEVEMENTS.WPM_100);
  }
  if (payload.accuracy >= 98) {
    await addAchievement(payload.userId, ACHIEVEMENTS.ACCURACY_98);
  }
  if (payload.mistakes === 0) {
    await addAchievement(payload.userId, ACHIEVEMENTS.ZERO_MISTAKE);
  }
  if (nextStreak >= 3) {
    await addAchievement(payload.userId, ACHIEVEMENTS.STREAK_3);
  }
}

export async function updateAfterMultiplayerMatch(payload: MultiplayerPayload) {
  const now = new Date();
  const dayKey = dayKeyFor(now);

  const usernames = [...new Set(payload.participants.map((p) => p.name.trim()).filter(Boolean))];
  if (usernames.length === 0) {
    return;
  }

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true, rating: true },
  });
  if (users.length === 0) {
    return;
  }

  const userMap = new Map(users.map((u) => [u.username, u]));

  await Promise.all(
    users.map((user) => ensureMissionRows(user.id, dayKey)),
  );

  for (const user of users) {
    const isWinner = payload.winnerName === user.username;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        rating: Math.max(800, user.rating + (isWinner ? 10 : -5)),
      },
    });

    await prisma.userDailyMission.update({
      where: {
        userId_dayKey_missionKey: { userId: user.id, dayKey, missionKey: "multiplayer_join" },
      },
      data: { progress: { increment: 1 }, completed: true },
    });

    if (isWinner) {
      await addAchievement(user.id, ACHIEVEMENTS.MULTI_WIN);
    }

    const player = payload.participants.find((p) => p.name === user.username);
    if (player && player.wpm >= 120) {
      await addAchievement(user.id, ACHIEVEMENTS.MULTI_120);
    }
  }

  const remaining = await prisma.userDailyMission.findMany({
    where: { userId: { in: users.map((u) => u.id) }, dayKey, completed: false },
  });
  await Promise.all(
    remaining
      .filter((mission) => mission.progress >= mission.target)
      .map((mission) =>
        prisma.userDailyMission.update({
          where: { id: mission.id },
          data: { completed: true },
        }),
      ),
  );
}

export const missionCatalog = DAILY_MISSIONS;
