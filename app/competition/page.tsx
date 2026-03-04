"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, SparkIcon, TrophyIcon, UsersIcon } from "@/app/components/icons";
import { UserRankBadge } from "@/app/components/user-rank-badge";
import { LanguageFlagIcon } from "@/app/components/language-flag-icon";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import {
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  type LanguageCode,
} from "@/app/typing/word-banks";

type SessionUser = { id: string; username: string; displayName?: string | null; needsDisplayNameSetup?: boolean };

type CompetitionParticipant = {
  userId: string;
  testsCount: number;
};

type CompetitionItem = {
  id: string;
  title: string;
  language: LanguageCode;
  status: "active" | "finished";
  createdAt: string;
  pendingAutoDelete: boolean;
  autoDeleteAt: string | null;
  endsAt: string;
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

const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_LABELS) as Array<[LanguageCode, string]>;
const PREFERRED_LANGUAGE_KEY = "fastfingers:preferred-language";

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function CompetitionPage() {
  const router = useRouter();
  const languageRef = useRef<HTMLDivElement>(null);
  const titleEditedRef = useRef(false);

  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("My Competition");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [openLanguage, setOpenLanguage] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const sortedCompetitions = useMemo(
    () => [...competitions].sort((a, b) => a.status.localeCompare(b.status)),
    [competitions],
  );
  const visibleCompetitions = useMemo(
    () =>
      sortedCompetitions.filter((item) => {
        if (item.status !== "active") return false;
        const endsAtMs = new Date(item.endsAt).getTime();
        return Number.isFinite(endsAtMs) && endsAtMs > nowMs;
      }),
    [sortedCompetitions, nowMs],
  );

  function requireLogin(message: string) {
    window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT));
    setActionError(message);
  }

  async function refreshList() {
    const res = await fetch("/api/competitions", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load competitions.");
    const json = (await res.json()) as { data: CompetitionItem[] };
    setCompetitions(json.data);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, stored)) {
      setLanguage(stored as LanguageCode);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionError?.toLowerCase().includes("login first")) return;
    const timer = window.setTimeout(() => setActionError((curr) => (curr?.toLowerCase().includes("login first") ? null : curr)), 2000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    function closeDropdowns(event: MouseEvent) {
      if (!languageRef.current?.contains(event.target as Node)) setOpenLanguage(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenLanguage(false);
      }
    }
    window.addEventListener("mousedown", closeDropdowns);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", closeDropdowns);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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

  function handleSelectLanguage(code: LanguageCode) {
    setOpenLanguage(false);
    setLanguage(code);
  }

  useEffect(() => {
    if (titleEditedRef.current) return;
    if (authUser?.username) {
      setTitle(`${authUser.displayName ?? authUser.username}'s Competition`);
      return;
    }
    setTitle("My Competition");
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        await refreshList();
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
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshList().catch(() => {
        // Silent polling failure; user can still manually navigate/retry actions.
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (busy) {
      setOpenLanguage(false);
    }
  }, [busy]);

  async function createRoom() {
    if (!authUser) return requireLogin("Login first to create competition.");
    if (!title.trim()) {
      setActionError("Title is required.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), language }),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? "Failed to create competition.");
      titleEditedRef.current = false;
      setTitle(authUser ? `${authUser.displayName ?? authUser.username}'s Competition` : "My Competition");
      await refreshList();
      router.push(`/competition/${json.data.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function enterRoom(id: string) {
    if (!authUser) return requireLogin("Login first to enter competition.");
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/competitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to enter room.");
      await refreshList();
      router.push(`/competition/${id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="site-shell competition-page">
      <section className="typing-header">
        <h1><TrophyIcon className="ui-icon ui-icon-accent" />Competition Arena</h1>
        <p>Create or enter a room. Typing arena + room leaderboard open on room page.</p>
      </section>

      <section className="competition-grid">
        <div className="competition-main-col">
          <section className="card glass competition-create-card">
            <h2 className="feature-title"><SparkIcon className="ui-icon ui-icon-accent" />Create Competition</h2>
            <div className="competition-create-grid">
              <label>Title<input className="chat-input" value={title} onChange={(e) => { titleEditedRef.current = true; setTitle(e.target.value); }} disabled={busy} /></label>
              <label>Language
                <div className="modern-select competition-language-select" ref={languageRef}>
                  <button type="button" className={`modern-select-trigger ${openLanguage ? "open" : ""}`} onClick={() => setOpenLanguage((c) => !c)} disabled={busy}>
                    <span className="modern-select-value"><span className="language-flag-icon"><LanguageFlagIcon language={language} /></span>{LANGUAGE_LABELS[language]}</span>
                    <span className="modern-select-chevron">v</span>
                  </button>
                  {openLanguage ? (
                    <div className="modern-select-panel">
                      {LANGUAGE_OPTIONS.map(([code, label]) => (
                        <button
                          key={code}
                          type="button"
                          className={`modern-select-option ${language === code ? "active" : ""}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleSelectLanguage(code);
                          }}
                        >
                          <span className="modern-select-value">
                            <span className="language-flag-icon"><LanguageFlagIcon language={code} /></span>
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>
            </div>
            <div className="competition-create-actions"><button className="btn btn-primary" type="button" onClick={() => void createRoom()} disabled={busy}><SparkIcon className="ui-icon" />Create Room</button></div>
            {actionError ? <p className="kpi-label">Error: {actionError}</p> : null}
          </section>

          <section className="card glass competition-room-list">
            <h2 className="feature-title"><UsersIcon className="ui-icon ui-icon-accent" />Competition Rooms</h2>
            {loading ? <p className="kpi-label">Loading rooms...</p> : null}
            {!loading && visibleCompetitions.length === 0 ? <p className="kpi-label">No competition room yet.</p> : null}
            <div className="room-directory-list">
              {visibleCompetitions.map((item) => {
                const inRoom = Boolean(authUser && item.participants.some((p) => p.userId === authUser.id));
                const joinedOnLeaderboard = Boolean(
                  authUser && item.participants.some((p) => p.userId === authUser.id && p.testsCount > 0),
                );
                const joinedPlayers = item.participants.filter((p) => p.testsCount > 0).length;
                const itemEndsAtMs = new Date(item.endsAt).getTime();
                const itemSecondsLeft = Math.max(0, Math.floor((itemEndsAtMs - nowMs) / 1000));
                const autoDeleteAtMs = item.autoDeleteAt ? new Date(item.autoDeleteAt).getTime() : null;
                const autoDeleteSecondsLeft =
                  autoDeleteAtMs && Number.isFinite(autoDeleteAtMs)
                    ? Math.max(0, Math.floor((autoDeleteAtMs - nowMs) / 1000))
                    : 0;
                const roomCountdown = item.status === "finished" || itemSecondsLeft <= 0 ? "ended 00:00:00" : `ends in ${formatCountdown(itemSecondsLeft)}`;
                const entryLabel = item.status === "active" ? (inRoom ? "open" : "enter") : "view";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="room-directory-card competition-room-card competition-room-entry"
                    onClick={() => {
                      if (item.status === "active") {
                        void enterRoom(item.id);
                      } else {
                        router.push(`/competition/${item.id}`);
                      }
                    }}
                    disabled={busy}
                  >
                    <div className="competition-room-select">
                      <div className="competition-room-title-row">
                        <p className="leaderboard-title">{item.title}</p>
                        {item.pendingAutoDelete ? (
                          <span className="competition-room-warning-chip">
                            <AlertIcon className="ui-icon" />
                            Waiting for players • auto-delete in {formatCountdown(autoDeleteSecondsLeft)}
                          </span>
                        ) : null}
                      </div>
                      <p className="kpi-label">
                        Host
                        <span className="user-name-inline-with-rank">
                          {item.host.displayName ?? item.host.username}
                          {item.host.tags && item.host.tags.length > 0 ? (
                            <>
                              <span className="user-rank-flag-badge" title={LANGUAGE_LABELS[item.language]}>
                                <LanguageFlagIcon language={item.language} />
                              </span>
                              <UserRankBadge tags={item.host.tags} />
                            </>
                          ) : null}
                        </span>
                        {" | "}
                        {LANGUAGE_FLAGS[item.language]} {LANGUAGE_LABELS[item.language]} | {joinedPlayers} joined | {roomCountdown}
                      </p>
                    </div>
                    <div className="competition-room-actions">
                      {joinedOnLeaderboard ? <span className="competition-room-joined-badge">joined</span> : null}
                      <span className="competition-room-open-text">{entryLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
