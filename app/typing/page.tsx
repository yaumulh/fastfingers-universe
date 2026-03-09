"use client";

import { useSearchParams } from "next/navigation";
import { TypingExperience } from "./typing-experience";
import { LANGUAGE_LABELS, type LanguageCode } from "./word-banks";

export default function TypingPage() {
  const searchParams = useSearchParams();
  const languageParam = searchParams.get("language");
  const initialLanguage =
    languageParam && languageParam in LANGUAGE_LABELS ? (languageParam as LanguageCode) : undefined;

  return <TypingExperience variant="normal" initialLanguage={initialLanguage} />;
}
