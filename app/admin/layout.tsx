import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Panel",
  description: "Admin tools for user management, branding, and word bank configuration.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

