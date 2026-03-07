import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { CONVERSATION_PAGE_SIZE, getDirectKey } from "@/lib/messages";

function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "messages:conversations:get", session.id), 120, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const [acceptedIncoming, acceptedOutgoing] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { toUserId: session.id, status: "accepted" },
      include: { fromUser: { select: { id: true, isActive: true } } },
    }),
    prisma.friendRequest.findMany({
      where: { fromUserId: session.id, status: "accepted" },
      include: { toUser: { select: { id: true, isActive: true } } },
    }),
  ]);

  const friendIds = new Set<string>();
  for (const item of acceptedIncoming) {
    if (item.fromUser?.id && item.fromUser.isActive) {
      friendIds.add(item.fromUser.id);
    }
  }
  for (const item of acceptedOutgoing) {
    if (item.toUser?.id && item.toUser.isActive) {
      friendIds.add(item.toUser.id);
    }
  }

  if (friendIds.size > 0) {
    await Promise.all(
      Array.from(friendIds).map(async (friendId) => {
        const directKey = getDirectKey(session.id, friendId);
        await prisma.conversation.upsert({
          where: { directKey },
          update: {},
          create: {
            directKey,
            members: {
              create: [{ userId: session.id }, { userId: friendId }],
            },
          },
        });
      }),
    );
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      members: { some: { userId: session.id } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: CONVERSATION_PAGE_SIZE,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          body: true,
          createdAt: true,
          senderId: true,
        },
      },
    },
  });

  const payload = await Promise.all(
    conversations.map(async (conversation) => {
      const me = conversation.members.find((member) => member.userId === session.id) ?? null;
      const other = conversation.members.find((member) => member.userId !== session.id) ?? null;
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          createdAt: me?.lastReadAt ? { gt: me.lastReadAt } : undefined,
          senderId: { not: session.id },
        },
      });
      return {
        id: conversation.id,
        directKey: conversation.directKey,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount,
        memberCount: conversation.members.length,
        myLastReadAt: me?.lastReadAt ?? null,
        peerLastReadAt: other?.lastReadAt ?? null,
        peer: other
          ? {
              id: other.user.id,
              username: other.user.username,
              displayName: other.user.displayName,
              role: other.user.role,
              isActive: other.user.isActive,
            }
          : null,
        lastMessage: conversation.messages[0]
          ? {
              id: conversation.messages[0].id,
              body: conversation.messages[0].body,
              createdAt: conversation.messages[0].createdAt,
              senderId: conversation.messages[0].senderId,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ data: payload });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await enforceRateLimit(getRateLimitKey(request, "messages:conversations:post", session.id), 40, 60_000);
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const body = (await request.json()) as { targetUserId?: string; targetUsername?: string };
  const targetUserIdRaw = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const targetUsername = normalizeUsername(body.targetUsername);

  let targetUser = null as null | { id: string; username: string; displayName: string | null; isActive: boolean; role: string };
  if (targetUserIdRaw) {
    targetUser = await prisma.user.findUnique({
      where: { id: targetUserIdRaw },
      select: { id: true, username: true, displayName: true, isActive: true, role: true },
    });
  } else if (targetUsername) {
    targetUser = await prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true, username: true, displayName: true, isActive: true, role: true },
    });
  }

  if (!targetUser || !targetUser.isActive) {
    return NextResponse.json({ error: "Target user not found or inactive." }, { status: 404 });
  }
  if (targetUser.id === session.id) {
    return NextResponse.json({ error: "Cannot message your own account." }, { status: 400 });
  }

  const directKey = getDirectKey(session.id, targetUser.id);
  const existing = await prisma.conversation.findUnique({
    where: { directKey },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const conversation =
    existing ??
    (await prisma.conversation.create({
      data: {
        directKey,
        members: {
          create: [{ userId: session.id }, { userId: targetUser.id }],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                role: true,
                isActive: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }));

  const peer = conversation.members.find((member) => member.userId !== session.id)?.user ?? null;
  return NextResponse.json({
    data: {
      id: conversation.id,
      directKey: conversation.directKey,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: 0,
      myLastReadAt: null,
      peerLastReadAt: null,
      peer: peer
        ? {
            id: peer.id,
            username: peer.username,
            displayName: peer.displayName,
            role: peer.role,
            isActive: peer.isActive,
          }
        : null,
      lastMessage: conversation.messages[0]
        ? {
            id: conversation.messages[0].id,
            body: conversation.messages[0].body,
            createdAt: conversation.messages[0].createdAt,
            senderId: conversation.messages[0].senderId,
          }
        : null,
    },
  });
}
