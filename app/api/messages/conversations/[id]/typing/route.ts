import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isConversationMember } from "@/lib/messages";
import { clearTypingPresence, isTypingPresent, setTypingPresence } from "@/lib/message-typing";

type RouteContext = { params: { id: string } };

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!conversationId) return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });

  const rate = await enforceRateLimit(
    getRateLimitKey(request, `messages:conversation:${conversationId}:typing:get`, session.id),
    240,
    60_000,
  );
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const member = await isConversationMember(conversationId, session.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const peers = await prisma.conversationMember.findMany({
    where: {
      conversationId,
      userId: { not: session.id },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    take: 3,
  });

  let typingUser: { id: string; username: string; displayName?: string | null } | null = null;
  for (const peer of peers) {
    // eslint-disable-next-line no-await-in-loop
    const active = await isTypingPresent(conversationId, peer.userId);
    if (active) {
      typingUser = {
        id: peer.user.id,
        username: peer.user.username,
        displayName: peer.user.displayName,
      };
      break;
    }
  }

  return NextResponse.json({
    data: {
      typing: Boolean(typingUser),
      user: typingUser,
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!conversationId) return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });

  const rate = await enforceRateLimit(
    getRateLimitKey(request, `messages:conversation:${conversationId}:typing:post`, session.id),
    360,
    60_000,
  );
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const member = await isConversationMember(conversationId, session.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { typing?: boolean };
  if (body.typing) {
    await setTypingPresence(conversationId, session.id, 6);
  } else {
    await clearTypingPresence(conversationId, session.id);
  }

  return NextResponse.json({ data: { ok: true } });
}

