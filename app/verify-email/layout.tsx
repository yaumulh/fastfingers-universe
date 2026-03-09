import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Confirm your email to activate your Fast-fingers Universe account.",
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}

