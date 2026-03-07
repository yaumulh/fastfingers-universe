"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CheckIcon } from "@/app/components/icons";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import { emitNotificationsUnreadChanged } from "@/lib/ui-sync-events";

type SessionUser = {
  id?: string;
  username: string;
  displayName?: string | null;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { href?: string; [key: string]: unknown } | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const unreadItems = useMemo(() => items.filter((item) => !item.isRead), [items]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession(): Promise<void> {
      try {
        setSessionLoading(true);
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setSessionUser(null);
          return;
        }
        const json = (await response.json()) as { data: SessionUser | null };
        if (!cancelled) setSessionUser(json.data ?? null);
      } catch {
        if (!cancelled) setSessionUser(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionUser?.id) {
      setItems([]);
      setUnreadCount(0);
      emitNotificationsUnreadChanged(0);
      return;
    }

    let cancelled = false;
    async function loadNotifications(): Promise<void> {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/notifications?limit=80", { cache: "no-store" });
        const json = (await response.json()) as { data?: NotificationItem[]; summary?: { unreadCount?: number }; error?: string };
        if (!response.ok || !json.data) {
          throw new Error(json.error ?? "Failed to load notifications.");
        }
        if (!cancelled) {
          const unread = Math.max(0, Number(json.summary?.unreadCount ?? 0));
          setItems(json.data);
          setUnreadCount(unread);
          emitNotificationsUnreadChanged(unread);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load notifications.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionUser?.id]);

  async function markRead(ids: string[] | "all"): Promise<void> {
    if (ids !== "all" && ids.length === 0) return;

    try {
      setMarking(true);
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
      });
      const json = (await response.json()) as { data?: { unreadCount?: number }; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to mark notifications.");
      }
      if (ids === "all") {
        setItems((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })));
      } else {
        const idSet = new Set(ids);
        setItems((prev) =>
          prev.map((item) => (idSet.has(item.id) ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() } : item)),
        );
      }
      const unread = Math.max(0, Number(json.data?.unreadCount ?? 0));
      setUnreadCount(unread);
      emitNotificationsUnreadChanged(unread);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark notifications.");
    } finally {
      setMarking(false);
    }
  }

  async function handleNotificationClick(item: NotificationItem): Promise<void> {
    if (!item.isRead) {
      await markRead([item.id]);
    }
    const href = typeof item.data?.href === "string" ? item.data.href : "";
    if (href) {
      router.push(href);
    }
  }

  if (sessionLoading) {
    return (
      <main className="site-shell messages-page">
        <section className="panel glass messages-page-card">
          <p className="kpi-label">Loading notifications...</p>
        </section>
      </main>
    );
  }

  if (!sessionUser?.id) {
    return (
      <main className="site-shell messages-page">
        <section className="panel glass messages-page-card">
          <h1 className="typing-title"><BellIcon className="ui-icon ui-icon-accent" />Notifications</h1>
          <p className="typing-copy">Login first to see your notifications.</p>
          <button className="btn btn-primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT))}>
            Login
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell messages-page messages-shell">
      <section className="typing-header">
        <h1 className="typing-title"><BellIcon className="ui-icon ui-icon-accent" />Notifications</h1>
        <p className="typing-copy">Stay updated with messages, social actions, and competition activity.</p>
      </section>

      <section className="card glass notification-wrap">
        <div className="notification-head">
          <p className="kpi-label">Unread: {unreadCount}</p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={marking || unreadItems.length === 0}
            onClick={() => void markRead("all")}
          >
            <CheckIcon className="ui-icon" />
            Mark all as read
          </button>
        </div>

        {loading ? <p className="kpi-label">Loading notifications...</p> : null}
        {!loading && error ? <p className="kpi-label">{error}</p> : null}
        {!loading && !error && items.length === 0 ? <p className="kpi-label">No notifications yet.</p> : null}

        {!loading && !error && items.length > 0 ? (
          <div className="notification-list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item ${item.isRead ? "read" : "unread"}`}
                onClick={() => void handleNotificationClick(item)}
              >
                <div className="notification-item-main">
                  <p className="notification-item-title">{item.title}</p>
                  <p className="notification-item-body">{item.body}</p>
                </div>
                <div className="notification-item-meta">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  {!item.isRead ? <span className="notification-unread-dot" /> : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
