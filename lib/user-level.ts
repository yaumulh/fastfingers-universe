export type UserLevelProgress = {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
};

export function xpNeededForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 100 + (safeLevel - 1) * 25;
}

export function getLevelProgress(totalXpInput: number): UserLevelProgress {
  const totalXp = Math.max(0, Math.floor(totalXpInput));
  let remaining = totalXp;
  let level = 1;

  while (remaining >= xpNeededForLevel(level)) {
    remaining -= xpNeededForLevel(level);
    level += 1;
  }

  const nextLevelXp = xpNeededForLevel(level);
  const progressPct = nextLevelXp > 0 ? Math.min(100, Math.round((remaining / nextLevelXp) * 100)) : 0;

  return {
    level,
    totalXp,
    currentLevelXp: remaining,
    nextLevelXp,
    progressPct,
  };
}

export function getTypingXpGain(input: {
  wpm: number;
  accuracy: number;
  mistakes: number;
  duration: number;
}): number {
  const durationScale = Math.max(0.35, Math.min(2, input.duration / 60));
  const baseXp = 12;
  const speedXp = Math.round(Math.max(0, input.wpm) * 0.45);
  const accuracyXp = Math.round(Math.max(0, input.accuracy) * 0.2);
  const cleanBonus = input.mistakes === 0 ? 8 : 0;
  const raw = (baseXp + speedXp + accuracyXp + cleanBonus) * durationScale;
  return Math.max(5, Math.round(raw));
}
