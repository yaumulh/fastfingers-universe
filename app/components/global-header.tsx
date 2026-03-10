"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVE_MULTIPLAYER_ROOM_KEY, REQUIRE_EXIT_EVENT } from "@/lib/multiplayer-room-lock";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import { MESSAGES_UNREAD_CHANGED_EVENT, NOTIFICATIONS_UNREAD_CHANGED_EVENT } from "@/lib/ui-sync-events";
import { BellIcon, ChatIcon, EyeIcon, EyeOffIcon, SparkIcon, UsersIcon, UserIcon } from "./icons";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/typing", label: "Typing" },
  { href: "/typing-advanced", label: "Advanced" },
  { href: "/competition", label: "Competition" },
  { href: "/multiplayer", label: "Multiplayer" },
  { href: "/messages", label: "Messages" },
  { href: "/notifications", label: "Notifications" },
  { href: "/profile", label: "My Profile" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin" },
];
const BRANDING_CACHE_KEY = "fastfingers:branding-logos";
const THEME_STORAGE_KEY = "fastfingers:theme";
const THEME_OPTIONS = [
  { value: "nebula", label: "Nebula" },
  { value: "ocean", label: "Ocean" },
  { value: "carbon", label: "Carbon" },
  { value: "aurora", label: "Aurora" },
  { value: "midnight", label: "Midnight" },
  { value: "crimson", label: "Crimson" },
  { value: "emerald", label: "Emerald" },
  { value: "violet", label: "Violet" },
] as const;
type ThemeValue = (typeof THEME_OPTIONS)[number]["value"];

type SessionUser = {
  id?: string;
  username: string;
  displayName?: string | null;
  needsDisplayNameSetup?: boolean;
  role?: "user" | "mod" | "admin";
};

function getPasswordStrength(password: string): { score: number; label: string } {
  const value = password.trim();
  if (!value) {
    return { score: 0, label: "No password" };
  }

  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  const normalized = Math.min(score, 4);
  if (normalized <= 1) {
    return { score: normalized, label: "Weak" };
  }
  if (normalized <= 2) {
    return { score: normalized, label: "Medium" };
  }
  if (normalized <= 3) {
    return { score: normalized, label: "Strong" };
  }
  return { score: normalized, label: "Very strong" };
}

function getPasswordRequirements(password: string): Array<{ label: string; met: boolean }> {
  const value = password.trim();
  return [
    { label: "At least 6 characters", met: value.length >= 6 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(value) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(value) },
    { label: "Contains number", met: /\d/.test(value) },
  ];
}

