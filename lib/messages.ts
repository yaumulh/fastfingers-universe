import { prisma } from "@/lib/prisma";

export const MAX_MESSAGE_LENGTH = 500;
export const CONVERSATION_PAGE_SIZE = 30;
export const MESSAGE_PAGE_SIZE = 50;

export function sanitizeMessageBody(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function getDirectKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

