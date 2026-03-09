import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Manage your profile, avatar, stats, level progress, and recent activity.",
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}

