"use client";

import { useSearchParams } from "next/navigation";
import { TypingExperience } from "../typing/typing-experience";
import { LANGUAGE_LABELS, type LanguageCode } from "../typing/word-banks";

export default function TypingAdvancedPage() {
  const searchParams = useSearchParams();
  const languageParam = searchParams.get("language");
  const initialLanguage =
    languageParam && languageParam in LANGUAGE_LABELS ? (languageParam as LanguageCode) : undefined;

  return <TypingExperience variant="advanced" initialLanguage={initialLanguage} />;
}
