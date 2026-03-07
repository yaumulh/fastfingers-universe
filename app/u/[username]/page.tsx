"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GaugeIcon, SparkIcon, TimerIcon, TrophyIcon, UserIcon } from "@/app/components/icons";
import { RecentRunsChart } from "@/app/components/recent-runs-chart";
import { UserAvatar } from "@/app/components/user-avatar";

type PublicProfileResponse = {
  data: {
    user: {
      id: string;
      username: string;
      displayName?: string | null;
      avatarUrl?: string | null;
      rating: number;
      trustScore: number;
      totalXp: number;
      streakDays: number;
      createdAt: string;
      level: {
        level: number;
        totalXp: number;
        currentLevelXp: number;
        nextLevelXp: number;
        progressPct: number;
      };
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
      mode: "normal" | "advanced";
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
};

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = useMemo(() => String(params?.username ?? "").trim(), [params]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicProfileResponse["data"] | null>(null);

  useEffect(() => {
    if (!username) {
      setError("Invalid profile.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/public-profile/${encodeURIComponent(username)}`, { cache: "no-store" });
        const json = (await response.json()) as PublicProfileResponse & { error?: string };
        if (!response.ok || !json.data) {
          throw new Error(json.error ?? "Profile not found.");
        }
        if (!cancelled) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <main>
      <div className="site-shell">
        <section className="typing-page">
          <h1>
            <UserIcon className="ui-icon ui-icon-accent" />
            Public Profile
          </h1>
          {loading ? <p className="kpi-label">Loading profile...</p> : null}
          {error ? <p className="kpi-label auth-error">{error}</p> : null}
          {data ? (
            <>
              <section className="grid-3 profile-kpis">
                <article className="card glass">
                  <div className="public-profile-identity">
                    <UserAvatar
                      username={data.user.username}
                      displayName={data.user.displayName}
                      avatarUrl={data.user.avatarUrl}
                      size="md"
                      className="public-profile-avatar-lg"
                    />
                    <p className="kpi public-profile-name">{data.user.displayName ?? data.user.username}</p>
                  </div>
                  <p className="kpi-label">@{data.user.username}</p>
                </article>
                <article className="card glass">
                  <p className="kpi">{data.user.level.level}</p>
                  <p className="kpi-label">Level</p>
                </article>
                <article className="card glass">
                  <p className="kpi">{data.user.streakDays}</p>
                  <p className="kpi-label">Streak Days</p>
                </article>
              </section>

              <section className="grid-3 profile-kpis">
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <GaugeIcon className="ui-icon" />
                  </span>
                  <p className="kpi">{data.summary.bestWpm}</p>
                  <p className="kpi-label">Best WPM</p>
                </article>
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <SparkIcon className="ui-icon" />
                  </span>
                  <p className="kpi">{data.summary.avgAccuracy}%</p>
                  <p className="kpi-label">Avg Accuracy</p>
                </article>
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <TimerIcon className="ui-icon" />
                  </span>
                  <p className="kpi">{data.summary.totalTests}</p>
                  <p className="kpi-label">Total Tests</p>
                </article>
              </section>

              <section className="grid-3 profile-kpis">
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <TrophyIcon className="ui-icon" />
                  </span>
                  <p className="kpi">{data.summary.competitionJoined}</p>
                  <p className="kpi-label">Competitions Joined</p>
                </article>
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <TrophyIcon className="ui-icon" />
                  </span>
                  <p className="kpi">{data.summary.competitionWins}</p>
                  <p className="kpi-label">Competition Wins</p>
                </article>
                <article className="card glass">
                  <span className="ui-icon-badge">
                    <SparkIcon className="ui-icon" />
                  </span>
                  <p className="kpi">
                    {data.summary.competitionJoined > 0
                      ? Math.round((data.summary.competitionWins / data.summary.competitionJoined) * 100)
                      : 0}
                    %
                  </p>
                  <p className="kpi-label">Competition Win Rate</p>
                </article>
              </section>

              <section className="card glass profile-trend">
                <h2 className="feature-title">
                  <GaugeIcon className="ui-icon ui-icon-accent" />
                  Latest Runs
                </h2>
                <RecentRunsChart runs={data.trend} />
              </section>

              <section className="card glass profile-trend">
                <h2 className="feature-title">
                  <TrophyIcon className="ui-icon ui-icon-accent" />
                  Recent Competitions
                </h2>
                {data.recentCompetitions.length === 0 ? (
                  <p className="kpi-label">No completed competition yet.</p>
                ) : (
                  <div className="profile-trend-list">
                    {data.recentCompetitions.map((item) => (
                      <article key={`${item.competitionId}-${item.bestResultAt ?? item.endedAt}`} className="profile-trend-item">
                        <Link href={`/competition/${item.competitionId}`} className="profile-trend-link kpi-label profile-trend-line">
                          {item.title} | {item.bestWpm} WPM | {item.bestAccuracy}% ACC
                          {item.isWinner ? " | Winner" : ""} |{" "}
                          {item.bestResultAt
                            ? new Date(item.bestResultAt).toLocaleString()
                            : new Date(item.endedAt).toLocaleString()}
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
