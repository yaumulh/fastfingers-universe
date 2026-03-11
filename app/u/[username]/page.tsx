"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GaugeIcon, SparkIcon, TimerIcon, TrophyIcon, UserIcon } from "@/app/components/icons";
import { RecentRunsChart } from "@/app/components/recent-runs-chart";
import { UserAvatar } from "@/app/components/user-avatar";
import { type LanguageCode } from "@/app/typing/word-banks";

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
      language: LanguageCode;
      duration: number;
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
  const [friendState, setFriendState] = useState<"guest" | "self" | "none" | "request_sent" | "request_received" | "friends">("guest");
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [friendActionNotice, setFriendActionNotice] = useState<string | null>(null);

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

  useEffect(() => {
    const targetUsername = data?.user.username;
    if (!targetUsername) {
      return;
    }

    let cancelled = false;
    async function resolveFriendState() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        if (!sessionResponse.ok) {
          if (!cancelled) setFriendState("guest");
          return;
        }
        const sessionJson = (await sessionResponse.json()) as {
          data: { username?: string | null } | null;
        };
        const viewerUsername = sessionJson.data?.username?.trim() ?? "";
        if (!viewerUsername) {
          if (!cancelled) setFriendState("guest");
          return;
        }
        if (viewerUsername === targetUsername) {
          if (!cancelled) setFriendState("self");
          return;
        }

        const friendsResponse = await fetch("/api/friends", { cache: "no-store" });
        if (!friendsResponse.ok) {
          if (!cancelled) setFriendState("none");
          return;
        }
        const friendsJson = (await friendsResponse.json()) as {
          data?: {
            friends?: Array<{ username: string }>;
            pendingIncoming?: Array<{ user: { username: string } }>;
            pendingOutgoing?: Array<{ user: { username: string } }>;
          };
        };
        const target = targetUsername;
        const friends = friendsJson.data?.friends ?? [];
        const pendingIncoming = friendsJson.data?.pendingIncoming ?? [];
        const pendingOutgoing = friendsJson.data?.pendingOutgoing ?? [];

        if (friends.some((item) => item.username === target)) {
          if (!cancelled) setFriendState("friends");
          return;
        }
        if (pendingOutgoing.some((item) => item.user.username === target)) {
          if (!cancelled) setFriendState("request_sent");
          return;
        }
        if (pendingIncoming.some((item) => item.user.username === target)) {
          if (!cancelled) setFriendState("request_received");
          return;
        }
        if (!cancelled) setFriendState("none");
      } catch {
        if (!cancelled) setFriendState("none");
      }
    }
    void resolveFriendState();
    return () => {
      cancelled = true;
    };
  }, [data?.user.username]);

  useEffect(() => {
    if (!friendActionNotice) return;
    const timer = window.setTimeout(() => setFriendActionNotice(null), 2100);
    return () => window.clearTimeout(timer);
  }, [friendActionNotice]);

  async function handleAddFriend() {
    if (!data?.user.username || friendActionBusy) return;
    if (friendState === "guest") {
      window.dispatchEvent(new CustomEvent("ff:require-login"));
      return;
    }
    if (friendState !== "none") return;

    try {
      setFriendActionBusy(true);
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.user.username }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          const message = (json.error ?? "").toLowerCase();
          if (message.includes("already friends")) {
            setFriendState("friends");
            setFriendActionNotice("Already friends.");
            return;
          }
          if (message.includes("pending")) {
            setFriendState("request_sent");
            setFriendActionNotice("Request already sent.");
            return;
          }
        }
        setFriendActionNotice(json.error ?? "Failed to send request.");
        return;
      }
      setFriendState("request_sent");
      setFriendActionNotice("Friend request sent.");
    } catch {
      setFriendActionNotice("Failed to send request.");
    } finally {
      setFriendActionBusy(false);
    }
  }

  const addFriendLabel =
    friendState === "friends"
      ? "Friends"
      : friendState === "request_sent"
        ? "Request Sent"
        : friendState === "request_received"
          ? "Pending Approval"
          : friendState === "guest"
            ? "Add Friend"
            : "Add Friend";

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <UserIcon className="ui-icon ui-icon-accent" />
          Public Profile
        </h1>
        <p>View public stats, latest runs, and recent competitions.</p>
      </section>

      {loading ? <section className="card glass"><p className="kpi-label">Loading profile...</p></section> : null}
      {error ? <section className="card glass"><p className="kpi-label auth-error">{error}</p></section> : null}

      {data ? (
        <>
              <section className="profile-hero-section profile-summary">
                <article className="card glass profile-hero-card">
                  <div className="profile-hero-main">
                    <div className="profile-hero-identity">
                      <div className="profile-avatar-wrap">
                        {data.user.avatarUrl ? (
                          <Image
                            src={data.user.avatarUrl}
                            alt={`${data.user.displayName ?? data.user.username} avatar`}
                            width={72}
                            height={72}
                            className="profile-avatar-image"
                            unoptimized
                          />
                        ) : (
                          <UserAvatar
                            username={data.user.username}
                            displayName={data.user.displayName}
                            avatarUrl={null}
                            size="md"
                            className="profile-avatar-fallback"
                          />
                        )}
                      </div>
                      <div className="profile-name-row">
                        <p className="kpi public-profile-name">{data.user.displayName ?? data.user.username}</p>
                        {friendState !== "self" ? (
                          <button
                            type="button"
                            className={`public-profile-add-friend-btn ${friendState !== "none" && friendState !== "guest" ? "state-locked" : ""}`}
                            onClick={() => void handleAddFriend()}
                            disabled={friendActionBusy || (friendState !== "none" && friendState !== "guest")}
                            title={addFriendLabel}
                            aria-label={addFriendLabel}
                          >
                            <span className="public-profile-add-friend-icon">+</span>
                            <span>{addFriendLabel}</span>
                          </button>
                        ) : null}
                      </div>
                      <p className="kpi-label profile-username-linklike">@{data.user.username}</p>
                      {friendActionNotice ? <p className="kpi-label public-profile-friend-notice">{friendActionNotice}</p> : null}
                      <div className="public-profile-meta">
                        <span className="kpi-label">Joined {new Date(data.user.createdAt).toLocaleDateString()}</span>
                        <span className="kpi-label">Level {data.user.level.level}</span>
                        <span className="kpi-label">Streak {data.user.streakDays} days</span>
                      </div>
                    </div>

                    <div className="profile-hero-stats-grid">
                      <article className="profile-hero-metric">
                        <span className="ui-icon-badge">
                          <TrophyIcon className="ui-icon" />
                        </span>
                        <p className="kpi">{data.user.rating}</p>
                        <p className="kpi-label">Rating</p>
                      </article>
                      <article className="profile-hero-metric">
                        <span className="ui-icon-badge">
                          <SparkIcon className="ui-icon" />
                        </span>
                        <p className="kpi">{data.user.trustScore}%</p>
                        <p className="kpi-label">Trust Score</p>
                      </article>
                      <article className="profile-hero-metric">
                        <span className="ui-icon-badge">
                          <GaugeIcon className="ui-icon" />
                        </span>
                        <p className="kpi">{data.summary.bestWpm}</p>
                        <p className="kpi-label">Best WPM</p>
                      </article>
                      <article className="profile-hero-metric">
                        <p className="kpi">{data.summary.avgAccuracy}%</p>
                        <p className="kpi-label">Avg Accuracy</p>
                      </article>
                      <article className="profile-hero-metric">
                        <span className="ui-icon-badge">
                          <TimerIcon className="ui-icon" />
                        </span>
                        <p className="kpi">{data.summary.totalTests}</p>
                        <p className="kpi-label">Total Tests</p>
                      </article>
                      <article className="profile-hero-metric">
                        <p className="kpi">{data.summary.competitionJoined}</p>
                        <p className="kpi-label">Competitions Joined</p>
                      </article>
                      <article className="profile-hero-metric">
                        <p className="kpi">{data.summary.competitionWins}</p>
                        <p className="kpi-label">Competition Wins</p>
                      </article>
                      <article className="profile-hero-metric">
                        <p className="kpi">
                          {data.summary.competitionJoined > 0
                            ? Math.round((data.summary.competitionWins / data.summary.competitionJoined) * 100)
                            : 0}
                          %
                        </p>
                        <p className="kpi-label">Competition Win Rate</p>
                      </article>
                    </div>
                  </div>
                </article>
              </section>

              <div className="profile-recent-grid">
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
                          <Link href={`/competition/${item.competitionId}`} className="profile-trend-link profile-competition-link">
                            <span className="profile-competition-main">
                              <span className="profile-competition-title">{item.title}</span>
                              <span className="kpi-label profile-competition-meta">
                                {item.bestResultAt
                                  ? new Date(item.bestResultAt).toLocaleString()
                                  : new Date(item.endedAt).toLocaleString()}
                              </span>
                            </span>
                            {item.isWinner ? <span className="profile-competition-chip">Winner</span> : null}
                          </Link>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
        </>
      ) : null}
    </main>
  );
}
