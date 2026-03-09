import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Competition",
  description: "Create and join 24-hour typing competitions with room-based rankings and results.",
};

export default function CompetitionLayout({ children }: { children: React.ReactNode }) {
  return children;
}

