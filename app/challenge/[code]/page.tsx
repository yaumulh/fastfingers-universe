"use client";

import { useEffect, useState } from "react";
import { GaugeIcon, SparkIcon, TimerIcon, TrophyIcon } from "@/app/components/icons";

type ChallengeData = {
  id: string;
  code: string;
  mode: string;
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

export default function ChallengePage({ params }: { params: { code: string } }) {
  const code = String(params.code || "").toUpperCase();
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wpm, setWpm] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadChallenge() {
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
  }

  useEffect(() => {
    void loadChallenge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function submitAttempt() {
    const wpmNumber = Number(wpm);
    const accuracyNumber = Number(accuracy);
    if (!Number.isFinite(wpmNumber) || !Number.isFinite(accuracyNumber)) {
      setError("Please provide valid WPM and Accuracy.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const response = await fetch(`/api/challenges/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wpm: wpmNumber, accuracy: accuracyNumber }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Failed to submit attempt.");
        return;
      }
      setWpm("");
      setAccuracy("");
      await loadChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <SparkIcon className="ui-icon ui-icon-accent" />
          Challenge {code}
        </h1>
        <p>Submit your score and compete on this private challenge leaderboard.</p>
      </section>

      {loading ? <section className="card glass"><p className="kpi-label">Loading challenge...</p></section> : null}
      {!loading && error ? <section className="card glass"><p className="kpi-label">Error: {error}</p></section> : null}

      {!loading && !error && challenge ? (
        <>
          <section className="grid-3">
            <article className="card glass">
              <p className="kpi">{challenge.mode}</p>
              <p className="kpi-label">Mode</p>
            </article>
            <article className="card glass">
              <p className="kpi">{challenge.language}</p>
              <p className="kpi-label">Language</p>
            </article>
            <article className="card glass">
              <p className="kpi">{challenge.durationSec}s</p>
              <p className="kpi-label">Duration</p>
            </article>
          </section>

          <section className="card glass profile-social">
            <h2 className="feature-title">
              <GaugeIcon className="ui-icon ui-icon-accent" />
              Submit Attempt
            </h2>
            <div className="profile-social-row">
              <input
                className="chat-input"
                value={wpm}
                onChange={(event) => setWpm(event.target.value)}
                placeholder="WPM"
                disabled={busy || !challenge.isActive}
              />
              <input
                className="chat-input"
                value={accuracy}
                onChange={(event) => setAccuracy(event.target.value)}
                placeholder="Accuracy %"
                disabled={busy || !challenge.isActive}
              />
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !challenge.isActive}
                onClick={() => void submitAttempt()}
              >
                Submit
              </button>
            </div>
            {!challenge.isActive ? <p className="kpi-label">Challenge already expired.</p> : null}
          </section>

          <section className="card glass profile-social">
            <h2 className="feature-title">
              <TrophyIcon className="ui-icon ui-icon-accent" />
              Challenge Leaderboard
            </h2>
            {challenge.attempts.length === 0 ? (
              <p className="kpi-label">No attempts yet.</p>
            ) : (
              <div className="profile-trend-list">
                {challenge.attempts.map((attempt, index) => (
                  <article key={attempt.id} className="profile-trend-item">
                    <p className="leaderboard-title">#{index + 1} {attempt.displayName ?? attempt.username}</p>
                    <p className="kpi-label">
                      <GaugeIcon className="ui-icon" /> {Math.round(attempt.wpm)} WPM |{" "}
                      <TimerIcon className="ui-icon" /> {Math.round(attempt.accuracy)}%
                    </p>
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
