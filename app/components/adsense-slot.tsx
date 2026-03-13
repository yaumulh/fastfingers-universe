"use client";

import Script from "next/script";
import { useEffect, useMemo } from "react";

type AdSlotProps = {
  slot: string;
  className?: string;
  format?: string;
  responsive?: boolean;
};

const ADSENSE_SCRIPT_ID = "adsense-script";

export function AdsenseSlot({
  slot,
  className = "",
  format = "auto",
  responsive = true,
}: AdSlotProps) {
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

  const shouldRender = enabled && Boolean(client) && Boolean(slot);
  const slotKey = useMemo(() => `${client}:${slot}`, [client, slot]);

  useEffect(() => {
    if (!shouldRender) return;
    try {
      (window as typeof window & { adsbygoogle?: unknown[] }).adsbygoogle = (window as typeof window & { adsbygoogle?: unknown[] }).adsbygoogle || [];
      (window as typeof window & { adsbygoogle?: unknown[] }).adsbygoogle?.push({});
    } catch {
      // Ignore ad script errors.
    }
  }, [shouldRender, slotKey]);

  if (!shouldRender) return null;

  return (
    <div className={`adsense-slot ${className}`.trim()} aria-label="Advertisement">
      <Script
        id={ADSENSE_SCRIPT_ID}
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <ins
        className="adsbygoogle adsense-unit"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}
