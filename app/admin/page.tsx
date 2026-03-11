"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, GlobeIcon, RefreshIcon, SparkIcon, UsersIcon } from "@/app/components/icons";
import { LANGUAGE_LABELS, type LanguageCode } from "@/app/typing/word-banks";

type AppRole = "user" | "mod" | "admin";

type SessionUser = {
  id: string;
  username: string;
  displayName?: string | null;
  needsDisplayNameSetup?: boolean;
  role?: AppRole;
};

type AdminUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
};

type CreateUserForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: AppRole;
};

type EditUserForm = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: AppRole;
  isActive: boolean;
};

type BrandingSlot =
  | "headerWordmark"
  | "headerIcon"
  | "sideRailIcon"
  | "favicon"
  | "appleTouch"
  | "homeHero"
  | "loadingIcon";

type BrandingLogos = Partial<Record<BrandingSlot, string | null>>;
type WordBankMode = "normal" | "advanced";
type WordBankSummary = Record<LanguageCode, Record<WordBankMode, { active: boolean; count: number }>>;

const BRANDING_SLOTS: Array<{ slot: BrandingSlot; label: string; hint: string; fallback: string }> = [
  { slot: "headerWordmark", label: "Header Wordmark", hint: "Top navigation brand area (recommended 1600x220)", fallback: "/images/ffu-wordmark.svg" },
  { slot: "headerIcon", label: "Header Icon", hint: "Used when no custom wordmark", fallback: "/images/ff-transparent.png" },
  { slot: "sideRailIcon", label: "Side Rail Icon", hint: "Left navigation brand icon", fallback: "/images/ff-transparent.png" },
  { slot: "favicon", label: "Favicon", hint: "Browser tab icon", fallback: "/images/ff-transparent.png" },
  { slot: "appleTouch", label: "Apple Touch", hint: "iOS homescreen icon", fallback: "/images/ff-transparent.png" },
  { slot: "homeHero", label: "Home Hero", hint: "Logo/artwork in home hero panel (recommended 16:9)", fallback: "/images/ff-transparent.png" },
  { slot: "loadingIcon", label: "Loading Icon", hint: "Shown in loading badge", fallback: "/images/ff-transparent.png" },
];
const WORD_BANK_MODES: Array<{ mode: WordBankMode; label: string }> = [
  { mode: "normal", label: "Normal" },
  { mode: "advanced", label: "Advanced" },
];

