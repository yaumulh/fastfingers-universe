import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sanitizeUsername } from "@/lib/auth-session";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [incoming, outgoing, acceptedIncoming, acceptedOutgoing] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { toUserId: session.id, status: "pending" },
      include: { fromUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendRequest.findMany({
      where: { fromUserId: session.id, status: "pending" },
      include: { toUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendRequest.findMany({
      where: { toUserId: session.id, status: "accepted" },
      include: { fromUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { respondedAt: "desc" },
    }),
    prisma.friendRequest.findMany({
      where: { fromUserId: session.id, status: "accepted" },
      include: { toUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { respondedAt: "desc" },
    }),
  ]);

  const friends = [
    ...acceptedIncoming.map((item) => item.fromUser),
    ...acceptedOutgoing.map((item) => item.toUser),
  ];

  return NextResponse.json({
    data: {
      friends,
      pendingIncoming: incoming.map((item) => ({
        id: item.id,
        user: item.fromUser,
        createdAt: item.createdAt,
      })),
      pendingOutgoing: outgoing.map((item) => ({
        id: item.id,
        user: item.toUser,
        createdAt: item.createdAt,
      })),
    },
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { username?: string };
  const targetUsername = sanitizeUsername(body.username);
  if (!targetUsername) {
    return NextResponse.json({ error: "Target username required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { username: targetUsername },
    select: { id: true, username: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.id === session.id) {
    return NextResponse.json({ error: "Cannot add yourself." }, { status: 400 });
  }

  const existing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { fromUserId: session.id, toUserId: target.id },
        { fromUserId: target.id, toUserId: session.id },
      ],
    },
  });
  if (existing && existing.status === "accepted") {
    return NextResponse.json({ error: "Already friends." }, { status: 409 });
  }
  if (existing && existing.status === "pending") {
    return NextResponse.json({ error: "Friend request already pending." }, { status: 409 });
  }

  const created = await prisma.friendRequest.create({
    data: {
      fromUserId: session.id,
      toUserId: target.id,
      status: "pending",
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
