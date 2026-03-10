"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon, InfoIcon, SparkIcon } from "@/app/components/icons";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenParam = url.searchParams.get("token")?.trim() ?? "";
    setToken(tokenParam);
  }, []);

  async function submit(): Promise<void> {
    if (!token) {
      setMessage("Missing reset token.");
      return;
    }
    if (password.trim().length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (password.trim() !== confirm.trim()) {
      setMessage("Password confirmation does not match.");
      return;
    }
    try {
      setBusy(true);
      setMessage(null);
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(json.error ?? "Failed to reset password.");
        return;
      }
      setMessage("Password updated. You can login now.");
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <SparkIcon className="ui-icon ui-icon-accent" />
          Reset Password
        </h1>
        <p>Set a new password for your account.</p>
      </section>

      <section className="card glass auth-page-card">
        <form className="auth-form-grid auth-page-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            New Password
            <div className="auth-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
          <label>
            Confirm Password
            <div className="auth-password-wrap">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
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
        </form>

        <div className="auth-page-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Updating..." : "Update Password"}
          </button>
          <Link href="/" className="btn btn-ghost">Back Home</Link>
        </div>

        {message ? (
          <p className="auth-page-note">
            <InfoIcon className="ui-icon" /> {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
