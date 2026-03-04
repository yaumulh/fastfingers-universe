import { NextResponse } from "next/server";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPrismaPoolTimeout(error: unknown): boolean {
  if (!isObject(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (code === "P2024") return true;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("connection pool") || message.includes("timed out fetching a new connection");
}

export function toApiErrorResponse(error: unknown, fallbackMessage = "Request failed.") {
  if (isPrismaPoolTimeout(error)) {
    return NextResponse.json(
      { error: "Server is busy. Please retry in a few seconds." },
      {
        status: 503,
        headers: {
          "Retry-After": "2",
        },
      },
    );
  }

  const message = isObject(error) && typeof error.message === "string" ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 500 });
}
