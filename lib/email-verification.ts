import { randomBytes } from "crypto";
import nodemailer from "nodemailer";

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim().toLowerCase();
  if (!next) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    throw new Error("Invalid email format.");
  }
  return next;
}

export function createEmailVerificationToken(): string {
  return randomBytes(24).toString("hex");
}

export function createPasswordResetToken(): string {
  return randomBytes(24).toString("hex");
}

export function resolveAppOrigin(requestUrl?: string): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return "http://localhost:3000";
    }
  }
  return "http://localhost:3000";
}

export async function sendVerificationEmail(params: {
  toEmail: string;
  username: string;
  verifyUrl: string;
}): Promise<boolean> {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <h2 style="margin:0 0 8px;">Verify your email</h2>
      <p style="margin:0 0 10px;">Hi ${params.username}, please confirm your email to activate your account.</p>
      <p style="margin:0 0 14px;"><a href="${params.verifyUrl}" style="display:inline-block;background:#22d3ee;color:#0b1020;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Verify Email</a></p>
      <p style="margin:0;font-size:13px;color:#475569;">If the button doesn't work, open this link:</p>
      <p style="margin:4px 0 0;font-size:13px;word-break:break-all;">${params.verifyUrl}</p>
    </div>
  `;

  const fromEmail = process.env.EMAIL_FROM;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPortRaw = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass && fromEmail) {
    const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : 465;
    const secure = smtpPort === 465;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: fromEmail,
        to: params.toEmail,
        subject: "Confirm your Fast-fingers Universe email",
        html,
      });
      return true;
    } catch {
      return false;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !fromEmail) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.toEmail],
      subject: "Confirm your Fast-fingers Universe email",
      html,
    }),
  });

  return response.ok;
}

export async function sendPasswordResetEmail(params: {
  toEmail: string;
  username: string;
  resetUrl: string;
}): Promise<boolean> {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <h2 style="margin:0 0 8px;">Reset your password</h2>
      <p style="margin:0 0 10px;">Hi ${params.username}, you can reset your password using the link below.</p>
      <p style="margin:0 0 14px;"><a href="${params.resetUrl}" style="display:inline-block;background:#22d3ee;color:#0b1020;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Reset Password</a></p>
      <p style="margin:0;font-size:13px;color:#475569;">If the button doesn't work, open this link:</p>
      <p style="margin:4px 0 0;font-size:13px;word-break:break-all;">${params.resetUrl}</p>
    </div>
  `;

  const fromEmail = process.env.EMAIL_FROM;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPortRaw = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass && fromEmail) {
    const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : 465;
    const secure = smtpPort === 465;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: fromEmail,
        to: params.toEmail,
        subject: "Reset your Fast-fingers Universe password",
        html,
      });
      return true;
    } catch {
      return false;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !fromEmail) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.toEmail],
      subject: "Reset your Fast-fingers Universe password",
      html,
    }),
  });

  return response.ok;
}
