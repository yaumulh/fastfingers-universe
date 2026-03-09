import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Typing",
  description: "Practice typing speed in normal mode with live WPM, accuracy, and top ranking.",
};

export default function TypingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

