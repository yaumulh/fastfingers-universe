"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import {
  ChatIcon,
  GaugeIcon,
  GlobeIcon,
  KeyboardIcon,
  SparkIcon,
  TimerIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "../components/icons";
import { UserRankBadge } from "../components/user-rank-badge";
import { LanguageFlagIcon } from "../components/language-flag-icon";
import { ACTIVE_MULTIPLAYER_ROOM_KEY, REQUIRE_EXIT_EVENT } from "@/lib/multiplayer-room-lock";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, type LanguageCode } from "../typing/word-banks";

type Player = {
  id: string;
  socketId: string | null;
  name: string;
  ready: boolean;
  progress: number;
  wpm: number;
  finishedAt: number | null;
  connected: boolean;
  disconnectedAt: number | null;
  antiCheatViolations: number;
  blocked: boolean;
};

type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  createdAt: number;
};

type RoomState = {
  id: string;
  createdAt: number;
  hostId: string;
  players: Player[];
  status: "lobby" | "racing" | "finished";
  raceWords: string[];
  startedAt: number | null;
  winnerId: string | null;
  chat: ChatMessage[];
  durationSec: 15 | 30 | 60 | 120;
  typingMode: "normal" | "advanced";
  language: LanguageCode;
};

type PublicRoom = {
  id: string;
  hostName: string;
  playerCount: number;
  connectedCount: number;
  capacity: number;
  durationSec: 15 | 30 | 60 | 120;
  typingMode: "normal" | "advanced";
  language: LanguageCode;
  status: "lobby" | "racing" | "finished";
  createdAt: number;
};

type RaceFinishedPayload = {
  roomId: string;
  startedAt: number | null;
  finishedAt: number;
  winnerId: string | null;
  winnerName: string | null;
  participants: Array<{
    playerId: string;
    name: string;
    progress: number;
    wpm: number;
    finishedAt: number | null;
  }>;
};

type WordState = "pending" | "correct" | "incorrect";
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

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const PLAYER_TOKEN_KEY = "fastfingers:multiplayer:token";
const LAST_ROOM_KEY = "fastfingers:multiplayer:last-room";
const REFRESH_EXIT_INTENT_KEY = "fastfingers:multiplayer:refresh-exit-intent";
const MAX_CHARS_PER_LINE = 118;
const VISUAL_WORD_OVERHEAD = 2;
const VISIBLE_LINES = 2;
const DURATION_OPTIONS = [15, 30, 60, 120] as const;
const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_LABELS) as Array<[LanguageCode, string]>;
const PREFERRED_LANGUAGE_KEY = "fastfingers:preferred-language";

const listContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.03,
    },
  },
};

const listItem = {
  hidden: { opacity: 0, y: 7, scale: 0.99 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.18, ease: "easeOut" },
  },
};

