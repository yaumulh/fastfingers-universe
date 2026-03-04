"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ACTIVE_MULTIPLAYER_ROOM_KEY, REQUIRE_EXIT_EVENT } from "@/lib/multiplayer-room-lock";
import { BellIcon, ChatIcon, CrownIcon, HomeIcon, KeyboardIcon, TrophyIcon, UserIcon, UsersIcon } from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/typing", label: "Typing", icon: KeyboardIcon },
  { href: "/typing-advanced", label: "Advanced", icon: KeyboardIcon },
  { href: "/competition", label: "Competition", icon: CrownIcon },
  { href: "/multiplayer", label: "Multiplayer", icon: UsersIcon },
  { href: "/messages", label: "Messages", icon: ChatIcon },
  { href: "/notifications", label: "Notifications", icon: BellIcon },
  { href: "/profile", label: "My Profile", icon: UserIcon },
  { href: "/admin", label: "Admin", icon: UsersIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
];

export default function SideRailNav() {
  const pathname = usePathname();
  const [session, setSession] = useState<{ id: string; role?: "user" | "mod" | "admin" } | null>(null);
  const [brandingLogos, setBrandingLogos] = useState<Record<string, string | null>>({});

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.href === "/messages") return Boolean(session);
        if (item.href === "/notifications") return Boolean(session);
        if (item.href === "/profile") return Boolean(session);
        if (item.href === "/admin") return session?.role === "admin";
        return true;
      }),
    [session],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setSession(null);
          }
          return;
        }
        const json = (await response.json()) as { data: { id: string; role?: "user" | "mod" | "admin" } | null };
        if (!cancelled) {
          setSession(json.data);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      }
    }

    function onAuthChanged() {
      void loadSession();
    }

    void loadSession();
    window.addEventListener("ff:auth-changed", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:auth-changed", onAuthChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      try {
        const response = await fetch("/api/branding", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { data?: { logos?: Record<string, string | null> } };
        if (!cancelled) {
          setBrandingLogos(json.data?.logos ?? {});
        }
      } catch {
        if (!cancelled) setBrandingLogos({});
      }
    }

    function onBrandChanged() {
      void loadBranding();
    }

    void loadBranding();
    window.addEventListener("ff:branding-changed", onBrandChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ff:branding-changed", onBrandChanged);
    };
  }, []);

  function shouldBlockNavigation(targetHref: string): boolean {
    if (!pathname.startsWith("/multiplayer")) {
      return false;
    }
    if (targetHref.startsWith("/multiplayer")) {
      return false;
    }
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(window.localStorage.getItem(ACTIVE_MULTIPLAYER_ROOM_KEY));
  }

  function handleNavClick(event: React.MouseEvent<HTMLAnchorElement>, href: string): void {
    if (!shouldBlockNavigation(href)) {
      return;
    }
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(REQUIRE_EXIT_EVENT));
  }

  const sideRailIcon = brandingLogos.sideRailIcon ?? null;

  return (
    <aside className="side-rail" aria-label="Main sections">
      <Link href="/" className="side-rail-brand" aria-label="Fast-fingers Universe home">
        {sideRailIcon ? (
          <img src={sideRailIcon} alt="" className="side-rail-brand-logo" />
        ) : (
          <Image src="/images/ff-transparent.png" alt="" width={28} height={28} className="side-rail-brand-logo" />
        )}
        <span>Fast-fingers Universe</span>
      </Link>
      <nav className="side-rail-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavClick(event, item.href)}
              className={`side-rail-link ${isActive ? "active" : ""}`}
              data-tooltip={item.label}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="ui-icon" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
