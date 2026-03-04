"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChatIcon, GaugeIcon, InfoIcon, PencilIcon, SparkIcon, TimerIcon, TrophyIcon, UsersIcon } from "../components/icons";
import { LanguageFlagIcon } from "../components/language-flag-icon";
import { UserRankBadge } from "../components/user-rank-badge";
import { LANGUAGE_LABELS, type LanguageCode } from "../typing/word-banks";

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

type ProfileResponse = {
  data: {
    user: {
      id: string;
      username: string;
      displayName?: string | null;
      displayNameUpdatedAt?: string | null;
      displayNameChangeAvailableAt?: string | null;
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
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendUsername, setFriendUsername] = useState("");
  const [friendsData, setFriendsData] = useState<{
    friends: Array<{ id: string; username: string; displayName?: string | null }>;
    pendingIncoming: Array<{ id: string; user: { id: string; username: string; displayName?: string | null } }>;
    pendingOutgoing: Array<{ id: string; user: { id: string; username: string; displayName?: string | null } }>;
  } | null>(null);
  const [socialBusy, setSocialBusy] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameBusy, setDisplayNameBusy] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameEditOpen, setDisplayNameEditOpen] = useState(false);
  const [challengeCode, setChallengeCode] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [friendProfileOpen, setFriendProfileOpen] = useState(false);
  const [friendProfileLoading, setFriendProfileLoading] = useState(false);
  const [friendProfileError, setFriendProfileError] = useState<string | null>(null);
  const [friendProfileTags, setFriendProfileTags] = useState<UserTag[]>([]);
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [tagLanguage, setTagLanguage] = useState<LanguageCode>("en");
  const [friendProfileData, setFriendProfileData] = useState<{
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
  } | null>(null);

  useEffect(() => {
    setSiteOrigin(window.location.origin);
    const preferred = window.localStorage.getItem("fastfingers:preferred-language");
    if (preferred && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, preferred)) {
      setTagLanguage(preferred as LanguageCode);
    }
  }, []);

  useEffect(() => {
    if (!friendProfileOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFriendProfileOpen(false);
        setFriendProfileData(null);
        setFriendProfileError(null);
        setFriendProfileTags([]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [friendProfileOpen]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadFriends() {
      try {
        const response = await fetch("/api/friends", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as { data: NonNullable<typeof friendsData> };
        if (!cancelled) {
          setFriendsData(json.data);
        }
      } catch {
        if (!cancelled) {
          setFriendsData(null);
        }
      }
    }

    void loadFriends();
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

  async function refreshFriends() {
    const response = await fetch("/api/friends", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const json = (await response.json()) as { data: NonNullable<typeof friendsData> };
    setFriendsData(json.data);
  }

  async function sendFriendRequest() {
    if (!friendUsername.trim()) {
      return;
    }
    try {
      setSocialBusy(true);
      setSocialError(null);
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: friendUsername.trim() }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSocialError(json.error ?? "Failed to send friend request.");
        return;
      }
      setFriendUsername("");
      await refreshFriends();
    } finally {
      setSocialBusy(false);
    }
  }

  async function respondRequest(requestId: string, action: "accept" | "reject") {
    try {
      setSocialBusy(true);
      setSocialError(null);
      const response = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSocialError(json.error ?? "Failed to respond request.");
        return;
      }
      await refreshFriends();
    } finally {
      setSocialBusy(false);
    }
  }

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

  async function openFriendProfile(userId: string) {
    try {
      setFriendProfileOpen(true);
      setFriendProfileLoading(true);
      setFriendProfileError(null);
      setFriendProfileData(null);
      setFriendProfileTags([]);

      const response = await fetch(`/api/profile/${userId}`, { cache: "no-store" });
      const json = (await response.json()) as {
        data?: NonNullable<typeof friendProfileData>;
        error?: string;
      };

      if (!response.ok || !json.data) {
        setFriendProfileError(json.error ?? "Failed to load friend profile.");
        return;
      }

      setFriendProfileData(json.data);
      try {
        const query = new URLSearchParams({
          language: tagLanguage,
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
    } catch {
      setFriendProfileError("Failed to load friend profile.");
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
          <section className="grid-3 profile-summary">
            <article className="card glass">
              <span className="ui-icon-badge">
                <UsersIcon className="ui-icon" />
              </span>
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
            </article>
            <article className="card glass">
              <span className="ui-icon-badge">
                <TrophyIcon className="ui-icon" />
              </span>
              <p className="kpi">{data.user.rating}</p>
              <p className="kpi-label">Rating</p>
            </article>
            <article className="card glass">
              <span className="ui-icon-badge">
                <SparkIcon className="ui-icon" />
              </span>
              <p className="kpi">{data.user.trustScore}%</p>
              <p className="kpi-label">Trust Score</p>
            </article>
          </section>

          <section className="grid-3 profile-kpis">
            <article className="card glass">
              <p className="kpi">{data.summary.bestWpm}</p>
              <p className="kpi-label">Best WPM</p>
            </article>
            <article className="card glass">
              <p className="kpi">{data.summary.avgWpm}</p>
              <p className="kpi-label">Average WPM</p>
            </article>
            <article className="card glass">
              <p className="kpi">{data.summary.avgAccuracy}%</p>
              <p className="kpi-label">Average Accuracy</p>
            </article>
          </section>

          <section className="grid-3 profile-kpis">
            <article className="card glass">
              <p className="kpi">{data.summary.competitionJoined}</p>
              <p className="kpi-label">Competitions Joined</p>
            </article>
            <article className="card glass">
              <p className="kpi">{data.summary.competitionWins}</p>
              <p className="kpi-label">Competition Wins</p>
            </article>
            <article className="card glass">
              <p className="kpi">
                {data.summary.competitionJoined > 0
                  ? Math.round((data.summary.competitionWins / data.summary.competitionJoined) * 100)
                  : 0}
                %
              </p>
              <p className="kpi-label">Competition Win Rate</p>
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
                Recent Trend
              </h2>
              {data.trend.length === 0 ? (
                <p className="kpi-label">No run data yet.</p>
              ) : (
                <div className="profile-trend-list">
                  {[...data.trend].slice(-5).reverse().map((point, index) => (
                    <article key={`${point.date}-${index}`} className="profile-trend-item">
                      <p className="kpi-label profile-trend-line">
                        {new Date(point.date).toLocaleString()} | {point.wpm} WPM | {point.accuracy}% ACC
                      </p>
                    </article>
                  ))}
                </div>
              )}
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
          </div>

          <section className="card glass profile-social">
            <h2 className="feature-title">
              <UsersIcon className="ui-icon ui-icon-accent" />
              Friends
            </h2>
            <div className="profile-social-row">
              <input
                className="chat-input"
                value={friendUsername}
                onChange={(event) => setFriendUsername(event.target.value)}
                placeholder="Username to add friend"
                disabled={socialBusy}
              />
              <button className="btn btn-ghost" type="button" onClick={() => void sendFriendRequest()} disabled={socialBusy}>
                Add Friend
              </button>
            </div>
            {friendsData ? (
              <>
                <p className="kpi-label">Friends: {friendsData.friends.length}</p>
                <div className="leaderboard-chips">
                  {friendsData.friends.map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      className="leaderboard-chip profile-friend-chip"
                      onClick={() => void openFriendProfile(friend.id)}
                    >
                      {friend.displayName ?? friend.username}
                    </button>
                  ))}
                </div>
                {friendsData.pendingIncoming.length > 0 ? (
                  <div className="profile-mission-list">
                    {friendsData.pendingIncoming.map((incoming) => (
                      <article className="profile-mission-item" key={incoming.id}>
                        <p className="leaderboard-title">{incoming.user.displayName ?? incoming.user.username}</p>
                        <div className="profile-social-actions">
                          <button
                            className="btn btn-primary"
                            type="button"
                            disabled={socialBusy}
                            onClick={() => void respondRequest(incoming.id, "accept")}
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={socialBusy}
                            onClick={() => void respondRequest(incoming.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="kpi-label">Loading friends...</p>
            )}
          </section>

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

      {friendProfileOpen ? (
        <div
          className="profile-friend-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => {
            setFriendProfileOpen(false);
            setFriendProfileData(null);
            setFriendProfileError(null);
            setFriendProfileTags([]);
          }}
        >
          <section className="card glass profile-friend-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="profile-friend-modal-head">
              <h3 className="feature-title">
                <UsersIcon className="ui-icon ui-icon-accent" />
                {(friendProfileData?.user.displayName ?? friendProfileData?.user.username ?? "Player")} Profile
              </h3>
              <div className="profile-friend-modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleMessageFromProfile()}
                  disabled={messageActionBusy || !friendProfileData?.user.id}
                >
                  <ChatIcon className="ui-icon" />
                  {messageActionBusy ? "Opening..." : "Message"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setFriendProfileOpen(false);
                    setFriendProfileData(null);
                    setFriendProfileError(null);
                    setFriendProfileTags([]);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {friendProfileLoading ? <p className="kpi-label">Loading friend profile...</p> : null}
            {!friendProfileLoading && friendProfileError ? (
              <p className="kpi-label">Error: {friendProfileError}</p>
            ) : null}

            {!friendProfileLoading && !friendProfileError && friendProfileData ? (
              <div className="profile-friend-modal-body">
                <section className="grid-3">
                  <article className="card glass">
                    <p className="kpi">
                      <span className="profile-name-with-rank">
                        <span>{friendProfileData.user.displayName ?? friendProfileData.user.username}</span>
                        {friendProfileTags.length > 0 ? (
                          <>
                            <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[tagLanguage]}>
                              <LanguageFlagIcon language={tagLanguage} />
                            </span>
                            <UserRankBadge tags={friendProfileTags} />
                          </>
                        ) : null}
                      </span>
                    </p>
                    <p className="kpi-label">Player</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.user.rating}</p>
                    <p className="kpi-label">Rating</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.user.trustScore}%</p>
                    <p className="kpi-label">Trust Score</p>
                  </article>
                </section>

                <section className="grid-3">
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.summary.bestWpm}</p>
                    <p className="kpi-label">Best WPM</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.summary.avgWpm}</p>
                    <p className="kpi-label">Average WPM</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.summary.avgAccuracy}%</p>
                    <p className="kpi-label">Average Accuracy</p>
                  </article>
                </section>

                <section className="grid-3">
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.summary.competitionJoined}</p>
                    <p className="kpi-label">Competitions Joined</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">{friendProfileData.summary.competitionWins}</p>
                    <p className="kpi-label">Competition Wins</p>
                  </article>
                  <article className="card glass">
                    <p className="kpi">
                      {friendProfileData.summary.competitionJoined > 0
                        ? Math.round(
                            (friendProfileData.summary.competitionWins /
                              friendProfileData.summary.competitionJoined) *
                              100,
                          )
                        : 0}
                      %
                    </p>
                    <p className="kpi-label">Competition Win Rate</p>
                  </article>
                </section>

                <div className="profile-recent-grid">
                  <section className="card glass profile-trend">
                    <h4 className="feature-title">
                      <GaugeIcon className="ui-icon ui-icon-accent" />
                      Latest Runs
                    </h4>
                    {friendProfileData.trend.length === 0 ? (
                      <p className="kpi-label">No run data yet.</p>
                    ) : (
                      <div className="profile-trend-list">
                        {friendProfileData.trend.slice(0, 5).map((point, index) => (
                          <article key={`${point.date}-${index}`} className="profile-trend-item">
                            <p className="kpi-label profile-trend-line">
                              {new Date(point.date).toLocaleString()} | {point.wpm} WPM | {point.accuracy}% ACC
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="card glass profile-trend">
                    <h4 className="feature-title">
                      <TrophyIcon className="ui-icon ui-icon-accent" />
                      Recent Competitions
                    </h4>
                    {friendProfileData.recentCompetitions.length === 0 ? (
                      <p className="kpi-label">No completed competition yet.</p>
                    ) : (
                      <div className="profile-trend-list">
                        {friendProfileData.recentCompetitions.slice(0, 5).map((item) => (
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
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
