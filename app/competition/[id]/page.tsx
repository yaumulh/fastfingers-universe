"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertIcon,
  ArrowLeftIcon,
  ChatIcon,
  CheckIcon,
  GaugeIcon,
  GlobeIcon,
  KeyboardIcon,
  RefreshIcon,
  SparkIcon,
  TimerIcon,
  TrophyIcon,
  UsersIcon,
} from "@/app/components/icons";
import { UserRankBadge } from "@/app/components/user-rank-badge";
import { LanguageFlagIcon } from "@/app/components/language-flag-icon";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import {
  BANK_SIZE_PER_LEVEL,
  buildWordPoolFromSeed,
  getStableWordPool,
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  type LanguageCode,
} from "@/app/typing/word-banks";

type SessionUser = { id: string; username: string; displayName?: string | null; needsDisplayNameSetup?: boolean };
type WordState = "pending" | "correct" | "incorrect";
type RunStatus = "idle" | "running" | "finished";
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

type CompetitionParticipant = {
  id: string;
  userId: string;
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
  bestWpm: number;
  bestAccuracy: number;
  bestResultAt: string | null;
  testsCount: number;
};

type CompetitionItem = {
  id: string;
  title: string;
  language: LanguageCode;
  hostEditUsed: boolean;
  status: "active" | "finished";
  startsAt: string;
  endsAt: string;
  winnerName: string | null;
  host: {
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
  };
  participants: CompetitionParticipant[];
};

