"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatIcon, EyeIcon, UsersIcon } from "./icons";
import { UserAvatar } from "./user-avatar";

type SessionUser = {
  id?: string;
  username: string;
};

type FriendUser = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type FriendsResponse = {
  data: {
    friends: FriendUser[];
    pendingIncoming: Array<{ id: string; user: FriendUser }>;
    pendingOutgoing: Array<{ id: string; user: FriendUser }>;
  };
};

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName?: string | null;
  };
};

export default function FriendsDock() {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendUsername, setFriendUsername] = useState("");
  const [friendsData, setFriendsData] = useState<FriendsResponse["data"] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<{ conversationId: string; peer: FriendUser } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMinimized, setChatMinimized] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const pendingIncomingCount = friendsData?.pendingIncoming.length ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setSessionUser(null);
          return;
        }
        const json = (await response.json()) as { data: SessionUser | null };
        if (!cancelled) {
          setSessionUser(json.data ?? null);
        }
      } catch {
        if (!cancelled) setSessionUser(null);
      }
    }

    void loadSession();
    const onAuthChanged = () => void loadSession();
    window.addEventListener("ff:auth-changed", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:auth-changed", onAuthChanged);
    };
  }, []);

  const refreshFriends = useCallback(async () => {
    if (!sessionUser?.id) {
      setFriendsData(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/friends", { cache: "no-store" });
      if (!response.ok) {
        setFriendsData(null);
        return;
      }
      const json = (await response.json()) as FriendsResponse;
      setFriendsData(json.data);
    } catch {
      setFriendsData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!sessionUser?.id) return;
    void refreshFriends();
    if (!open) return;
    const timer = window.setInterval(() => {
      void refreshFriends();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [sessionUser?.id, open, refreshFriends]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isMessagesPage = useMemo(() => pathname === "/messages", [pathname]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setChatLoading(true);
      const response = await fetch(`/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`, { cache: "no-store" });
      const json = (await response.json()) as { data?: ChatMessage[]; error?: string };
      if (!response.ok || !json.data) {
        setChatError(json.error ?? "Failed to load messages.");
        return;
      }
      setChatMessages(json.data);
      setChatError(null);
      await fetch(`/api/messages/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" });
    } catch {
      setChatError("Failed to load messages.");
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChat?.conversationId) return;
    void loadMessages(activeChat.conversationId);
    const timer = window.setInterval(() => {
      void loadMessages(activeChat.conversationId);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [activeChat?.conversationId, loadMessages]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages]);

  async function startChat(targetUserId: string) {
    try {
      setBusy(true);
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const json = (await response.json()) as {
        data?: {
          id: string;
          peer?: { username?: string; displayName?: string | null } | null;
        };
        error?: string;
      };
      if (!response.ok || !json.data?.id) {
        setError(json.error ?? "Failed to open chat.");
        return;
      }
      const peer =
        friendsData?.friends.find((item) => item.id === targetUserId) ??
        ({
          id: targetUserId,
          username: json.data.peer?.username ?? "user",
          displayName: json.data.peer?.displayName ?? json.data.peer?.username ?? "User",
          avatarUrl: null,
        } as FriendUser);
      setActiveChat({
        conversationId: json.data.id,
        peer,
      });
      setChatMinimized(false);
      setChatInput("");
      setChatMessages([]);
      setChatError(null);
      setOpen(true);
    } catch {
      setError("Failed to open chat.");
    } finally {
      setBusy(false);
    }
  }

  async function sendChatMessage() {
    if (!activeChat?.conversationId) return;
    const body = chatInput.trim();
    if (!body) return;
    try {
      setBusy(true);
      const response = await fetch(`/api/messages/conversations/${encodeURIComponent(activeChat.conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setChatError(json.error ?? "Failed to send message.");
        return;
      }
      setChatInput("");
      await loadMessages(activeChat.conversationId);
    } catch {
      setChatError("Failed to send message.");
    } finally {
      setBusy(false);
    }
  }

  async function sendFriendRequest() {
    const username = friendUsername.trim();
    if (!username) return;
    try {
      setBusy(true);
      setError(null);
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Failed to send request.");
        return;
      }
      setFriendUsername("");
      setAddOpen(false);
      setToast("Friend request sent.");
      await refreshFriends();
    } catch {
      setError("Failed to send request.");
    } finally {
      setBusy(false);
    }
  }

  async function respondRequest(requestId: string, action: "accept" | "reject") {
    try {
      setBusy(true);
      setError(null);
      const response = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Failed to update request.");
        return;
      }
      await refreshFriends();
      setToast(action === "accept" ? "Friend request accepted." : "Friend request rejected.");
    } catch {
      setError("Failed to update request.");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionUser?.id) return null;

  return (
    <aside className={`friends-dock ${open ? "open" : ""}`} aria-label="Friends dock">
      <div className="friends-dock-stack">
        {activeChat && !chatMinimized ? (
          <section className="friends-chat-box glass">
            <header className="friends-chat-head">
              <div className="friends-chat-peer">
                <UserAvatar
                  username={activeChat.peer.username}
                  displayName={activeChat.peer.displayName}
                  avatarUrl={activeChat.peer.avatarUrl ?? null}
                  size="xs"
                />
                <span>{activeChat.peer.displayName ?? activeChat.peer.username}</span>
              </div>
              <div className="friends-chat-head-actions">
                <button type="button" className="friends-chat-close" onClick={() => setActiveChat(null)} aria-label="Close chat">
                  ×
                </button>
              </div>
            </header>

            <div className="friends-chat-messages">
              {chatLoading && chatMessages.length === 0 ? <p className="kpi-label">Loading messages...</p> : null}
              {!chatLoading && chatMessages.length === 0 ? <p className="kpi-label">No messages yet.</p> : null}
              {chatMessages.map((message) => {
                const mine = message.sender.id === sessionUser.id;
                return (
                  <article className={`friends-chat-message ${mine ? "mine" : "theirs"}`} key={message.id}>
                    <p>{message.body}</p>
                    <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </article>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            <div className="friends-chat-input-row">
              <input
                className="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder="Type a message..."
                disabled={busy}
              />
              <button className="btn btn-primary" type="button" onClick={() => void sendChatMessage()} disabled={busy}>
                Send
              </button>
            </div>
            {chatError ? <p className="kpi-label auth-error">{chatError}</p> : null}
          </section>
        ) : null}

        {open ? (
          <section className="friends-dock-panel glass">
            <header className="friends-dock-head">
              <h3>
                <UsersIcon className="ui-icon ui-icon-accent" />
                Friends
              </h3>
              <div className="friends-dock-head-actions">
                <button type="button" className="friends-dock-close" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </header>

            {addOpen ? (
              <div className="friends-dock-add">
                <input
                  className="chat-input"
                  value={friendUsername}
                  onChange={(event) => setFriendUsername(event.target.value)}
                  placeholder="Type username..."
                  disabled={busy}
                />
                <button className="btn btn-primary" type="button" onClick={() => void sendFriendRequest()} disabled={busy}>
                  Send
                </button>
              </div>
            ) : null}

            {toast ? <p className="friends-dock-toast">{toast}</p> : null}
            {error ? <p className="kpi-label auth-error">{error}</p> : null}

            {pendingIncomingCount > 0 ? (
              <div className="friends-dock-section">
                <p className="kpi-label">Pending Requests ({pendingIncomingCount})</p>
                <div className="friends-dock-list">
                  {friendsData?.pendingIncoming.slice(0, 3).map((incoming) => (
                    <article className="friends-dock-request-item" key={incoming.id}>
                      <div className="friends-dock-user">
                        <UserAvatar
                          username={incoming.user.username}
                          displayName={incoming.user.displayName}
                          avatarUrl={incoming.user.avatarUrl ?? null}
                          size="sm"
                        />
                        <span>{incoming.user.displayName ?? incoming.user.username}</span>
                      </div>
                      <div className="friends-dock-request-actions">
                        <button type="button" className="btn btn-primary" onClick={() => void respondRequest(incoming.id, "accept")} disabled={busy}>
                          Accept
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void respondRequest(incoming.id, "reject")} disabled={busy}>
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="friends-dock-section">
              <p className="kpi-label">Friend List</p>
              {loading && !friendsData ? <p className="kpi-label">Loading friends...</p> : null}
              {!loading && (friendsData?.friends.length ?? 0) === 0 ? <p className="kpi-label">No friends yet.</p> : null}
              <div className="friends-dock-list">
                {friendsData?.friends.map((friend) => (
                  <article className="friends-dock-item friends-dock-item-linklike" key={friend.id}>
                    <button
                      type="button"
                      className={`friends-dock-chat-link ${(isMessagesPage || activeChat?.peer.id === friend.id) ? "active" : ""}`}
                      title={`Chat with ${friend.displayName ?? friend.username}`}
                      onClick={() => void startChat(friend.id)}
                      disabled={busy}
                    >
                      <UserAvatar
                        username={friend.username}
                        displayName={friend.displayName}
                        avatarUrl={friend.avatarUrl ?? null}
                        size="sm"
                      />
                      <span>{friend.displayName ?? friend.username}</span>
                    </button>
                    <Link
                      href={`/u/${encodeURIComponent(friend.username)}`}
                      className="friends-dock-profile-link"
                      title={`View ${friend.displayName ?? friend.username} profile`}
                      aria-label={`View ${friend.displayName ?? friend.username} profile`}
                    >
                      <EyeIcon className="ui-icon" />
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <div className="friends-dock-bar glass">
        {activeChat ? (
          <button
            type="button"
            className={`friends-dock-chat-tab ${!chatMinimized ? "active" : ""}`}
            onClick={() => setChatMinimized((current) => !current)}
            title={chatMinimized ? "Open chat box" : "Minimize chat box"}
          >
            <span>{activeChat.peer.displayName ?? activeChat.peer.username}</span>
            <span
              className="friends-dock-chat-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                setActiveChat(null);
                setChatError(null);
                setChatMessages([]);
              }}
            >
              ×
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="friends-dock-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-label="Open friends dock"
          title="Friends chat bar"
        >
          <ChatIcon className="ui-icon" />
          <span>Chat ({friendsData?.friends.length ?? 0})</span>
          {pendingIncomingCount > 0 ? <span className="friends-dock-count">{Math.min(pendingIncomingCount, 99)}</span> : null}
        </button>
      </div>
    </aside>
  );
}
