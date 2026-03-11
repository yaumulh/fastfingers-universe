"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ACTIVE_MULTIPLAYER_ROOM_KEY, REQUIRE_EXIT_EVENT } from "@/lib/multiplayer-room-lock";
import { MESSAGES_UNREAD_CHANGED_EVENT, NOTIFICATIONS_UNREAD_CHANGED_EVENT } from "@/lib/ui-sync-events";
import { BellIcon, ChatIcon, CrownIcon, HomeIcon, KeyboardIcon, TrophyIcon, UserIcon, UsersIcon } from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/typing", label: "Typing", icon: KeyboardIcon },
  { href: "/typing-advanced", label: "Advanced", icon: KeyboardIcon },
  { href: "/competition", label: "Competition", icon: CrownIcon },
  { href: "/multiplayer", label: "Multiplayer", icon: UsersIcon },
  { href: "/messages", label: "Messages", icon: ChatIcon },
  { href: "/notifications", label: "Notifications", icon: BellIcon },
  { href: "/profile", label: "My Profile", icon: UserIcon },
  { href: "/admin", label: "Admin", icon: UsersIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
];

export default function SideRailNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<{ id: string; role?: "user" | "mod" | "admin" } | null>(null);
  const [brandingLogos, setBrandingLogos] = useState<Record<string, string | null>>({});
  const [brandingReady, setBrandingReady] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const [notificationsUnread, setNotificationsUnread] = useState(0);

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.href === "/messages") return Boolean(session);
        if (item.href === "/notifications") return Boolean(session);
        if (item.href === "/profile") return Boolean(session);
        if (item.href === "/admin") return session?.role === "admin";
        return true;
      }),
    [session],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setSession(null);
          }
          return;
        }
        const json = (await response.json()) as { data: { id: string; role?: "user" | "mod" | "admin" } | null };
        if (!cancelled) {
          setSession(json.data);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
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
    let cancelled = false;

    async function loadBranding() {
      try {
        const response = await fetch("/api/branding", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setBrandingReady(true);
          }
          return;
        }
        const json = (await response.json()) as { data?: { logos?: Record<string, string | null> } };
        if (!cancelled) {
          setBrandingLogos(json.data?.logos ?? {});
          setBrandingReady(true);
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
    if (!session?.id) {
      setMessagesUnread(0);
      setNotificationsUnread(0);
      return;
    }

    let cancelled = false;

    async function loadMessagesUnread() {
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

    async function loadNotificationsUnread() {
      try {
        const response = await fetch("/api/notifications?limit=1", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { summary?: { unreadCount?: number } };
        if (!cancelled) {
          setNotificationsUnread(Math.max(0, Number(json.summary?.unreadCount ?? 0)));
        }
      } catch {
        if (!cancelled) setNotificationsUnread(0);
      }
    }

    void loadMessagesUnread();
    void loadNotificationsUnread();

    const interval = window.setInterval(() => {
      void loadMessagesUnread();
      void loadNotificationsUnread();
    }, 12_000);

    function onMessagesUnreadChanged(event: Event): void {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setMessagesUnread(Math.max(0, Math.floor(custom.detail.count)));
      } else {
        void loadMessagesUnread();
      }
    }

    function onNotificationsUnreadChanged(event: Event): void {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setNotificationsUnread(Math.max(0, Math.floor(custom.detail.count)));
      } else {
        void loadNotificationsUnread();
      }
    }

    window.addEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onMessagesUnreadChanged as EventListener);
    window.addEventListener(NOTIFICATIONS_UNREAD_CHANGED_EVENT, onNotificationsUnreadChanged as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onMessagesUnreadChanged as EventListener);
      window.removeEventListener(NOTIFICATIONS_UNREAD_CHANGED_EVENT, onNotificationsUnreadChanged as EventListener);
    };
  }, [session?.id]);

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

  async function openMessagesSmart(): Promise<void> {
    if (!session?.id) {
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

  function handleMessagesClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    handleNavClick(event, "/messages");
    if (event.defaultPrevented) return;
    event.preventDefault();
    void openMessagesSmart();
  }

  const sideRailIcon = brandingLogos.sideRailIcon ?? null;

  return (
    <aside className="side-rail" aria-label="Main sections">
      <Link href="/" className="side-rail-brand" aria-label="Fast-fingers Universe home">
        {sideRailIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sideRailIcon} alt="" className="side-rail-brand-logo" />
        ) : !brandingReady ? (
          <span className="side-rail-brand-logo side-rail-brand-logo-placeholder" aria-hidden="true" />
        ) : (
          <Image src="/images/ff-transparent.png" alt="" width={28} height={28} className="side-rail-brand-logo" />
        )}
        <span>Fast-fingers Universe</span>
      </Link>
      <nav className="side-rail-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const unread = item.href === "/messages"
            ? messagesUnread
            : item.href === "/notifications"
              ? notificationsUnread
              : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (item.href === "/messages") {
                  handleMessagesClick(event);
                  return;
                }
                handleNavClick(event, item.href);
              }}
              className={`side-rail-link ${isActive ? "active" : ""}`}
              data-tooltip={item.label}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="ui-icon" />
              <span>{item.label}</span>
              {unread > 0 ? <span className="side-rail-unread-badge">{Math.min(unread, 99)}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
