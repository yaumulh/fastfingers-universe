import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Competition Room",
  description: "Compete in a dedicated room with live typing and room leaderboard updates.",
};

export default function CompetitionRoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}

