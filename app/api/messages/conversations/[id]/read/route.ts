import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isConversationMember } from "@/lib/messages";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!conversationId) return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });

  const rate = await enforceRateLimit(
    getRateLimitKey(request, `messages:conversation:${conversationId}:read`, session.id),
    90,
    60_000,
  );
  if (!rate.ok) return createRateLimitResponse(rate.retryAfterSec);

  const member = await isConversationMember(conversationId, session.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId: session.id,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });

  return NextResponse.json({ data: { ok: true } });
}

