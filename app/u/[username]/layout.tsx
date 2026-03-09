import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public Profile",
  description: "View public typing profile, stats, achievements, and recent competitions.",
};

export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}