function getOrCreateToken() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(PLAYER_TOKEN_KEY);
  if (existing && existing.length >= 8) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_TOKEN_KEY, next);
  return next;
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

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readRefreshExitIntent() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(REFRESH_EXIT_INTENT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { roomId?: string; token?: string; createdAt?: number };
    if (!parsed?.roomId || !parsed?.token || typeof parsed.createdAt !== "number") {
      window.localStorage.removeItem(REFRESH_EXIT_INTENT_KEY);
      return null;
    }

    // Ignore stale intent to avoid accidental leave long after refresh happened.
    if (Date.now() - parsed.createdAt > 15000) {
      window.localStorage.removeItem(REFRESH_EXIT_INTENT_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(REFRESH_EXIT_INTENT_KEY);
    return null;
  }
}

export default function MultiplayerPage() {
  const socketRef = useRef<Socket | null>(null);
  const playerTokenRef = useRef("");
  const roomRef = useRef<RoomState | null>(null);
  const selfPlayerIdRef = useRef<string | null>(null);
  const raceSavedKeyRef = useRef<string | null>(null);
  const nameRef = useRef("Player");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  const prevModalBlockedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("Player");
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null);
  const [inputWord, setInputWord] = useState("");
  const [wordStates, setWordStates] = useState<WordState[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [totalCorrectChars, setTotalCorrectChars] = useState(0);
  const [totalTypedChars, setTotalTypedChars] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [battleWpm, setBattleWpm] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [raceSaveState, setRaceSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [raceSavedKey, setRaceSavedKey] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [requireExitNotice, setRequireExitNotice] = useState(false);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roomLanguage, setRoomLanguage] = useState<LanguageCode>("en");
  const [openLanguage, setOpenLanguage] = useState(false);
  const [uiModalOpen, setUiModalOpen] = useState(false);
  const [userTagsByLanguage, setUserTagsByLanguage] = useState<
    Partial<Record<LanguageCode, Record<string, UserTag[]>>>
  >({});

  const self = useMemo(
    () => room?.players.find((player) => player.id === selfPlayerId) ?? null,
    [room?.players, selfPlayerId],
  );

  const isHost = Boolean(room && self && room.hostId === self.id);
  const canStartRace = Boolean(
    room &&
      isHost &&
      room.players.filter((player) => player.connected).length >= 2 &&
      room.status !== "racing" &&
      room.players
        .filter((player) => player.connected)
        .every((player) => player.id === room.hostId || player.ready),
  );

  const { ranges: lineRanges, wordToLine } = useMemo(
    () => buildLineRanges(room?.raceWords ?? [], MAX_CHARS_PER_LINE),
    [room?.raceWords],
  );

  const currentLineIndex = useMemo(() => {
    if (lineRanges.length === 0 || !room) {
      return 0;
    }
    const clampedWordIndex = Math.min(currentWordIndex, room.raceWords.length - 1);
    return wordToLine[clampedWordIndex] ?? 0;
  }, [currentWordIndex, lineRanges.length, room, wordToLine]);

  const visibleStartLine = useMemo(() => {
    if (lineRanges.length <= VISIBLE_LINES) {
      return 0;
    }
    return Math.min(currentLineIndex, lineRanges.length - VISIBLE_LINES);
  }, [currentLineIndex, lineRanges.length]);

  const visibleRanges = useMemo(
    () => lineRanges.slice(visibleStartLine, visibleStartLine + VISIBLE_LINES),
    [lineRanges, visibleStartLine],
  );

  const progress = useMemo(() => {
    const wordCount = room?.raceWords.length ?? 0;
    if (wordCount <= 0) {
      return 0;
    }
    return clampPercent((currentWordIndex / wordCount) * 100);
  }, [currentWordIndex, room?.raceWords.length]);

  const timeLeft = useMemo(() => {
    if (!room || room.status !== "racing" || !room.startedAt) {
      return room?.durationSec ?? 0;
    }
    const elapsed = Math.floor((nowTick - room.startedAt) / 1000);
    return Math.max(room.durationSec - elapsed, 0);
  }, [nowTick, room]);

  const raceRoomId = room?.id ?? null;
  const raceStatus = room?.status ?? "lobby";
  const raceWordCount = room?.raceWords.length ?? 0;

  useEffect(() => {
    roomRef.current = room;
    if (room) {
      setRoomLanguage(room.language);
      window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, room.language);
    }
  }, [room]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (room) {
      window.localStorage.setItem(ACTIVE_MULTIPLAYER_ROOM_KEY, room.id);
    } else {
      window.localStorage.removeItem(ACTIVE_MULTIPLAYER_ROOM_KEY);
    }
  }, [room]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, stored)) {
      setRoomLanguage(stored as LanguageCode);
    }
  }, []);

  useEffect(() => {
    function closeDropdowns(event: MouseEvent) {
      if (!languageRef.current?.contains(event.target as Node)) {
        setOpenLanguage(false);
      }
    }

    document.addEventListener("mousedown", closeDropdowns);
    return () => document.removeEventListener("mousedown", closeDropdowns);
  }, []);

  useEffect(() => {
    function onRequireExit() {
      setRequireExitNotice(true);
      window.setTimeout(() => setRequireExitNotice(false), 1300);
    }

    window.addEventListener(REQUIRE_EXIT_EVENT, onRequireExit);
    return () => window.removeEventListener(REQUIRE_EXIT_EVENT, onRequireExit);
  }, []);

  useEffect(() => {
    if (!authUser) {
      setUserTagsByLanguage({});
      return;
    }

    const namesByLanguage = new Map<LanguageCode, Set<string>>();
    for (const item of rooms) {
      const hostName = item.hostName.trim();
      if (!hostName) continue;
      const current = namesByLanguage.get(item.language) ?? new Set<string>();
      current.add(hostName);
      namesByLanguage.set(item.language, current);
    }

    if (room) {
      const current = namesByLanguage.get(room.language) ?? new Set<string>();
      for (const player of room.players) {
        const playerName = player.name.trim();
        if (playerName) current.add(playerName);
      }
      namesByLanguage.set(room.language, current);
    }

    if (namesByLanguage.size === 0) {
      setUserTagsByLanguage({});
      return;
    }

    let cancelled = false;
    async function loadTags() {
      try {
        const entries = [...namesByLanguage.entries()];
        const results = await Promise.all(
          entries.map(async ([language, names]) => {
            const query = new URLSearchParams({
              language,
              names: [...names].join(","),
            });
            const response = await fetch(`/api/user-language-tags?${query.toString()}`, { cache: "no-store" });
            if (!response.ok) {
              return [language, {}] as const;
            }
            const json = (await response.json()) as { data: Record<string, UserTag[]> };
            return [language, json.data ?? {}] as const;
          }),
        );

        if (!cancelled) {
          const next: Partial<Record<LanguageCode, Record<string, UserTag[]>>> = {};
          for (const [language, data] of results) {
            next[language] = data;
          }
          setUserTagsByLanguage(next);
        }
      } catch {
        if (!cancelled) {
          setUserTagsByLanguage({});
        }
      }
    }

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [authUser, room, rooms]);

  function getUserTags(username: string, language: LanguageCode): UserTag[] {
    return userTagsByLanguage[language]?.[username] ?? [];
  }

  useEffect(() => {
    selfPlayerIdRef.current = selfPlayerId;
  }, [selfPlayerId]);

  useEffect(() => {
    raceSavedKeyRef.current = raceSavedKey;
  }, [raceSavedKey]);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    if (!room || room.status !== "racing") {
      return;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [room]);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el) {
      return;
    }

    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  }, [room?.id, room?.chat.length]);

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
    if (!uiModalOpen) return;
    inputRef.current?.blur();
  }, [uiModalOpen]);

  useEffect(() => {
    const modalActive =
      uiModalOpen ||
      document.body.getAttribute("data-ff-ui-modal-open") === "1" ||
      Boolean(document.querySelector(".auth-modal-backdrop, .auth-modal"));
    const wasBlocked = prevModalBlockedRef.current;
    if (wasBlocked && !modalActive && room?.status === "racing" && self?.connected && !self?.blocked) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
    prevModalBlockedRef.current = modalActive;
  }, [uiModalOpen, room?.status, self?.connected, self?.blocked]);

  useEffect(() => {
    if (raceStatus !== "racing") {
      setInputWord("");
      setCurrentWordIndex(0);
      setWordStates([]);
      setTotalCorrectChars(0);
      setTotalTypedChars(0);
      setTotalMistakes(0);
      setBattleWpm(0);
      return;
    }

    setInputWord("");
    setCurrentWordIndex(0);
    setWordStates(Array(raceWordCount).fill("pending"));
    setTotalCorrectChars(0);
    setTotalTypedChars(0);
    setTotalMistakes(0);
    setBattleWpm(0);
    if (!uiModalOpen) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [raceRoomId, raceStatus, raceWordCount, uiModalOpen]);

  useEffect(() => {
    if (uiModalOpen) return;
    if (!room || room.status !== "racing") return;
    if (!self?.connected || self?.blocked) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [uiModalOpen, room, self?.connected, self?.blocked]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        setAuthLoading(true);
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as { data: SessionUser | null };
        if (!cancelled) {
          setAuthUser(json.data ?? null);
          if (json.data?.username) {
            setName(json.data.displayName ?? json.data.username);
          }
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
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
    playerTokenRef.current = getOrCreateToken();
    const refreshExitIntent = readRefreshExitIntent();
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);

      if (refreshExitIntent?.roomId && refreshExitIntent?.token === playerTokenRef.current) {
        socket.emit("leave-room", {
          roomId: refreshExitIntent.roomId,
          token: refreshExitIntent.token,
        });
        window.localStorage.removeItem(REFRESH_EXIT_INTENT_KEY);
        window.localStorage.removeItem(ACTIVE_MULTIPLAYER_ROOM_KEY);
        window.localStorage.removeItem(LAST_ROOM_KEY);
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("rooms-list", (incomingRooms: PublicRoom[]) => {
      setRooms(incomingRooms);
    });

    socket.on("room-state", (incomingRoom: RoomState) => {
      setRoom(incomingRoom);
      window.localStorage.setItem(LAST_ROOM_KEY, incomingRoom.id);
    });

    socket.on("chat-message", (message: ChatMessage) => {
      setRoom((prev) => {
        if (!prev || prev.id !== roomRef.current?.id) {
          return prev;
        }
        return {
          ...prev,
          chat: [...prev.chat, message].slice(-100),
        };
      });
    });

    socket.on("anti-cheat-warning", (payload: { reason: string; count: number; max: number }) => {
      setError(`Anti-cheat warning (${payload.count}/${payload.max}): ${payload.reason}`);
    });

    socket.on("anti-cheat-blocked", () => {
      setError("You are temporarily blocked from race updates due to repeated suspicious input.");
    });

    socket.on("race-started", () => {
      setError(null);
      setRaceSaveState("idle");
    });

    socket.on("race-finished", async (payload: RaceFinishedPayload) => {
      setError(null);
      const currentRoom = roomRef.current;
      const currentSelfId = selfPlayerIdRef.current;
      if (!currentRoom || !currentSelfId || currentRoom.hostId !== currentSelfId) {
        return;
      }

      const saveKey = `${payload.roomId}:${payload.finishedAt}`;
      if (raceSavedKeyRef.current === saveKey) {
        return;
      }

      try {
        setRaceSaveState("saving");
        const response = await fetch("/api/multiplayer-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Failed to save multiplayer match.");
        }

        setRaceSaveState("saved");
        setRaceSavedKey(saveKey);
      } catch (err) {
        setRaceSaveState("error");
        setError(err instanceof Error ? err.message : "Failed to save multiplayer match.");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    function handleBeforeUnload() {
      const activeRoom = roomRef.current;
      const token = playerTokenRef.current;
      if (!activeRoom || !token) {
        return;
      }

      window.localStorage.setItem(
        REFRESH_EXIT_INTENT_KEY,
        JSON.stringify({
          roomId: activeRoom.id,
          token,
          createdAt: Date.now(),
        }),
      );

      socketRef.current?.emit("leave-room", {
        roomId: activeRoom.id,
        token,
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function createRoom() {
    const socket = socketRef.current;
    if (!socket || !authUser) {
      window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
      return;
    }

    setActionBusy(true);
    setError(null);

    socket.emit(
      "create-room",
      { name: authUser.displayName ?? authUser.username, token: playerTokenRef.current, language: roomLanguage },
      (response: { room?: RoomState; playerId?: string; error?: string }) => {
        if (response.error || !response.room || !response.playerId) {
          setError(response.error ?? "Failed to create room.");
          setActionBusy(false);
          return;
        }

        setRoom(response.room);
        window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, response.room.language);
        setSelfPlayerId(response.playerId);
        setRaceSaveState("idle");
        window.localStorage.setItem(LAST_ROOM_KEY, response.room.id);
        setActionBusy(false);
      },
    );
  }

  function joinRoom(roomId: string) {
    const socket = socketRef.current;
    if (!socket || !authUser) {
      window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
      return;
    }

    setActionBusy(true);
    setError(null);

    socket.emit(
      "join-room",
      { roomId, name: authUser.displayName ?? authUser.username, token: playerTokenRef.current },
      (response: { room?: RoomState; playerId?: string; error?: string }) => {
        if (response.error || !response.room || !response.playerId) {
          setError(response.error ?? "Failed to join room.");
          setActionBusy(false);
          return;
        }

        setRoom(response.room);
        setSelfPlayerId(response.playerId);
        setRaceSaveState("idle");
        window.localStorage.setItem(LAST_ROOM_KEY, response.room.id);
        setActionBusy(false);
      },
    );
  }

  function updateRoomDuration(nextDuration: 15 | 30 | 60 | 120) {
    if (!room) {
      return;
    }
    socketRef.current?.emit(
      "update-room-settings",
      { roomId: room.id, durationSec: nextDuration },
      (response: { error?: string }) => {
        if (response?.error) {
          setError(response.error);
        }
      },
    );
  }

  function toggleReady() {
    if (!room || !self) {
      return;
    }

    socketRef.current?.emit("player-ready", {
      roomId: room.id,
      ready: !self.ready,
    });
  }

  function startRace() {
    if (!room) {
      return;
    }

    socketRef.current?.emit("start-race", { roomId: room.id }, (response: { error?: string }) => {
      if (response?.error) {
        setError(response.error);
      }
    });
  }

  function submitCurrentWord() {
    if (!room || !self || room.status !== "racing" || currentWordIndex >= room.raceWords.length) {
      return;
    }

    const typed = inputWord.trim();
    if (!typed) {
      return;
    }

    const targetWord = room.raceWords[currentWordIndex];
    const isCorrect = typed === targetWord;
    const { correctChars, mistakes } = compareWords(typed, targetWord);
    const nextWordIndex = currentWordIndex + 1;
    const nextCorrectChars = totalCorrectChars + correctChars;
    const nextTypedChars = totalTypedChars + typed.length;

    setWordStates((prev) => {
      const next = [...prev];
      next[currentWordIndex] = isCorrect ? "correct" : "incorrect";
      return next;
    });

    setTotalCorrectChars(nextCorrectChars);
    setTotalTypedChars(nextTypedChars);
    setTotalMistakes((current) => current + mistakes);
    setCurrentWordIndex(nextWordIndex);
    setInputWord("");

    const elapsedSeconds = room.startedAt ? Math.max((Date.now() - room.startedAt) / 1000, 1) : 1;
    const nextWpm = Math.round((nextTypedChars / 5) * (60 / elapsedSeconds));
    setBattleWpm(nextWpm);

    const nextProgress = clampPercent((nextWordIndex / Math.max(room.raceWords.length, 1)) * 100);

    socketRef.current?.emit("update-progress", {
      roomId: room.id,
      progress: nextProgress,
      wpm: nextWpm,
    });
  }

  function sendChatMessage() {
    if (!room || !chatInput.trim()) {
      return;
    }

    socketRef.current?.emit(
      "send-message",
      { roomId: room.id, text: chatInput },
      (response: { ok?: boolean; error?: string }) => {
        if (response?.error) {
          setError(response.error);
          return;
        }
        setChatInput("");
      },
    );
  }

  function exitRoom() {
    if (!room) {
      return;
    }

    const leavingRoomId = room.id;
    setRoom(null);
    setSelfPlayerId(null);
    setRaceSaveState("idle");
    setRaceSavedKey(null);
    setInputWord("");
    setCurrentWordIndex(0);
    setWordStates([]);
    setTotalCorrectChars(0);
    setTotalTypedChars(0);
    setTotalMistakes(0);
    setBattleWpm(0);
    window.localStorage.removeItem(ACTIVE_MULTIPLAYER_ROOM_KEY);
    window.localStorage.removeItem(LAST_ROOM_KEY);
    socketRef.current?.emit("leave-room", { roomId: leavingRoomId });
  }

  return (
    <main className="site-shell multiplayer-page">
      <section className="typing-header">
        <h1>
          <UsersIcon className="ui-icon ui-icon-accent" />
          Multiplayer Battle Arena
        </h1>
        <p>Public lobby rooms, max 4 players, host sets duration, and race uses 2-line word logic.</p>
      </section>

      <section className="multiplayer-layout">
        <div className="multiplayer-main-col">
          <section className="card glass multiplayer-connection">
            <div className="multiplayer-meta-row">
              <p className="multiplayer-meta-pill">
                <GlobeIcon className="ui-icon" />
                Connection: <strong>{connected ? "online" : "offline"}</strong>
              </p>
              <p className="multiplayer-meta-pill">
                <UserIcon className="ui-icon" />
                Player:{" "}
                {authUser?.username ? (
                  <Link href={`/u/${encodeURIComponent(authUser.username)}`} className="multiplayer-profile-link">
                    <strong>{name}</strong>
                  </Link>
                ) : (
                  <strong>Guest</strong>
                )}
              </p>
            </div>
            {!authLoading && !authUser ? (
              <p className="kpi-label">Login first from header to use multiplayer.</p>
            ) : null}
            <div className="multiplayer-create-row">
              <button
                className="btn btn-primary create-room-btn"
                type="button"
                onClick={createRoom}
                disabled={actionBusy || !connected || Boolean(room) || authLoading}
              >
                <SparkIcon className="ui-icon" />
                Create Room
              </button>
              <div className="typing-control-block">
                <p className="typing-control-label">Language</p>
                <div className="modern-select multiplayer-language-select" ref={languageRef}>
                  <button
                    type="button"
                    className={`modern-select-trigger ${openLanguage ? "open" : ""}`}
                    onClick={() => setOpenLanguage((current) => !current)}
                    disabled={actionBusy || Boolean(room)}
                  >
                    <span className="modern-select-value">
                      <span className="language-flag-icon">
                        <LanguageFlagIcon language={roomLanguage} />
                      </span>
                      {LANGUAGE_LABELS[roomLanguage]}
                    </span>
                    <span className="modern-select-chevron">v</span>
                  </button>
                  {openLanguage ? (
                    <div className="modern-select-panel">
                      {LANGUAGE_OPTIONS.map(([code, label]) => (
                        <button
                          key={code}
                          type="button"
                          className={`modern-select-option ${roomLanguage === code ? "active" : ""}`}
                          onClick={() => {
                            setRoomLanguage(code);
                            setOpenLanguage(false);
                            window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, code);
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
            </div>
          </section>

          <section className="card glass multiplayer-room-directory">
            <h2 className="feature-title">
              <UsersIcon className="ui-icon ui-icon-accent" />
              Lobby Rooms
            </h2>
            {rooms.length === 0 ? <p className="kpi-label">No room yet. Create one to start.</p> : null}
            {rooms.length > 0 ? (
              <motion.div className="room-directory-list" variants={listContainer} initial="hidden" animate="show">
                {rooms.map((item) => {
                  const isCurrentRoom = room?.id === item.id;
                  const isJoinable = item.status !== "racing" && item.playerCount < item.capacity;
                  return (
                    <motion.article key={item.id} variants={listItem} className="room-directory-card">
                      <div>
                        <p className="leaderboard-title">
                          Host:
                          <span className="user-name-inline-with-rank">
                            <Link href={`/u/${encodeURIComponent(item.hostName)}`} className="multiplayer-profile-link">
                              {item.hostName}
                            </Link>
                            {getUserTags(item.hostName, item.language).length ? (
                              <>
                                <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[item.language]}>
                                  <LanguageFlagIcon language={item.language} />
                                </span>
                                <UserRankBadge tags={getUserTags(item.hostName, item.language)} />
                              </>
                            ) : null}
                          </span>
                        </p>
                        <p className="leaderboard-sub">
                          Players: {item.connectedCount}/{item.capacity} | Duration: {item.durationSec}s | Mode:{" "}
                          {item.typingMode} | Language: {LANGUAGE_FLAGS[item.language]} {LANGUAGE_LABELS[item.language]}
                        </p>
                      </div>
                      <button
                        className={`btn ${isCurrentRoom ? "btn-primary" : "btn-ghost"}`}
                        type="button"
                        disabled={actionBusy || !connected || isCurrentRoom || !isJoinable || authLoading}
                        onClick={() => joinRoom(item.id)}
                      >
                        {isCurrentRoom ? "In Room" : "Join"}
                      </button>
                    </motion.article>
                  );
                })}
              </motion.div>
            ) : null}
          </section>

          <section className="card glass">
            <h2 className="feature-title">
              <KeyboardIcon className="ui-icon ui-icon-accent" />
              Room Control
            </h2>
            {!room ? (
              <p className="kpi-label">No active room. Create a room or join from Lobby Rooms.</p>
            ) : (
              <>
                <p className="kpi-label">
                  Room: <strong>{room.id}</strong> | Status: <strong>{room.status}</strong> | Language:{" "}
                  <strong>
                    {LANGUAGE_FLAGS[room.language]} {LANGUAGE_LABELS[room.language]}
                  </strong>
                </p>

                {isHost && room.status !== "racing" ? (
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
                          className={`segment-btn ${room.durationSec === item ? "active" : ""}`}
                          onClick={() => updateRoomDuration(item)}
                        >
                          {item}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <motion.ul
                  className="room-player-list"
                  variants={listContainer}
                  initial="hidden"
                  animate="show"
                  key={`${room.id}-${room.status}-${room.players.length}`}
                >
                  {room.players.map((player) => (
                    <motion.li key={player.id} variants={listItem}>
                      <div className="room-player-main">
                        <span className="room-player-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
                        <span className="user-name-inline-with-rank">
                          <Link href={`/u/${encodeURIComponent(player.name)}`} className="multiplayer-profile-link">
                            {player.name}
                            {room.hostId === player.id ? " (Host)" : ""}
                          </Link>
                          {getUserTags(player.name, room.language).length ? (
                            <>
                              <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[room.language]}>
                                <LanguageFlagIcon language={room.language} />
                              </span>
                              <UserRankBadge tags={getUserTags(player.name, room.language)} />
                            </>
                          ) : null}
                        </span>
                      </div>
                      <div className="room-player-badges">
                        <span className={`status-badge ${player.connected ? "online" : "offline"}`}>
                          {player.connected ? "Online" : "Offline"}
                        </span>
                        <span className={`status-badge ${player.ready ? "ready" : "waiting"}`}>
                          {player.ready ? "Ready" : "Waiting"}
                        </span>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>

                <div className="multiplayer-buttons">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={toggleReady}
                    disabled={!self || room.status === "racing" || !self.connected}
                  >
                    <TimerIcon className="ui-icon" />
                    {self?.ready ? "Unready" : "Ready"}
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={startRace}
                    disabled={!isHost || !canStartRace}
                  >
                    <SparkIcon className="ui-icon" />
                    Start Race
                  </button>
                  <button
                    className={`btn btn-ghost exit-room-btn ${requireExitNotice ? "need-exit" : ""}`}
                    type="button"
                    onClick={exitRoom}
                  >
                    Exit Room
                  </button>
                </div>
                {requireExitNotice ? (
                  <p className="kpi-label exit-room-alert">
                    Please exit room first before moving to another page.
                  </p>
                ) : null}
              </>
            )}
          </section>

        </div>

        <aside className="card glass multiplayer-chat-sidebar">
          <h2 className="feature-title">
            <ChatIcon className="ui-icon ui-icon-accent" />
            Room Chat
          </h2>
          {!room ? <p className="kpi-label">Join a room to start chatting.</p> : null}
          <motion.div
            ref={chatListRef}
            className="chat-list"
            variants={listContainer}
            initial="hidden"
            animate="show"
          >
            {room && room.chat.length === 0 ? <p className="kpi-label">No messages yet.</p> : null}
            {room?.chat.map((message) => (
              <motion.p
                key={message.id}
                className={`chat-item ${message.playerId === selfPlayerId ? "chat-self" : ""}`}
                variants={listItem}
              >
                <strong>
                  <Link href={`/u/${encodeURIComponent(message.name)}`} className="multiplayer-profile-link">
                    {message.name}
                  </Link>
                  :
                </strong>{" "}
                {message.text}
              </motion.p>
            ))}
          </motion.div>
          <div className="multiplayer-buttons">
            <input
              className="chat-input"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={room ? "Type message..." : "Join room first..."}
              disabled={!room}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendChatMessage();
                }
              }}
            />
            <button className="btn btn-ghost" type="button" onClick={sendChatMessage} disabled={!room}>
              <ChatIcon className="ui-icon" />
              Send
            </button>
          </div>
        </aside>
      </section>

      {room ? (
        <section className="card glass battle-arena">
          <h2 className="feature-title">
            <GaugeIcon className="ui-icon ui-icon-accent" />
            Live Race
          </h2>

          <p className="kpi-label">
            Time Left: <strong>{formatSeconds(timeLeft)}</strong> | Your WPM: <strong>{battleWpm}</strong> |
            Progress: <strong>{Math.round(progress)}%</strong>
          </p>

          <div className="typing-progress-track">
            <div className="typing-progress-bar" style={{ width: `${progress}%` }} />
          </div>

          {room.status === "racing" ? (
            <section className="typing-arena multiplayer-typing" aria-live="polite">
              <div className="typing-target-viewport">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={visibleStartLine}
                    className="typing-target typing-target-lines typing-target-layer"
                    initial={{ y: 4 }}
                    animate={{ y: 0 }}
                    exit={{ y: -4 }}
                    transition={{ duration: 0.05, ease: "linear" }}
                  >
                    {visibleRanges.map((range, lineIndex) => {
                      const lineWords = room.raceWords.slice(range.start, range.end);
                      return (
                        <div key={`line-${lineIndex}`} className="typing-line">
                          {lineWords.map((word, localIndex) => {
                            const globalIndex = range.start + localIndex;
                            const state = wordStates[globalIndex];
                            const isCurrent = globalIndex === currentWordIndex;
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
                ref={inputRef}
                className="typing-input typing-input-word"
                value={inputWord}
                onChange={(event) => setInputWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    submitCurrentWord();
                  }
                }}
                placeholder="Type active word then press Space..."
                spellCheck={false}
                autoFocus
                disabled={uiModalOpen || !self?.connected || self?.blocked || room.status !== "racing"}
              />
            </section>
          ) : null}

          {room.status === "finished" ? (
            <p className="kpi-label">
              <TrophyIcon className="ui-icon" />
              Winner:{" "}
              <strong>{room.players.find((player) => player.id === room.winnerId)?.name ?? "Unknown"}</strong>
            </p>
          ) : null}

          <motion.div
            className="battle-bars"
            variants={listContainer}
            initial="hidden"
            animate="show"
            key={`${room.id}-${room.status}-bars`}
          >
            {room.players.map((player) => (
              <motion.article key={player.id} className="battle-bar-card" variants={listItem}>
                <div className="battle-bar-head">
                  <span>
                    <Link href={`/u/${encodeURIComponent(player.name)}`} className="multiplayer-profile-link">
                      {player.name}
                    </Link>
                    {player.id === selfPlayerId ? " (You)" : ""}
                    {getUserTags(player.name, room.language).length ? (
                      <span className="user-name-inline-with-rank">
                        <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[room.language]}>
                          <LanguageFlagIcon language={room.language} />
                        </span>
                        <UserRankBadge tags={getUserTags(player.name, room.language)} />
                      </span>
                    ) : null}
                  </span>
                  <span>{Math.round(player.progress)}%</span>
                </div>
                <div className="typing-progress-track">
                  <div className="typing-progress-bar" style={{ width: `${player.progress}%` }} />
                </div>
                <p className="kpi-label">
                  WPM: {Math.round(player.wpm)} | {player.connected ? "online" : "offline"}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </section>
      ) : null}

      {raceSaveState !== "idle" ? (
        <p className="kpi-label">
          Match persistence:{" "}
          <strong>
            {raceSaveState === "saving" ? "saving..." : raceSaveState === "saved" ? "saved" : "error"}
          </strong>
        </p>
      ) : null}
      {error ? <p className="kpi-label">Error: {error}</p> : null}
    </main>
  );
}
