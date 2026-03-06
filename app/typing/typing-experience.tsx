"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertIcon,
  CheckIcon,
  GaugeIcon,
  GlobeIcon,
  InfoIcon,
  KeyboardIcon,
  RocketIcon,
  SparkIcon,
  TimerIcon,
  TrophyIcon,
  UsersIcon,
} from "../components/icons";
import {
  BANK_SIZE_PER_LEVEL,
  buildWordPoolFromSeed,
  getWordPool,
  getStableWordPool,
  LANGUAGE_LABELS,
  type Difficulty,
  type LanguageCode,
} from "./word-banks";
import { UserRankBadge } from "../components/user-rank-badge";
import { LanguageFlagIcon } from "../components/language-flag-icon";
import { FriendProfileModal } from "../components/friend-profile-modal";
import { getTypingXpGain } from "@/lib/user-level";

type TestStatus = "idle" | "running" | "finished";
type WordState = "pending" | "correct" | "incorrect";
type TypingVariant = "normal" | "advanced";
type TopRankingPeriod = "today" | "weekly" | "all";
type WordBankMode = "normal" | "advanced";
type SessionUser = { id: string; username: string; displayName?: string | null; needsDisplayNameSetup?: boolean };
type UserTag = {
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
type GhostReplay = {
  bestWpm: number;
  duration: number;
  wordCount: number;
  checkpoints: Array<{ wordIndex: number; atMs: number }>;
};
type TypingLeaderboardRow = {
  id: string;
  wpm: number;
  accuracy: number;
  language: LanguageCode;
  difficulty: Difficulty;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    tags?: Array<{
      code:
        | "role_mod"
        | "lang_daily_1"
        | "lang_weekly_1"
        | "lang_alltime_1"
        | "adv_daily_1"
        | "adv_weekly_1"
        | "adv_alltime_1";
      label: string;
    }>;
  } | null;
};
type FriendProfileData = {
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    rating: number;
    trustScore: number;
    streakDays: number;
  };
  summary: {
    totalTests: number;
    avgWpm: number;
    avgAccuracy: number;
    bestWpm: number;
    competitionJoined: number;
    competitionWins: number;
  };
  trend: Array<{
    date: string;
    wpm: number;
    accuracy: number;
  }>;
  recentCompetitions: Array<{
    competitionId: string;
    title: string;
    language: string;
    endedAt: string;
    status: string;
    bestWpm: number;
    bestAccuracy: number;
    bestResultAt: string | null;
    isWinner: boolean;
  }>;
};

type SaveProgress = {
  xpGained: number;
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
  leveledUp: boolean;
};

const MAX_CHARS_PER_LINE_NORMAL = 108;
const MAX_CHARS_PER_LINE_ADVANCED = 102;
const VISUAL_WORD_OVERHEAD = 2;
const VISIBLE_LINES = 2;
const DEFAULT_DURATION_SECONDS = 60;
const DURATION_OPTIONS = [15, 30, 60, 120] as const;
const TOP_RANKING_PERIODS: Array<{ value: TopRankingPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "all", label: "All-time" },
];
const PREFERRED_LANGUAGE_KEY = "fastfingers:preferred-language";
const AFK_MIN_TYPED_CHARS = 15;
const AFK_IDLE_THRESHOLD_MS = 12000;
const WORD_SEPARATOR_CHARS = 1;

function getGhostKey(language: LanguageCode, difficulty: Difficulty, duration: number) {
  return `fastfingers:ghost:${language}:${difficulty}:${duration}`;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 100);
}

function compareWords(inputWord: string, targetWord: string) {
  const maxLength = Math.max(inputWord.length, targetWord.length);
  let correctChars = 0;

  for (let index = 0; index < maxLength; index += 1) {
    if (inputWord[index] && inputWord[index] === targetWord[index]) {
      correctChars += 1;
    }
  }

  const mistakes = maxLength - correctChars;
  return { correctChars, mistakes };
}

function getInitialWords(language: LanguageCode, difficulty: Difficulty): string[] {
  return getStableWordPool(language, difficulty);
}

function resolveWordBankMode(difficulty: Difficulty): WordBankMode {
  return difficulty === "hard" ? "advanced" : "normal";
}

