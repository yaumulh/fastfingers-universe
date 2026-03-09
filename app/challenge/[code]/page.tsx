"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GaugeIcon, GlobeIcon, TimerIcon, TrophyIcon, UsersIcon } from "@/app/components/icons";
import { TypingExperience } from "@/app/typing/typing-experience";
import { LANGUAGE_LABELS, type LanguageCode } from "@/app/typing/word-banks";
import { UserAvatar } from "@/app/components/user-avatar";

type ChallengeData = {
  id: string;
  code: string;
  mode: "normal" | "advanced" | string;
  language: string;
  durationSec: number;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  creator: { id: string; username: string; displayName?: string | null } | null;
  attempts: Array<{
    id: string;
    username: string;
    displayName?: string | null;
    wpm: number;
    accuracy: number;
    createdAt: string;
  }>;
};

const LANGUAGE_CODES: LanguageCode[] = ["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"];

function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGE_CODES.includes(value as LanguageCode);
}

function formatLeaderboardTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChallengePage({ params }: { params: { code: string } }) {
  const code = String(params.code || "").toUpperCase();
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/challenges/${code}`, { cache: "no-store" });
      const json = (await response.json()) as { data?: ChallengeData; error?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Failed to load challenge.");
      }
      setChallenge(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    if (!submitNotice) return;
    const timer = window.setTimeout(() => setSubmitNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [submitNotice]);

  const dedupedAttempts = useMemo(() => {
    if (!challenge) return [];
    const seen = new Set<string>();
    const rows: ChallengeData["attempts"] = [];
    for (const attempt of challenge.attempts) {
      if (seen.has(attempt.username)) continue;
      seen.add(attempt.username);
      rows.push(attempt);
      if (rows.length >= 20) break;
    }
    return rows;
  }, [challenge]);

  const submitPrivateResult = useCallback(
    async (payload: { wpm: number; accuracy: number }) => {
      const response = await fetch(`/api/challenges/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wpm: payload.wpm,
          accuracy: payload.accuracy,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to submit attempt.");
      }
      setSubmitNotice("Result submitted to private leaderboard.");
      await loadChallenge();
    },
    [code, loadChallenge],
  );

  const languageCode = challenge && isLanguageCode(challenge.language) ? challenge.language : "en";
  const languageLabel = challenge ? (isLanguageCode(challenge.language) ? LANGUAGE_LABELS[challenge.language] : challenge.language) : "-";
  const typingVariant = challenge?.mode === "advanced" ? "advanced" : "normal";
  const challengeTitle = challenge?.creator
    ? `${challenge.creator.displayName ?? challenge.creator.username}'s Challenge`
    : `Challenge ${code}`;

  return (
    <main className="site-shell typing-page">
      {loading ? <section className="card glass"><p className="kpi-label">Loading challenge...</p></section> : null}
      {!loading && error ? <section className="card glass"><p className="kpi-label">Error: {error}</p></section> : null}

      {!loading && !error && challenge ? (
        <>
          <TypingExperience
            variant={typingVariant}
            initialLanguage={languageCode}
            fixedDuration={challenge.durationSec}
            lockLanguage
            hideTopRanking
            disableGlobalSave
            onSaveResult={submitPrivateResult}
            headerTitle={`Private Challenge: ${challengeTitle}`}
            headerDescription={`Compete in this shared room and submit only real typing runs. ${languageLabel} • ${challenge.durationSec}s • ${typingVariant} mode`}
          />

          <section className="typing-daily-leaderboard card glass" aria-label="Private challenge leaderboard">
            <h2 className="feature-title">
              <TrophyIcon className="ui-icon ui-icon-accent" />
              Private Leaderboard
            </h2>
            <p className="kpi-label">
              <UsersIcon className="ui-icon" /> Code: <strong>{challenge.code}</strong> |{" "}
              <GlobeIcon className="ui-icon" /> Language: <strong>{languageLabel}</strong> |{" "}
              <TimerIcon className="ui-icon" /> Duration: <strong>{challenge.durationSec}s</strong> |{" "}
              <GaugeIcon className="ui-icon" /> Mode: <strong>{typingVariant}</strong>
            </p>
            {submitNotice ? <p className="kpi-label">{submitNotice}</p> : null}
            {!challenge.isActive ? <p className="kpi-label">Challenge already expired.</p> : null}

            {dedupedAttempts.length === 0 ? (
              <p className="kpi-label">No attempts yet.</p>
            ) : (
              <div className="typing-mini-leaderboard">
                {dedupedAttempts.map((attempt, index) => (
                  <article key={attempt.id} className="typing-mini-leaderboard-row">
                    <span className={`typing-mini-rank ${index < 3 ? `medal medal-${index + 1}` : ""}`}>
                      {index < 3 ? (index === 0 ? "1st" : index === 1 ? "2nd" : "3rd") : `#${index + 1}`}
                    </span>
                    <span className="typing-mini-user">
                      <span className="typing-mini-name-wrap">
                        <UserAvatar
                          username={attempt.username}
                          displayName={attempt.displayName}
                          size="xs"
                        />
                        <Link className="typing-mini-name typing-mini-name-btn" href={`/u/${encodeURIComponent(attempt.username)}`}>
                          {attempt.displayName ?? attempt.username}
                        </Link>
                      </span>
                      <span className="typing-mini-time">{formatLeaderboardTime(attempt.createdAt)}</span>
                    </span>
                    <span className="typing-mini-metric">{Math.round(attempt.wpm)} WPM</span>
                    <span className="typing-mini-metric">{Math.round(attempt.accuracy)}%</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
