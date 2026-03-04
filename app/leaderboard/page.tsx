"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, type Difficulty, type LanguageCode } from "@/app/typing/word-banks";
import { UserRankBadge } from "@/app/components/user-rank-badge";
import { LanguageFlagIcon } from "@/app/components/language-flag-icon";
import {
  GaugeIcon,
  GlobeIcon,
  TimerIcon,
  TrophyIcon,
  UsersIcon,
} from "../components/icons";

type Period = "all" | "today" | "weekly" | "season";
type SortMode = "recent" | "top";
type LeaderboardMode = "typing" | "multiplayer";
type TypingModeFilter = "all" | "normal" | "advanced";
type DurationFilter = "all" | 15 | 30 | 60 | 120;

const DURATION_FILTERS: DurationFilter[] = ["all", 15, 30, 60, 120];
const PREFERRED_LANGUAGE_KEY = "fastfingers:preferred-language";

type TypingResult = {
  id: string;
  wpm: number;
  accuracy: number;
  duration: number;
  wordCount: number;
  mistakes: number;
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

type MultiplayerMatch = {
  id: string;
  roomId: string;
  winnerName: string | null;
  finishedAt: string;
  participants: Array<{
    id: string;
    playerName: string;
    wpm: number;
    progress: number;
    isWinner: boolean;
  }>;
};

const PERIOD_OPTIONS: Period[] = ["all", "today", "weekly", "season"];
const SORT_OPTIONS: SortMode[] = ["recent", "top"];

const listContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.05,
    },
  },
};

