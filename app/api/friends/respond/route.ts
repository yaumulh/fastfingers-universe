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
    select: {
      id: true,
      toUserId: true,
      fromUserId: true,
      status: true,
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
    },
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

  if (body.action === "accept") {
    await prisma.notification.create({
      data: {
        userId: friendRequest.fromUserId,
        type: "friend_accept",
        title: "Friend request accepted",
        body: `${friendRequest.toUser?.username ?? "A user"} accepted your friend request.`,
        data: {
          href: "/profile",
        },
      },
    });
  }

  return NextResponse.json({ data: updated });
}