export default function GlobalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formConfirm, setFormConfirm] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formEmailConfirm, setFormEmailConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [requireLoginNotice, setRequireLoginNotice] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameBusy, setDisplayNameBusy] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [brandingLogos, setBrandingLogos] = useState<Record<string, string | null>>({});
  const [brandingReady, setBrandingReady] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [notificationPulse, setNotificationPulse] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const [messagesPulse, setMessagesPulse] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeValue>("nebula");
  const previousUnreadRef = useRef(0);
  const previousMessagesUnreadRef = useRef(0);
  const uiModalOpen = authModalOpen || displayNameModalOpen;

  function applyTheme(nextTheme: ThemeValue): void {
    const normalized: ThemeValue = THEME_OPTIONS.some((item) => item.value === nextTheme) ? nextTheme : "nebula";
    setTheme(normalized);
    if (typeof document !== "undefined") {
      if (normalized === "nebula") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", normalized);
      }
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failure.
    }
  }

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
    if (typeof document === "undefined") return;
    const favicon = brandingLogos.favicon ?? null;
    const appleTouch = brandingLogos.appleTouch ?? null;
    const links = document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']");
    links.forEach((node) => {
      if (node instanceof HTMLLinkElement) {
        if (node.rel === "apple-touch-icon" && appleTouch) {
          node.href = appleTouch;
        } else if (favicon) {
          node.href = favicon;
        }
      }
    });
  }, [brandingLogos]);

  async function syncSessionFromServer(): Promise<void> {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) {
      setSessionUser(null);
      return;
    }
    const json = (await response.json()) as { data: SessionUser | null };
    const nextUser = json.data ?? null;
    setSessionUser(nextUser);
    if (nextUser?.needsDisplayNameSetup) {
      setDisplayNameInput((current) => current || nextUser.displayName || nextUser.username);
      setDisplayNameModalOpen(true);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        await syncSessionFromServer();
      } catch {
        if (!cancelled) setSessionUser(null);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-ff-ui-modal-open", uiModalOpen ? "1" : "0");
    }
    window.dispatchEvent(new CustomEvent("ff:ui-modal-state", { detail: { open: uiModalOpen } }));

    return () => {
      if (typeof document !== "undefined") {
        document.body.setAttribute("data-ff-ui-modal-open", "0");
      }
      window.dispatchEvent(new CustomEvent("ff:ui-modal-state", { detail: { open: false } }));
    };
  }, [uiModalOpen]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    function onRequireLogin() {
      setRequireLoginNotice(true);
      window.setTimeout(() => setRequireLoginNotice(false), 1300);
    }

    window.addEventListener(REQUIRE_LOGIN_EVENT, onRequireLogin);
    return () => window.removeEventListener(REQUIRE_LOGIN_EVENT, onRequireLogin);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      const nextTheme = THEME_OPTIONS.some((item) => item.value === raw) ? (raw as ThemeValue) : "nebula";
      applyTheme(nextTheme);
    } catch {
      applyTheme("nebula");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authModalOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !busy) {
        setAuthModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authModalOpen, busy]);

  useEffect(() => {
    if (!authModalOpen || busy) {
      return;
    }
    window.requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
    });
  }, [authModalOpen, authMode, busy]);

  useEffect(() => {
    if (!sessionUser?.id) {
      setNotificationUnread(0);
      setMessagesUnread(0);
      return;
    }

    let cancelled = false;

    async function loadNotificationsSummary(): Promise<void> {
      try {
        const response = await fetch("/api/notifications?limit=1", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { summary?: { unreadCount?: number } };
        if (!cancelled) {
          setNotificationUnread(Math.max(0, Number(json.summary?.unreadCount ?? 0)));
        }
      } catch {
        if (!cancelled) setNotificationUnread(0);
      }
    }

    async function loadMessagesSummary(): Promise<void> {
      try {
        const response = await fetch("/api/messages/conversations", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { data?: Array<{ unreadCount?: number }> };
        if (!cancelled) {
          const unread = Array.isArray(json.data)
            ? json.data.reduce((sum, item) => sum + Math.max(0, Number(item.unreadCount ?? 0)), 0)
            : 0;
          setMessagesUnread(unread);
        }
      } catch {
        if (!cancelled) setMessagesUnread(0);
      }
    }

    void loadNotificationsSummary();
    void loadMessagesSummary();
    const interval = window.setInterval(() => {
      void loadNotificationsSummary();
      void loadMessagesSummary();
    }, 12_000);

    function onNotificationsUnreadChanged(event: Event): void {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setNotificationUnread(Math.max(0, Math.floor(custom.detail.count)));
      } else {
        void loadNotificationsSummary();
      }
    }

    function onMessagesUnreadChanged(event: Event): void {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setMessagesUnread(Math.max(0, Math.floor(custom.detail.count)));
      } else {
        void loadMessagesSummary();
      }
    }

    window.addEventListener(NOTIFICATIONS_UNREAD_CHANGED_EVENT, onNotificationsUnreadChanged as EventListener);
    window.addEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onMessagesUnreadChanged as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_UNREAD_CHANGED_EVENT, onNotificationsUnreadChanged as EventListener);
      window.removeEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onMessagesUnreadChanged as EventListener);
    };
  }, [sessionUser?.id]);

  useEffect(() => {
    const previous = previousUnreadRef.current;
    if (notificationUnread > previous) {
      setNotificationPulse(true);
      const timer = window.setTimeout(() => setNotificationPulse(false), 760);
      previousUnreadRef.current = notificationUnread;
      return () => window.clearTimeout(timer);
    }
    previousUnreadRef.current = notificationUnread;
  }, [notificationUnread]);

  useEffect(() => {
    const previous = previousMessagesUnreadRef.current;
    if (messagesUnread > previous) {
      setMessagesPulse(true);
      const timer = window.setTimeout(() => setMessagesPulse(false), 760);
      previousMessagesUnreadRef.current = messagesUnread;
      return () => window.clearTimeout(timer);
    }
    previousMessagesUnreadRef.current = messagesUnread;
  }, [messagesUnread]);

  const authTitle = useMemo(
    () => (authMode === "register" ? "Create Account" : "Login"),
    [authMode],
  );
  const navLinks = useMemo(
    () =>
      NAV_LINKS.filter((item) => {
        if (item.href === "/notifications") return Boolean(sessionUser?.username);
        if (item.href === "/messages") return Boolean(sessionUser?.username);
        if (item.href === "/profile") return Boolean(sessionUser?.username);
        if (item.href === "/admin") return sessionUser?.role === "admin";
        return true;
      }),
    [sessionUser],
  );
  const passwordStrength = useMemo(
    () => getPasswordStrength(formPassword),
    [formPassword],
  );
  const passwordRequirements = useMemo(
    () => getPasswordRequirements(formPassword),
    [formPassword],
  );

  async function openMessagesSmart(): Promise<void> {
    if (!sessionUser?.id) {
      router.push("/messages");
      return;
    }

    try {
      const response = await fetch("/api/messages/conversations", { cache: "no-store" });
      const json = (await response.json()) as {
        data?: Array<{ id: string; unreadCount?: number; lastMessageAt?: string | null; updatedAt?: string | null }>;
      };
      const unreadList = (json.data ?? []).filter((item) => Math.max(0, Number(item.unreadCount ?? 0)) > 0);
      const newestUnread = unreadList.sort((a, b) => {
        const aMs = new Date(a.lastMessageAt ?? a.updatedAt ?? 0).getTime() || 0;
        const bMs = new Date(b.lastMessageAt ?? b.updatedAt ?? 0).getTime() || 0;
        return bMs - aMs;
      })[0];
      if (newestUnread?.id) {
        router.push(`/messages?conversation=${encodeURIComponent(newestUnread.id)}`);
        return;
      }
      router.push("/messages");
    } catch {
      router.push("/messages");
    }
  }

  function handleMessagesIconClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    void openMessagesSmart();
  }

  function shouldBlockNavigation(targetHref: string): boolean {
    if (!pathname.startsWith("/multiplayer")) {
      return false;
    }
    if (targetHref.startsWith("/multiplayer")) {
      return false;
    }
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(window.localStorage.getItem(ACTIVE_MULTIPLAYER_ROOM_KEY));
  }

  function handleNavClick(event: React.MouseEvent<HTMLAnchorElement>, href: string): void {
    if (!shouldBlockNavigation(href)) {
      return;
    }
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(REQUIRE_EXIT_EVENT));
  }

  function openAuthModal(mode: "login" | "register"): void {
    setAuthMode(mode);
    setFormError(null);
    setFormErrorCode(null);
    setFormPassword("");
    setFormConfirm("");
    setFormEmail("");
    setFormEmailConfirm("");
    setShowPassword(false);
    setShowConfirm(false);
    setAuthModalOpen(true);
  }

  async function handleLogin(): Promise<void> {
    const nextUsername = formUsername.trim();
    if (!nextUsername) {
      setFormError("Username is required.");
      return;
    }
    if (!formPassword.trim()) {
      setFormError("Password is required.");
      return;
    }

    try {
      setBusy(true);
      setFormError(null);
      setFormErrorCode(null);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername, password: formPassword }),
      });
      const json = (await response.json()) as {
        data?: { username: string; displayName?: string | null };
        error?: string;
        code?: string;
      };
      if (!response.ok || !json.data) {
        setFormError(json.error ?? "Login failed.");
        setFormErrorCode(json.code ?? null);
        return;
      }
      await syncSessionFromServer();
      setFormPassword("");
      setFormConfirm("");
      setAuthModalOpen(false);
      setToastMessage(`Welcome back, ${json.data.displayName ?? json.data.username}.`);
      window.dispatchEvent(new CustomEvent("ff:auth-changed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(): Promise<void> {
    const nextUsername = formUsername.trim();
    const nextEmail = formEmail.trim().toLowerCase();
    const nextEmailConfirm = formEmailConfirm.trim().toLowerCase();
    if (!nextUsername) {
      setFormError("Username is required.");
      return;
    }
    if (!nextEmail) {
      setFormError("Email is required.");
      return;
    }
    if (nextEmail !== nextEmailConfirm) {
      setFormError("Email confirmation does not match.");
      return;
    }
    if (!formPassword.trim()) {
      setFormError("Password is required.");
      return;
    }
    if (formPassword.trim() !== formConfirm.trim()) {
      setFormError("Password confirmation does not match.");
      return;
    }

    try {
      setBusy(true);
      setFormError(null);
      setFormErrorCode(null);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername, password: formPassword, email: nextEmail }),
      });
      const json = (await response.json()) as {
        data?: {
          username: string;
          verificationRequired?: boolean;
          previewVerifyUrl?: string | null;
          emailSent?: boolean;
        };
        error?: string;
      };
      if (!response.ok || !json.data) {
        setFormError(json.error ?? "Register failed.");
        return;
      }
      setAuthMode("login");
      setFormPassword("");
      setFormConfirm("");
      setFormEmail("");
      setFormEmailConfirm("");
      setFormUsername("");
      if (json.data.previewVerifyUrl) {
        setToastMessage(`Account created. Open verify link: ${json.data.previewVerifyUrl}`);
      } else if (json.data.emailSent) {
        setToastMessage("Account created. Please check your email and verify before login.");
      } else {
        setToastMessage("Account created. Verification email is pending.");
      }
      return;
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      setBusy(true);
      setIsLoggingOut(true);
      const startedAt = Date.now();
      await fetch("/api/auth/logout", { method: "POST" });
      await syncSessionFromServer();
      setUserMenuOpen(false);
      setDisplayNameModalOpen(false);
      setDisplayNameInput("");
      setDisplayNameError(null);
      const elapsed = Date.now() - startedAt;
      const minLoadingMs = 850;
      if (elapsed < minLoadingMs) {
        await new Promise((resolve) => window.setTimeout(resolve, minLoadingMs - elapsed));
      }
      setToastMessage("Logged out.");
      window.dispatchEvent(new CustomEvent("ff:auth-changed"));
      router.push("/");
    } finally {
      setIsLoggingOut(false);
      setBusy(false);
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (authMode === "register") {
      await handleRegister();
      return;
    }
    await handleLogin();
  }

  async function handleResendVerification(): Promise<void> {
    const nextUsername = formUsername.trim();
    if (!nextUsername) {
      setFormError("Username is required.");
      return;
    }

    try {
      setBusy(true);
      setFormError(null);
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername }),
      });
      const json = (await response.json()) as { data?: { emailSent?: boolean; previewVerifyUrl?: string | null }; error?: string };
      if (!response.ok || !json.data) {
        setFormError(json.error ?? "Failed to resend verification email.");
        return;
      }
      if (json.data.previewVerifyUrl) {
        setToastMessage(`Open verify link: ${json.data.previewVerifyUrl}`);
      } else if (json.data.emailSent) {
        setToastMessage("Verification email resent. Check your inbox.");
      } else {
        setToastMessage("Verification email pending.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDisplayName(): Promise<void> {
    const value = displayNameInput.trim();
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
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDisplayNameError(json.error ?? "Failed to save display name.");
        return;
      }
      await syncSessionFromServer();
      setDisplayNameModalOpen(false);
      setToastMessage("Display name updated.");
      window.dispatchEvent(new CustomEvent("ff:auth-changed"));
    } finally {
      setDisplayNameBusy(false);
    }
  }

  const headerWordmarkLogo = brandingLogos.headerWordmark ?? null;
  const headerIconLogo = brandingLogos.headerIcon ?? null;

  return (
    <>
      <header className="top-nav glass">
        <Link href="/" className="brand-wrap" aria-label="Fast-fingers Universe home">
          {headerWordmarkLogo ? (
            <img src={headerWordmarkLogo} alt="Fast-fingers Universe" className="brand-wordmark" />
          ) : !brandingReady ? (
            <span className="brand-wordmark brand-wordmark-placeholder" aria-hidden="true" />
          ) : (
            <>
              <span className="brand-logo-shell" aria-hidden="true">
                {headerIconLogo ? (
                  <img src={headerIconLogo} alt="" className="brand-logo-img" />
                ) : (
                  <Image src="/images/ff-transparent.png" alt="" width={40} height={40} className="brand-logo-img" priority />
                )}
              </span>
              <span className="brand">Fast-fingers Universe</span>
            </>
          )}
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavClick(event, item.href)}
              className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "active" : ""}
              aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <div ref={themeMenuRef} className={`theme-menu ${themeMenuOpen ? "open" : ""}`}>
            <button
              type="button"
              className="auth-top-icon-btn theme-menu-trigger"
              aria-label="Open theme menu"
              data-tooltip="Theme"
              title="Theme"
              onClick={() => setThemeMenuOpen((current) => !current)}
            >
              <SparkIcon className="ui-icon auth-top-icon-svg" />
            </button>
            <div className="theme-menu-panel">
              <p className="theme-menu-title">Choose Theme</p>
              {THEME_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`theme-option ${theme === item.value ? "active" : ""}`}
                  onClick={() => {
                    applyTheme(item.value);
                    setThemeMenuOpen(false);
                  }}
                >
                  <span className={`theme-swatch ${item.value}`} aria-hidden="true" />
                  <span className="theme-option-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          {sessionUser?.username ? (
            <>
              <Link
                href="/messages"
                className={`auth-top-icon-btn auth-message-btn ${messagesPulse ? "notif-pulse" : ""}`}
                onClick={handleMessagesIconClick}
                aria-label="Open messages"
                data-tooltip="Messages"
                title="Messages"
              >
                <ChatIcon className="ui-icon auth-top-icon-svg" />
                {messagesUnread > 0 ? <span className="auth-message-badge">{Math.min(messagesUnread, 99)}</span> : null}
              </Link>
              <Link
                href="/notifications"
                className={`auth-top-icon-btn auth-message-btn ${notificationPulse ? "notif-pulse" : ""}`}
                aria-label="Open notifications"
                data-tooltip="Notifications"
                title="Notifications"
              >
                <BellIcon className="ui-icon auth-top-icon-svg" />
                {notificationUnread > 0 ? <span className="auth-message-badge">{Math.min(notificationUnread, 99)}</span> : null}
              </Link>

              <div ref={userMenuRef} className={`auth-user-menu ${userMenuOpen ? "open" : ""}`}>
                <button
                  type="button"
                  className="auth-pill auth-pill-trigger"
                  onClick={() => setUserMenuOpen((curr) => !curr)}
                  aria-expanded={userMenuOpen}
                  aria-label="Open user menu"
                >
                  <UsersIcon className="ui-icon" />
                  {sessionUser.displayName ?? sessionUser.username}
                  {sessionUser.role === "mod" || sessionUser.role === "admin" ? (
                    <span className="auth-role-badge">MOD</span>
                  ) : null}
                </button>
                <div className="auth-user-menu-panel">
                  <Link href="/profile" className="auth-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                    <UserIcon className="ui-icon" />
                    Profile
                  </Link>
                  {sessionUser.role === "admin" ? (
                    <Link href="/admin" className="auth-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                      <UsersIcon className="ui-icon" />
                      Admin
                    </Link>
                  ) : null}
                  <button className="auth-user-menu-item danger" type="button" onClick={handleLogout} disabled={busy}>
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-ghost auth-btn" type="button" onClick={() => openAuthModal("register")} disabled={busy}>
                Register
              </button>
              <button
                className={`btn btn-primary auth-btn ${requireLoginNotice ? "need-login" : ""}`}
                type="button"
                onClick={() => openAuthModal("login")}
                disabled={busy}
              >
                Login
              </button>
            </>
          )}
        </div>
      </header>

      {authModalOpen ? (
        <div
          className="auth-modal-backdrop"
          onClick={() => {
            if (!busy) {
              setAuthModalOpen(false);
            }
          }}
        >
          <section
            className="auth-modal glass"
            role="dialog"
            aria-modal="true"
            aria-label={authTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-modal-head">
              <h2>{authTitle}</h2>
              <p>{authMode === "register" ? "Register with email, verify it, then login to join all game modes." : "Login to sync your name across all pages."}</p>
            </div>

            <div className="auth-switch-row">
              <button
                type="button"
                className={`segment-btn ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setFormError(null);
                  setFormErrorCode(null);
                  setFormEmail("");
                  setFormEmailConfirm("");
                }}
                disabled={busy}
              >
                Register
              </button>
              <button
                type="button"
                className={`segment-btn ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setFormError(null);
                  setFormErrorCode(null);
                  setFormEmail("");
                  setFormEmailConfirm("");
                }}
                disabled={busy}
              >
                Login
              </button>
            </div>

            <form id="auth-form" className="auth-form-grid" onSubmit={(event) => void handleAuthSubmit(event)}>
              <label>
                Username
                <input
                  ref={usernameInputRef}
                  value={formUsername}
                  onChange={(event) => setFormUsername(event.target.value)}
                  placeholder="e.g. PlayerOne"
                  disabled={busy}
                />
              </label>
              {authMode === "register" ? (
                <label>
                  Email
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    placeholder="you@example.com"
                    disabled={busy}
                  />
                </label>
              ) : null}
              {authMode === "register" ? (
                <label>
                  Confirm Email
                  <input
                    type="email"
                    value={formEmailConfirm}
                    onChange={(event) => setFormEmailConfirm(event.target.value)}
                    placeholder="Repeat your email"
                    disabled={busy}
                  />
                </label>
              ) : null}
              <label>
                Password
                <div className="auth-password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(event) => setFormPassword(event.target.value)}
                    placeholder="Minimum 6 characters"
                    disabled={busy}
                  />
                  <button
                    className="auth-toggle-btn"
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={busy}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon className="ui-icon" /> : <EyeIcon className="ui-icon" />}
                  </button>
                </div>
              </label>
              {authMode === "register" ? (
                <label>
                  Confirm Password
                  <div className="auth-password-wrap">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={formConfirm}
                      onChange={(event) => setFormConfirm(event.target.value)}
                      placeholder="Repeat password"
                      disabled={busy}
                    />
                    <button
                      className="auth-toggle-btn"
                      type="button"
                      onClick={() => setShowConfirm((current) => !current)}
                      disabled={busy}
                      aria-label={showConfirm ? "Hide confirmation password" : "Show confirmation password"}
                    >
                      {showConfirm ? <EyeOffIcon className="ui-icon" /> : <EyeIcon className="ui-icon" />}
                    </button>
                  </div>
                </label>
              ) : null}
              {authMode === "register" ? (
                <div className="auth-strength">
                  <div className="auth-strength-track">
                    <span
                      className={`auth-strength-fill strength-${passwordStrength.score}`}
                      style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                    />
                  </div>
                  <p className="auth-strength-label">
                    Password strength: <strong>{passwordStrength.label}</strong>
                  </p>
                  <ul className="auth-requirements" aria-label="Password requirements">
                    {passwordRequirements.map((item) => (
                      <li key={item.label} className={item.met ? "met" : "unmet"}>
                        <span className="auth-requirement-dot" aria-hidden="true" />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </form>

            {formError ? <p className="kpi-label auth-error">{formError}</p> : null}
            {formError && formErrorCode === "email_unverified" ? (
              <div className="auth-resend-wrap">
                <button className="btn btn-ghost" type="button" onClick={() => void handleResendVerification()} disabled={busy}>
                  Resend Verification Email
                </button>
              </div>
            ) : null}

            <div className="auth-modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setAuthModalOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="auth-form"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="auth-spinner" />
                    Please wait...
                  </>
                ) : authMode === "register" ? (
                  "Create Account"
                ) : (
                  "Login"
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {displayNameModalOpen ? (
        <div className="auth-modal-backdrop" onClick={(event) => event.stopPropagation()}>
          <section
            className="auth-modal glass"
            role="dialog"
            aria-modal="true"
            aria-label="Set display name"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-modal-head">
              <h2>Complete Profile</h2>
              <p>Set your display name. This name will be shown in multiplayer and leaderboard.</p>
            </div>

            <div className="auth-form-grid">
              <label>
                Display Name
                <input
                  value={displayNameInput}
                  maxLength={12}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  placeholder="Your public name"
                  disabled={displayNameBusy}
                />
              </label>
            </div>

            {displayNameError ? <p className="kpi-label auth-error">{displayNameError}</p> : null}

            <div className="auth-modal-actions">
              <button className="btn btn-primary" type="button" disabled={displayNameBusy} onClick={() => void handleSaveDisplayName()}>
                {displayNameBusy ? "Saving..." : "Save Display Name"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {toastMessage ? <p className="auth-toast">{toastMessage}</p> : null}
    </>
  );
}
