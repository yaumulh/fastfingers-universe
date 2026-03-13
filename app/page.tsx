"use client";

import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import {
  GlobeIcon,
  GaugeIcon,
  KeyboardIcon,
  RocketIcon,
  SparkIcon,
  TimerIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "./components/icons";
import { LanguageFlagIcon } from "./components/language-flag-icon";
import { UserAvatar } from "./components/user-avatar";
import { UserRankBadge } from "./components/user-rank-badge";
import { AdsenseSlot } from "./components/adsense-slot";
import type { LanguageCode } from "./typing/word-banks";

type HomeSnapshot = {
  totalUsers: number;
  testsTodayCount: number;
  avgWpmToday: number;
  activeChallenges: number;
  seasonTopWpm: number;
  seasonTopUser: string;
  globalLanguageTop: {
    today: Array<{
      rank: number;
      language: string;
      count: number;
    }>;
    weekly: Array<{
      rank: number;
      language: string;
      count: number;
    }>;
    allTime: Array<{
      rank: number;
      language: string;
      count: number;
    }>;
  };
  latestTypingRuns: Array<{
    id: string;
    wpm: number;
    language: string;
    mode: "normal" | "advanced";
    createdAt: string;
    user: {
      id: string | null;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
      tags: Array<{
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
  }>;
};

type SessionUser = {
  id: string;
  username: string;
};

const features = [
  {
    title: "Champion Badge System",
    copy: "Earn ranked badges in Normal and Advanced ladders across Today, Weekly, and All-time (verified on 60s runs).",
    icon: TrophyIcon,
  },
  {
    title: "Profile Intelligence",
    copy: "Rating, trust score, streak, missions, and achievements.",
    icon: UserIcon,
  },
  {
    title: "Social Layer",
    copy: "Friend requests and direct private challenges.",
    icon: UsersIcon,
  },
  {
    title: "Ghost Replay",
    copy: "Race your personal-best pace in real time.",
    icon: RocketIcon,
  },
  {
    title: "Live Multiplayer",
    copy: "Public lobbies, host control, and real-time race sync.",
    icon: KeyboardIcon,
  },
  {
    title: "Challenge Links",
    copy: "Create private challenge code with focused leaderboard.",
    icon: SparkIcon,
  },
];

const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "id", label: "Indonesian" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
];

const PREFERRED_LANGUAGE_KEY = "fastfingers:preferred-language";
const RECENT_LANGUAGES_KEY = "fastfingers:recent-languages";
const BRANDING_CACHE_KEY = "fastfingers:branding-logos";
type FlagLanguage = ComponentProps<typeof LanguageFlagIcon>["language"];
const SUPPORTED_LANGUAGE_CODES = new Set<LanguageCode>(languages.map((item) => item.code));

function isSupportedLanguage(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGE_CODES.has(value as LanguageCode);
}

export default function HomePage() {
  type GlobalTopTab = "today" | "weekly" | "allTime";
  const languageSelectRef = useRef<HTMLDivElement>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [recentLanguages, setRecentLanguages] = useState<string[]>([]);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [globalTopTab, setGlobalTopTab] = useState<GlobalTopTab>("today");
  const [animatedSnapshot, setAnimatedSnapshot] = useState({
    totalUsers: 0,
    testsTodayCount: 0,
    avgWpmToday: 0,
    activeChallenges: 0,
    seasonTopWpm: 0,
  });
  const [brandingLogos, setBrandingLogos] = useState<Record<string, string | null>>({});
  const [brandingReady, setBrandingReady] = useState(false);
  const animatedSnapshotRef = useRef(animatedSnapshot);

  useEffect(() => {
    animatedSnapshotRef.current = animatedSnapshot;
  }, [animatedSnapshot]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!languageSelectRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsLanguageOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string | null>;
        if (parsed && typeof parsed === "object") {
          setBrandingLogos(parsed);
          setBrandingReady(true);
        }
      }
    } catch {
      // Ignore cache parse errors.
    }

    let cancelled = false;

    async function loadBranding() {
      try {
        const response = await fetch("/api/branding", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { data?: { logos?: Record<string, string | null> } };
        if (!cancelled) {
          const next = json.data?.logos ?? {};
          setBrandingLogos(next);
          setBrandingReady(true);
          try {
            window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage failures.
          }
        }
      } catch {
        if (!cancelled) {
          setBrandingLogos({});
          setBrandingReady(true);
        }
      } finally {
        if (!cancelled) {
          setBrandingReady(true);
        }
      }
    }

    function onBrandChanged() {
      void loadBranding();
    }

    void loadBranding();
    window.addEventListener("ff:branding-changed", onBrandChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:branding-changed", onBrandChanged);
    };
  }, []);

  useEffect(() => {
    function loadLanguagePreference() {
      const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
      const initial = stored && isSupportedLanguage(stored) ? stored : "en";
      setSelectedLanguage(initial);

      const rawRecent = window.localStorage.getItem(RECENT_LANGUAGES_KEY);
      if (rawRecent) {
        try {
          const parsed = JSON.parse(rawRecent) as string[];
          const normalized = parsed.filter((code): code is string => isSupportedLanguage(code));
          setRecentLanguages(normalized);
        } catch {
          setRecentLanguages([]);
        }
      }
    }

    loadLanguagePreference();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as { data: SessionUser | null };
        if (!cancelled) {
          setAuthUser(json.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null);
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
    const timer = window.setInterval(() => {
      setGlobalTopTab((current) => {
        if (current === "today") return "weekly";
        if (current === "weekly") return "allTime";
        return "today";
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        setSnapshotLoading(true);
        const response = await fetch("/api/home-snapshot", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as { data: HomeSnapshot };
        if (!cancelled) {
          setSnapshot(json.data);
        }
      } catch {
        if (!cancelled) {
          // Keep previous snapshot on transient network/API failure.
          setSnapshot((current) => current);
        }
      } finally {
        if (!cancelled) {
          setSnapshotLoading(false);
        }
      }
    }

    void loadSnapshot();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;

    const from = animatedSnapshotRef.current;
    const to = {
      totalUsers: Math.max(0, Math.round(snapshot.totalUsers)),
      testsTodayCount: Math.max(0, Math.round(snapshot.testsTodayCount)),
      avgWpmToday: Math.max(0, Math.round(snapshot.avgWpmToday)),
      activeChallenges: Math.max(0, Math.round(snapshot.activeChallenges)),
      seasonTopWpm: Math.max(0, Math.round(snapshot.seasonTopWpm)),
    };

    const durationMs = 900;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setAnimatedSnapshot({
        totalUsers: Math.round(from.totalUsers + (to.totalUsers - from.totalUsers) * eased),
        testsTodayCount: Math.round(from.testsTodayCount + (to.testsTodayCount - from.testsTodayCount) * eased),
        avgWpmToday: Math.round(from.avgWpmToday + (to.avgWpmToday - from.avgWpmToday) * eased),
        activeChallenges: Math.round(from.activeChallenges + (to.activeChallenges - from.activeChallenges) * eased),
        seasonTopWpm: Math.round(from.seasonTopWpm + (to.seasonTopWpm - from.seasonTopWpm) * eased),
      });

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [snapshot]);

  const stats = [
    { label: "Registered Users", value: String(animatedSnapshot.totalUsers), icon: UsersIcon },
    { label: "Tests Today", value: String(animatedSnapshot.testsTodayCount), icon: TimerIcon },
    { label: "Avg WPM Today", value: String(animatedSnapshot.avgWpmToday), icon: GaugeIcon },
  ];

  const selectedLanguageLabel = languages.find((item) => item.code === selectedLanguage)?.label ?? "English";
  const recentLanguageChips = recentLanguages
    .filter((code) => code !== selectedLanguage)
    .slice(0, 3);
  const globalLanguageRows = snapshot?.globalLanguageTop?.[globalTopTab] ?? [];
  const globalLanguageRowsPadded = (() => {
    const rows = globalLanguageRows.slice(0, 5);
    while (rows.length < 5) {
      rows.push({ rank: rows.length + 1, language: "", count: 0 });
    }
    return rows;
  })();
  const latestTypingRuns = snapshot?.latestTypingRuns ?? [];
  const latestTypingRunsPadded: Array<HomeSnapshot["latestTypingRuns"][number] | null> = (() => {
    const rows: Array<HomeSnapshot["latestTypingRuns"][number] | null> = latestTypingRuns.slice(0, 5);
    while (rows.length < 5) {
      rows.push(null);
    }
    return rows;
  })();
  const homeHeroLogo = brandingLogos.homeHero ?? null;

  function applyLanguagePreference(code: string) {
    if (!isSupportedLanguage(code)) {
      return;
    }

    setSelectedLanguage(code);
    window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, code);
    setRecentLanguages((current) => {
      const next = [code, ...current.filter((item) => item !== code)].slice(0, 5);
      window.localStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <main>
      <div className="site-shell">
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="badge">Modern Competitive Typing</span>
              <h1>
                Train faster.
                <br />
                <span className="gradient-title">Compete smarter.</span>
              </h1>
              <p>
                Modern typing platform with profile progression, social challenges, and competitive ranking.
              </p>
              <div className="hero-cta">
                <Link href="/typing" className="btn btn-primary">
                  <KeyboardIcon className="ui-icon" />
                  Start Typing
                </Link>
                <Link href="/multiplayer" className="btn btn-ghost">
                  <UsersIcon className="ui-icon" />
                  Compete Now
                </Link>
              </div>
            </div>

            <aside className="hero-panel glass">
              <div className="hero-illustration-wrap">
                {homeHeroLogo ? (
                  <Image
                    src={homeHeroLogo}
                    alt="Fast-fingers Universe logo"
                    width={960}
                    height={540}
                    sizes="(max-width: 900px) 82vw, 520px"
                    priority
                    unoptimized
                    className="hero-illustration hero-illustration-logo"
                  />
                ) : !brandingReady ? (
                  <div className="hero-illustration hero-illustration-placeholder" aria-hidden="true" />
                ) : (
                  <Image
                    src="/images/typing-cartoon-fast.svg"
                    alt="Cartoon racer typing very fast with motion effects"
                    width={640}
                    height={360}
                    priority
                    className="hero-illustration"
                  />
                )}
              </div>
            </aside>
          </div>

          <AdsenseSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_SLOT ?? ""} className="home-ad-slot" />

          <section className="section section-stats" aria-label="Live stats">
            <h2 className="section-title">
              <GaugeIcon className="ui-icon ui-icon-accent" />
              Live Snapshot
            </h2>
            <article className="card glass snapshot-card snapshot-card-unified">
              <div className="snapshot-card-headline">
                <span className="snapshot-badge">Live</span>
              </div>
              <div className="live-snapshot-grid">
                {stats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="snapshot-stat">
                      <div className="snapshot-card-top">
                        <span className="ui-icon-badge snapshot-icon-badge">
                          <Icon className="ui-icon" />
                        </span>
                      </div>
                      <p className="kpi snapshot-value">{item.value}</p>
                      <p className="kpi-label snapshot-label">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </article>
            <div className="home-insight-grid">
              <article className="card glass home-global-language-tabs" aria-label="Top global language ranking">
                <h3 className="feature-title">
                  <GlobeIcon className="ui-icon ui-icon-accent" />
                  Top Global Language
                </h3>
                <div className="home-global-tab-row" role="tablist" aria-label="Global language ranking periods">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globalTopTab === "today"}
                    className={`duration-link-btn ${globalTopTab === "today" ? "active" : ""}`}
                    onClick={() => setGlobalTopTab("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globalTopTab === "weekly"}
                    className={`duration-link-btn ${globalTopTab === "weekly" ? "active" : ""}`}
                    onClick={() => setGlobalTopTab("weekly")}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globalTopTab === "allTime"}
                    className={`duration-link-btn ${globalTopTab === "allTime" ? "active" : ""}`}
                    onClick={() => setGlobalTopTab("allTime")}
                  >
                    All-time
                  </button>
                </div>
                {snapshotLoading ? <p className="kpi-label">Loading top language...</p> : null}
                {!snapshotLoading && globalLanguageRows.length === 0 ? (
                  <p className="kpi-label">No language data yet.</p>
                ) : (
                  <div className="home-global-language-list">
                    {globalLanguageRowsPadded.map((item) => {
                      const hasData = Boolean(item.language);
                      const languageCode: FlagLanguage = isSupportedLanguage(item.language) ? item.language : "en";
                      const label = hasData
                        ? (languages.find((lang) => lang.code === item.language)?.label ?? item.language.toUpperCase())
                        : "—";
                      return (
                        <article key={`${globalTopTab}-${item.rank}-${item.language || "empty"}`} className={`home-global-language-item ${hasData ? "" : "is-empty"}`}>
                          <span className="typing-mini-rank">{`#${item.rank}`}</span>
                          <span className="home-global-language-name">
                            {hasData ? <span className="language-flag-icon"><LanguageFlagIcon language={languageCode} /></span> : null}
                            {label}
                          </span>
                          <span className="typing-mini-metric">{hasData ? `${item.count} tests` : "0 tests"}</span>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="card glass home-latest-runs" aria-label="Latest typing runs">
                <h3 className="feature-title">
                  <TimerIcon className="ui-icon ui-icon-accent" />
                  Latest Runs
                </h3>
                {snapshotLoading ? <p className="kpi-label">Loading latest runs...</p> : null}
                {!snapshotLoading && latestTypingRuns.length === 0 ? <p className="kpi-label">No runs yet.</p> : null}
                <div className="home-latest-runs-list">
                  {latestTypingRunsPadded.map((run, index) => {
                    if (!run) {
                      return (
                        <article key={`empty-${index}`} className="home-latest-run-item is-empty">
                          <span className="home-latest-run-user">
                            <span className="home-latest-run-placeholder">—</span>
                          </span>
                          <span className="home-latest-run-wpm">0 WPM</span>
                          <span className="home-latest-run-mode-icon">
                            <KeyboardIcon className="ui-icon" />
                          </span>
                        </article>
                      );
                    }

                    return (
                      <article key={run.id} className="home-latest-run-item">
                        <span className="home-latest-run-user">
                          <UserAvatar
                            username={run.user.username}
                            displayName={run.user.displayName}
                            avatarUrl={run.user.avatarUrl}
                            size="xs"
                          />
                          <Link href={`/u/${encodeURIComponent(run.user.username)}`} className="typing-mini-name-btn">
                            {run.user.displayName ?? run.user.username}
                          </Link>
                          <UserRankBadge tags={run.user.tags ?? []} />
                          <span className="home-latest-run-meta">
                            <span className="typing-mini-time">
                              {new Date(run.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="home-latest-run-sep">·</span>
                            <Link
                              href={{
                                pathname: run.mode === "advanced" ? "/typing-advanced" : "/typing",
                                query: { language: run.language },
                              }}
                              className="home-latest-run-language home-latest-run-language-link"
                            >
                              <span className="language-flag-icon">
                                <LanguageFlagIcon language={isSupportedLanguage(run.language) ? run.language : "en"} />
                              </span>
                              {languages.find((item) => item.code === run.language)?.label ?? run.language.toUpperCase()}
                            </Link>
                          </span>
                        </span>
                        <span className="home-latest-run-wpm">{run.wpm} WPM</span>
                        <span
                          className="home-latest-run-mode-icon"
                          title={run.mode === "advanced" ? "Advanced mode" : "Normal mode"}
                          aria-label={run.mode === "advanced" ? "Advanced mode" : "Normal mode"}
                        >
                          {run.mode === "advanced" ? (
                            <RocketIcon className="ui-icon" />
                          ) : (
                            <KeyboardIcon className="ui-icon" />
                          )}
                        </span>
                      </article>
                    );
                  })}
                </div>
              </article>
            </div>
          </section>

          <section className="section" aria-label="Feature preview">
            <h2 className="section-title">
              <SparkIcon className="ui-icon ui-icon-accent" />
              Core Features
            </h2>
            <article className="card glass home-feature-panel">
              <div className="home-feature-list">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="home-feature-row">
                      <h3 className="feature-title">
                        <Icon className="ui-icon ui-icon-accent" />
                        {feature.title}
                      </h3>
                      <p className="feature-copy">{feature.copy}</p>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="section" aria-label="Language selection">
            <h2 className="section-title">
              <GlobeIcon className="ui-icon ui-icon-accent" />
              Language Preference
            </h2>
            <div className="card glass language-panel">
              <p className="kpi-label">Set default typing language for this device.</p>
              <div className="modern-select" ref={languageSelectRef}>
                <button
                  type="button"
                  className={`modern-select-trigger ${isLanguageOpen ? "open" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={isLanguageOpen}
                  onClick={() => setIsLanguageOpen((current) => !current)}
                >
                  <span className="modern-select-value">
                    <span className="language-flag-icon"><LanguageFlagIcon language={selectedLanguage as (typeof languages)[number]["code"]} /></span>
                    {languages.find((item) => item.code === selectedLanguage)?.label ?? "English"}
                  </span>
                  <span className="modern-select-chevron">v</span>
                </button>
                {isLanguageOpen ? (
                  <div className="modern-select-panel" role="listbox" aria-label="Select language">
                    {languages.map((language) => (
                      <button
                        key={language.code}
                        type="button"
                        role="option"
                        aria-selected={selectedLanguage === language.code}
                        className={`modern-select-option ${selectedLanguage === language.code ? "active" : ""}`}
                        onClick={() => {
                          applyLanguagePreference(language.code);
                          setIsLanguageOpen(false);
                        }}
                      >
                        <span className="modern-select-value">
                          <span className="language-flag-icon"><LanguageFlagIcon language={language.code as (typeof languages)[number]["code"]} /></span>
                          {language.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="language-preference-meta">
                <span className="leaderboard-chip">
                  <SparkIcon className="ui-icon" />
                  {authUser ? "Logged in: saved on this device" : "Guest: saved on this device"}
                </span>
                <span className="leaderboard-chip">
                  <TimerIcon className="ui-icon" />
                  Word bank ready: 1000 words
                </span>
                <span className="leaderboard-chip">
                  <GlobeIcon className="ui-icon" />
                  Current: {selectedLanguageLabel}
                </span>
              </div>

              {recentLanguageChips.length > 0 ? (
                <div className="language-recent-wrap">
                  <p className="kpi-label">Recently used</p>
                  <div className="language-recent-list">
                    {recentLanguageChips.map((code) => (
                      <button
                        key={code}
                        type="button"
                        className="language-recent-chip"
                        onClick={() => applyLanguagePreference(code)}
                      >
                        <span className="language-flag-icon"><LanguageFlagIcon language={code as (typeof languages)[number]["code"]} /></span>
                        {languages.find((item) => item.code === code)?.label ?? code}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <p className="footer-note">
          Fast-fingers Universe: simple UI, deep progression, competitive gameplay.
        </p>
      </div>
    </main>
  );
}
