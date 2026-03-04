import { prisma } from "@/lib/prisma";
import type { Difficulty, LanguageCode } from "@/app/typing/word-banks";

export const COMPETITION_DURATION_HOURS = 24;
export const EMPTY_ROOM_AUTO_DELETE_HOURS = 3;
export const EMPTY_ROOM_WARNING_HOURS = 1;

export function difficultyFromMode(mode: "normal" | "advanced"): "medium" | "hard" {
  return mode === "advanced" ? "hard" : "medium";
}

export function isCompetitionEnded(endsAt: Date): boolean {
  return endsAt.getTime() <= Date.now();
}

export async function finalizeCompetitionIfNeeded(competitionId: string): Promise<void> {
  const base = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      status: true,
      endsAt: true,
    },
  });

  if (!base || base.status === "finished") {
    return;
  }

  if (!isCompetitionEnded(base.endsAt)) {
    return;
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      participants: {
        include: { user: { select: { username: true } } },
      },
    },
  });

  if (!competition || competition.status === "finished") {
    return;
  }

  const eligibleParticipants = competition.participants.filter((participant) => participant.testsCount > 0);
  const sorted = [...eligibleParticipants].sort((a, b) => {
    if (b.bestWpm !== a.bestWpm) {
      return b.bestWpm - a.bestWpm;
    }
    if (b.bestAccuracy !== a.bestAccuracy) {
      return b.bestAccuracy - a.bestAccuracy;
    }
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  const winner = sorted[0] ?? null;

  await prisma.$transaction([
    prisma.competition.update({
      where: { id: competition.id },
      data: {
        status: "finished",
        winnerUserId: winner?.userId ?? null,
        winnerName: winner?.user.username ?? null,
      },
    }),
    prisma.competitionParticipant.updateMany({
      where: { competitionId: competition.id },
      data: { isWinner: false },
    }),
    ...(winner
      ? [
          prisma.competitionParticipant.update({
            where: {
              competitionId_userId: {
                competitionId: competition.id,
                userId: winner.userId,
              },
            },
            data: { isWinner: true },
          }),
        ]
      : []),
  ]);
}

export async function syncCompetitionScoreFromResult(input: {
  userId: string;
  language: LanguageCode;
  difficulty: Difficulty;
  wpm: number;
  accuracy: number;
  createdAt: Date;
}): Promise<void> {
  const mode = input.difficulty === "hard" ? "advanced" : input.difficulty === "medium" ? "normal" : null;
  if (!mode) {
    return;
  }

  const activeCompetitions = await prisma.competition.findMany({
    where: {
      status: "active",
      language: input.language,
      mode,
      participants: {
        some: {
          userId: input.userId,
        },
      },
    },
    select: {
      id: true,
      endsAt: true,
    },
  });

  if (activeCompetitions.length === 0) {
    return;
  }

  for (const competition of activeCompetitions) {
    if (isCompetitionEnded(competition.endsAt)) {
      await finalizeCompetitionIfNeeded(competition.id);
      continue;
    }

    const participant = await prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: input.userId,
        },
      },
      select: {
        bestWpm: true,
        bestAccuracy: true,
      },
    });

    if (!participant) {
      continue;
    }

    const shouldUpdateBest =
      input.wpm > participant.bestWpm ||
      (input.wpm === participant.bestWpm && input.accuracy > participant.bestAccuracy);

    await prisma.competitionParticipant.update({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId: input.userId,
        },
      },
      data: {
        testsCount: { increment: 1 },
        ...(shouldUpdateBest
          ? {
              bestWpm: input.wpm,
              bestAccuracy: input.accuracy,
              bestResultAt: input.createdAt,
            }
          : {}),
      },
    });
  }
}

export async function cleanupStaleEmptyCompetitions(): Promise<number> {
  const threshold = new Date(Date.now() - EMPTY_ROOM_AUTO_DELETE_HOURS * 60 * 60 * 1000);
  const candidates = await prisma.competition.findMany({
    where: {
      status: "active",
      createdAt: {
        lte: threshold,
      },
    },
    select: {
      id: true,
      hostUserId: true,
      participants: {
        select: {
          userId: true,
          testsCount: true,
        },
      },
    },
    take: 200,
  });

  const staleIds = candidates
    .filter((item) => !item.participants.some((participant) => participant.testsCount > 0))
    .map((item) => item.id);

  if (staleIds.length === 0) {
    return 0;
  }

  const deleted = await prisma.competition.deleteMany({
    where: { id: { in: staleIds } },
  });

  return deleted.count;
}
