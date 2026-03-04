import { INDONESIAN_USER_WORDS } from "./id-user-words";

export type LanguageCode =
  | "en"
  | "id"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "zh"
  | "ja";

export type Difficulty = "easy" | "medium" | "hard";
export type WordBankMode = "normal" | "advanced";

export const BANK_SIZE_PER_LEVEL = 1000;

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  id: "Indonesian",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
};

export const LANGUAGE_FLAGS: Record<LanguageCode, string> = {
  en: "\u{1F1FA}\u{1F1F8}",
  id: "\u{1F1EE}\u{1F1E9}",
  es: "\u{1F1EA}\u{1F1F8}",
  fr: "\u{1F1EB}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}",
  pt: "\u{1F1F5}\u{1F1F9}",
  it: "\u{1F1EE}\u{1F1F9}",
  ru: "\u{1F1F7}\u{1F1FA}",
  zh: "\u{1F1E8}\u{1F1F3}",
  ja: "\u{1F1EF}\u{1F1F5}",
};

const BASE_WORD_BANKS: Record<LanguageCode, Record<Difficulty, string[]>> = {
  // Long-form Indonesian set for advanced mode.
  // Normal mode uses INDONESIAN_USER_WORDS.
  // Keeping this separate preserves advanced difficulty feel.
  // prettier-ignore
  id: {
    easy: [...INDONESIAN_USER_WORDS],
    medium: [...INDONESIAN_USER_WORDS],
    hard: [
      "komunikasi", "kolaborasi", "optimalisasi", "sinkronisasi", "konsentrasi", "produktivitas", "kompatibilitas",
      "konfigurasi", "identifikasi", "klasifikasi", "representasi", "visualisasi", "implementasi", "verifikasi",
      "validasi", "integrasi", "otomatisasi", "personalisasi", "transparansi", "konsistensi", "probabilitas",
      "fleksibilitas", "adaptabilitas", "interoperabilitas", "stabilitas", "akuntabilitas", "kapabilitas",
      "kompleksitas", "efisiensi", "efektivitas", "pengembangan", "pemantauan", "pengukuran", "penyesuaian",
      "peningkatan", "pemberdayaan", "pengelolaan", "penjadwalan", "pengelompokan", "pengoptimalan", "ketangguhan",
      "ketepatan", "keterbacaan", "keterampilan", "keterhubungan", "kesinambungan", "keteraturan", "keselarasan",
      "keterlibatan", "keberlanjutan", "keandalan", "keunggulan", "pengalaman", "pengaturan", "pengendalian",
      "pemecahan", "perencanaan", "penyederhanaan", "pendekatan", "pengintegrasian", "pencatatan", "peninjauan",
      "koordinasi", "komputasi", "inkonsistensi", "responsivitas", "skalabilitas", "reliabilitas", "akurasi",
      "latensi", "kalibrasi", "instrumentasi", "orkestrasi", "moderasi", "prioritas", "sinkron", "asimetris",
      "deterministik", "nondeterministik", "komprehensif", "fundamental", "komparatif", "iteratif", "agregasi",
      "normalisasi", "standardisasi", "parametris", "heuristik", "analitis", "strategis", "kompetitif", "simulasi",
      "prediktif", "korelatif", "eksperimental", "berkelanjutan", "rekonsiliasi", "kontekstual", "struktural",
      "operasional", "metodologi", "arsitektur", "progresivitas", "keterulangan", "keterukuran",
    ],
  },
  en: {
    easy: ["time", "fast", "focus", "clear", "smart", "train", "words", "score", "hands", "brain", "skill", "speed"],
    medium: ["typing", "rhythm", "battle", "result", "system", "target", "stable", "modern", "player", "screen", "layout", "design"],
    hard: ["precision", "discipline", "competitive", "synchronization", "optimization", "architecture", "consistency", "adaptation", "latency", "multiplayer", "trajectory", "calibration"],
  },
  es: {
    easy: ["rapido", "claro", "foco", "mano", "tecla", "ritmo", "meta", "punto", "serie", "turno", "texto", "nivel"],
    medium: ["escritura", "preciso", "desafio", "ranking", "equipo", "fluidez", "tiempo", "avance", "control", "tecnico", "moderno", "practica"],
    hard: ["competencia", "sincronizar", "optimizacion", "arquitectura", "consistencia", "dificultades", "rendimiento", "estrategico", "adaptacion", "interaccion", "estabilidad", "calibracion"],
  },
  fr: {
    easy: ["vite", "texte", "mains", "score", "temps", "focus", "piste", "serie", "niveau", "claire", "cible", "motif"],
    medium: ["frappe", "rythme", "precision", "combat", "progres", "joueur", "session", "interface", "vitesse", "controle", "module", "modern"],
    hard: ["competition", "synchroniser", "optimisation", "architecture", "coherence", "interaction", "adaptation", "statistiques", "stabilite", "performance", "calibrage", "strategie"],
  },
  de: {
    easy: ["schnell", "klar", "taste", "zeit", "ziel", "punkt", "serie", "fokus", "tempo", "wort", "kraft", "start"],
    medium: ["schreiben", "genauigkeit", "fortschritt", "spieler", "heraus", "systeme", "bildschirm", "training", "steuerung", "leistung", "struktur", "moderne"],
    hard: ["wettkampf", "synchronisieren", "optimierung", "architektur", "konsistenz", "anpassung", "messwerte", "mehrspieler", "stabilitat", "reaktionszeit", "ausrichtung", "konfiguration"],
  },
  pt: {
    easy: ["rapido", "claro", "foco", "tempo", "meta", "tecla", "texto", "serie", "ponto", "nivel", "forca", "fluxo"],
    medium: ["digitacao", "precisao", "desafio", "ranking", "jogador", "progresso", "controle", "sistema", "moderno", "treino", "ritmo", "resultado"],
    hard: ["competicao", "sincronizar", "otimizacao", "arquitetura", "consistencia", "adaptacao", "desempenho", "interacao", "estabilidade", "calibracao", "complexidade", "monitoramento"],
  },
  it: {
    easy: ["veloce", "chiaro", "focus", "tempo", "testo", "meta", "tasto", "serie", "punto", "livello", "mano", "flusso"],
    medium: ["digitare", "precisione", "sfida", "classifica", "giocatore", "progresso", "controllo", "sistema", "moderno", "ritmo", "sessione", "risultato"],
    hard: ["competizione", "sincronizzare", "ottimizzazione", "architettura", "coerenza", "adattamento", "prestazioni", "interazione", "stabilita", "calibrazione", "monitoraggio", "complessita"],
  },
  ru: {
    easy: ["tempo", "fokus", "tekst", "bystro", "metka", "ritm", "seria", "slovo", "ruki", "punkt", "uroven", "start"],
    medium: ["nabor", "tochnost", "igrok", "progres", "kontrol", "sistema", "rejim", "trening", "rezultat", "vremya", "ekran", "potok"],
    hard: ["sorevnovanie", "sinhronizaciya", "optimizaciya", "arhitektura", "stabilnost", "adaptaciya", "proizvoditelnost", "vzaimodeistvie", "kalibrovka", "monitoring", "strategiya", "slojnost"],
  },
  zh: {
    easy: ["kuai", "qingsong", "wenzi", "shijian", "jieneng", "mubiao", "jindu", "fenshu", "kaishi", "lianxi", "jiezou", "shuru"],
    medium: ["sudu", "zhunque", "tiaozhan", "paiming", "wanjia", "xitong", "liucheng", "kongzhi", "shuju", "moxing", "jieguo", "gongneng"],
    hard: ["duoren", "tongbu", "youhua", "jiagou", "wending", "shipei", "jiaohu", "jiance", "celue", "fankui", "yanchi", "jiaozhun"],
  },
  ja: {
    easy: ["hayai", "teki", "moji", "jikan", "rensa", "point", "kaishi", "renso", "tejun", "mirai", "jissen", "keikaku"],
    medium: ["nyuryoku", "seikaku", "taisen", "rankingu", "player", "system", "kontrol", "flow", "result", "session", "challenge", "timing"],
    hard: ["kyoso", "synchronization", "optimization", "architecture", "stability", "adaptation", "multiplayer", "monitoring", "calibration", "consistency", "performance", "strategy"],
  },
};

