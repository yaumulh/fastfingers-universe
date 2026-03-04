import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeCompetitionIfNeeded } from "@/lib/competition";
import { invalidateCachePrefixAsync } from "@/lib/response-cache";
import { toApiErrorResponse } from "@/lib/api-error";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const endedActive = await prisma.competition.findMany({
      where: {
        status: "active",
        endsAt: {
          lte: now,
        },
      },
      select: { id: true },
      take: 50,
      orderBy: { endsAt: "asc" },
    });

    for (const row of endedActive) {
      await finalizeCompetitionIfNeeded(row.id);
    }

    if (endedActive.length > 0) {
      await invalidateCachePrefixAsync("competitions:get");
      await invalidateCachePrefixAsync("competition:get:");
      await invalidateCachePrefixAsync("home-snapshot:get");
    }

    return NextResponse.json({
      data: {
        checked: endedActive.length,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, "Failed to finalize competitions.");
  }
}
