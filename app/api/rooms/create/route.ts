import { NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms-store";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(getRateLimitKey(request, "rooms:create"), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json().catch(() => ({}))) as { hostName?: string };
  const rawHostName = body.hostName?.trim();
  const hostName = rawHostName && rawHostName.length > 0 ? rawHostName.slice(0, 20) : "Host";

  const room = createRoom(hostName);
  return NextResponse.json({ data: room }, { status: 201 });
}