type ProfileData = {
  user: { id: string; username: string; displayName?: string | null; rating: number; trustScore: number };
  summary: {
    totalTests: number;
    avgWpm: number;
    bestWpm: number;
    avgAccuracy: number;
    competitionJoined: number;
    competitionWins: number;
  };
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

const DURATION_SECONDS = 60;
const DURATION_OPTIONS = [15, 30, 60, 120] as const;
const WORD_SEPARATOR_CHARS = 1;
const MAX_CHARS_PER_LINE = 108;
const VISUAL_WORD_OVERHEAD = 2;
const VISIBLE_LINES = 2;
const AFK_MIN_TYPED_CHARS = 15;
const AFK_IDLE_THRESHOLD_MS = 12000;

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getCompetitionWords(competitionId: string, language: LanguageCode, seedOverride?: string[] | null): string[] {
  const source = seedOverride && seedOverride.length > 0
    ? [...buildWordPoolFromSeed(seedOverride, "medium", { stable: true })]
    : [...getStableWordPool(language, "medium")];
  const rng = createRng(hashString(`${competitionId}:${language}:normal`));
  for (let i = source.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(0, BANK_SIZE_PER_LEVEL);
}

function compareWords(inputWord: string, targetWord: string) {
  const maxLength = Math.max(inputWord.length, targetWord.length);
  let correctChars = 0;
  for (let i = 0; i < maxLength; i += 1) {
    if (inputWord[i] && inputWord[i] === targetWord[i]) correctChars += 1;
  }
  return { correctChars, mistakes: maxLength - correctChars };
}

function buildLineRanges(words: string[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  const wordToLine = new Array<number>(words.length).fill(0);
  if (words.length === 0) return { ranges, wordToLine };

  let start = 0;
  let lineChars = 0;
  let lineIndex = 0;
  for (let i = 0; i < words.length; i += 1) {
    const visual = words[i].length + VISUAL_WORD_OVERHEAD;
    const nextChars = lineChars === 0 ? visual : lineChars + 1 + visual;
    if (lineChars > 0 && nextChars > MAX_CHARS_PER_LINE) {
      ranges.push({ start, end: i });
      start = i;
      lineChars = words[i].length;
      lineIndex += 1;
    } else {
      lineChars = nextChars;
    }
    wordToLine[i] = lineIndex;
  }
  ranges.push({ start, end: words.length });
  return { ranges, wordToLine };
}

export default function CompetitionRoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const roomId = params.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const seededRoomRef = useRef<string | null>(null);
  const lastActivityAtRef = useRef<number | null>(null);

  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [competition, setCompetition] = useState<CompetitionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [words, setWords] = useState<string[]>([]);
  const [wordStates, setWordStates] = useState<WordState[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS);
  const [correctChars, setCorrectChars] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [customNormalSeed, setCustomNormalSeed] = useState<string[] | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileTags, setProfileTags] = useState<UserTag[]>([]);
  const [messageActionBusy, setMessageActionBusy] = useState(false);

  const selectedEndsAtMs = useMemo(() => (competition ? new Date(competition.endsAt).getTime() : 0), [competition]);
  const selectedEnded = useMemo(
    () => Boolean(competition && (competition.status === "finished" || (Number.isFinite(selectedEndsAtMs) && nowMs >= selectedEndsAtMs))),
    [competition, selectedEndsAtMs, nowMs],
  );
  const competitionSecondsLeft = useMemo(() => Math.max(0, Math.floor((selectedEndsAtMs - nowMs) / 1000)), [selectedEndsAtMs, nowMs]);
  const joined = useMemo(
    () => Boolean(competition && authUser && competition.participants.some((item) => item.userId === authUser.id)),
    [competition, authUser],
  );
  const selectedRankedParticipants = useMemo(
    () => (competition ? competition.participants.filter((item) => item.testsCount > 0) : []),
    [competition],
  );
  const canDeleteRoom = useMemo(() => {
    if (!competition || !authUser) return false;
    if (competition.host.id !== authUser.id) return false;
    if (selectedEnded) return false;
    const startedAtMs = new Date(competition.startsAt).getTime();
    if (!Number.isFinite(startedAtMs)) return false;
    const elapsedMs = nowMs - startedAtMs;
    return elapsedMs >= 0 && elapsedMs <= 60_000;
  }, [competition, authUser, selectedEnded, nowMs]);
  const deleteSecondsLeft = useMemo(() => {
    if (!competition) return 0;
    const startedAtMs = new Date(competition.startsAt).getTime();
    if (!Number.isFinite(startedAtMs)) return 0;
    const elapsedSeconds = Math.floor((nowMs - startedAtMs) / 1000);
    return Math.max(0, 60 - elapsedSeconds);
  }, [competition, nowMs]);

  const elapsedSeconds = Math.max(DURATION_SECONDS - timeLeft, 1);
  const wpm = Math.round((typedChars / 5) * (60 / elapsedSeconds));
  const accuracy = Math.round((correctChars / Math.max(typedChars, 1)) * 100);
  const progress = Math.min(Math.max((currentWordIndex / Math.max(words.length, 1)) * 100, 0), 100);
  const showResultModal = status === "finished" && timeLeft === 0 && isResultModalOpen;

  const { ranges, wordToLine } = useMemo(() => buildLineRanges(words), [words]);
  const lineIndex = useMemo(() => (ranges.length ? wordToLine[Math.min(currentWordIndex, words.length - 1)] ?? 0 : 0), [ranges.length, wordToLine, currentWordIndex, words.length]);
  const visibleStartLine = useMemo(() => (ranges.length <= VISIBLE_LINES ? 0 : Math.min(lineIndex, ranges.length - VISIBLE_LINES)), [lineIndex, ranges.length]);
  const visibleRanges = useMemo(() => ranges.slice(visibleStartLine, visibleStartLine + VISIBLE_LINES), [ranges, visibleStartLine]);

  function focusTypingInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  const loadCompetition = useCallback(async () => {
    const res = await fetch(`/api/competitions/${roomId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load competition room.");
    const json = (await res.json()) as { data: CompetitionItem };
    setCompetition(json.data);
  }, [roomId]);

  async function joinRoom() {
    if (!authUser) {
      window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
      setActionError("Login first to enter competition.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/competitions/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to enter room.");
      await loadCompetition();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onPointerUp(event: PointerEvent) {
      if (!competition || selectedEnded || !joined) return;
      if (status === "finished") return;
      if (profileOpen) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest(".modern-select-panel")) return;
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }

    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, [competition, selectedEnded, joined, status, profileOpen]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data: SessionUser | null };
      if (!cancelled) setAuthUser(json.data ?? null);
    }
    void loadSession();
    const onAuth = () => void loadSession();
    window.addEventListener("ff:auth-changed", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:auth-changed", onAuth);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        await loadCompetition();
      } catch (err) {
        if (!cancelled) setActionError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, loadCompetition]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomWordBank() {
      if (!competition?.language) {
        setCustomNormalSeed(null);
        return;
      }
      try {
        const response = await fetch(`/api/word-bank?language=${encodeURIComponent(competition.language)}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setCustomNormalSeed(null);
          return;
        }
        const json = (await response.json()) as { data?: { normal?: string[] | null } };
        if (cancelled) return;
        setCustomNormalSeed(Array.isArray(json.data?.normal) && json.data?.normal.length > 0 ? json.data.normal : null);
      } catch {
        if (!cancelled) setCustomNormalSeed(null);
      }
    }
    void loadCustomWordBank();
    return () => {
      cancelled = true;
    };
  }, [competition?.language]);

  useEffect(() => {
    if (!competition?.id || !competition.language) return;
    const seedKey = `${competition.id}:${competition.language}:${customNormalSeed ? "custom" : "base"}`;
    if (seededRoomRef.current === seedKey) return;
    seededRoomRef.current = seedKey;

    const seededWords = getCompetitionWords(competition.id, competition.language, customNormalSeed);
    setWords(seededWords);
    setWordStates(Array(seededWords.length).fill("pending"));
    setCurrentWordIndex(0);
    setCurrentInput("");
    setStatus("idle");
    setTimeLeft(DURATION_SECONDS);
    setCorrectChars(0);
    setTypedChars(0);
    setMistakes(0);
    setTypedCount(0);
    setSubmitted(false);
    setRunFeedback(null);
  }, [competition?.id, competition?.language, competition?.title, customNormalSeed]);

  useEffect(() => {
    if (status !== "running") return;
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
    if (status === "finished" && timeLeft === 0) {
      setIsResultModalOpen(true);
    }
  }, [status, timeLeft]);

  useEffect(() => {
    if (!showResultModal) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        setIsResultModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showResultModal]);

  async function refreshRoomManual() {
    try {
      setManualRefreshing(true);
      setActionError(null);
      await loadCompetition();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setManualRefreshing(false);
    }
  }

  async function deleteRoom() {
    if (!competition || !authUser) {
      window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
      setActionError("Login first to delete room.");
      return;
    }
    if (!canDeleteRoom) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/competitions/${competition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-room" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete room.");
      window.location.href = "/competition";
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const submitAttempt = useCallback(async () => {
    if (!competition || !authUser || submitted) return;
    const idleMs = lastActivityAtRef.current ? Date.now() - lastActivityAtRef.current : Number.POSITIVE_INFINITY;
    const isAfkRun = typedChars < AFK_MIN_TYPED_CHARS || idleMs > AFK_IDLE_THRESHOLD_MS;
    if (isAfkRun) {
      setSubmitted(true);
      setRunFeedback("AFK detected: result not saved.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/competitions/${competition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit-attempt",
          wpm,
          accuracy,
          duration: DURATION_SECONDS,
          wordCount: typedCount,
          mistakes: Math.max(mistakes, 0),
        }),
      });
      const json = (await res.json()) as { data?: { updatedBest: boolean }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit attempt.");
      setSubmitted(true);
      setRunFeedback(json.data?.updatedBest ? "New personal best in this room." : "Result submitted.");
      await loadCompetition();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [competition, authUser, submitted, wpm, accuracy, typedCount, typedChars, mistakes, loadCompetition]);

  useEffect(() => {
    if (!(status === "finished" && !submitted && !selectedEnded && joined && authUser)) return;
    void submitAttempt();
  }, [status, submitted, selectedEnded, joined, authUser, submitAttempt]);

  useEffect(() => {
    if (busy) return;
    if (!competition || selectedEnded || !joined) return;
    if (status === "finished") return;
    focusTypingInput();
  }, [busy, competition, selectedEnded, joined, status]);

  useEffect(() => {
    if (!selectedEnded) return;
    setCurrentInput("");
    if (status === "running") setStatus("idle");
  }, [selectedEnded, status]);

  async function openProfile(userId: string) {
    const res = await fetch(`/api/profile/${userId}`, { cache: "no-store" });
    const json = (await res.json()) as { data?: ProfileData; error?: string };
    if (!res.ok || !json.data) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
      setActionError(json.error ?? "Failed to load profile.");
      return;
    }
    setProfileData(json.data);
    try {
      const query = new URLSearchParams({
        language: competition?.language ?? "en",
        names: json.data.user.username,
      });
      const tagRes = await fetch(`/api/user-language-tags?${query.toString()}`, { cache: "no-store" });
      if (tagRes.ok) {
        const tagJson = (await tagRes.json()) as { data: Record<string, UserTag[]> };
        setProfileTags(tagJson.data?.[json.data.user.username] ?? []);
      } else {
        setProfileTags([]);
      }
    } catch {
      setProfileTags([]);
    }
    setProfileOpen(true);
  }

  async function handleMessageFromProfile(): Promise<void> {
    if (!profileData?.user.id) return;

    try {
      setMessageActionBusy(true);
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: profileData.user.id }),
      });
      const json = (await response.json()) as { data?: { id: string }; error?: string };
      if (!response.ok || !json.data?.id) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
          throw new Error("Login first to send message.");
        }
        throw new Error(json.error ?? "Failed to open chat.");
      }

      setProfileOpen(false);
      setProfileTags([]);
      router.push(`/messages?conversation=${encodeURIComponent(json.data.id)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to open chat.");
    } finally {
      setMessageActionBusy(false);
    }
  }

  function startRun() {
    if (!competition || !joined || selectedEnded) return;
    const staticWords =
      words.length > 0 ? words : getCompetitionWords(competition.id, competition.language, customNormalSeed);
    if (words.length === 0) {
      setWords(staticWords);
    }
    setWordStates(Array(staticWords.length).fill("pending"));
    setCurrentWordIndex(0);
    setCurrentInput("");
    setTimeLeft(DURATION_SECONDS);
    setCorrectChars(0);
    setTypedChars(0);
    setMistakes(0);
    setTypedCount(0);
    setSubmitted(false);
    setRunFeedback(null);
    setIsResultModalOpen(false);
    lastActivityAtRef.current = null;
    setStatus("running");
    focusTypingInput();
  }

  function submitWord() {
    if (status === "finished" || currentWordIndex >= words.length) return;
    const typed = currentInput.trim();
    if (!typed) return;
    const target = words[currentWordIndex];
    const score = compareWords(typed, target);
    setWordStates((prev) => {
      const next = [...prev];
      next[currentWordIndex] = typed === target ? "correct" : "incorrect";
      return next;
    });
    // Keep scoring aligned with typing mode: include separator (space) as a typed character.
    setCorrectChars((current) => current + score.correctChars + WORD_SEPARATOR_CHARS);
    setTypedChars((current) => current + typed.length + WORD_SEPARATOR_CHARS);
    setMistakes((current) => current + score.mistakes);
    setTypedCount((current) => current + 1);
    setCurrentWordIndex((current) => current + 1);
    setCurrentInput("");
    lastActivityAtRef.current = Date.now();
  }

  return (
    <main className="site-shell competition-page">
      <section className="typing-header">
        <h1><TrophyIcon className="ui-icon ui-icon-accent" />Competition Room</h1>
        <p>Room typing arena and ranking board.</p>
        <Link className="btn btn-ghost" href="/competition"><ArrowLeftIcon className="ui-icon" />Back to Competition Lobby</Link>
        {loading ? <p className="kpi-label">Loading...</p> : null}
        {actionError ? <p className="kpi-label">Error: {actionError}</p> : null}
      </section>

      {!competition ? null : (
        <div className="competition-room-stack">
          <section className="card glass competition-typing-full">
            <h2 className="feature-title"><KeyboardIcon className="ui-icon ui-icon-accent" />{competition.title}</h2>
            <section className="typing-controls card glass">
              <div className="typing-control-group">
                <p className="kpi-label">
                  <GlobeIcon className="ui-icon" />
                  Language
                </p>
                <button type="button" className="modern-select-trigger" disabled aria-label="Competition language">
                  <span className="modern-select-value">
                    <span className="language-flag-icon">
                      <LanguageFlagIcon language={competition.language} />
                    </span>
                    {LANGUAGE_LABELS[competition.language]}
                  </span>
                  <span className="modern-select-chevron">v</span>
                </button>
              </div>
              <div className="typing-control-group">
                <p className="kpi-label">
                  <TimerIcon className="ui-icon" />
                  Duration
                </p>
                <div className="typing-segmented typing-duration-segmented">
                  {DURATION_OPTIONS.map((item) => (
                    <button
                      key={`competition-duration-${item}`}
                      type="button"
                      className={`segment-btn ${DURATION_SECONDS === item ? "active" : ""}`}
                      disabled
                    >
                      {item}s
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" type="button" onClick={startRun} disabled={busy || !joined || selectedEnded}>
                <KeyboardIcon className="ui-icon" />
                Restart Test
              </button>
            </section>
            {!joined ? <p className="kpi-label">Enter this room first to compete.</p> : selectedEnded ? <p className="kpi-label">Competition ended. This room is read-only now.</p> : (
              <>
                <div className="typing-stats grid-3">
                  <article className="card glass"><span className="ui-icon-badge"><GaugeIcon className="ui-icon" /></span><p className="kpi">{wpm}</p><p className="kpi-label">WPM</p></article>
                  <article className="card glass"><span className="ui-icon-badge"><CheckIcon className="ui-icon" /></span><p className="kpi">{accuracy}%</p><p className="kpi-label">Accuracy</p></article>
                  <article className="card glass"><span className="ui-icon-badge"><TimerIcon className="ui-icon" /></span><p className="kpi">{formatSeconds(timeLeft)}</p><p className="kpi-label">Time Left</p></article>
                </div>
                <div className="typing-progress card glass"><div className="typing-progress-track"><div className="typing-progress-bar" style={{ width: `${progress}%` }} /></div><p><UsersIcon className="ui-icon" /> Player: {authUser?.displayName ?? authUser?.username ?? "Guest"} | <GaugeIcon className="ui-icon" /> Progress: {Math.round(progress)}% | <AlertIcon className="ui-icon" /> Mistakes: {mistakes}</p></div>
                <div className="typing-arena card glass">
                  <div className="typing-target-viewport">
                    <motion.div key={visibleStartLine} className="typing-target typing-target-lines typing-target-layer" initial={{ y: 4 }} animate={{ y: 0 }} transition={{ duration: 0.045, ease: "linear" }}>
                      {visibleRanges.map((range, i) => <div key={`line-${i}`} className="typing-line">{words.slice(range.start, range.end).map((word, localIndex) => { const globalIndex = range.start + localIndex; const state = wordStates[globalIndex]; const isCurrent = globalIndex === currentWordIndex && status !== "finished"; const className = state === "correct" ? "word-correct" : state === "incorrect" ? "word-incorrect" : isCurrent ? "word-current" : "word-pending"; return <span key={`${word}-${globalIndex}`} className={`typing-word ${className}`}>{word}</span>; })}</div>)}
                    </motion.div>
                  </div>
                  <input
                    ref={inputRef}
                    className="typing-input typing-input-word"
                    value={currentInput}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCurrentInput(nextValue);
                      if (status === "idle" && nextValue.trim().length > 0) {
                        lastActivityAtRef.current = Date.now();
                        setStatus("running");
                      }
                      if (status === "running") {
                        lastActivityAtRef.current = Date.now();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        submitWord();
                      }
                    }}
                    placeholder="Type active word then press Space..."
                    disabled={status === "finished" || selectedEnded}
                  />
                </div>
                {runFeedback ? <p className="kpi-label">{runFeedback}</p> : null}
              </>
            )}
          </section>

          <section className="card glass competition-detail">
            <div className="competition-detail-top">
              <div className="competition-meta">
                <span><GlobeIcon className="ui-icon" /> {LANGUAGE_FLAGS[competition.language]} {LANGUAGE_LABELS[competition.language]}</span>
                <span className="competition-countdown-chip"><TimerIcon className="ui-icon" /> {selectedEnded ? "ended 00:00:00" : `ends in ${formatCountdown(competitionSecondsLeft)}`}</span>
              </div>
            </div>
            <div className="competition-edit-actions">
              {!joined && !selectedEnded ? <button type="button" className="btn btn-primary" onClick={() => void joinRoom()} disabled={busy}>Enter Room</button> : null}
              {canDeleteRoom ? (
                <button type="button" className="btn btn-ghost" onClick={() => void deleteRoom()} disabled={busy}>
                  Delete Room ({deleteSecondsLeft}s)
                </button>
              ) : null}
              <button
                type="button"
                className={`btn btn-ghost ${manualRefreshing ? "is-refreshing" : ""}`}
                onClick={() => void refreshRoomManual()}
                disabled={busy || manualRefreshing}
                title={manualRefreshing ? "Refreshing leaderboard..." : "Refresh leaderboard"}
                aria-label={manualRefreshing ? "Refreshing leaderboard..." : "Refresh leaderboard"}
              >
                <RefreshIcon className="ui-icon" />
                {manualRefreshing ? "Refreshing..." : "Refresh Leaderboard"}
              </button>
            </div>

            <motion.div className="competition-ranking" initial={false}>
              {selectedRankedParticipants.length === 0 ? <p className="kpi-label">No submitted result yet.</p> : selectedRankedParticipants.map((p, i) => (
                <article key={p.id} className={`competition-rank-row ${selectedEnded && i === 0 ? "winner" : ""}`}>
                  <span className={`typing-mini-rank ${i < 3 ? `medal medal-${i + 1}` : ""}`}>{i < 3 ? (i === 0 ? "1st" : i === 1 ? "2nd" : "3rd") : `#${i + 1}`}</span>
                  <span className="user-name-inline-with-rank">
                    <button type="button" className="competition-profile-link" onClick={() => void openProfile(p.userId)}>{p.displayName ?? p.username}</button>
                    {p.tags && p.tags.length > 0 ? (
                      <>
                        <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[competition.language]}>
                          <LanguageFlagIcon language={competition.language} />
                        </span>
                        <UserRankBadge tags={p.tags} />
                      </>
                    ) : null}
                  </span>
                  <span className="typing-mini-metric">{Math.round(p.bestWpm)} WPM</span>
                  <span className="typing-mini-time">{formatDateTime(p.bestResultAt)}</span>
                </article>
              ))}
            </motion.div>
          </section>

          <AnimatePresence>
            {showResultModal ? (
              <motion.div className="result-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                <motion.section className="result-modal glass" initial={{ opacity: 0, scale: 0.96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                  <p className="badge">Competition Result</p>
                  <h2 className="result-modal-title">Time&apos;s Up</h2>
                  <p className="kpi-label"><SparkIcon className="ui-icon" /> Room: <strong>{competition.title}</strong></p>
                  <div className="result-modal-stats">
                    <article><p className="kpi">{wpm}</p><p className="kpi-label">WPM</p></article>
                    <article><p className="kpi">{accuracy}%</p><p className="kpi-label">Accuracy</p></article>
                    <article><p className="kpi">{typedCount}</p><p className="kpi-label">Words Checked</p></article>
                    <article><p className="kpi">{Math.max(mistakes, 0)}</p><p className="kpi-label">Mistakes</p></article>
                  </div>
                  <p className="kpi-label">{busy ? "Submitting result to room leaderboard..." : runFeedback ?? "Result submitted."}</p>
                  <div className="result-modal-actions">
                    <button className="btn btn-primary" type="button" onClick={startRun} disabled={busy || !joined || selectedEnded}>OK</button>
                  </div>
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {profileOpen && profileData ? (
        <div
          className="profile-friend-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => {
            setProfileOpen(false);
            setProfileTags([]);
          }}
        >
          {/** competition language fallback keeps tag UI safe during transient states */}
          {(() => {
            const profileLanguage = competition?.language ?? "en";
            return (
          <section className="card glass profile-friend-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="profile-friend-modal-head">
              <h3 className="feature-title">
                <UsersIcon className="ui-icon ui-icon-accent" />
                {(profileData.user.displayName ?? profileData.user.username)} Profile
              </h3>
              <div className="profile-friend-modal-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void handleMessageFromProfile()}
                  disabled={messageActionBusy || !profileData.user.id}
                >
                  <ChatIcon className="ui-icon" />
                  {messageActionBusy ? "Opening..." : "Message"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setProfileTags([]);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="profile-friend-modal-body">
              <section className="grid-3">
                <article className="card glass">
                  <p className="kpi">
                    <span className="profile-name-with-rank">
                      <span>{profileData.user.displayName ?? profileData.user.username}</span>
                      {profileTags.length > 0 ? (
                        <>
                          <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[profileLanguage]}>
                            <LanguageFlagIcon language={profileLanguage} />
                          </span>
                          <UserRankBadge tags={profileTags} />
                        </>
                      ) : null}
                    </span>
                  </p>
                  <p className="kpi-label">Player</p>
                </article>
                <article className="card glass"><p className="kpi">{profileData.summary.bestWpm}</p><p className="kpi-label">Best WPM</p></article>
                <article className="card glass"><p className="kpi">{profileData.summary.avgAccuracy}%</p><p className="kpi-label">Average Accuracy</p></article>
              </section>
              <section className="grid-3">
                <article className="card glass"><p className="kpi">{profileData.summary.competitionJoined}</p><p className="kpi-label">Competitions Joined</p></article>
                <article className="card glass"><p className="kpi">{profileData.summary.competitionWins}</p><p className="kpi-label">Competition Wins</p></article>
                <article className="card glass"><p className="kpi">{profileData.user.rating}</p><p className="kpi-label">Rating</p></article>
              </section>
              <section className="card glass profile-trend">
                <h4 className="feature-title"><TrophyIcon className="ui-icon ui-icon-accent" />Recent Competitions</h4>
                {profileData.recentCompetitions.length === 0 ? (
                  <p className="kpi-label">No completed competition yet.</p>
                ) : (
                  <div className="profile-trend-list">
                    {profileData.recentCompetitions.slice(0, 5).map((item) => (
                      <article key={`${item.competitionId}-${item.bestResultAt ?? item.endedAt}`} className="profile-trend-item">
                        <Link href={`/competition/${item.competitionId}`} className="profile-trend-link kpi-label profile-trend-line">
                          {item.title} |{" "}
                          {item.bestWpm} WPM | {item.bestAccuracy}% ACC |{" "}
                          {item.bestResultAt ? new Date(item.bestResultAt).toLocaleString() : new Date(item.endedAt).toLocaleString()}
                          {item.isWinner ? " | Winner" : ""}
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
            );
          })()}
        </div>
      ) : null}
    </main>
  );
}
