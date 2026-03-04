import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";

type Body = {
  requestId?: string;
  action?: "accept" | "reject";
};

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  if (!body.requestId || (body.action !== "accept" && body.action !== "reject")) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const friendRequest = await prisma.friendRequest.findUnique({
    where: { id: body.requestId },
    select: { id: true, toUserId: true, status: true },
  });
  if (!friendRequest) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (friendRequest.toUserId !== session.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (friendRequest.status !== "pending") {
    return NextResponse.json({ error: "Request already handled." }, { status: 409 });
  }

  const updated = await prisma.friendRequest.update({
    where: { id: friendRequest.id },
    data: {
      status: body.action === "accept" ? "accepted" : "rejected",
      respondedAt: new Date(),
    },
    select: { id: true, status: true, respondedAt: true },
  });

  return NextResponse.json({ data: updated });
}
