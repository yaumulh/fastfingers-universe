import { NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms-store";

type Params = {
  params: {
    roomId: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  const room = getRoom(params.roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ data: room });
}
