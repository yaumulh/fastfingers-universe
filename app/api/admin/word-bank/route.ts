import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/authz";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
  clearWordBankOverride,
  getWordBankSourceWords,
  getWordBankOverrideSummary,
  isWordBankLanguageCode,
  isWordBankMode,
  parseWordBankJsonInput,
  setWordBankOverride,
} from "@/lib/word-bank-settings";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:wordbank:get", session.id), 60, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  try {
    const url = new URL(request.url);
    const languageRaw = url.searchParams.get("language");
    const modeRaw = url.searchParams.get("mode");
    const download = url.searchParams.get("download") === "1";

    if (languageRaw && modeRaw) {
      if (!isWordBankLanguageCode(languageRaw)) {
        return NextResponse.json({ error: "Invalid language." }, { status: 400 });
      }
      if (!isWordBankMode(modeRaw)) {
        return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
      }

      const payload = await getWordBankSourceWords(languageRaw, modeRaw);
      if (download) {
        const filename = `word-bank-${languageRaw}-${modeRaw}-${payload.source}.json`;
        return new NextResponse(JSON.stringify(payload.words, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      return NextResponse.json({
        data: {
          language: languageRaw,
          mode: modeRaw,
          source: payload.source,
          count: payload.words.length,
          words: payload.words,
        },
      });
    }

    const data = await getWordBankOverrideSummary();
    return NextResponse.json({ data });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2021") {
      return NextResponse.json({ error: "Settings table is not ready yet. Run db push first." }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to load word bank settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:wordbank:post", session.id), 20, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  try {
    const form = await request.formData();
    const languageRaw = String(form.get("language") ?? "");
    const modeRaw = String(form.get("mode") ?? "");
    const file = form.get("file");

    if (!isWordBankLanguageCode(languageRaw)) {
      return NextResponse.json({ error: "Invalid language." }, { status: 400 });
    }
    if (!isWordBankMode(modeRaw)) {
      return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "JSON file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File size must be between 1 byte and 2MB." }, { status: 400 });
    }

    const rawText = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON file." }, { status: 400 });
    }

    const words = parseWordBankJsonInput(parsed);
    await setWordBankOverride(languageRaw, modeRaw, words);
    return NextResponse.json({
      data: {
        language: languageRaw,
        mode: modeRaw,
        count: words.length,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to upload word bank." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:wordbank:delete", session.id), 30, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const url = new URL(request.url);
  const languageRaw = String(url.searchParams.get("language") ?? "");
  const modeRaw = String(url.searchParams.get("mode") ?? "");

  if (!isWordBankLanguageCode(languageRaw)) {
    return NextResponse.json({ error: "Invalid language." }, { status: 400 });
  }
  if (!isWordBankMode(modeRaw)) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }

  try {
    await clearWordBankOverride(languageRaw, modeRaw);
    return NextResponse.json({ data: { ok: true, language: languageRaw, mode: modeRaw } });
  } catch {
    return NextResponse.json({ error: "Failed to reset word bank." }, { status: 500 });
  }
}
