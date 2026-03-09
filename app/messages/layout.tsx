import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Chat with friends in direct conversations while staying inside Fast-fingers Universe.",
};

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

