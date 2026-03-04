import { prisma } from "@/lib/prisma";
import { getDefaultWordBankSeed } from "@/app/typing/word-banks";

export const WORD_BANK_LANGUAGE_CODES = ["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"] as const;
export type WordBankLanguageCode = (typeof WORD_BANK_LANGUAGE_CODES)[number];

export const WORD_BANK_MODES = ["normal", "advanced"] as const;
export type WordBankMode = (typeof WORD_BANK_MODES)[number];

const MAX_WORD_BANK_WORDS = 5000;
const MIN_WORD_BANK_WORDS = 20;
const MAX_WORD_LENGTH = 40;

function toWordBankKey(language: WordBankLanguageCode, mode: WordBankMode): string {
  return `wordbank.${language}.${mode}`;
}

export function isWordBankLanguageCode(value: string): value is WordBankLanguageCode {
  return WORD_BANK_LANGUAGE_CODES.includes(value as WordBankLanguageCode);
}

export function isWordBankMode(value: string): value is WordBankMode {
  return WORD_BANK_MODES.includes(value as WordBankMode);
}

function normalizeWord(raw: string): string {
  return raw.trim();
}

export function parseWordBankJsonInput(input: unknown): string[] {
  let payload: unknown = input;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "words" in payload) {
    payload = (payload as { words?: unknown }).words;
  }

  if (!Array.isArray(payload)) {
    throw new Error('Invalid JSON format. Use array of strings or object {"words":[...]}.');
  }

  const words: string[] = [];
  const seen = new Set<string>();

  for (const entry of payload) {
    if (typeof entry !== "string") continue;
    const word = normalizeWord(entry);
    if (!word) continue;
    if (word.length > MAX_WORD_LENGTH) continue;
    if (/\s/u.test(word)) continue;
    if (!/[\p{L}\p{N}]/u.test(word)) continue;
    const dedupeKey = word.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    words.push(word);
    if (words.length >= MAX_WORD_BANK_WORDS) break;
  }

  if (words.length < MIN_WORD_BANK_WORDS) {
    throw new Error(`Word bank must contain at least ${MIN_WORD_BANK_WORDS} valid unique words.`);
  }

  return words;
}

export async function getWordBankOverridesByLanguage(
  language: WordBankLanguageCode,
): Promise<Partial<Record<WordBankMode, string[]>>> {
  const keys = WORD_BANK_MODES.map((mode) => toWordBankKey(language, mode));
  const settings = await prisma.siteSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });

  const result: Partial<Record<WordBankMode, string[]>> = {};
  for (const mode of WORD_BANK_MODES) {
    const row = settings.find((item) => item.key === toWordBankKey(language, mode));
    if (!row?.value) continue;
    try {
      const parsed = JSON.parse(row.value) as unknown;
      const words = parseWordBankJsonInput(parsed);
      result[mode] = words;
    } catch {
      // Ignore malformed rows and fallback to built-in word bank.
    }
  }

  return result;
}

export async function getWordBankOverride(
  language: WordBankLanguageCode,
  mode: WordBankMode,
): Promise<string[] | null> {
  const row = await prisma.siteSetting.findUnique({
    where: { key: toWordBankKey(language, mode) },
    select: { value: true },
  });
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    const words = parseWordBankJsonInput(parsed);
    return words;
  } catch {
    return null;
  }
}

export async function getWordBankSourceWords(
  language: WordBankLanguageCode,
  mode: WordBankMode,
): Promise<{ words: string[]; source: "custom" | "default" }> {
  const custom = await getWordBankOverride(language, mode);
  if (custom && custom.length > 0) {
    return { words: custom, source: "custom" };
  }
  const defaults = getDefaultWordBankSeed(language, mode);
  return { words: defaults, source: "default" };
}

export async function getWordBankOverrideSummary(): Promise<
  Record<WordBankLanguageCode, Record<WordBankMode, { active: boolean; count: number }>>
> {
  const allKeys = WORD_BANK_LANGUAGE_CODES.flatMap((language) =>
    WORD_BANK_MODES.map((mode) => toWordBankKey(language, mode)),
  );
  const settings = await prisma.siteSetting.findMany({
    where: { key: { in: allKeys } },
    select: { key: true, value: true },
  });

  const summary = {} as Record<WordBankLanguageCode, Record<WordBankMode, { active: boolean; count: number }>>;

  for (const language of WORD_BANK_LANGUAGE_CODES) {
    summary[language] = {
      normal: { active: false, count: 0 },
      advanced: { active: false, count: 0 },
    };
    for (const mode of WORD_BANK_MODES) {
      const row = settings.find((item) => item.key === toWordBankKey(language, mode));
      if (!row?.value) continue;
      try {
        const parsed = JSON.parse(row.value) as unknown;
        const words = parseWordBankJsonInput(parsed);
        summary[language][mode] = { active: true, count: words.length };
      } catch {
        summary[language][mode] = { active: false, count: 0 };
      }
    }
  }

  return summary;
}

export async function setWordBankOverride(
  language: WordBankLanguageCode,
  mode: WordBankMode,
  words: string[],
): Promise<void> {
  const payload = JSON.stringify(words);
  await prisma.siteSetting.upsert({
    where: { key: toWordBankKey(language, mode) },
    update: { value: payload },
    create: { key: toWordBankKey(language, mode), value: payload },
  });
}

export async function clearWordBankOverride(language: WordBankLanguageCode, mode: WordBankMode): Promise<void> {
  await prisma.siteSetting.deleteMany({
    where: { key: toWordBankKey(language, mode) },
  });
}
