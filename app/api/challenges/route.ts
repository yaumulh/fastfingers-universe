import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

type Body = {
  mode?: "normal" | "advanced";
  language?: string;
  durationSec?: number;
  expiresHours?: number;
};

function createCode() {
  return randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const mode = body.mode === "advanced" ? "advanced" : "normal";
  const language = typeof body.language === "string" ? body.language.slice(0, 5) : "en";
  const durationSec =
    typeof body.durationSec === "number" && [15, 30, 60, 120].includes(body.durationSec)
      ? body.durationSec
      : 60;
  const expiresHours =
    typeof body.expiresHours === "number" ? Math.max(1, Math.min(Math.floor(body.expiresHours), 168)) : 48;

  let code = createCode();
  while (await prisma.challengeLink.findUnique({ where: { code }, select: { id: true } })) {
    code = createCode();
  }

  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
  const created = await prisma.challengeLink.create({
    data: {
      code,
      creatorId: session.id,
      mode,
      language,
      durationSec,
      expiresAt,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      mode: true,
      language: true,
      durationSec: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
