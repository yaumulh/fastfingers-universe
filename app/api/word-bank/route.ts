import { NextResponse } from "next/server";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
  getWordBankOverridesByLanguage,
  isWordBankLanguageCode,
  WORD_BANK_LANGUAGE_CODES,
} from "@/lib/word-bank-settings";

export async function GET(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "wordbank:get"), 240, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const url = new URL(request.url);
  const languageRaw = String(url.searchParams.get("language") ?? "en");
  const language = isWordBankLanguageCode(languageRaw) ? languageRaw : "en";

  try {
    const overrides = await getWordBankOverridesByLanguage(language);
    return NextResponse.json({
      data: {
        language,
        normal: overrides.normal ?? null,
        advanced: overrides.advanced ?? null,
        availableLanguages: WORD_BANK_LANGUAGE_CODES,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load word bank override." }, { status: 500 });
  }
}

