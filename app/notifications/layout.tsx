import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Check friend requests, messages, achievements, and activity alerts in one place.",
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

