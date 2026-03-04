type RoomPlayer = {
  id: string;
  name: string;
  joinedAt: number;
};

export type Room = {
  id: string;
  createdAt: number;
  players: RoomPlayer[];
};

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __fastfingersRooms?: Map<string, Room>;
};

const rooms = globalStore.__fastfingersRooms ?? new Map<string, Room>();

if (!globalStore.__fastfingersRooms) {
  globalStore.__fastfingersRooms = rooms;
}

function pruneExpiredRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(roomId);
    }
  }
}

function generateId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createRoom(hostName: string): Room {
  pruneExpiredRooms();

  let id = generateId();
  while (rooms.has(id)) {
    id = generateId();
  }

  const room: Room = {
    id,
    createdAt: Date.now(),
    players: [{ id: crypto.randomUUID(), name: hostName, joinedAt: Date.now() }],
  };

  rooms.set(id, room);
  return room;
}

export function getRoom(roomId: string): Room | null {
  pruneExpiredRooms();
  return rooms.get(roomId.toUpperCase()) ?? null;
}

export function joinRoom(roomId: string, name: string): Room | null {
  pruneExpiredRooms();

  const target = rooms.get(roomId.toUpperCase());
  if (!target) {
    return null;
  }

  if (target.players.length >= 8) {
    return target;
  }

  target.players.push({
    id: crypto.randomUUID(),
    name,
    joinedAt: Date.now(),
  });

  rooms.set(target.id, target);
  return target;
}
