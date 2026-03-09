import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multiplayer",
  description: "Join real-time typing rooms, race other players, and track live progress.",
};

export default function MultiplayerLayout({ children }: { children: React.ReactNode }) {
  return children;
}

