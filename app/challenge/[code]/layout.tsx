import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Challenge",
  description: "Open a challenge link and compete on a focused typing leaderboard.",
};

export default function ChallengeLayout({ children }: { children: React.ReactNode }) {
  return children;
}

