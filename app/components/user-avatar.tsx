"use client";

import Image from "next/image";

type UserAvatarProps = {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
};

function getInitial(name?: string | null): string {
  const value = String(name ?? "").trim();
  if (!value) return "?";
  return value.slice(0, 1).toUpperCase();
}

export function UserAvatar({
  username,
  displayName,
  avatarUrl,
  size = "sm",
  className = "",
}: UserAvatarProps) {
  const initial = getInitial(displayName ?? username);
  const title = displayName ?? username ?? "User";
  const classes = `user-avatar user-avatar-${size} ${className}`.trim();

  return (
    <span className={classes} title={title} aria-hidden="true">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={64}
          height={64}
          sizes="48px"
          unoptimized
          className="user-avatar-image"
        />
      ) : (
        <span className="user-avatar-fallback">{initial}</span>
      )}
    </span>
  );
}