const GLOBAL_LEVEL_EXPANSION: Record<Difficulty, string[]> = {
  easy: [
    "word", "line", "test", "type", "tap", "key", "pace", "goal", "win", "play", "zone", "mode",
    "task", "step", "turn", "move", "flow", "form", "plan", "team", "rank", "best", "next", "done",
    "home", "page", "link", "name", "user", "room", "chat", "live", "race", "time", "mind", "hand",
    "read", "write", "learn", "build", "start", "stop", "open", "close", "left", "right", "up", "down",
    "high", "low", "long", "short", "young", "older", "green", "blue", "black", "white", "light", "dark",
    "small", "large", "quick", "slow", "sharp", "clean", "plain", "solid", "smooth", "fresh", "clear", "calm",
    "easy", "hard", "true", "false", "safe", "risk", "good", "great", "basic", "smart", "ready", "steady",
    "point", "score", "level", "stage", "clock", "timer", "input", "enter", "space", "shift", "press", "check",
    "track", "graph", "chart", "trend", "stats", "speed", "focus", "brain", "hands", "skill", "power", "energy",
    "sound", "voice", "story", "topic", "value", "money", "price", "world", "earth", "cloud", "river", "ocean",
    "north", "south", "east", "west", "front", "back", "round", "daily", "today", "night", "morning", "evening",
  ],
  medium: [
    "typing", "rhythm", "target", "result", "progress", "session", "profile", "mission", "streak", "feature",
    "setting", "option", "summary", "history", "average", "leaderboard", "duration", "language", "variant",
    "normal", "advanced", "multiplayer", "challenge", "private", "public", "request", "accept", "reject",
    "connect", "network", "latency", "server", "client", "socket", "storage", "browser", "account", "password",
    "register", "login", "logout", "refresh", "restart", "retry", "update", "filter", "search", "ranking",
    "percent", "mistake", "accuracy", "counter", "preview", "display", "viewport", "layout", "surface", "gradient",
    "palette", "shadow", "border", "radius", "spacing", "motion", "animate", "smooth", "slide", "opacity",
    "trigger", "dropdown", "select", "option", "value", "default", "persist", "session", "device", "global",
    "capture", "record", "report", "metric", "monitor", "snapshot", "insight", "mission", "reward", "status",
    "pending", "active", "online", "offline", "winner", "player", "battle", "lobby", "control", "invite",
    "toggle", "button", "dialog", "popup", "modal", "overlay", "header", "footer", "section", "content",
    "article", "element", "context", "pattern", "system", "module", "engine", "runtime", "memory", "signal",
    "payload", "response", "request", "service", "endpoint", "handler", "schema", "prisma", "sqlite", "token",
    "secure", "safety", "review", "quality", "testing", "deploy", "release", "version", "branch", "commit",
  ],
  hard: [
    "optimization", "synchronization", "configuration", "instrumentation", "representation", "implementation",
    "compatibility", "interoperability", "normalization", "standardization", "parameterization", "calibration",
    "deterministic", "nondeterministic", "comprehensive", "computational", "architectural", "observability",
    "maintainability", "reliability", "responsiveness", "scalability", "accessibility", "adaptability",
    "productivity", "concurrency", "orchestration", "integration", "verification", "validation", "aggregation",
    "prioritization", "personalization", "classification", "identification", "visualization", "serialization",
    "deserialization", "authentication", "authorization", "consistency", "performance", "stabilization",
    "optimization", "instrumental", "structural", "operational", "methodology", "sustainability", "transparency",
    "collaboration", "coordination", "communication", "experimentation", "comparative", "predictive", "correlative",
    "analytical", "strategical", "competitive", "fundamental", "iterative", "heuristic", "procedural",
    "contextual", "multilingual", "progressivity", "repeatability", "measurability", "traceability",
    "recoverability", "faulttolerance", "throughput", "asymmetrical", "instrumented", "eventdriven",
    "decentralized", "centralized", "multithreaded", "asynchronous", "synchronous", "quantitative", "qualitative",
    "composability", "extensibility", "modularity", "encapsulation", "abstraction", "specialization",
    "generalization", "transformation", "reconciliation", "cohesiveness", "granularity", "formalization",
    "digitization", "virtualization", "containerization", "observational", "interactivity", "resilience",
    "durability", "portability", "diagnostics", "benchmarking", "instrumentality", "predictability",
    "compatibilization", "configurationdriven", "implementationready", "performancecritical", "latencysensitive",
    "telemetryenabled", "profileguided", "availability", "integrity", "confidentiality", "accountability",
    "robustness", "correctness", "detailability", "coordinative", "synchronistic", "orchestrative", "streamlined",
  ],
};

