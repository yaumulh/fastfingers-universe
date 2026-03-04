const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.SOCKET_PORT || 3001);
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ROOM_CAPACITY = 4;
const DISCONNECT_GRACE_MS = 45000;
const MAX_WPM = 280;
const MAX_CATCHUP_PROGRESS_PER_SEC = 7;
const MAX_PROGRESS_DROP = 6;
const MAX_VIOLATIONS = 5;
const CHAT_LIMIT = 100;
const DURATION_OPTIONS = [15, 30, 60, 120];
const DEFAULT_DURATION_SEC = 60;
const LANGUAGE_OPTIONS = ["en", "id", "es", "fr", "de", "pt", "it", "ru", "zh", "ja"];
const DEFAULT_LANGUAGE = "en";
const REDIS_URL = process.env.REDIS_URL || "";

const rooms = new Map();
const disconnectTimers = new Map();
const raceTimers = new Map();

const NORMAL_WORD_SEED = [
  "typing",
  "rhythm",
  "battle",
  "result",
  "system",
  "target",
  "stable",
  "modern",
  "player",
  "screen",
  "layout",
  "design",
];

const WORD_SEED_BY_LANGUAGE = {
  en: NORMAL_WORD_SEED,
  id: ["waktu", "masalah", "jalan", "anak", "pulang", "jumlah", "makanan", "harga", "sekarang", "sebelum", "sesudah", "bersama"],
  es: ["tiempo", "ritmo", "batalla", "resultado", "sistema", "objetivo", "estable", "moderno", "jugador", "pantalla", "diseno", "equipo"],
  fr: ["temps", "rythme", "combat", "resultat", "systeme", "objectif", "stable", "moderne", "joueur", "ecran", "design", "progres"],
  de: ["zeit", "rhythmus", "kampf", "ergebnis", "system", "ziel", "stabil", "modern", "spieler", "bildschirm", "design", "fortschritt"],
  pt: ["tempo", "ritmo", "batalha", "resultado", "sistema", "alvo", "estavel", "moderno", "jogador", "tela", "design", "progresso"],
  it: ["tempo", "ritmo", "battaglia", "risultato", "sistema", "obiettivo", "stabile", "moderno", "giocatore", "schermo", "design", "progresso"],
  ru: ["vremya", "ritm", "bitva", "rezultat", "sistema", "tsel", "stabilno", "modern", "igrok", "ekran", "dizayn", "progress"],
  zh: ["shijian", "jiezou", "duizhan", "jieguo", "xitong", "mubiao", "wending", "xiandai", "wanjia", "pingmu", "sheji", "jinbu"],
  ja: ["jikan", "rizumu", "tatakai", "kekka", "shisutemu", "mokuhyo", "antei", "modan", "pureya", "sukurin", "dezain", "shinchoku"],
 };

function sanitizeName(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned.slice(0, 20) : fallback;
}

function sanitizeToken(value) {
  if (typeof value !== "string") {
    return "";
  }

  const token = value.trim();
  if (token.length < 8) {
    return "";
  }

  return token.slice(0, 120);
}

