import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isConversationMember, MESSAGE_PAGE_SIZE, sanitizeMessageBody } from "@/lib/messages";

type RouteContext = { params: { id: string } };

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!conversationId) return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });

  const rate = await enforceRateLimit(
    getRateLimitKey(request, `messages:conversation:${conversationId}:get`, session.id),
    180,
    60_000,
  );
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const member = await isConversationMember(conversationId, session.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const where = before && !Number.isNaN(before.getTime())
    ? { conversationId, createdAt: { lt: before } }
    : { conversationId };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE_SIZE,
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
        },
      },
    },
  });

  const ordered = [...messages].reverse().map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    sender: {
      id: message.sender.id,
      username: message.sender.username,
      displayName: message.sender.displayName,
      role: message.sender.role,
    },
  }));

  return NextResponse.json({
    data: ordered,
    paging: {
      hasMore: messages.length === MESSAGE_PAGE_SIZE,
      before: messages.length > 0 ? messages[messages.length - 1].createdAt : null,
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!conversationId) return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });

  const rate = await enforceRateLimit(
    getRateLimitKey(request, `messages:conversation:${conversationId}:post`, session.id),
    50,
    60_000,
  );
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const member = await isConversationMember(conversationId, session.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { body?: string };
  const messageBody = sanitizeMessageBody(body.body);
  if (!messageBody) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.message.create({
      data: {
        conversationId,
        senderId: session.id,
        body: messageBody,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: next.createdAt,
      },
    });

    const recipients = await tx.conversationMember.findMany({
      where: {
        conversationId,
        userId: { not: session.id },
      },
      select: { userId: true },
    });

    if (recipients.length > 0) {
      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.userId,
          type: "message",
          title: "New message",
          body: `${next.sender.displayName ?? next.sender.username}: ${next.body.slice(0, 80)}`,
          data: {
            conversationId,
            senderId: session.id,
            senderUsername: next.sender.username,
            href: `/messages?conversation=${conversationId}`,
          },
        })),
      });
    }

    return next;
  });

  return NextResponse.json({
    data: {
      id: created.id,
      body: created.body,
      createdAt: created.createdAt,
      sender: {
        id: created.sender.id,
        username: created.sender.username,
        displayName: created.sender.displayName,
        role: created.sender.role,
      },
    },
  });
}
