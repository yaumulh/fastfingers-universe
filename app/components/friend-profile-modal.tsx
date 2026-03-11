"use client";

import Link from "next/link";
import { ChatIcon, GaugeIcon, TrophyIcon, UsersIcon } from "./icons";
import { LanguageFlagIcon } from "./language-flag-icon";
import { RecentRunsChart } from "./recent-runs-chart";
import { UserRankBadge } from "./user-rank-badge";
import { UserAvatar } from "./user-avatar";
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

type FriendProfileData = {
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    rating: number;
    trustScore: number;
    totalXp?: number;
    level?: {
      level: number;
      totalXp: number;
      currentLevelXp: number;
      nextLevelXp: number;
      progressPct: number;
    };
    streakDays?: number;
  };
  level?: {
    level: number;
    totalXp: number;
    currentLevelXp: number;
    nextLevelXp: number;
    progressPct: number;
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
    mode?: "normal" | "advanced";
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

type FriendProfileModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: FriendProfileData | null;
  tags: UserTag[];
  languageForTags: LanguageCode;
  messageBusy?: boolean;
  onClose: () => void;
  onMessage: () => void;
};

export function FriendProfileModal({
  open,
  loading,
  error,
  data,
  tags,
  languageForTags,
  messageBusy = false,
  onClose,
  onMessage,
}: FriendProfileModalProps) {
  if (!open) return null;

  return (
    <div
      className="profile-friend-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <section className="card glass profile-friend-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="profile-friend-modal-head">
          <h3 className="feature-title">
            <UsersIcon className="ui-icon ui-icon-accent" />
            {(data?.user.displayName ?? data?.user.username ?? "Player")} Profile
          </h3>
          <div className="profile-friend-modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onMessage}
              disabled={messageBusy || !data?.user.id}
            >
              <ChatIcon className="ui-icon" />
              {messageBusy ? "Opening..." : "Message"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading ? <p className="kpi-label">Loading profile...</p> : null}
        {!loading && error ? <p className="kpi-label">Error: {error}</p> : null}

        {!loading && !error && data ? (
          <div className="profile-friend-modal-body">
            <section className="grid-3">
              <article className="card glass">
                <p className="kpi">
                  <span className="profile-name-with-rank">
                    <UserAvatar
                      username={data.user.username}
                      displayName={data.user.displayName}
                      avatarUrl={data.user.avatarUrl}
                      size="sm"
                    />
                    <span>{data.user.displayName ?? data.user.username}</span>
                    {tags.length > 0 ? (
                      <>
                        <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[languageForTags]}>
                          <LanguageFlagIcon language={languageForTags} />
                        </span>
                        <UserRankBadge tags={tags} />
                      </>
                    ) : null}
                  </span>
                </p>
                {data.level || data.user.level ? (
                  <p className="kpi-label">
                    Level {(data.level?.level ?? data.user.level?.level) ?? 1} •{" "}
                    {(data.level?.currentLevelXp ?? data.user.level?.currentLevelXp) ?? 0}/
                    {(data.level?.nextLevelXp ?? data.user.level?.nextLevelXp) ?? 100} XP
                  </p>
                ) : null}
                <p className="kpi-label">Player</p>
              </article>
              <article className="card glass">
                <p className="kpi">{data.user.rating}</p>
                <p className="kpi-label">Rating</p>
              </article>
              <article className="card glass">
                <p className="kpi">{data.user.trustScore}%</p>
                <p className="kpi-label">Trust Score</p>
              </article>
            </section>

            <section className="grid-3">
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

            <section className="grid-3">
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

            <div className="profile-recent-grid">
              <section className="card glass profile-trend">
                <h4 className="feature-title">
                  <GaugeIcon className="ui-icon ui-icon-accent" />
                  Latest Runs
                </h4>
                <RecentRunsChart runs={data.trend} />
              </section>

              <section className="card glass profile-trend">
                <h4 className="feature-title">
                  <TrophyIcon className="ui-icon ui-icon-accent" />
                  Recent Competitions
                </h4>
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
          </div>
        ) : null}
      </section>
    </div>
  );
}
