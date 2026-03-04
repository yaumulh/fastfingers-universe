import { NextResponse } from "next/server";
import { getRoom, joinRoom } from "@/lib/rooms-store";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type Params = {
  params: {
    roomId: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "rooms:join"), 50, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const roomBefore = getRoom(params.roomId);
  if (!roomBefore) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (roomBefore.players.length >= 8) {
    return NextResponse.json({ error: "Room is full." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { playerName?: string };
  const rawPlayerName = body.playerName?.trim();
  const playerName = rawPlayerName && rawPlayerName.length > 0 ? rawPlayerName.slice(0, 20) : "Player";

  const room = joinRoom(params.roomId, playerName);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ data: room }, { status: 201 });
}
