import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-session";

type AttemptBody = {
  wpm?: number;
  accuracy?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const code = String(params.code || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Challenge code required." }, { status: 400 });
  }

  const challenge = await prisma.challengeLink.findUnique({
    where: { code },
    include: {
      creator: { select: { id: true, username: true, displayName: true } },
      attempts: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: [{ wpm: "desc" }, { accuracy: "desc" }, { createdAt: "asc" }],
        take: 30,
      },
    },
  });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  const expired = challenge.expiresAt ? challenge.expiresAt.getTime() <= Date.now() : false;
  return NextResponse.json({
    data: {
      id: challenge.id,
      code: challenge.code,
      mode: challenge.mode,
      language: challenge.language,
      durationSec: challenge.durationSec,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt,
      isActive: challenge.isActive && !expired,
      creator: challenge.creator,
      attempts: challenge.attempts.map((attempt) => ({
        id: attempt.id,
        username: attempt.username,
        displayName: attempt.user?.displayName ?? null,
        wpm: attempt.wpm,
        accuracy: attempt.accuracy,
        createdAt: attempt.createdAt,
      })),
    },
  });
}

export async function POST(request: Request, { params }: { params: { code: string } }) {
  const code = String(params.code || "").trim().toUpperCase();
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AttemptBody;
  if (!isFiniteNumber(body.wpm) || !isFiniteNumber(body.accuracy)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const challenge = await prisma.challengeLink.findUnique({
    where: { code },
    select: { id: true, isActive: true, expiresAt: true },
  });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }
  if (!challenge.isActive || (challenge.expiresAt && challenge.expiresAt.getTime() <= Date.now())) {
    return NextResponse.json({ error: "Challenge is expired or inactive." }, { status: 409 });
  }

  const created = await prisma.challengeAttempt.create({
    data: {
      challengeId: challenge.id,
      userId: session.id,
      username: session.username,
      wpm: Math.max(0, body.wpm),
      accuracy: Math.min(Math.max(body.accuracy, 0), 100),
    },
    select: {
      id: true,
      username: true,
      user: {
        select: {
          displayName: true,
        },
      },
      wpm: true,
      accuracy: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      data: {
        id: created.id,
        username: created.username,
        displayName: created.user?.displayName ?? null,
        wpm: created.wpm,
        accuracy: created.accuracy,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
}
