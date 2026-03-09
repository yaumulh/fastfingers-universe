import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "View global typing and multiplayer rankings with filters by duration, language, and mode.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}