const EMPTY_CREATE_FORM: CreateUserForm = {
  username: "",
  displayName: "",
  email: "",
  password: "",
  role: "user",
};
const MAX_LOGO_UPLOAD_BYTES = 3 * 1024 * 1024;

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "logo" | "wordBank">("users");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyEdit, setBusyEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<EditUserForm | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [brandingLogos, setBrandingLogos] = useState<BrandingLogos>({});
  const [brandingFiles, setBrandingFiles] = useState<Partial<Record<BrandingSlot, File | null>>>({});
  const [brandBusySlot, setBrandBusySlot] = useState<BrandingSlot | null>(null);
  const [wordBankSummary, setWordBankSummary] = useState<WordBankSummary | null>(null);
  const [wordBankFiles, setWordBankFiles] = useState<Partial<Record<`${LanguageCode}:${WordBankMode}`, File | null>>>({});
  const [wordBankBusyKey, setWordBankBusyKey] = useState<string | null>(null);
  const [openWordBankLanguage, setOpenWordBankLanguage] = useState<LanguageCode>("en");

  const canAccess = sessionUser?.role === "admin";

  async function loadUsers(currentQuery: string) {
    const q = currentQuery.trim();
    const url = q ? `/api/admin/users?q=${encodeURIComponent(q)}&take=80` : "/api/admin/users?take=80";
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as { data?: AdminUser[]; error?: string };
    if (!res.ok || !json.data) {
      throw new Error(json.error ?? "Failed to load users.");
    }
    setUsers(json.data);
  }

  function openEditForm(user: AdminUser) {
    setEditForm({
      userId: user.id,
      username: user.username,
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionJson = (await sessionRes.json()) as { data: SessionUser | null };
        if (cancelled) return;
        setSessionUser(sessionJson.data);
        if (sessionJson.data?.role === "admin") {
          await loadUsers("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      try {
        const response = await fetch("/api/admin/branding", { cache: "no-store" });
        if (!response.ok) return;
        const json = await parseJsonSafe<{ data?: { logos?: BrandingLogos } }>(response);
        if (!cancelled) {
          setBrandingLogos(json?.data?.logos ?? {});
        }
      } catch {
        if (!cancelled) setBrandingLogos({});
      }
    }

    if (canAccess) {
      void loadBranding();
    }

    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  async function loadWordBankSummary() {
    const response = await fetch("/api/admin/word-bank", { cache: "no-store" });
    const json = await parseJsonSafe<{ data?: WordBankSummary; error?: string }>(response);
    if (!response.ok || !json?.data) {
      throw new Error(json?.error ?? "Failed to load word bank settings.");
    }
    setWordBankSummary(json.data);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadWordBank() {
      if (!canAccess) return;
      try {
        await loadWordBankSummary();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load word bank settings.");
        }
      }
    }

    void loadWordBank();
    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 1800);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (busyCreate || busyEdit) return;
      setCreateOpen(false);
      setEditForm(null);
    }

    if (!createOpen && !editForm) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, editForm, busyCreate, busyEdit]);

  async function submitSearch() {
    try {
      setError(null);
      setLoading(true);
      await loadUsers(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    try {
      setBusyCreate(true);
      setError(null);
      setSuccess(null);

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const json = (await res.json()) as { data?: AdminUser; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Failed to create user.");
      }

      setCreateForm(EMPTY_CREATE_FORM);
      setUsers((prev) => [json.data!, ...prev]);
      setSuccess(`User ${json.data.displayName ?? json.data.username} created.`);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setBusyCreate(false);
    }
  }

  async function saveEditUser() {
    if (!editForm) return;
    try {
      setBusyEdit(true);
      setError(null);
      setSuccess(null);
      const payload = {
        userId: editForm.userId,
        username: editForm.username,
        displayName: editForm.displayName,
        email: editForm.email,
        role: editForm.role,
        isActive: editForm.isActive,
        ...(editForm.password.trim() ? { password: editForm.password } : {}),
      };
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { data?: AdminUser; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Failed to update user.");
      }
      setUsers((prev) => prev.map((item) => (item.id === json.data!.id ? json.data! : item)));
      setSuccess(`User ${json.data.displayName ?? json.data.username} updated.`);
      setEditForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setBusyEdit(false);
    }
  }

  async function uploadBrandLogo(slot: BrandingSlot) {
    const file = brandingFiles[slot] ?? null;
    if (!file) return;
    try {
      setBrandBusySlot(slot);
      setError(null);
      setSuccess(null);
      const form = new FormData();
      form.set("slot", slot);
      form.set("logo", file);
      const response = await fetch("/api/admin/branding", {
        method: "POST",
        body: form,
      });
      const json = await parseJsonSafe<{ data?: { slot: BrandingSlot; logoDataUrl: string | null }; error?: string }>(response);
      if (!response.ok || !json?.data) {
        throw new Error(json?.error ?? "Failed to upload logo.");
      }
      setBrandingLogos((prev) => ({ ...prev, [slot]: json.data?.logoDataUrl ?? null }));
      setBrandingFiles((prev) => ({ ...prev, [slot]: null }));
      setSuccess(`${BRANDING_SLOTS.find((item) => item.slot === slot)?.label ?? "Logo"} updated.`);
      window.dispatchEvent(new CustomEvent("ff:branding-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setBrandBusySlot(null);
    }
  }

  async function resetBrandLogo(slot: BrandingSlot) {
    try {
      setBrandBusySlot(slot);
      setError(null);
      setSuccess(null);
      const response = await fetch(`/api/admin/branding?slot=${encodeURIComponent(slot)}`, {
        method: "DELETE",
      });
      const json = await parseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(json?.error ?? "Failed to reset logo.");
      }
      setBrandingLogos((prev) => ({ ...prev, [slot]: null }));
      setBrandingFiles((prev) => ({ ...prev, [slot]: null }));
      setSuccess(`${BRANDING_SLOTS.find((item) => item.slot === slot)?.label ?? "Logo"} reset to default.`);
      window.dispatchEvent(new CustomEvent("ff:branding-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setBrandBusySlot(null);
    }
  }

  async function uploadWordBank(language: LanguageCode, mode: WordBankMode) {
    const fileKey = `${language}:${mode}` as const;
    const file = wordBankFiles[fileKey] ?? null;
    if (!file) return;
    try {
      setWordBankBusyKey(fileKey);
      setError(null);
      setSuccess(null);
      const form = new FormData();
      form.set("language", language);
      form.set("mode", mode);
      form.set("file", file);
      const response = await fetch("/api/admin/word-bank", {
        method: "POST",
        body: form,
      });
      const json = await parseJsonSafe<{ data?: { count?: number }; error?: string }>(response);
      if (!response.ok) {
        throw new Error(json?.error ?? "Failed to upload word bank.");
      }
      await loadWordBankSummary();
      setWordBankFiles((prev) => ({ ...prev, [fileKey]: null }));
      setSuccess(`${LANGUAGE_LABELS[language]} ${mode} word bank updated (${json?.data?.count ?? 0} words).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setWordBankBusyKey(null);
    }
  }

  async function resetWordBank(language: LanguageCode, mode: WordBankMode) {
    const fileKey = `${language}:${mode}` as const;
    try {
      setWordBankBusyKey(fileKey);
      setError(null);
      setSuccess(null);
      const response = await fetch(
        `/api/admin/word-bank?language=${encodeURIComponent(language)}&mode=${encodeURIComponent(mode)}`,
        { method: "DELETE" },
      );
      const json = await parseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(json?.error ?? "Failed to reset word bank.");
      }
      await loadWordBankSummary();
      setWordBankFiles((prev) => ({ ...prev, [fileKey]: null }));
      setSuccess(`${LANGUAGE_LABELS[language]} ${mode} word bank reset to default.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setWordBankBusyKey(null);
    }
  }

  function downloadWordBank(language: LanguageCode, mode: WordBankMode) {
    const url = `/api/admin/word-bank?language=${encodeURIComponent(language)}&mode=${encodeURIComponent(mode)}&download=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const stats = useMemo(() => {
    const mods = users.filter((user) => user.role === "mod").length;
    const admins = users.filter((user) => user.role === "admin").length;
    return { total: users.length, mods, admins };
  }, [users]);

  const hasCustomLogo = useMemo(
    () => BRANDING_SLOTS.some((item) => Boolean(brandingLogos[item.slot])),
    [brandingLogos],
  );

  const hasCustomWordBank = useMemo(() => {
    if (!wordBankSummary) return false;
    return (Object.keys(LANGUAGE_LABELS) as LanguageCode[]).some(
      (language) => wordBankSummary[language]?.normal?.active || wordBankSummary[language]?.advanced?.active,
    );
  }, [wordBankSummary]);

  if (loading && !sessionUser) {
    return (
      <main className="site-shell">
        <section className="card glass"><p className="kpi-label">Loading admin panel...</p></section>
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="site-shell">
        <section className="typing-header">
          <h1><SparkIcon className="ui-icon ui-icon-accent" />Admin</h1>
          <p>This page is restricted to admin accounts.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell admin-page">
      <section className="typing-header">
        <h1><UsersIcon className="ui-icon ui-icon-accent" />Admin Panel</h1>
        <p>Manage moderators and user accounts from one consistent dashboard.</p>
      </section>

      <section className="card glass admin-panel-card">
        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button
            type="button"
            className={`segment-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
            role="tab"
            aria-selected={activeTab === "users"}
          >
            Users
          </button>
          <button
            type="button"
            className={`segment-btn ${activeTab === "logo" ? "active" : ""}`}
            onClick={() => setActiveTab("logo")}
            role="tab"
            aria-selected={activeTab === "logo"}
          >
            Logo
            {hasCustomLogo ? <span className="admin-tab-dot" aria-label="Custom logo active" /> : null}
          </button>
          <button
            type="button"
            className={`segment-btn ${activeTab === "wordBank" ? "active" : ""}`}
            onClick={() => setActiveTab("wordBank")}
            role="tab"
            aria-selected={activeTab === "wordBank"}
          >
            Word Bank
            {hasCustomWordBank ? <span className="admin-tab-dot" aria-label="Custom word bank active" /> : null}
          </button>
        </div>

        {error ? <p className="kpi-label admin-feedback admin-feedback-error">Error: {error}</p> : null}
        {success ? <p className="kpi-label admin-feedback admin-feedback-success"><CheckIcon className="ui-icon" />{success}</p> : null}

        {activeTab === "users" ? (
          <>
            <div className="admin-panel-top">
              <div className="leaderboard-metrics">
                <span>Total: {stats.total}</span>
                <span>MOD: {stats.mods}</span>
                <span>ADMIN: {stats.admins}</span>
              </div>
              <div className="admin-search">
                <input
                  className="chat-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search username/email..."
                />
                <button className="btn btn-ghost" type="button" onClick={() => void submitSearch()} disabled={loading}>
                  Search
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => { setQuery(""); void submitSearch(); }} disabled={loading}>
                  Refresh
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCreateForm(EMPTY_CREATE_FORM);
                    setCreateOpen(true);
                  }}
                >
                  Create User
                </button>
              </div>
            </div>

            {loading ? <p className="kpi-label">Loading users...</p> : null}
            <div className="admin-user-list">
              {users.map((user) => (
                <article key={user.id} className="admin-user-item">
                  <div className="admin-user-line">
                    <span className="admin-user-name">{user.displayName ?? user.username}</span>
                    <span className={`admin-user-status ${user.isActive ? "active" : "disabled"}`}>
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                    <span className={`admin-user-role ${user.role}`}>
                      {user.role === "mod" ? "MOD" : user.role === "admin" ? "Admin" : "User"}
                    </span>
                    <span className="admin-user-sep">|</span>
                    <span className="admin-user-meta admin-user-username">@{user.username}</span>
                    <span className="admin-user-sep">|</span>
                    <span className="admin-user-meta">{user.email ?? "No email"}</span>
                    <span className="admin-user-sep">|</span>
                    <span className="admin-user-meta">{new Date(user.createdAt).toLocaleString()}</span>
                  </div>
                  <button className="btn btn-ghost admin-edit-btn" type="button" onClick={() => openEditForm(user)}>Edit</button>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {activeTab === "logo" ? (
          <div className="admin-branding-list">
            {BRANDING_SLOTS.map((item) => {
              const currentLogo = brandingLogos[item.slot] ?? null;
              const selectedFile = brandingFiles[item.slot] ?? null;
              const busy = brandBusySlot === item.slot;
              return (
                <article key={item.slot} className="admin-branding-item">
                  <div className="admin-branding-item-head">
                    <p className="leaderboard-title">{item.label}</p>
                    <p className="kpi-label">{item.hint}</p>
                  </div>
                  <div className="admin-branding-row">
                    <div className="admin-branding-preview">
                      {currentLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={currentLogo} alt={`${item.label} logo`} className="admin-branding-image" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.fallback} alt={`Default ${item.label} logo`} className="admin-branding-image" />
                      )}
                    </div>
                    <div className="admin-branding-actions">
                      <span className={`admin-branding-state ${currentLogo ? "custom" : "default"}`}>
                        {currentLogo ? "Custom active" : "Using default"}
                      </span>
                      <label className="btn btn-ghost admin-file-btn">
                        Select Logo
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (!file) {
                              setBrandingFiles((prev) => ({ ...prev, [item.slot]: null }));
                              return;
                            }
                            if (file.size > MAX_LOGO_UPLOAD_BYTES) {
                              setBrandingFiles((prev) => ({ ...prev, [item.slot]: null }));
                              setError("Logo file too large. Maximum 3MB.");
                              return;
                            }
                            setError(null);
                            setBrandingFiles((prev) => ({ ...prev, [item.slot]: file }));
                          }}
                          disabled={busy}
                        />
                      </label>
                      <button className="btn btn-primary" type="button" onClick={() => void uploadBrandLogo(item.slot)} disabled={!selectedFile || busy}>
                        {busy ? "Applying..." : "Apply Logo"}
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => void resetBrandLogo(item.slot)} disabled={busy}>
                        Reset Default
                      </button>
                      {selectedFile ? <p className="kpi-label">Selected: {selectedFile.name}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
            <p className="kpi-label">
              Tip: use transparent PNG or SVG, max 3MB per file. Header Wordmark ideal at 1600x220. Home Hero best in 16:9 (e.g. 1600x900, 1920x1080, or 1280x720).
            </p>
          </div>
        ) : null}

        {activeTab === "wordBank" ? (
          <div className="admin-word-bank-list">
            <div className="admin-word-bank-head">
              <p className="kpi-label">
                Upload JSON per language for <strong>Normal</strong> and <strong>Advanced</strong>. Supported format:
                <code>[&quot;word1&quot;,&quot;word2&quot;]</code> or <code>{`{"words":["word1","word2"]}`}</code>.
              </p>
              <button className="btn btn-ghost" type="button" onClick={() => void loadWordBankSummary()} disabled={wordBankBusyKey !== null}>
                <RefreshIcon className="ui-icon" />
                Refresh
              </button>
            </div>
            <div className="admin-word-bank-grid">
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((language) => {
                const isOpen = openWordBankLanguage === language;
                const normalState = wordBankSummary?.[language]?.normal;
                const advancedState = wordBankSummary?.[language]?.advanced;
                return (
                  <article key={language} className={`admin-word-bank-item ${isOpen ? "open" : ""}`}>
                    <header className="admin-word-bank-item-head compact">
                      <button
                        type="button"
                        className="admin-word-bank-language-btn"
                        onClick={() => setOpenWordBankLanguage(language)}
                      >
                        <GlobeIcon className="ui-icon ui-icon-accent" />
                        {LANGUAGE_LABELS[language]}
                      </button>
                      <div className="admin-word-bank-summary-chips">
                        <span className={`admin-branding-state ${normalState?.active ? "custom" : "default"}`}>
                          N: {normalState?.active ? `${normalState.count}` : "default"}
                        </span>
                        <span className={`admin-branding-state ${advancedState?.active ? "custom" : "default"}`}>
                          A: {advancedState?.active ? `${advancedState.count}` : "default"}
                        </span>
                      </div>
                    </header>
                    {isOpen ? (
                      <div className="admin-word-bank-mode-grid">
                        {WORD_BANK_MODES.map(({ mode, label }) => {
                          const fileKey = `${language}:${mode}` as const;
                          const selectedFile = wordBankFiles[fileKey] ?? null;
                          const busy = wordBankBusyKey === fileKey;
                          const summary = wordBankSummary?.[language]?.[mode];
                          return (
                            <section key={mode} className="admin-word-bank-mode-card">
                              <p className="kpi-label">{label}</p>
                              <span className={`admin-branding-state ${summary?.active ? "custom" : "default"}`}>
                                {summary?.active ? `Custom active (${summary.count})` : "Using default"}
                              </span>
                              <label className="btn btn-ghost admin-file-btn">
                                Select JSON
                                <input
                                  type="file"
                                  accept="application/json,.json,text/plain"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    setWordBankFiles((prev) => ({ ...prev, [fileKey]: file }));
                                    setError(null);
                                  }}
                                  disabled={busy}
                                />
                              </label>
                              <div className="admin-word-bank-actions">
                                <button
                                  className="btn btn-primary"
                                  type="button"
                                  onClick={() => void uploadWordBank(language, mode)}
                                  disabled={!selectedFile || busy}
                                >
                                  {busy ? "Applying..." : "Apply"}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => void resetWordBank(language, mode)}
                                  disabled={busy}
                                >
                                  Reset
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => downloadWordBank(language, mode)}
                                  disabled={busy}
                                >
                                  Download
                                </button>
                              </div>
                              {selectedFile ? <p className="kpi-label">Selected: {selectedFile.name}</p> : null}
                            </section>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <p className="kpi-label">Each JSON max 2MB. Recommended at least 200 unique words per file.</p>
          </div>
        ) : null}
      </section>

      {createOpen ? (
        <div className="auth-modal-backdrop" onClick={() => { if (!busyCreate) setCreateOpen(false); }}>
          <section className="auth-modal glass admin-modal-card" role="dialog" aria-modal="true" aria-label="Create user" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-head">
              <h2>Create User</h2>
              <p>Create account, assign role, and set initial password.</p>
            </div>
            <div className="admin-form-grid">
              <label>Username<input className="chat-input" value={createForm.username} onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))} placeholder="newplayer" /></label>
              <label>Display Name<input className="chat-input" value={createForm.displayName} onChange={(event) => setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="what users will see" /></label>
              <label>Email (optional)<input className="chat-input" value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="player@email.com" /></label>
              <label>Password<input className="chat-input" type="password" value={createForm.password} onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))} placeholder="minimum 6 characters" /></label>
              <label>Role
                <select className="chat-input" value={createForm.role} onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value as AppRole }))}>
                  <option value="user">User</option>
                  <option value="mod">MOD</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <div className="admin-form-actions">
              <button className="btn btn-primary" type="button" disabled={busyCreate} onClick={() => void createUser()}>Create User</button>
              <button className="btn btn-ghost" type="button" disabled={busyCreate} onClick={() => setCreateOpen(false)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {editForm ? (
        <div className="auth-modal-backdrop" onClick={() => { if (!busyEdit) setEditForm(null); }}>
          <section className="auth-modal glass admin-modal-card" role="dialog" aria-modal="true" aria-label="Edit user" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-head">
              <h2>Edit User</h2>
              <p>Update account details, role, and optional password reset.</p>
            </div>
            <div className="admin-form-grid">
              <label>Username<input className="chat-input" value={editForm.username} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, username: event.target.value } : prev))} /></label>
              <label>Display Name<input className="chat-input" value={editForm.displayName} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, displayName: event.target.value } : prev))} /></label>
              <label>Email (optional)<input className="chat-input" value={editForm.email} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))} /></label>
              <label>New Password (optional)<input className="chat-input" type="password" value={editForm.password} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, password: event.target.value } : prev))} placeholder="leave empty to keep current" /></label>
              <label>Role
                <select className="chat-input" value={editForm.role} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, role: event.target.value as AppRole } : prev))}>
                  <option value="user">User</option>
                  <option value="mod">MOD</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>Status
                <select className="chat-input" value={editForm.isActive ? "active" : "disabled"} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, isActive: event.target.value === "active" } : prev))}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <div className="admin-form-actions">
              <button className="btn btn-primary" type="button" disabled={busyEdit} onClick={() => void saveEditUser()}>Save Changes</button>
              <button className="btn btn-ghost" type="button" disabled={busyEdit} onClick={() => setEditForm(null)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
