"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, InfoIcon, SparkIcon } from "@/app/components/icons";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    let cancelled = false;
    async function verify() {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await response.json()) as { data?: { alreadyVerified?: boolean }; error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Verification failed.");
        }
        if (!cancelled) {
          setStatus("success");
          setMessage(json.data?.alreadyVerified ? "Your email is already verified." : "Email verified successfully.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Verification failed.");
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="site-shell profile-page">
      <section className="typing-header">
        <h1>
          <SparkIcon className="ui-icon ui-icon-accent" />
          Email Verification
        </h1>
        <p>Confirm your account email before login.</p>
      </section>

      <section className="card glass profile-social">
        <p className="kpi-label">
          {status === "loading" ? <InfoIcon className="ui-icon" /> : <CheckIcon className="ui-icon" />} {message}
        </p>
        <div className="profile-social-actions">
          <Link href="/forgot-password" className="btn btn-ghost">Forgot Password</Link>
          <Link href="/" className="btn btn-ghost">Back Home</Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.dispatchEvent(new CustomEvent("ff:require-login"))}
          >
            Open Login
          </button>
        </div>
      </section>
    </main>
  );
}