const listItem = {
  hidden: { opacity: 0, y: 8, scale: 0.99 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
};

function dedupeTopTypingByUser(rows: TypingResult[]): TypingResult[] {
  const seenUserIds = new Set<string>();
  const deduped: TypingResult[] = [];

  for (const row of rows) {
    const userId = row.user?.id;
    if (userId) {
      if (seenUserIds.has(userId)) {
        continue;
      }
      seenUserIds.add(userId);
    }
    deduped.push(row);
  }

  return deduped;
}

export default function LeaderboardPage() {
  const [mode, setMode] = useState<LeaderboardMode>("typing");
  const [period, setPeriod] = useState<Period>("all");
  const [language, setLanguage] = useState<LanguageCode | "all">("all");
  const [typingMode, setTypingMode] = useState<TypingModeFilter>("all");
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [sort, setSort] = useState<SortMode>("top");
  const [typingData, setTypingData] = useState<TypingResult[]>([]);
  const [multiplayerData, setMultiplayerData] = useState<MultiplayerMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function applyFromSearch(search: string) {
      const params = new URLSearchParams(search);
      const modeParam = params.get("mode");
      const periodParam = params.get("period");
      const sortParam = params.get("sort");
      const languageParam = params.get("language");
      const typingModeParam = params.get("typingMode");
      const durationParam = params.get("duration");

      if (modeParam === "typing" || modeParam === "multiplayer") {
        setMode(modeParam);
      }
      if (
        periodParam === "all" ||
        periodParam === "today" ||
        periodParam === "weekly" ||
        periodParam === "season"
      ) {
        setPeriod(periodParam);
      }
      if (sortParam === "recent" || sortParam === "top") {
        setSort(sortParam);
      }
      if (
        languageParam === "all" ||
        (languageParam !== null && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, languageParam))
      ) {
        setLanguage(languageParam as LanguageCode | "all");
      } else {
        const storedLanguage = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
        if (
          storedLanguage &&
          Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, storedLanguage)
        ) {
          setLanguage(storedLanguage as LanguageCode);
        }
      }
      if (typingModeParam === "all" || typingModeParam === "normal" || typingModeParam === "advanced") {
        setTypingMode(typingModeParam);
      }
      if (durationParam === "all") {
        setDurationFilter("all");
      } else {
        const parsed = Number(durationParam);
        if (parsed === 15 || parsed === 30 || parsed === 60 || parsed === 120) {
          setDurationFilter(parsed);
        }
      }
    }

    applyFromSearch(window.location.search);
    const onPopState = () => applyFromSearch(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    params.set("sort", sort);
    params.set("limit", "50");

    if (mode === "typing") {
      if (language !== "all") {
        params.set("language", language);
      }

      if (typingMode === "normal") {
        params.set("difficulty", "medium");
      }

      if (typingMode === "advanced") {
        params.set("difficulty", "hard");
      }

      if (durationFilter !== "all") {
        params.set("duration", String(durationFilter));
      }
    }

    return params.toString();
  }, [typingMode, durationFilter, language, mode, period, sort]);

  useEffect(() => {
    let cancelled = false;

    async function loadData(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        if (mode === "typing") {
          const response = await fetch(`/api/test-results?${query}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Failed to fetch typing leaderboard.");
          }
          const json = (await response.json()) as { data: TypingResult[] };
          if (!cancelled) {
            setTypingData(sort === "top" ? dedupeTopTypingByUser(json.data) : json.data);
            setMultiplayerData([]);
          }
          return;
        }

        if (mode === "multiplayer") {
          const response = await fetch(`/api/multiplayer-matches?${query}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Failed to fetch multiplayer leaderboard.");
          }
          const json = (await response.json()) as { data: MultiplayerMatch[] };
          if (!cancelled) {
            setMultiplayerData(json.data);
            setTypingData([]);
          }
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setTypingData([]);
          setMultiplayerData([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [mode, query, sort]);

  return (
    <main className="site-shell leaderboard-page">
      <section className="typing-header">
        <h1>
          <TrophyIcon className="ui-icon ui-icon-accent" />
          Leaderboard
        </h1>
        <p>Unified ranking for typing tests and multiplayer race results stored in SQLite.</p>
      </section>

      <section className="leaderboard-modes">
        <button
          className={`btn ${mode === "typing" ? "btn-primary" : "btn-ghost"}`}
          type="button"
          onClick={() => setMode("typing")}
        >
          <GaugeIcon className="ui-icon" />
          Typing
        </button>
        <button
          className={`btn ${mode === "multiplayer" ? "btn-primary" : "btn-ghost"}`}
          type="button"
          onClick={() => setMode("multiplayer")}
        >
          <UsersIcon className="ui-icon" />
          Multiplayer
        </button>
      </section>

      {mode === "typing" ? (
        <section className="leaderboard-duration-wrap" aria-label="Typing duration filters">
          <div className="leaderboard-sub-separator" />
          <nav className="leaderboard-duration-links">
            {DURATION_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className={`duration-link-btn ${durationFilter === value ? "active" : ""}`}
                onClick={() => setDurationFilter(value)}
              >
                {value === "all" ? "All Duration" : `${value}s`}
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      <section className="leaderboard-filters card glass">
        <label>
          Period
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            {PERIOD_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Language
          <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode | "all")}>
            <option value="all">all</option>
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Mode
          <select value={typingMode} onChange={(event) => setTypingMode(event.target.value as TypingModeFilter)}>
            <option value="all">all</option>
            <option value="normal">normal</option>
            <option value="advanced">advanced</option>
          </select>
        </label>

        <label>
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            {SORT_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card glass leaderboard-table-wrap">
        {isLoading ? <p className="kpi-label">Loading leaderboard...</p> : null}
        {!isLoading && error ? <p className="kpi-label">Error: {error}</p> : null}

        {!isLoading && !error && mode === "typing" && typingData.length === 0 ? (
          <p className="kpi-label">No typing results yet.</p>
        ) : null}

        {!isLoading && !error && mode === "typing" && typingData.length > 0 ? (
          <motion.div
            key={`typing-${query}`}
            className="leaderboard-list"
            variants={listContainer}
            initial="hidden"
            animate="show"
          >
            {typingData.map((row, index) => (
              <motion.article key={row.id} className="leaderboard-item" variants={listItem}>
                <div className="leaderboard-item-head">
                  <span className="leaderboard-rank">#{index + 1}</span>
                  <div>
                    <p className="leaderboard-title-row">
                      <span className="leaderboard-title">{row.user?.displayName ?? row.user?.username ?? "Guest"}</span>
                      {row.user?.tags && row.user.tags.length > 0 ? (
                        <>
                          <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[row.language]}>
                            <LanguageFlagIcon language={row.language} />
                          </span>
                          <UserRankBadge tags={row.user.tags} />
                        </>
                      ) : null}
                    </p>
                    <p className="leaderboard-sub">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="leaderboard-metrics">
                  <span className="leaderboard-metric-green">
                    <GaugeIcon className="ui-icon" />
                    {Math.round(row.wpm)} WPM
                  </span>
                  <span className="leaderboard-metric-green">
                    <TrophyIcon className="ui-icon" />
                    {Math.round(row.accuracy)}% Accuracy
                  </span>
                  <span className="leaderboard-metric-green">
                    <GlobeIcon className="ui-icon" />
                    {LANGUAGE_LABELS[row.language] ?? row.language}
                  </span>
                  <span className="leaderboard-metric-green">
                    <TimerIcon className="ui-icon" />
                    {row.duration}s |{" "}
                    {row.difficulty === "hard"
                      ? "advanced"
                      : row.difficulty === "medium"
                        ? "normal"
                        : "legacy"}
                  </span>
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : null}

        {!isLoading && !error && mode === "multiplayer" && multiplayerData.length === 0 ? (
          <p className="kpi-label">No multiplayer matches yet.</p>
        ) : null}

        {!isLoading && !error && mode === "multiplayer" && multiplayerData.length > 0 ? (
          <motion.div
            key={`multiplayer-${query}`}
            className="leaderboard-list"
            variants={listContainer}
            initial="hidden"
            animate="show"
          >
            {multiplayerData.map((row, index) => {
              const topWpm = Math.max(...row.participants.map((p) => p.wpm), 0);
              const rankedPlayers = [...row.participants].sort((a, b) => b.wpm - a.wpm);

              return (
                <motion.article key={row.id} className="leaderboard-item" variants={listItem}>
                  <div className="leaderboard-item-head">
                    <span className="leaderboard-rank">#{index + 1}</span>
                    <div>
                      <p className="leaderboard-title">Room {row.roomId}</p>
                      <p className="leaderboard-sub">{new Date(row.finishedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="leaderboard-metrics">
                    <span>
                      <TrophyIcon className="ui-icon" />
                      Winner: {row.winnerName ?? "Unknown"}
                    </span>
                    <span>
                      <UsersIcon className="ui-icon" />
                      {row.participants.length} Players
                    </span>
                    <span>
                      <GaugeIcon className="ui-icon" />
                      Top {Math.round(topWpm)} WPM
                    </span>
                  </div>
                  <div className="leaderboard-chips">
                    {rankedPlayers.map((player) => (
                      <span key={player.id} className="leaderboard-chip">
                        {player.playerName} {Math.round(player.wpm)}wpm
                      </span>
                    ))}
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        ) : null}
      </section>

    </main>
  );
}
