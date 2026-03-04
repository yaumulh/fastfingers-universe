import { useState } from "react";
import type { LanguageCode } from "@/app/typing/word-banks";
import { LANGUAGE_FLAGS } from "@/app/typing/word-banks";

const LANGUAGE_FLAG_ICON_SRC: Record<LanguageCode, string> = {
  en: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg",
  id: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ee-1f1e9.svg",
  es: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1f8.svg",
  fr: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1eb-1f1f7.svg",
  de: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e9-1f1ea.svg",
  pt: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1f5-1f1f9.svg",
  it: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ee-1f1f9.svg",
  ru: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1f7-1f1fa.svg",
  zh: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e8-1f1f3.svg",
  ja: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ef-1f1f5.svg",
};

const LANGUAGE_FLAG_ALT: Record<LanguageCode, string> = {
  en: "US flag",
  id: "Indonesia flag",
  es: "Spain flag",
  fr: "France flag",
  de: "Germany flag",
  pt: "Portugal flag",
  it: "Italy flag",
  ru: "Russia flag",
  zh: "China flag",
  ja: "Japan flag",
};

export function LanguageFlagIcon({ language }: { language: LanguageCode }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="user-rank-flag-fallback">{LANGUAGE_FLAGS[language]}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LANGUAGE_FLAG_ICON_SRC[language]}
      alt={LANGUAGE_FLAG_ALT[language]}
      className="user-rank-flag-img"
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