function sanitizeDuration(value) {
  const parsed = Number(value);
  if (DURATION_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_DURATION_SEC;
}

function sanitizeLanguage(value) {
  if (typeof value !== "string") {
    return DEFAULT_LANGUAGE;
  }
  const normalized = value.trim().toLowerCase();
  if (LANGUAGE_OPTIONS.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_LANGUAGE;
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";

  for (let i = 0; i < 6; i += 1) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

function createRaceWords(language = DEFAULT_LANGUAGE, wordCount = 220) {
  const seed = WORD_SEED_BY_LANGUAGE[language] || WORD_SEED_BY_LANGUAGE[DEFAULT_LANGUAGE];
  const words = [];
  while (words.length < wordCount) {
    const shuffled = [...seed].sort(() => Math.random() - 0.5);
    words.push(...shuffled);
  }
  return words.slice(0, wordCount);
}

function toPublicRoom(room) {
  return {
    id: room.id,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Host",
    playerCount: room.players.length,
    connectedCount: room.players.filter((player) => player.connected).length,
    capacity: ROOM_CAPACITY,
    durationSec: room.durationSec,
    typingMode: room.typingMode,
    language: room.language,
    status: room.status,
    createdAt: room.createdAt,
  };
}

function emitRoomsList(io) {
  const list = [...rooms.values()]
    .filter((room) => room.status !== "racing")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((room) => toPublicRoom(room));
  io.emit("rooms-list", list);
}

function emitRoomState(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const roomView = {
    id: room.id,
    createdAt: room.createdAt,
    hostId: room.hostId,
    status: room.status,
    raceWords: room.raceWords,
    startedAt: room.startedAt,
    winnerId: room.winnerId,
    chat: room.chat,
    durationSec: room.durationSec,
    typingMode: room.typingMode,
    language: room.language,
    players: room.players.map((player) => ({
      id: player.id,
      socketId: player.socketId,
      name: player.name,
      ready: player.ready,
      progress: player.progress,
      wpm: player.wpm,
      finishedAt: player.finishedAt,
      connected: player.connected,
      disconnectedAt: player.disconnectedAt,
      antiCheatViolations: player.antiCheatViolations,
      blocked: player.blocked,
    })),
  };

  io.to(roomId).emit("room-state", roomView);
}

function getWinnerId(room) {
  const finished = room.players
    .filter((player) => player.progress >= 100 && typeof player.finishedAt === "number")
    .sort((a, b) => a.finishedAt - b.finishedAt);

  if (finished.length > 0) {
    return finished[0].id;
  }

  const byProgress = [...room.players].sort((a, b) => {
    if (b.progress === a.progress) {
      return b.wpm - a.wpm;
    }
    return b.progress - a.progress;
  });

  return byProgress[0]?.id ?? null;
}

function makeRaceFinishedPayload(room) {
  return {
    roomId: room.id,
    startedAt: room.startedAt,
    finishedAt: Date.now(),
    winnerId: room.winnerId,
    winnerName: room.players.find((player) => player.id === room.winnerId)?.name ?? null,
    participants: room.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      progress: player.progress,
      wpm: player.wpm,
      finishedAt: player.finishedAt,
    })),
  };
}

function clearRaceTimer(roomId) {
  const existing = raceTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    raceTimers.delete(roomId);
  }
}

function maybeFinishRace(io, room) {
  if (!room || room.status !== "racing") {
    return;
  }

  const anyConnected = room.players.some((player) => player.connected);
  const pendingConnected = room.players.some((player) => player.connected && player.progress < 100);

  if (anyConnected && pendingConnected) {
    return;
  }

  room.status = "finished";
  room.winnerId = getWinnerId(room);
  clearRaceTimer(room.id);
  const payload = makeRaceFinishedPayload(room);
  io.to(room.id).emit("race-finished", payload);
  emitRoomsList(io);
}

function scheduleRaceTimeout(io, room) {
  clearRaceTimer(room.id);
  const timer = setTimeout(() => {
    const activeRoom = rooms.get(room.id);
    if (!activeRoom || activeRoom.status !== "racing") {
      return;
    }
    activeRoom.status = "finished";
    activeRoom.winnerId = getWinnerId(activeRoom);
    const payload = makeRaceFinishedPayload(activeRoom);
    io.to(activeRoom.id).emit("race-finished", payload);
    emitRoomState(io, activeRoom.id);
    emitRoomsList(io);
    clearRaceTimer(activeRoom.id);
  }, room.durationSec * 1000);

  raceTimers.set(room.id, timer);
}

function registerSuspiciousUpdate(socket, player, reason) {
  player.antiCheatViolations += 1;
  socket.emit("anti-cheat-warning", {
    reason,
    count: player.antiCheatViolations,
    max: MAX_VIOLATIONS,
  });

  if (player.antiCheatViolations >= MAX_VIOLATIONS) {
    player.blocked = true;
    socket.emit("anti-cheat-blocked", {
      reason: "Too many suspicious updates.",
    });
  }
}

function removePlayerFromRoom(io, roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const index = room.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    return;
  }

  const wasHost = room.hostId === room.players[index].id;
  room.players.splice(index, 1);

  if (room.players.length === 0) {
    clearRaceTimer(roomId);
    rooms.delete(roomId);
    emitRoomsList(io);
    return;
  }

  if (wasHost) {
    const connectedPlayers = room.players.filter((player) => player.connected);
    const hostPool = connectedPlayers.length > 0 ? connectedPlayers : room.players;
    const nextHost = hostPool[Math.floor(Math.random() * hostPool.length)];
    room.hostId = nextHost.id;
  }

  maybeFinishRace(io, room);
  emitRoomState(io, roomId);
  emitRoomsList(io);
}

function handleDisconnect(io, socketId) {
  for (const [roomId, room] of rooms.entries()) {
    const player = room.players.find((item) => item.socketId === socketId);
    if (!player) {
      continue;
    }

    player.connected = false;
    player.disconnectedAt = Date.now();
    player.ready = false;
    player.socketId = null;

    maybeFinishRace(io, room);
    emitRoomState(io, roomId);
    emitRoomsList(io);

    const timerKey = `${roomId}:${player.id}`;
    const existingTimer = disconnectTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      disconnectTimers.delete(timerKey);
      removePlayerFromRoom(io, roomId, player.id);
    }, DISCONNECT_GRACE_MS);

    disconnectTimers.set(timerKey, timer);
  }
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: [ALLOWED_ORIGIN, "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
});