const INDONESIAN_LEVEL_EXPANSION: Record<Difficulty, string[]> = {
  easy: [],
  medium: [],
  hard: [],
};

function getLevelExpansion(language: LanguageCode, difficulty: Difficulty): string[] {
  if (language === "id") {
    return INDONESIAN_LEVEL_EXPANSION[difficulty];
  }
  return GLOBAL_LEVEL_EXPANSION[difficulty];
}

function getDifficultyLengthWeight(difficulty: Difficulty, length: number): number {
  if (difficulty === "easy") {
    if (length <= 4) return 1.55;
    if (length <= 6) return 1.2;
    if (length <= 8) return 0.86;
    if (length <= 10) return 0.62;
    return 0.42;
  }

  if (difficulty === "hard") {
    if (length <= 4) return 0.62;
    if (length <= 6) return 0.9;
    if (length <= 8) return 1.15;
    if (length <= 10) return 1.35;
    return 1.55;
  }

  if (length <= 4) return 1.25;
  if (length <= 6) return 1.1;
  if (length <= 8) return 1;
  if (length <= 10) return 0.88;
  return 0.72;
}

function getRecentPenalty(difficulty: Difficulty): number {
  if (difficulty === "easy") {
    return 0.24;
  }
  if (difficulty === "hard") {
    return 0.34;
  }
  return 0.28;
}

