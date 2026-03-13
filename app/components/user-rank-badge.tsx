"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CrownIcon, UsersIcon } from "./icons";

type UserTag = {
  code: string;
  label: string;
};

type ChampionTier = "today" | "week" | "alltime";
type ChampionMode = "normal" | "advanced";

function tagOrder(code: UserTag["code"]): number {
  if (code === "role_mod") return 0;
  if (code === "adv_alltime_1") return 1;
  if (code === "adv_weekly_1") return 2;
  if (code === "adv_daily_1") return 3;
  if (code === "lang_alltime_1") return 4;
  if (code === "lang_weekly_1") return 5;
  if (code === "lang_daily_1") return 6;
  return 7;
}

export function UserRankBadge({ tags }: { tags: UserTag[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => tagOrder(a.code) - tagOrder(b.code)),
    [tags],
  );

  const roleTag = sortedTags.find((tag) => tag.code === "role_mod") ?? null;
  const championTags = sortedTags.filter((tag) => tag.code !== "role_mod");
  const championPrimaryCode = championTags[0]?.code ?? null;
  const championTier: ChampionTier | null = useMemo(() => {
    if (
      championTags.some((tag) => tag.code === "adv_alltime_1" || tag.code === "lang_alltime_1")
    ) return "alltime";
    if (
      championTags.some((tag) => tag.code === "adv_weekly_1" || tag.code === "lang_weekly_1")
    ) return "week";
    if (
      championTags.some((tag) => tag.code === "adv_daily_1" || tag.code === "lang_daily_1")
    ) return "today";
    return null;
  }, [championTags]);
  const championMode: ChampionMode | null = useMemo(() => {
    if (!championPrimaryCode) return null;
    if (championPrimaryCode.startsWith("adv_")) return "advanced";
    if (championPrimaryCode.startsWith("lang_")) return "normal";
    return null;
  }, [championPrimaryCode]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (sortedTags.length === 0) {
    return null;
  }

  return (
    <span ref={rootRef} className={`user-rank-badge ${open ? "open" : ""}`}>
      {roleTag ? (
        <span className="user-role-tag" title={roleTag.label}>
          <UsersIcon className="ui-icon" />
          MOD
        </span>
      ) : null}
      {championTags.length > 0 ? (
      <button
        type="button"
        className={`user-rank-icon-btn ${championTier ? `tier-${championTier}` : ""} ${championMode ? `mode-${championMode}` : ""}`}
        aria-label="Champion tags"
        title="Champion tags"
        onClick={() => setOpen((current) => !current)}
      >
        <CrownIcon className="ui-icon" />
        {championTags.length > 1 ? <span className="user-rank-count">{championTags.length}</span> : null}
      </button>
      ) : null}
      <span className="user-rank-popover" role="tooltip">
        {sortedTags.map((tag) => (
          <span key={tag.code} className={`user-rank-popover-item ${tag.code}`}>
            {tag.label}
          </span>
        ))}
        {championTags.length > 0 ? (
          <span className="user-rank-popover-note">
            Champion badges are based on 60s runs only.
          </span>
        ) : null}
      </span>
    </span>
  );
}