let redisPubClient = null;
let redisSubClient = null;

async function setupRedisAdapterIfEnabled() {
  if (!REDIS_URL) {
    console.log("Socket Redis adapter disabled (REDIS_URL not set).");
    return;
  }

  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const Redis = require("ioredis");

    redisPubClient = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: () => null,
      reconnectOnError: () => false,
    });
    redisSubClient = redisPubClient.duplicate();
    redisPubClient.on("error", () => {});
    redisSubClient.on("error", () => {});

    await Promise.all([redisPubClient.connect(), redisSubClient.connect()]);
    io.adapter(createAdapter(redisPubClient, redisSubClient));
    console.log("Socket Redis adapter enabled.");
  } catch (error) {
    console.error("Failed to enable Socket Redis adapter. Falling back to single-instance mode.", error);
    redisPubClient = null;
    redisSubClient = null;
  }
}

io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  emitRoomsList(io);

  socket.on("create-room", (payload, callback) => {
    const name = sanitizeName(payload?.name, "Host");
    const token = sanitizeToken(payload?.token);
    if (!token) {
      callback?.({ error: "Missing player token." });
      return;
    }

    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      token,
      name,
      ready: false,
      progress: 0,
      wpm: 0,
      finishedAt: null,
      connected: true,
      disconnectedAt: null,
      antiCheatViolations: 0,
      blocked: false,
      lastProgressAt: null,
      lastProgress: 0,
      lastWpm: 0,
    };

    const room = {
      id: roomId,
      createdAt: Date.now(),
      hostId: player.id,
      players: [player],
      status: "lobby",
      raceWords: [],
      startedAt: null,
      winnerId: null,
      chat: [],
      durationSec: sanitizeDuration(payload?.durationSec),
      typingMode: "normal",
      language: sanitizeLanguage(payload?.language),
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    emitRoomState(io, roomId);
    emitRoomsList(io);
    callback?.({ room, playerId: player.id });
  });

  socket.on("join-room", (payload, callback) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const token = sanitizeToken(payload?.token);
    const room = rooms.get(roomId);

    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }

    if (!token) {
      callback?.({ error: "Missing player token." });
      return;
    }

    const existing = room.players.find((player) => player.token === token);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.name = sanitizeName(payload?.name, existing.name);
      socket.join(roomId);

      const timerKey = `${roomId}:${existing.id}`;
      const timer = disconnectTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(timerKey);
      }

      emitRoomState(io, roomId);
      emitRoomsList(io);
      callback?.({ room, playerId: existing.id, reconnected: true });
      return;
    }

    if (room.players.length >= ROOM_CAPACITY) {
      callback?.({ error: "Room is full." });
      return;
    }

    if (room.status === "racing") {
      callback?.({ error: "Race already started." });
      return;
    }

    const name = sanitizeName(payload?.name, "Player");
    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      token,
      name,
      ready: false,
      progress: 0,
      wpm: 0,
      finishedAt: null,
      connected: true,
      disconnectedAt: null,
      antiCheatViolations: 0,
      blocked: false,
      lastProgressAt: null,
      lastProgress: 0,
      lastWpm: 0,
    };

    room.players.push(player);
    rooms.set(roomId, room);
    socket.join(roomId);
    emitRoomState(io, roomId);
    emitRoomsList(io);
    callback?.({ room, playerId: player.id });
  });

  socket.on("update-room-settings", (payload, callback) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }
    if (room.status === "racing") {
      callback?.({ error: "Room settings cannot be changed during race." });
      return;
    }

    const actor = room.players.find((item) => item.socketId === socket.id && item.connected);
    if (!actor || actor.id !== room.hostId) {
      callback?.({ error: "Only host can change room settings." });
      return;
    }

    room.durationSec = sanitizeDuration(payload?.durationSec);
    if (typeof payload?.language === "string") {
      room.language = sanitizeLanguage(payload.language);
    }
    emitRoomState(io, roomId);
    emitRoomsList(io);
    callback?.({ ok: true });
  });

  socket.on("player-ready", (payload) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const ready = Boolean(payload?.ready);
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const player = room.players.find((item) => item.socketId === socket.id && item.connected);
    if (!player) {
      return;
    }

    player.ready = ready;
    emitRoomState(io, roomId);
  });

  socket.on("start-race", (payload, callback) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }

    const actor = room.players.find((item) => item.socketId === socket.id);
    if (!actor || actor.id !== room.hostId) {
      callback?.({ error: "Only host can start." });
      return;
    }

    const connectedPlayers = room.players.filter((player) => player.connected);
    if (connectedPlayers.length < 2) {
      callback?.({ error: "Need at least 2 players." });
      return;
    }

    if (!connectedPlayers.every((player) => player.ready || player.id === room.hostId)) {
      callback?.({ error: "All players must be ready." });
      return;
    }

    room.status = "racing";
    room.raceWords = createRaceWords(room.language);
    room.startedAt = Date.now();
    room.winnerId = null;

    room.players.forEach((player) => {
      player.progress = 0;
      player.wpm = 0;
      player.finishedAt = null;
      player.ready = false;
      player.blocked = false;
      player.antiCheatViolations = 0;
      player.lastProgressAt = room.startedAt;
      player.lastProgress = 0;
      player.lastWpm = 0;
    });

    scheduleRaceTimeout(io, room);
    emitRoomState(io, roomId);
    emitRoomsList(io);
    io.to(roomId).emit("race-started", {
      roomId,
      startedAt: room.startedAt,
      durationSec: room.durationSec,
    });
    callback?.({ ok: true });
  });

  socket.on("update-progress", (payload) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room || room.status !== "racing") {
      return;
    }

    const player = room.players.find((item) => item.socketId === socket.id && item.connected);
    if (!player || player.blocked) {
      return;
    }

    const progressRaw = Number(payload?.progress);
    const wpmRaw = Number(payload?.wpm);
    if (!Number.isFinite(progressRaw) || !Number.isFinite(wpmRaw)) {
      return;
    }

    const nextProgress = Math.min(Math.max(progressRaw, 0), 100);
    const nextWpm = Math.max(wpmRaw, 0);
    const now = Date.now();
    const sinceLastMs = Math.max(now - (player.lastProgressAt || room.startedAt || now), 1);
    const maxJump = (sinceLastMs / 1000) * MAX_CATCHUP_PROGRESS_PER_SEC + 3;
    const progressDelta = nextProgress - player.lastProgress;

    if (nextWpm > MAX_WPM) {
      registerSuspiciousUpdate(socket, player, `WPM exceeds ${MAX_WPM}`);
      emitRoomState(io, roomId);
      return;
    }

    if (progressDelta < -MAX_PROGRESS_DROP) {
      registerSuspiciousUpdate(socket, player, "Progress drop too large");
      emitRoomState(io, roomId);
      return;
    }

    if (progressDelta > maxJump) {
      registerSuspiciousUpdate(socket, player, "Progress jump too large");
      emitRoomState(io, roomId);
      return;
    }

    player.progress = nextProgress;
    player.wpm = nextWpm;
    player.lastProgressAt = now;
    player.lastProgress = nextProgress;
    player.lastWpm = nextWpm;

    if (player.progress >= 100 && !player.finishedAt) {
      player.finishedAt = Date.now();
    }

    maybeFinishRace(io, room);
    emitRoomState(io, roomId);
  });

  socket.on("send-message", (payload, callback) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }

    const player = room.players.find((item) => item.socketId === socket.id && item.connected);
    if (!player) {
      callback?.({ error: "Player not in room." });
      return;
    }

    const text = String(payload?.text || "").trim();
    if (!text) {
      callback?.({ error: "Message cannot be empty." });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      playerId: player.id,
      name: player.name,
      text: text.slice(0, 240),
      createdAt: Date.now(),
    };

    room.chat.push(message);
    if (room.chat.length > CHAT_LIMIT) {
      room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    }

    io.to(roomId).emit("chat-message", message);
    callback?.({ ok: true });
  });

  socket.on("leave-room", (payload, callback) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const token = sanitizeToken(payload?.token);
    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ ok: true });
      return;
    }

    const player = room.players.find(
      (item) => item.socketId === socket.id || (token && item.token === token),
    );
    if (!player) {
      callback?.({ ok: true });
      return;
    }

    const timerKey = `${roomId}:${player.id}`;
    const existingTimer = disconnectTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(timerKey);
    }

    socket.leave(roomId);
    removePlayerFromRoom(io, roomId, player.id);
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    handleDisconnect(io, socket.id);
  });
});

async function startServer() {
  await setupRedisAdapterIfEnabled();
  httpServer.listen(PORT, () => {
    console.log(`FastFingers Socket server running on http://localhost:${PORT}`);
  });
}

async function shutdown() {
  try {
    if (redisPubClient) await redisPubClient.quit();
    if (redisSubClient) await redisSubClient.quit();
  } catch (error) {
    console.error("Socket server shutdown error:", error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
