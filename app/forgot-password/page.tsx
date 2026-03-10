"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoIcon, SparkIcon } from "@/app/components/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  async function submit(): Promise<void> {
    const value = email.trim().toLowerCase();
    if (!value) {
      setMessage("Email is required.");
      return;
    }
    try {
      setBusy(true);
      setMessage(null);
      setPreviewUrl(null);
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const json = (await response.json()) as { data?: { previewResetUrl?: string | null }; error?: string };
      if (!response.ok) {
        setMessage(json.error ?? "Failed to send reset email.");
        return;
      }
      if (json.data?.previewResetUrl) {
        setPreviewUrl(json.data.previewResetUrl);
        setMessage("Open the preview reset link below.");
        setToastMessage("Reset link ready. Use the preview link below.");
      } else {
        setMessage("If the email exists, a reset link has been sent.");
        setToastMessage("Reset email sent. Check your inbox.");
      }
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <SparkIcon className="ui-icon ui-icon-accent" />
          Forgot Password
        </h1>
        <p>We will email you a reset link if your account exists.</p>
      </section>

      <section className="card glass auth-page-card">
        <form className="auth-form-grid auth-page-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
          </label>
        </form>
        <div className="auth-page-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Sending..." : "Send Reset Link"}
          </button>
          <Link href="/" className="btn btn-ghost">Back Home</Link>
        </div>
        {message ? (
          <p className="auth-page-note">
            <InfoIcon className="ui-icon" /> {message}
          </p>
        ) : null}
        {previewUrl ? (
          <p className="auth-page-note">
            Preview: <a className="typing-mini-name-btn" href={previewUrl}>{previewUrl}</a>
          </p>
        ) : null}
      </section>
      {toastMessage ? <p className="auth-toast">{toastMessage}</p> : null}
    </main>
  );
}
