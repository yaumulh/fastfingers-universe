"use client";

import { useEffect, useMemo, useState } from "react";
import { REQUIRE_LOGIN_EVENT } from "@/lib/auth-ui-events";
import { ChatIcon } from "@/app/components/icons";

type SessionUser = {
  id?: string;
  username: string;
  displayName?: string | null;
};

type ConversationItem = {
  id: string;
  unreadCount: number;
  updatedAt: string;
  lastMessageAt: string | null;
  peer: {
    id: string;
    username: string;
    displayName?: string | null;
    role?: "user" | "mod" | "admin";
    isActive?: boolean;
  } | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
  } | null;
};

type ConversationMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName?: string | null;
    role?: "user" | "mod" | "admin";
  };
};

export default function MessagesPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [startUsername, setStartUsername] = useState("");
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversation");
    setInitialConversationId(conversationId ? conversationId.trim() : null);
  }, []);

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
        if (!cancelled) {
          setSessionUser(json.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setSessionUser(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionUser?.id) {
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }
    void loadConversations(initialConversationId ?? undefined);
    const interval = window.setInterval(() => {
      void loadConversations(undefined, { silent: true });
    }, 10_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id, initialConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    void loadMessages(selectedConversationId);
    const interval = window.setInterval(() => {
      void loadMessages(selectedConversationId, { silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  async function loadConversations(preferredId?: string | null, options?: { silent?: boolean }): Promise<void> {
    if (!sessionUser?.id) return;
    const silent = Boolean(options?.silent);
    if (!silent) {
      setConversationsLoading(true);
    }
    try {
      const response = await fetch("/api/messages/conversations", { cache: "no-store" });
      const json = (await response.json()) as { data?: ConversationItem[]; error?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Failed to load conversations.");
      }
      setConversations(json.data);
      const nextId = preferredId ?? selectedConversationId;
      if (nextId && json.data.some((item) => item.id === nextId)) {
        setSelectedConversationId(nextId);
      } else if (json.data.length > 0) {
        setSelectedConversationId(json.data[0].id);
      } else {
        setSelectedConversationId(null);
      }
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Failed to load conversations.");
    } finally {
      if (!silent) {
        setConversationsLoading(false);
      }
    }
  }

  async function loadMessages(conversationId: string, options?: { silent?: boolean }): Promise<void> {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setMessagesLoading(true);
    }
    try {
      const response = await fetch(`/api/messages/conversations/${conversationId}/messages`, { cache: "no-store" });
      const json = (await response.json()) as { data?: ConversationMessage[]; error?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Failed to load messages.");
      }
      setMessages(json.data);
      await fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });
      await loadConversations(conversationId, { silent: true });
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Failed to load messages.");
    } finally {
      if (!silent) {
        setMessagesLoading(false);
      }
    }
  }

  async function handleStartConversation(): Promise<void> {
    const username = startUsername.trim();
    if (!username) return;
    try {
      setMessageError(null);
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUsername: username }),
      });
      const json = (await response.json()) as { data?: ConversationItem; error?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Failed to start conversation.");
      }
      setStartUsername("");
      await loadConversations(json.data.id);
      setSelectedConversationId(json.data.id);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Failed to start conversation.");
    }
  }

  async function handleSendMessage(): Promise<void> {
    if (!selectedConversationId) return;
    const body = messageInput.trim();
    if (!body) return;
    try {
      setMessageError(null);
      const response = await fetch(`/api/messages/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to send message.");
      }
      setMessageInput("");
      await loadMessages(selectedConversationId, { silent: true });
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Failed to send message.");
    }
  }

  if (sessionLoading) {
    return (
      <main className="site-shell messages-page messages-shell">
        <section className="panel glass messages-page-card">
          <p className="kpi-label">Loading messages...</p>
        </section>
      </main>
    );
  }

  if (!sessionUser?.id) {
    return (
      <main className="site-shell messages-page messages-shell">
        <section className="panel glass messages-page-card">
          <h1 className="typing-title"><ChatIcon className="ui-icon ui-icon-accent" />Messages</h1>
          <p className="typing-copy">Login first to open your direct messages.</p>
          <div className="messages-login-actions">
            <button className="btn btn-primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT))}>
              Login
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell messages-page messages-shell">
      <section className="typing-header">
        <h1 className="typing-title"><ChatIcon className="ui-icon ui-icon-accent" />Messages</h1>
        <p className="typing-copy">Chat with your friends in a clean full-page layout.</p>
      </section>

      <section className="message-center-card glass messages-page-card">
        <div className="message-center-start">
          <input
            className="chat-input"
            value={startUsername}
            onChange={(event) => setStartUsername(event.target.value)}
            placeholder="Start chat by username..."
          />
          <button className="btn btn-primary" type="button" onClick={() => void handleStartConversation()}>
            Start
          </button>
        </div>

        <div className="message-center-grid">
          <aside className="message-center-list">
            {conversationsLoading && conversations.length === 0 ? <p className="kpi-label">Loading...</p> : null}
            {!conversationsLoading && conversations.length === 0 ? <p className="kpi-label">No conversations yet.</p> : null}
            {conversations.map((item) => (
              <button
                key={item.id}
                className={`message-conversation-item ${selectedConversationId === item.id ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedConversationId(item.id)}
              >
                <span className="message-conversation-name">{item.peer?.displayName ?? item.peer?.username ?? "Unknown"}</span>
                <span className="message-conversation-preview">{item.lastMessage?.body ?? "No message yet"}</span>
                {item.unreadCount > 0 ? <span className="message-conversation-unread">{item.unreadCount}</span> : null}
              </button>
            ))}
          </aside>

          <section className="message-center-thread">
            {selectedConversation ? (
              <>
                <p className="kpi-label">
                  Chat with <strong>{selectedConversation.peer?.displayName ?? selectedConversation.peer?.username ?? "Unknown"}</strong>
                </p>
                <div className="message-thread-list">
                  {messagesLoading && messages.length === 0 ? <p className="kpi-label">Loading messages...</p> : null}
                  {!messagesLoading && messages.length === 0 ? <p className="kpi-label">No messages yet.</p> : null}
                  {messages.map((message) => {
                    const mine = message.sender.id === sessionUser.id;
                    return (
                      <article key={message.id} className={`message-bubble ${mine ? "mine" : "peer"}`}>
                        <p>{message.body}</p>
                        <span>{new Date(message.createdAt).toLocaleString()}</span>
                      </article>
                    );
                  })}
                </div>
                <div className="message-thread-input">
                  <input
                    className="chat-input"
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    placeholder="Type message..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                  />
                  <button className="btn btn-primary" type="button" onClick={() => void handleSendMessage()}>
                    Send
                  </button>
                </div>
              </>
            ) : (
              <p className="kpi-label">Select conversation or start new chat.</p>
            )}
          </section>
        </div>

        {messageError ? <p className="kpi-label auth-error">{messageError}</p> : null}
      </section>
    </main>
  );
}
