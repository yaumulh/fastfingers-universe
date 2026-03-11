"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { EyeIcon, GaugeIcon, InfoIcon, PencilIcon, SparkIcon, TimerIcon, TrophyIcon, UsersIcon } from "../components/icons";
import { RecentRunsChart } from "../components/recent-runs-chart";
import { UserAvatar } from "../components/user-avatar";
import { LANGUAGE_LABELS } from "../typing/word-banks";

type ProfileResponse = {
  data: {
    user: {
      id: string;
      username: string;
      displayName?: string | null;
      avatarUrl?: string | null;
      displayNameUpdatedAt?: string | null;
      displayNameChangeAvailableAt?: string | null;
      rating: number;
      trustScore: number;
      totalXp: number;
      streakDays: number;
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
    achievements: Array<{
      code: string;
      label: string;
      unlockedAt: string;
    }>;
    missions: Array<{
      key: string;
      title: string;
      progress: number;
      target: number;
      completed: boolean;
    }>;
    trend: Array<{
      date: string;
      wpm: number;
      accuracy: number;
      mode: "normal" | "advanced";
      language: string;
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

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socialBusy, setSocialBusy] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameBusy, setDisplayNameBusy] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameEditOpen, setDisplayNameEditOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [challengeCode, setChallengeCode] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSiteOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/profile", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Please login first to view profile.");
          }
          throw new Error("Failed to load profile.");
        }
        const json = (await response.json()) as ProfileResponse;
        if (!cancelled) {
          setData(json.data);
          setDisplayNameDraft(json.data.user.displayName ?? json.data.user.username);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setData(null);
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
  }, []);

  const missionCompletion = useMemo(() => {
    if (!data || data.missions.length === 0) {
      return 0;
    }
    const done = data.missions.filter((mission) => mission.completed).length;
    return Math.round((done / data.missions.length) * 100);
  }, [data]);

  const canChangeDisplayName = useMemo(() => {
    if (!data?.user.displayNameChangeAvailableAt) {
      return true;
    }
    return new Date(data.user.displayNameChangeAvailableAt).getTime() <= Date.now();
  }, [data?.user.displayNameChangeAvailableAt]);

  const displayNameCooldownText = useMemo(() => {
    if (!data?.user.displayNameChangeAvailableAt || canChangeDisplayName) {
      return "You can change display name every 7 days.";
    }
    const target = new Date(data.user.displayNameChangeAvailableAt);
    return `Next change available on ${target.toLocaleString()}.`;
  }, [canChangeDisplayName, data?.user.displayNameChangeAvailableAt]);

  const publicProfileUrl = useMemo(() => {
    if (!data?.user.username) return "";
    const base = siteOrigin || (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) return "";
    return `${base}/u/${encodeURIComponent(data.user.username)}`;
  }, [data?.user.username, siteOrigin]);

  const competitionWinRate = useMemo(() => {
    if (!data) return 0;
    return data.summary.competitionJoined > 0
      ? Math.round((data.summary.competitionWins / data.summary.competitionJoined) * 100)
      : 0;
  }, [data]);

  async function createChallengeLink() {
    try {
      setSocialBusy(true);
      setSocialError(null);
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "normal", language: "en", durationSec: 60, expiresHours: 48 }),
      });
      const json = (await response.json()) as { data?: { code: string }; error?: string };
      if (!response.ok || !json.data) {
        setSocialError(json.error ?? "Failed to create challenge.");
        return;
      }
      setChallengeCode(json.data.code);
    } finally {
      setSocialBusy(false);
    }
  }

  async function copyPublicProfileLink() {
    if (!publicProfileUrl) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      setShareCopied(false);
    }
  }

  async function saveDisplayName() {
    if (!data) return;
    const value = displayNameDraft.trim();
    if (value.length < 3) {
      setDisplayNameError("Display name must be 3-12 characters.");
      return;
    }
    try {
      setDisplayNameBusy(true);
      setDisplayNameError(null);
      const response = await fetch("/api/auth/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value }),
      });
      const json = (await response.json()) as { data?: { displayName: string | null; displayNameUpdatedAt?: string | null }; error?: string };
      if (!response.ok || !json.data) {
        setDisplayNameError(json.error ?? "Failed to update display name.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                displayName: json.data?.displayName ?? prev.user.displayName,
                displayNameUpdatedAt: json.data?.displayNameUpdatedAt ?? new Date().toISOString(),
                displayNameChangeAvailableAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
            }
          : prev,
      );
      setDisplayNameDraft(value);
      setDisplayNameEditOpen(false);
    } finally {
      setDisplayNameBusy(false);
    }
  }

  async function uploadAvatar(file: File): Promise<void> {
    if (!file || !data) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setAvatarError("Only PNG, JPG, or WEBP is allowed.");
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setAvatarError("Avatar max size is 1MB.");
      return;
    }

    try {
      setAvatarBusy(true);
      setAvatarError(null);
      const form = new FormData();
      form.set("avatar", file);
      const response = await fetch("/api/profile/avatar", {
        method: "PATCH",
        body: form,
      });
      const json = (await response.json()) as {
        data?: { avatarUrl?: string | null };
        error?: string;
      };
      if (!response.ok || !json.data) {
        setAvatarError(json.error ?? "Failed to upload avatar.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                avatarUrl: json.data?.avatarUrl ?? null,
              },
            }
          : prev,
      );
      window.dispatchEvent(new CustomEvent("ff:auth-changed"));
    } catch {
      setAvatarError("Failed to upload avatar.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar(): Promise<void> {
    if (!data) return;
    try {
      setAvatarBusy(true);
      setAvatarError(null);
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      const json = (await response.json()) as {
        data?: { avatarUrl?: string | null };
        error?: string;
      };
      if (!response.ok || !json.data) {
        setAvatarError(json.error ?? "Failed to remove avatar.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                avatarUrl: null,
              },
            }
          : prev,
      );
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      window.dispatchEvent(new CustomEvent("ff:auth-changed"));
    } catch {
      setAvatarError("Failed to remove avatar.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <UsersIcon className="ui-icon ui-icon-accent" />
          User Profile
        </h1>
        <p>Track your personal progress, missions, achievements, and competitive rating.</p>
      </section>

      {loading ? <section className="card glass"><p className="kpi-label">Loading profile...</p></section> : null}
      {!loading && error ? <section className="card glass"><p className="kpi-label">Error: {error}</p></section> : null}

      {!loading && !error && data ? (
        <>
          <section className="profile-hero-section profile-summary">
            <article className="card glass profile-hero-card">
              <div className="profile-hero-main">
                <div className="profile-hero-identity">
                  <div className="profile-avatar-head">
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
                    <div className="profile-avatar-head-actions">
                      <button
                        className="profile-hero-icon-btn"
                        type="button"
                        onClick={() => void copyPublicProfileLink()}
                        disabled={!publicProfileUrl}
                        title={shareCopied ? "Copied" : "Share profile"}
                        aria-label={shareCopied ? "Copied" : "Share profile"}
                      >
                        <SparkIcon className="ui-icon" />
                      </button>
                      {publicProfileUrl ? (
                        <Link
                          href={`/u/${encodeURIComponent(data.user.username)}`}
                          className="profile-hero-icon-btn"
                          title="View public profile"
                          aria-label="View public profile"
                        >
                          <EyeIcon className="ui-icon" />
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="profile-name-row">
                    <p className="kpi">{data.user.displayName ?? data.user.username}</p>
                    <button
                      className="profile-edit-name-btn"
                      type="button"
                      onClick={() => setDisplayNameEditOpen(true)}
                      disabled={!canChangeDisplayName || displayNameBusy}
                      title={canChangeDisplayName ? "Edit display name" : "Display name can be changed every 7 days"}
                      aria-label="Edit display name"
                    >
                      <PencilIcon className="ui-icon" />
                    </button>
                  </div>
                  <p className="kpi-label profile-username-linklike">@{data.user.username}</p>

                  <div className="profile-social-row profile-avatar-actions">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="profile-avatar-input"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadAvatar(file);
                        }
                      }}
                      disabled={avatarBusy}
                    />
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarBusy}
                    >
                      {avatarBusy ? "Uploading..." : "Upload Avatar"}
                    </button>
                    {data.user.avatarUrl ? (
                      <button className="btn btn-ghost" type="button" onClick={() => void removeAvatar()} disabled={avatarBusy}>
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <p className="kpi-label">
                    Level <strong>{data.user.level.level}</strong> • {data.user.level.currentLevelXp}/{data.user.level.nextLevelXp} XP
                  </p>
                  <div className="typing-progress-track">
                    <div className="typing-progress-bar" style={{ width: `${data.user.level.progressPct}%` }} />
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
                    <p className="kpi">{data.summary.bestWpm}</p>
                    <p className="kpi-label">Best WPM</p>
                  </article>
                  <article className="profile-hero-metric">
                    <p className="kpi">{data.summary.avgWpm}</p>
                    <p className="kpi-label">Average WPM</p>
                  </article>
                  <article className="profile-hero-metric">
                    <p className="kpi">{data.summary.avgAccuracy}%</p>
                    <p className="kpi-label">Average Accuracy</p>
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
                    <p className="kpi">{competitionWinRate}%</p>
                    <p className="kpi-label">Competition Win Rate</p>
                  </article>
                </div>
              </div>

              {displayNameEditOpen ? (
                <div className="profile-social-row">
                  <input
                    className="chat-input"
                    value={displayNameDraft}
                    maxLength={12}
                    onChange={(event) => setDisplayNameDraft(event.target.value)}
                    disabled={displayNameBusy || !canChangeDisplayName}
                    placeholder="Display name"
                  />
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void saveDisplayName()}
                    disabled={displayNameBusy || !canChangeDisplayName}
                  >
                    {displayNameBusy ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setDisplayNameEditOpen(false);
                      setDisplayNameError(null);
                      setDisplayNameDraft(data.user.displayName ?? data.user.username);
                    }}
                    disabled={displayNameBusy}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <p className="profile-displayname-hint" aria-live="polite">
                <InfoIcon className="ui-icon" />
                <span>{displayNameCooldownText}</span>
              </p>
              {displayNameError ? <p className="kpi-label auth-error">{displayNameError}</p> : null}
              {avatarError ? <p className="kpi-label auth-error">{avatarError}</p> : null}
            </article>
          </section>

          <section className="card glass profile-missions">
            <h2 className="feature-title">
              <TimerIcon className="ui-icon ui-icon-accent" />
              Daily Missions ({missionCompletion}%)
            </h2>
            <div className="profile-mission-list">
              {data.missions.map((mission) => {
                const pct = Math.min(Math.round((mission.progress / Math.max(mission.target, 1)) * 100), 100);
                return (
                  <article key={mission.key} className="profile-mission-item">
                    <p className="leaderboard-title">{mission.title}</p>
                    <p className="kpi-label">
                      {mission.progress}/{mission.target} {mission.completed ? "Completed" : "In progress"}
                    </p>
                    <div className="typing-progress-track">
                      <div className="typing-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="card glass profile-achievements">
            <h2 className="feature-title">
              <TrophyIcon className="ui-icon ui-icon-accent" />
              Achievements
            </h2>
            {data.achievements.length === 0 ? (
              <p className="kpi-label">No achievements yet. Start typing to unlock.</p>
            ) : (
              <div className="leaderboard-chips">
                {data.achievements.map((achievement) => (
                  <span className="leaderboard-chip" key={achievement.code}>
                    {achievement.label}
                  </span>
                ))}
              </div>
            )}
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
                  {data.recentCompetitions.slice(0, 5).map((item) => (
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

          <section className="card glass profile-social">
            <h2 className="feature-title">
              <SparkIcon className="ui-icon ui-icon-accent" />
              Private Challenge Link
            </h2>
            <p className="kpi-label">Create and share challenge link for race with friends.</p>
            <button className="btn btn-primary" type="button" onClick={() => void createChallengeLink()} disabled={socialBusy}>
              Generate Challenge Link
            </button>
            {challengeCode ? (
              <p className="kpi-label">
                Code: <strong>{challengeCode}</strong> | URL:{" "}
                <strong>{`${siteOrigin || ""}/challenge/${challengeCode}`}</strong>
              </p>
            ) : null}
            {socialError ? <p className="kpi-label">Error: {socialError}</p> : null}
          </section>
        </>
      ) : null}

    </main>
  );
}