function buildLargeBank(seed: string[], size: number, difficulty: Difficulty): string[] {
  const output: string[] = [];
  const cleanedSeed = Array.from(new Set(seed.map((word) => word.trim()).filter(Boolean)));

  if (cleanedSeed.length === 0) {
    return output;
  }

  const baseWeights = cleanedSeed.map((word, index) => {
    // Earlier words are treated as more common, then adjusted by length
    // so short words appear more often, similar to natural typing lists.
    const rankWeight = (cleanedSeed.length - index) / cleanedSeed.length;
    const lengthWeight = getDifficultyLengthWeight(difficulty, word.length);
    return Math.max(rankWeight * lengthWeight, 0.0001);
  });

  let previousWord = "";
  const recentWindow: string[] = [];

  while (output.length < size) {
    let totalWeight = 0;
    const adjustedWeights = cleanedSeed.map((word, index) => {
      if (word === previousWord) {
        return 0;
      }

      let weight = baseWeights[index];
      if (recentWindow.includes(word)) {
        weight *= getRecentPenalty(difficulty);
      }

      totalWeight += weight;
      return weight;
    });

    let pickedIndex = -1;
    if (totalWeight > 0) {
      let roll = Math.random() * totalWeight;
      for (let index = 0; index < adjustedWeights.length; index += 1) {
        roll -= adjustedWeights[index];
        if (roll <= 0) {
          pickedIndex = index;
          break;
        }
      }
    }

    if (pickedIndex === -1) {
      const fallback = cleanedSeed.findIndex((word) => word !== previousWord);
      pickedIndex = fallback >= 0 ? fallback : 0;
    }

    const pickedWord = cleanedSeed[pickedIndex];
    output.push(pickedWord);
    previousWord = pickedWord;
    recentWindow.push(pickedWord);
    if (recentWindow.length > 3) {
      recentWindow.shift();
    }
  }

  return output.slice(0, size);
}