function resolvePreferredLanguage(): LanguageCode {
  const valid = new Set<LanguageCode>(["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"]);
  const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
  if (stored && valid.has(stored as LanguageCode)) {
    return stored as LanguageCode;
  }

  return "en";
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatLeaderboardTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLineRanges(words: string[], maxCharsPerLine: number) {
  const ranges: Array<{ start: number; end: number }> = [];
  const wordToLine = new Array<number>(words.length).fill(0);

  if (words.length === 0) {
    return { ranges, wordToLine };
  }

  let start = 0;
  let lineChars = 0;
  let lineIndex = 0;

  for (let i = 0; i < words.length; i += 1) {
    const wordLength = words[i].length;
    const visualWordLength = wordLength + VISUAL_WORD_OVERHEAD;
    const nextChars = lineChars === 0 ? visualWordLength : lineChars + 1 + visualWordLength;

    if (lineChars > 0 && nextChars > maxCharsPerLine) {
      ranges.push({ start, end: i });
      start = i;
      lineChars = wordLength;
      lineIndex += 1;
    } else {
      lineChars = nextChars;
    }

    wordToLine[i] = lineIndex;
  }

  ranges.push({ start, end: words.length });
  return { ranges, wordToLine };
}

function dedupeLeaderboardByUser(rows: TypingLeaderboardRow[], limit: number): TypingLeaderboardRow[] {
  const seenUserIds = new Set<string>();
  const deduped: TypingLeaderboardRow[] = [];

  for (const row of rows) {
    const userId = row.user?.id;
    if (userId) {
      if (seenUserIds.has(userId)) {
        continue;
      }
      seenUserIds.add(userId);
    }

    deduped.push(row);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

function isSameLeaderboard(
  current: TypingLeaderboardRow[],
  next: TypingLeaderboardRow[],
): boolean {
  if (current.length !== next.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    const a = current[index];
    const b = next[index];
    if (
      a.id !== b.id ||
      a.wpm !== b.wpm ||
      a.accuracy !== b.accuracy ||
      a.createdAt !== b.createdAt ||
      (a.user?.id ?? null) !== (b.user?.id ?? null)
    ) {
      return false;
    }

    const aTags = (a.user?.tags ?? []).map((tag) => tag.code).join("|");
    const bTags = (b.user?.tags ?? []).map((tag) => tag.code).join("|");
    if (aTags !== bTags) {
      return false;
    }
  }

  return true;
}

export function TypingExperience({ variant = "normal" }: { variant?: TypingVariant }) {
  const router = useRouter();
  const typingInputRef = useRef<HTMLInputElement>(null);
  const languageSelectRef = useRef<HTMLDivElement>(null);
  const difficulty: Difficulty = variant === "advanced" ? "hard" : "medium";
  const [duration, setDuration] = useState(DEFAULT_DURATION_SECONDS);
  const [leaderboardDuration, setLeaderboardDuration] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [topRankingPeriod, setTopRankingPeriod] = useState<TopRankingPeriod>("today");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [words, setWords] = useState<string[]>(() => getInitialWords("en", difficulty));
  const [wordBankOverrides, setWordBankOverrides] = useState<
    Partial<Record<LanguageCode, Partial<Record<WordBankMode, string[]>>>>
  >({});
  const [wordStates, setWordStates] = useState<WordState[]>(() => Array(BANK_SIZE_PER_LEVEL).fill("pending"));
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATION_SECONDS);
  const [status, setStatus] = useState<TestStatus>("idle");
  const [bestWpm, setBestWpm] = useState(0);
  const [totalCorrectChars, setTotalCorrectChars] = useState(0);
  const [totalTypedChars, setTotalTypedChars] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [typedWordsCount, setTypedWordsCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const [animatedXp, setAnimatedXp] = useState(0);
  const animatedXpRef = useRef(0);
  const [hasSavedCurrentRun, setHasSavedCurrentRun] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [ghostReplay, setGhostReplay] = useState<GhostReplay | null>(null);
  const [ghostProgress, setGhostProgress] = useState(0);
  const [currentReplayCheckpoints, setCurrentReplayCheckpoints] = useState<
    Array<{ wordIndex: number; atMs: number }>
  >([]);
  const [dailyLeaderboard, setDailyLeaderboard] = useState<TypingLeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [friendProfileOpen, setFriendProfileOpen] = useState(false);
  const [friendProfileLoading, setFriendProfileLoading] = useState(false);
  const [friendProfileError, setFriendProfileError] = useState<string | null>(null);
  const [friendProfileData, setFriendProfileData] = useState<FriendProfileData | null>(null);
  const [friendProfileTags, setFriendProfileTags] = useState<UserTag[]>([]);
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [uiModalOpen, setUiModalOpen] = useState(false);
  const runStartedAtRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number | null>(null);
  const hasLoadedLeaderboardRef = useRef(false);
  const prevBlockingModalRef = useRef(false);

  const elapsedSeconds = duration - timeLeft;
  const elapsedSecondsSafe = Math.max(elapsedSeconds, 1);
  const wpm = Math.round((totalTypedChars / 5) * (60 / elapsedSecondsSafe));
  const accuracy = Math.round(
    (totalCorrectChars / Math.max(totalTypedChars, 1)) * 100,
  );
  const progress = clampPercent((currentWordIndex / words.length) * 100);
  const showResultModal = status === "finished" && timeLeft === 0;
  const hasBlockingModal = uiModalOpen || friendProfileOpen || showResultModal;
  const estimatedXp = getTypingXpGain({
    wpm,
    accuracy,
    mistakes: Math.max(totalMistakes, 0),
    duration,
  });
  const xpTarget = authUser ? Math.max(0, saveProgress?.xpGained ?? estimatedXp) : 0;
  const languageOptions = Object.entries(LANGUAGE_LABELS) as [LanguageCode, string][];
  const typingMode = variant === "advanced" ? "advanced" : "normal";
  const leaderboardHref = `/leaderboard?mode=typing&period=${topRankingPeriod}&sort=top&language=${language}&typingMode=${typingMode}&duration=${leaderboardDuration}`;

  const maxCharsPerLine = variant === "advanced" ? MAX_CHARS_PER_LINE_ADVANCED : MAX_CHARS_PER_LINE_NORMAL;
  const currentWordBankMode: WordBankMode = resolveWordBankMode(difficulty);

  function getSeedOverride(nextLanguage: LanguageCode, nextDifficulty: Difficulty): string[] | null {
    const mode = resolveWordBankMode(nextDifficulty);
    const seeded = wordBankOverrides[nextLanguage]?.[mode];
    if (!seeded || seeded.length === 0) return null;
    return seeded;
  }

  function generateWords(nextLanguage: LanguageCode, nextDifficulty: Difficulty, stable = false): string[] {
    const overrideSeed = getSeedOverride(nextLanguage, nextDifficulty);
    if (overrideSeed) {
      return buildWordPoolFromSeed(overrideSeed, nextDifficulty, { stable });
    }
    return stable ? getStableWordPool(nextLanguage, nextDifficulty) : getWordPool(nextLanguage, nextDifficulty);
  }

  const { ranges: lineRanges, wordToLine } = useMemo(
    () => buildLineRanges(words, maxCharsPerLine),
    [maxCharsPerLine, words],
  );

  const currentLineIndex = useMemo(() => {
    if (lineRanges.length === 0) {
      return 0;
    }

    const clampedWordIndex = Math.min(currentWordIndex, words.length - 1);
    return wordToLine[clampedWordIndex] ?? 0;
  }, [currentWordIndex, lineRanges.length, wordToLine, words.length]);

  const visibleStartLine = useMemo(() => {
    if (lineRanges.length <= VISIBLE_LINES) {
      return 0;
    }

    // Shift the window every time one line is completed:
    // current line becomes top row, next line becomes bottom row.
    return Math.min(currentLineIndex, lineRanges.length - VISIBLE_LINES);
  }, [currentLineIndex, lineRanges.length]);

  const visibleRanges = useMemo(
    () => lineRanges.slice(visibleStartLine, visibleStartLine + VISIBLE_LINES),
    [lineRanges, visibleStartLine],
  );

  useEffect(() => {
    const preferred = resolvePreferredLanguage();
    if (preferred !== language) {
      setLanguage(preferred);
      setWords(getInitialWords(preferred, difficulty));
      setWordStates(Array(BANK_SIZE_PER_LEVEL).fill("pending"));
      setCurrentWordIndex(0);
      setCurrentInput("");
      setTimeLeft(duration);
      setStatus("idle");
      setTotalCorrectChars(0);
      setTotalTypedChars(0);
      setTotalMistakes(0);
      setTypedWordsCount(0);
      setHasSavedCurrentRun(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWordBankOverrides() {
      try {
        const response = await fetch(`/api/word-bank?language=${encodeURIComponent(language)}`, { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as {
          data?: { normal?: string[] | null; advanced?: string[] | null };
        };
        if (cancelled || !json.data) return;

        const nextForLanguage: Partial<Record<WordBankMode, string[]>> = {};
        if (Array.isArray(json.data.normal) && json.data.normal.length > 0) {
          nextForLanguage.normal = json.data.normal;
        }
        if (Array.isArray(json.data.advanced) && json.data.advanced.length > 0) {
          nextForLanguage.advanced = json.data.advanced;
        }

        setWordBankOverrides((prev) => ({
          ...prev,
          [language]: nextForLanguage,
        }));
      } catch {
        if (!cancelled) {
          setWordBankOverrides((prev) => ({ ...prev, [language]: {} }));
        }
      }
    }

    void loadWordBankOverrides();
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    setBestWpm(0);
    const cachedBest = window.localStorage.getItem(
      `fastfingers:best-wpm:${language}:${difficulty}`,
    );
    if (cachedBest) {
      const parsed = Number(cachedBest);
      if (Number.isFinite(parsed)) {
        setBestWpm(parsed);
      }
    }
  }, [difficulty, language]);

  useEffect(() => {
    const key = getGhostKey(language, difficulty, duration);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setGhostReplay(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as GhostReplay;
      if (!parsed || !Array.isArray(parsed.checkpoints)) {
        setGhostReplay(null);
        return;
      }
      setGhostReplay(parsed);
    } catch {
      setGhostReplay(null);
    }
  }, [difficulty, duration, language]);

  useEffect(() => {
    if (status !== "idle") return;
    if (currentWordIndex !== 0) return;
    if (currentInput.trim().length > 0) return;
    const seeded = wordBankOverrides[language]?.[currentWordBankMode];
    if (!seeded || seeded.length === 0) return;

    const nextWords = generateWords(language, difficulty, true);
    setWords(nextWords);
    setWordStates(Array(nextWords.length).fill("pending"));
  }, [
    currentInput,
    currentWordBankMode,
    currentWordIndex,
    difficulty,
    language,
    status,
    wordBankOverrides,
  ]);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setStatus("finished");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as { data: SessionUser | null };
        if (!cancelled) {
          setAuthUser(json.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null);
        }
      }
    }

    function onAuthChanged() {
      void loadSession();
    }

    void loadSession();
    window.addEventListener("ff:auth-changed", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:auth-changed", onAuthChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDailyLeaderboard() {
      const isInitialLoad = !hasLoadedLeaderboardRef.current;
      try {
        if (isInitialLoad) {
          setLeaderboardLoading(true);
          setLeaderboardError(null);
        }
        const params = new URLSearchParams();
        params.set("period", topRankingPeriod);
        params.set("sort", "top");
        params.set("limit", "20");
        params.set("language", language);
        params.set("difficulty", difficulty);
        params.set("duration", String(leaderboardDuration));
        const response = await fetch(`/api/test-results?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load daily leaderboard.");
        }
        const json = (await response.json()) as { data: TypingLeaderboardRow[] };
        if (!cancelled) {
          const nextRows = dedupeLeaderboardByUser(json.data, 20);
          setDailyLeaderboard((current) => (isSameLeaderboard(current, nextRows) ? current : nextRows));
          setLeaderboardError(null);
          hasLoadedLeaderboardRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          if (isInitialLoad) {
            setDailyLeaderboard([]);
            setLeaderboardError(err instanceof Error ? err.message : "Unknown error");
          }
        }
      } finally {
        if (!cancelled) {
          setLeaderboardLoading(false);
        }
      }
    }

    void loadDailyLeaderboard();
    const timer = window.setInterval(() => {
      void loadDailyLeaderboard();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [difficulty, language, leaderboardDuration, topRankingPeriod]);

  useEffect(() => {
    const open = document.body.getAttribute("data-ff-ui-modal-open") === "1";
    setUiModalOpen(open);

    function onModalState(event: Event): void {
      const custom = event as CustomEvent<{ open?: boolean }>;
      setUiModalOpen(Boolean(custom.detail?.open));
    }

    window.addEventListener("ff:ui-modal-state", onModalState as EventListener);
    return () => {
      window.removeEventListener("ff:ui-modal-state", onModalState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!hasBlockingModal) return;
    typingInputRef.current?.blur();
  }, [hasBlockingModal]);

  useEffect(() => {
    const wasBlocking = prevBlockingModalRef.current;
    if (wasBlocking && !hasBlockingModal && status !== "finished") {
      focusTypingInput();
    }
    prevBlockingModalRef.current = hasBlockingModal;
  }, [hasBlockingModal, status]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!languageSelectRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsLanguageOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    function onPointerUp(event: PointerEvent): void {
      if (status === "finished" || hasBlockingModal) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest(".modern-select-panel")) {
        return;
      }

      window.requestAnimationFrame(() => {
        typingInputRef.current?.focus();
      });
    }

    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [status, hasBlockingModal]);

  useEffect(() => {
    if (currentWordIndex >= words.length && status === "running") {
      setStatus("finished");
    }
  }, [currentWordIndex, words.length, status]);

  useEffect(() => {
    if (status !== "finished") {
      return;
    }

    if (wpm > bestWpm) {
      setBestWpm(wpm);
      window.localStorage.setItem(`fastfingers:best-wpm:${language}:${difficulty}`, String(wpm));
    }
  }, [status, wpm, bestWpm, difficulty, language]);

  useEffect(() => {
    if (status !== "running" || !ghostReplay || !runStartedAtRef.current) {
      setGhostProgress(0);
      return;
    }

    const timer = window.setInterval(() => {
      if (!runStartedAtRef.current) {
        return;
      }
      const elapsed = Date.now() - runStartedAtRef.current;
      let ghostWordIndex = 0;
      for (const checkpoint of ghostReplay.checkpoints) {
        if (checkpoint.atMs <= elapsed) {
          ghostWordIndex = checkpoint.wordIndex;
          continue;
        }
        break;
      }

      const nextProgress = clampPercent((ghostWordIndex / Math.max(ghostReplay.wordCount, 1)) * 100);
      setGhostProgress(nextProgress);
    }, 80);

    return () => window.clearInterval(timer);
  }, [ghostReplay, status]);

  useEffect(() => {
    if (!showResultModal || !authUser) {
      animatedXpRef.current = 0;
      setAnimatedXp(0);
      return;
    }

    let rafId = 0;
    const from = animatedXpRef.current;
    const to = xpTarget;
    if (to === from) {
      return;
    }

    const startAt = performance.now();
    const durationMs = 520;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (to - from) * eased);
      animatedXpRef.current = value;
      setAnimatedXp(value);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    rafId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [showResultModal, authUser, xpTarget]);

  useEffect(() => {
    if (status !== "finished" || isSaving || hasSavedCurrentRun) {
      return;
    }

    if (!authUser) {
      setHasSavedCurrentRun(true);
      setSaveError(null);
      setSaveProgress(null);
      return;
    }

    const idleMs = lastActivityAtRef.current ? Date.now() - lastActivityAtRef.current : Number.POSITIVE_INFINITY;
    const isAfkRun = totalTypedChars < AFK_MIN_TYPED_CHARS || idleMs > AFK_IDLE_THRESHOLD_MS;
    if (isAfkRun) {
      setHasSavedCurrentRun(true);
      setSaveError("AFK detected: result not saved.");
      setSaveProgress(null);
      return;
    }

    let cancelled = false;

    async function persistResult(): Promise<void> {
      try {
        setIsSaving(true);
        setSaveError(null);
        const response = await fetch("/api/test-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wpm,
            accuracy,
            duration,
            wordCount: words.length,
            mistakes: Math.max(totalMistakes, 0),
            language,
            difficulty,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save result");
        }
        const json = (await response.json()) as {
          progress?: SaveProgress | null;
        };
        if (!cancelled) {
          setSaveProgress(json.progress ?? null);
          setHasSavedCurrentRun(true);
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : "Failed to save result");
          setSaveProgress(null);
          setHasSavedCurrentRun(true);
        }
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    }

    void persistResult();

    return () => {
      cancelled = true;
    };
  }, [
    status,
    isSaving,
    hasSavedCurrentRun,
    authUser,
    wpm,
    accuracy,
    duration,
    words.length,
    totalTypedChars,
    totalMistakes,
    language,
    difficulty,
  ]);

  function resetTest(nextLanguage = language, nextDuration = duration): void {
    const nextWords = generateWords(nextLanguage, difficulty, false);
    setWords(nextWords);
    setWordStates(Array(nextWords.length).fill("pending"));
    setCurrentWordIndex(0);
    setCurrentInput("");
    setTimeLeft(nextDuration);
    setStatus("idle");
    setTotalCorrectChars(0);
    setTotalTypedChars(0);
    setTotalMistakes(0);
    setTypedWordsCount(0);
    setSaveError(null);
    setSaveProgress(null);
    setHasSavedCurrentRun(false);
    setCurrentReplayCheckpoints([]);
    setGhostProgress(0);
    runStartedAtRef.current = null;
    lastActivityAtRef.current = null;
  }

  function focusTypingInput(): void {
    if (hasBlockingModal) return;
    window.requestAnimationFrame(() => {
      typingInputRef.current?.focus();
    });
  }

  function submitCurrentWord(): void {
    if (status === "finished" || currentWordIndex >= words.length) {
      return;
    }

    const inputWord = currentInput.trim();
    if (inputWord.length === 0) {
      return;
    }

    const targetWord = words[currentWordIndex];
    const isCorrect = inputWord === targetWord;
    const { correctChars, mistakes } = compareWords(inputWord, targetWord);

    setWordStates((previous) => {
      const next = [...previous];
      next[currentWordIndex] = isCorrect ? "correct" : "incorrect";
      return next;
    });

    // 10fastfingers-like scoring: submitted word + separator (space) are counted as characters.
    setTotalCorrectChars((current) => current + correctChars + WORD_SEPARATOR_CHARS);
    setTotalTypedChars((current) => current + inputWord.length + WORD_SEPARATOR_CHARS);
    setTotalMistakes((current) => current + mistakes);
    setTypedWordsCount((current) => current + 1);
    setCurrentWordIndex((current) => current + 1);
    setCurrentInput("");

    if (runStartedAtRef.current) {
      const elapsed = Date.now() - runStartedAtRef.current;
      setCurrentReplayCheckpoints((prev) => [
        ...prev,
        { wordIndex: currentWordIndex + 1, atMs: elapsed },
      ]);
    }
    lastActivityAtRef.current = Date.now();
  }

  function gradeFromWpm(currentWpm: number): string {
    if (currentWpm >= 110) return "S";
    if (currentWpm >= 90) return "A";
    if (currentWpm >= 70) return "B";
    if (currentWpm >= 50) return "C";
    return "D";
  }

  async function openFriendProfile(userId: string): Promise<void> {
    setFriendProfileOpen(true);
    setFriendProfileLoading(true);
    setFriendProfileError(null);
    setFriendProfileData(null);
    setFriendProfileTags([]);

    try {
      const response = await fetch(`/api/profile/${userId}`, { cache: "no-store" });
      const json = (await response.json()) as { data?: FriendProfileData; error?: string };

      if (!response.ok || !json.data) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("ff:require-login"));
        }
        throw new Error(json.error ?? "Failed to load profile.");
      }

      setFriendProfileData(json.data);
      try {
        const query = new URLSearchParams({
          language,
          names: json.data.user.username,
        });
        const tagResponse = await fetch(`/api/user-language-tags?${query.toString()}`, { cache: "no-store" });
        if (tagResponse.ok) {
          const tagJson = (await tagResponse.json()) as { data: Record<string, UserTag[]> };
          setFriendProfileTags(tagJson.data?.[json.data.user.username] ?? []);
        }
      } catch {
        setFriendProfileTags([]);
      }
    } catch (error) {
      setFriendProfileError(error instanceof Error ? error.message : "Failed to load profile.");
    } finally {
      setFriendProfileLoading(false);
    }
  }

  async function handleMessageFromProfile(): Promise<void> {
    if (!friendProfileData?.user.id) return;

    try {
      setMessageActionBusy(true);
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: friendProfileData.user.id }),
      });
      const json = (await response.json()) as { data?: { id: string }; error?: string };
      if (!response.ok || !json.data?.id) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("ff:require-login"));
          throw new Error("Login first to send message.");
        }
        throw new Error(json.error ?? "Failed to open chat.");
      }

      setFriendProfileOpen(false);
      setFriendProfileData(null);
      setFriendProfileError(null);
      setFriendProfileTags([]);
      router.push(`/messages?conversation=${encodeURIComponent(json.data.id)}`);
    } catch (error) {
      setFriendProfileError(error instanceof Error ? error.message : "Failed to open chat.");
    } finally {
      setMessageActionBusy(false);
    }
  }

  useEffect(() => {
    if (status !== "finished" || currentReplayCheckpoints.length === 0) {
      return;
    }

    const hasExistingGhost = Boolean(ghostReplay && ghostReplay.checkpoints.length > 0);
    const currentBestGhostWpm = ghostReplay?.bestWpm ?? -1;
    const shouldSaveGhost = !hasExistingGhost || wpm > currentBestGhostWpm;
    if (!shouldSaveGhost) {
      return;
    }

    const payload: GhostReplay = {
      bestWpm: wpm,
      duration,
      wordCount: words.length,
      checkpoints: currentReplayCheckpoints,
    };
    window.localStorage.setItem(getGhostKey(language, difficulty, duration), JSON.stringify(payload));
    setGhostReplay(payload);
  }, [
    status,
    currentReplayCheckpoints,
    wpm,
    ghostReplay,
    duration,
    words.length,
    language,
    difficulty,
  ]);

  return (
    <main className="site-shell typing-page">
      <section className="typing-header">
        <h1>
          <KeyboardIcon className="ui-icon ui-icon-accent" />
          {variant === "advanced" ? "Typing Test (Advanced)" : "Typing Test (Normal)"}
        </h1>
        <p>
          Word bank per level: {BANK_SIZE_PER_LEVEL} words. Display shows only 2 lines, then shifts
          to the next 2-line block.
        </p>
      </section>

      <section className="typing-controls glass card">
        <div className="typing-control-block">
          <p className="typing-control-label">
            <GlobeIcon className="ui-icon" />
            Language
          </p>
          <div className="modern-select" ref={languageSelectRef}>
            <button
              type="button"
              className={`modern-select-trigger ${isLanguageOpen ? "open" : ""}`}
              onClick={() => setIsLanguageOpen((current) => !current)}
              disabled={status === "running"}
              aria-haspopup="listbox"
              aria-expanded={isLanguageOpen}
            >
              <span className="modern-select-value">
                <span className="language-flag-icon">
                  <LanguageFlagIcon language={language} />
                </span>
                {LANGUAGE_LABELS[language]}
              </span>
              <span className="modern-select-chevron">v</span>
            </button>
            {isLanguageOpen ? (
              <div className="modern-select-panel" role="listbox" aria-label="Language options">
                {languageOptions.map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    role="option"
                    aria-selected={language === code}
                    className={`modern-select-option ${language === code ? "active" : ""}`}
                    onClick={() => {
                      setLanguage(code);
                      setLeaderboardDuration(DEFAULT_DURATION_SECONDS);
                      window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, code);
                      resetTest(code, duration);
                      setIsLanguageOpen(false);
                      focusTypingInput();
                    }}
                  >
                    <span className="modern-select-value">
                      <span className="language-flag-icon">
                        <LanguageFlagIcon language={code} />
                      </span>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="typing-control-block">
          <p className="typing-control-label">
            <TimerIcon className="ui-icon" />
            Duration
          </p>
          <div className="typing-segmented typing-duration-segmented">
            {DURATION_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className={`segment-btn ${duration === item ? "active" : ""}`}
                disabled={status === "running"}
                onClick={() => {
                  setDuration(item);
                  resetTest(language, item);
                  focusTypingInput();
                }}
              >
                {item}s
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            resetTest();
            focusTypingInput();
          }}
        >
          <KeyboardIcon className="ui-icon" />
          Restart Test
        </button>
      </section>

      <section className="typing-stats grid-3">
        <article className="card glass">
          <span className="ui-icon-badge">
            <GaugeIcon className="ui-icon" />
          </span>
          <p className="kpi">{wpm}</p>
          <p className="kpi-label wpm-label">
            WPM
            {wpm >= 100 ? (
              <motion.span
                className="wpm-boost"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: [1, 1.12, 1], opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <RocketIcon className="ui-icon" />
                Boost
              </motion.span>
            ) : null}
          </p>
        </article>
        <article className="card glass">
          <span className="ui-icon-badge">
            <CheckIcon className="ui-icon" />
          </span>
          <p className="kpi">{accuracy}%</p>
          <p className="kpi-label">Accuracy</p>
        </article>
        <article className="card glass">
          <span className="ui-icon-badge">
            <TimerIcon className="ui-icon" />
          </span>
          <p className="kpi">{formatSeconds(timeLeft)}</p>
          <p className="kpi-label">Time Left</p>
        </article>
      </section>

      <section className="typing-progress card glass" aria-label="Typing progress">
        {ghostReplay ? (
          <div className="typing-progress-label-row" aria-hidden>
            <span className="typing-progress-mini-label">You</span>
            <span className="typing-progress-mini-label ghost">Ghost</span>
          </div>
        ) : null}
        <div className="typing-progress-track">
          <div className="typing-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        {ghostReplay ? (
          <div className="typing-progress-track typing-progress-track-ghost">
            <div
              className="typing-progress-bar typing-progress-bar-ghost"
              style={{ width: `${status === "running" ? ghostProgress : 0}%` }}
            />
          </div>
        ) : null}
        <p>
          <UsersIcon className="ui-icon" /> Player:{" "}
          <span className="typing-player-name-linklike">{authUser?.displayName ?? authUser?.username ?? "Guest"}</span> |{" "}
          <GlobeIcon className="ui-icon" /> Language: {LANGUAGE_LABELS[language]} |{" "}
          <SparkIcon className="ui-icon" /> Mode: {variant} |{" "}
          <GaugeIcon className="ui-icon" /> Progress: {Math.round(progress)}% |{" "}
          <AlertIcon className="ui-icon" /> Mistakes: {Math.max(totalMistakes, 0)} |{" "}
          <SparkIcon className="ui-icon" /> Best: {bestWpm} wpm | <SparkIcon className="ui-icon" /> Ghost:{" "}
          {status === "running"
            ? `${Math.round(ghostProgress)}%`
            : ghostReplay
              ? `Ready (${ghostReplay.bestWpm} wpm)`
              : "No data"}
        </p>
        {ghostReplay ? (
          <p className="typing-ghost-motivation">
            <InfoIcon className="ui-icon" />
            Beat your ghost pace and break your personal best.
          </p>
        ) : null}
      </section>

      <section className="typing-arena card glass" aria-live="polite">
        <div className="typing-target-viewport">
          <AnimatePresence initial={false}>
            <motion.div
              key={visibleStartLine}
              className="typing-target typing-target-lines typing-target-layer"
              initial={{ opacity: 0.94 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.94 }}
              transition={{ duration: 0.06, ease: "linear" }}
            >
              {visibleRanges.map((range, lineIndex) => {
                const lineWords = words.slice(range.start, range.end);

                return (
                  <div key={`line-${lineIndex}`} className="typing-line">
                    {lineWords.map((word, localIndex) => {
                      const globalIndex = range.start + localIndex;
                      const state = wordStates[globalIndex];
                      const isCurrent = globalIndex === currentWordIndex && status !== "finished";
                      const className =
                        state === "correct"
                          ? "word-correct"
                          : state === "incorrect"
                            ? "word-incorrect"
                            : isCurrent
                              ? "word-current"
                              : "word-pending";

                      return (
                        <span key={`${word}-${globalIndex}`} className={`typing-word ${className}`}>
                          {word}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        <input
          ref={typingInputRef}
          className="typing-input typing-input-word"
          value={currentInput}
          onChange={(event) => {
            const nextValue = event.target.value;
            setCurrentInput(nextValue);
            if (status === "idle" && nextValue.trim().length > 0) {
              runStartedAtRef.current = Date.now();
              lastActivityAtRef.current = runStartedAtRef.current;
              setStatus("running");
            }
            if (status === "running") {
              lastActivityAtRef.current = Date.now();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === " ") {
              event.preventDefault();
              submitCurrentWord();
            }

            if (event.key === "Enter") {
              event.preventDefault();
              submitCurrentWord();
            }
          }}
          placeholder="Type the active word then press Space..."
          spellCheck={false}
          autoFocus
          disabled={status === "finished" || hasBlockingModal}
        />
      </section>

      <section className="typing-daily-leaderboard card glass" aria-label="Daily typing leaderboard">
        <h2 className="feature-title">
          <SparkIcon className="ui-icon ui-icon-accent" />
          Top Ranking
        </h2>
        <div className="leaderboard-duration-links typing-top-duration-tabs" aria-label="Top ranking period tabs">
          {TOP_RANKING_PERIODS.map((item) => (
            <button
              key={`top-period-${item.value}`}
              type="button"
              className={`duration-link-btn ${topRankingPeriod === item.value ? "active" : ""}`}
              onClick={() => setTopRankingPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="leaderboard-duration-links typing-top-duration-tabs" aria-label="Top ranking duration tabs">
          {DURATION_OPTIONS.map((item) => (
            <button
              key={`top-duration-${item}`}
              type="button"
              className={`duration-link-btn ${leaderboardDuration === item ? "active" : ""}`}
              onClick={() => setLeaderboardDuration(item)}
            >
              {item}s
            </button>
          ))}
        </div>
        <p className="kpi-label">
          Period: <strong>{topRankingPeriod === "today" ? "Today" : topRankingPeriod === "weekly" ? "Weekly" : "All-time"}</strong> |{" "}
          Mode: <strong>{variant}</strong> | Language: <strong>{LANGUAGE_LABELS[language]}</strong> | Duration:{" "}
          <strong>{leaderboardDuration}s</strong>
        </p>

        {leaderboardLoading ? <p className="kpi-label">Loading leaderboard...</p> : null}
        {!leaderboardLoading && leaderboardError ? (
          <p className="kpi-label">Error: {leaderboardError}</p>
        ) : null}
        {!leaderboardLoading && !leaderboardError && dailyLeaderboard.length === 0 ? (
          <p className="kpi-label">
            No data yet for {topRankingPeriod === "today" ? "today" : topRankingPeriod === "weekly" ? "this week" : "all-time"} in this language.
          </p>
        ) : null}

        {!leaderboardLoading && !leaderboardError && dailyLeaderboard.length > 0 ? (
          <div className="typing-mini-leaderboard">
            {dailyLeaderboard.map((row, index) => (
              <article key={row.id} className="typing-mini-leaderboard-row">
                <span className={`typing-mini-rank ${index < 3 ? `medal medal-${index + 1}` : ""}`}>
                  {index < 3 ? (index === 0 ? "1st" : index === 1 ? "2nd" : "3rd") : `#${index + 1}`}
                </span>
                <span className="typing-mini-user">
                  <span className="typing-mini-name-wrap">
                    {row.user?.id ? (
                      <button
                        type="button"
                        className="typing-mini-name typing-mini-name-btn"
                        onClick={() => void openFriendProfile(row.user!.id)}
                      >
                        {row.user.displayName ?? row.user.username}
                      </button>
                    ) : (
                      <span className="typing-mini-name">Guest</span>
                    )}
                    {row.user?.tags && row.user.tags.length > 0 ? (
                      <>
                        <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[row.language]}>
                          <LanguageFlagIcon language={row.language} />
                        </span>
                        <UserRankBadge tags={row.user.tags} />
                      </>
                    ) : null}
                  </span>
                  <span className="typing-mini-time">{formatLeaderboardTime(row.createdAt)}</span>
                </span>
                <span className="typing-mini-metric">{Math.round(row.wpm)} WPM</span>
                <span className="typing-mini-metric">{Math.round(row.accuracy)}%</span>
              </article>
            ))}
          </div>
        ) : null}

        <div className="typing-mini-actions">
          <Link href={leaderboardHref} className="btn btn-ghost">
            <GaugeIcon className="ui-icon" />
            View Full Leaderboard
          </Link>
        </div>
      </section>

      <AnimatePresence>
        {showResultModal && (
          <motion.div
            className="result-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <motion.section
              className="result-modal glass"
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <p className="badge">Final Result</p>
              <h2 className="result-modal-title">Time&apos;s Up</h2>
              <p className="kpi-label">
                <SparkIcon className="ui-icon" /> Grade: <strong>{gradeFromWpm(wpm)}</strong>
              </p>

              <div className="result-modal-stats">
                <article>
                  <p className="kpi">{wpm}</p>
                  <p className="kpi-label">WPM</p>
                </article>
                <article>
                  <p className="kpi">{accuracy}%</p>
                  <p className="kpi-label">Accuracy</p>
                </article>
                <article>
                  <p className="kpi">{typedWordsCount}</p>
                  <p className="kpi-label">Words Checked</p>
                </article>
                <article>
                  <p className="kpi">{Math.max(totalMistakes, 0)}</p>
                  <p className="kpi-label">Mistakes</p>
                </article>
                {authUser ? (
                  <article>
                    <p className="kpi">+{animatedXp}</p>
                    <p className="kpi-label">{saveProgress ? "XP" : "Est. XP"}</p>
                  </article>
                ) : null}
              </div>

              <AnimatePresence>
                {authUser && saveProgress?.leveledUp ? (
                  <motion.div
                    className="result-level-up-banner"
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: [1, 1.015, 1] }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.38, ease: "easeOut" }}
                  >
                    <TrophyIcon className="ui-icon" />
                    <span>Level Up! You reached Level {saveProgress.level}</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <p className="kpi-label">
                {!authUser
                  ? "Guest mode: result is not saved to leaderboard. Login to sync progress."
                  : isSaving
                    ? `Saving result... (Estimated +${estimatedXp} XP)`
                    : saveError
                      ? `Save error: ${saveError}`
                      : saveProgress
                        ? `Result saved • +${saveProgress.xpGained} XP • Level ${saveProgress.level}${saveProgress.leveledUp ? " (Level Up!)" : ""}`
                        : "Result saved to leaderboard."}
              </p>

              <div className="result-modal-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    resetTest();
                    focusTypingInput();
                  }}
                >
                  OK
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <FriendProfileModal
        open={friendProfileOpen}
        loading={friendProfileLoading}
        error={friendProfileError}
        data={friendProfileData}
        tags={friendProfileTags}
        languageForTags={language}
        messageBusy={messageActionBusy}
        onMessage={() => {
          void handleMessageFromProfile();
        }}
        onClose={() => {
          setFriendProfileOpen(false);
          setFriendProfileData(null);
          setFriendProfileError(null);
          setFriendProfileTags([]);
        }}
      />
    </main>
  );
}