function createDeterministicRng(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function stableSeedFromWords(words: string[]): number {
  let hash = 2166136261;
  for (const word of words) {
    for (let index = 0; index < word.length; index += 1) {
      hash ^= word.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function buildLargeBankStable(seed: string[], size: number, difficulty: Difficulty): string[] {
  const output: string[] = [];
  const cleanedSeed = Array.from(new Set(seed.map((word) => word.trim()).filter(Boolean)));

  if (cleanedSeed.length === 0) {
    return output;
  }

  const baseSeed = stableSeedFromWords(cleanedSeed);
  let previousWord = "";
  const recentWindow: string[] = [];

  while (output.length < size) {
    const baseWeights = cleanedSeed.map((word, index) => {
      const rankWeight = (cleanedSeed.length - index) / cleanedSeed.length;
      const lengthWeight = getDifficultyLengthWeight(difficulty, word.length);
      return Math.max(rankWeight * lengthWeight, 0.0001);
    });

    const rng = createDeterministicRng(baseSeed + output.length * 7919);
    let totalWeight = 0;
    const adjustedWeights = cleanedSeed.map((word, index) => {
      if (word === previousWord) {
        return 0;
      }

      let weight = baseWeights[index];
      if (recentWindow.includes(word)) {
        weight *= getRecentPenalty(difficulty);
      }

      totalWeight += weight;
      return weight;
    });

    let pickedIndex = -1;
    if (totalWeight > 0) {
      let roll = rng() * totalWeight;
      for (let index = 0; index < adjustedWeights.length; index += 1) {
        roll -= adjustedWeights[index];
        if (roll <= 0) {
          pickedIndex = index;
          break;
        }
      }
    }

    if (pickedIndex === -1) {
      const fallback = cleanedSeed.findIndex((word) => word !== previousWord);
      pickedIndex = fallback >= 0 ? fallback : 0;
    }

    const pickedWord = cleanedSeed[pickedIndex];
    output.push(pickedWord);
    previousWord = pickedWord;
    recentWindow.push(pickedWord);
    if (recentWindow.length > 3) {
      recentWindow.shift();
    }
  }

  return output.slice(0, size);
}

export function buildWordPoolFromSeed(
  seedWords: string[],
  difficulty: Difficulty,
  options?: { stable?: boolean; size?: number },
): string[] {
  const size = options?.size ?? BANK_SIZE_PER_LEVEL;
  if (options?.stable) {
    return buildLargeBankStable(seedWords, size, difficulty);
  }
  return buildLargeBank(seedWords, size, difficulty);
}

export function getWordPool(language: LanguageCode, difficulty: Difficulty): string[] {
  const byLanguage = BASE_WORD_BANKS[language] ?? BASE_WORD_BANKS.en;
  const seed = [...(byLanguage[difficulty] ?? byLanguage.medium), ...getLevelExpansion(language, difficulty)];
  return buildLargeBank(seed, BANK_SIZE_PER_LEVEL, difficulty);
}

export function getStableWordPool(language: LanguageCode, difficulty: Difficulty): string[] {
  const byLanguage = BASE_WORD_BANKS[language] ?? BASE_WORD_BANKS.en;
  const seed = [...(byLanguage[difficulty] ?? byLanguage.medium), ...getLevelExpansion(language, difficulty)];
  return buildLargeBankStable(seed, BANK_SIZE_PER_LEVEL, difficulty);
}

export function getDefaultWordBankSeed(language: LanguageCode, mode: WordBankMode): string[] {
  const difficulty: Difficulty = mode === "advanced" ? "hard" : "medium";
  const byLanguage = BASE_WORD_BANKS[language] ?? BASE_WORD_BANKS.en;
  const seed = [...(byLanguage[difficulty] ?? byLanguage.medium), ...getLevelExpansion(language, difficulty)];
  return Array.from(new Set(seed.map((word) => word.trim()).filter(Boolean)));
}

