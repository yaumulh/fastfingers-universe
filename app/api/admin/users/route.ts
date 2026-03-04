import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, type AppUserRole } from "@/lib/authz";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { invalidateCachePrefixAsync } from "@/lib/response-cache";
import { sanitizeDisplayName, sanitizeUsername } from "@/lib/auth-session";
import { hashPassword, sanitizePassword } from "@/lib/password";

type UpdateRoleBody = {
  userId?: string;
  username?: string;
  displayName?: string;
  email?: string | null;
  role?: AppUserRole;
  password?: string;
  isActive?: boolean;
};

const ALLOWED_ROLES: AppUserRole[] = ["user", "mod", "admin"];

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim().toLowerCase();
  if (!next) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    throw new Error("Invalid email format.");
  }
  return next;
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:users:get", session.id), 120, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const takeRaw = Number(url.searchParams.get("take") ?? "30");
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.floor(takeRaw), 1), 100) : 30;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : undefined,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

  return NextResponse.json({ data: users });
}

export async function PATCH(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:users:patch", session.id), 80, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as UpdateRoleBody;
  const userId = typeof body.userId === "string" ? body.userId : "";
  const role = typeof body.role === "string" ? (body.role as AppUserRole) : undefined;
  const username = body.username !== undefined ? sanitizeUsername(body.username) : undefined;
  const displayName = body.displayName !== undefined ? sanitizeDisplayName(body.displayName) : undefined;
  const password = body.password !== undefined ? sanitizePassword(body.password) : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
  let email: string | null | undefined;
  try {
    email = body.email !== undefined ? normalizeEmail(body.email) : undefined;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid email." }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (role !== undefined && userId === session.id && role !== "admin") {
    return NextResponse.json({ error: "Admin cannot remove own admin role." }, { status: 409 });
  }
  if (isActive !== undefined && userId === session.id && isActive === false) {
    return NextResponse.json({ error: "Admin cannot disable own account." }, { status: 409 });
  }
  if (username !== undefined && username.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
  }
  if (displayName !== undefined && displayName !== "" && displayName.length < 3) {
    return NextResponse.json({ error: "Display name must be 3-12 characters." }, { status: 400 });
  }
  if (password !== undefined && password !== "" && password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const data: {
    role?: AppUserRole;
    username?: string;
    displayName?: string | null;
    displayNameUpdatedAt?: Date | null;
    email?: string | null;
    passwordHash?: string;
    isActive?: boolean;
  } = {};
  if (role !== undefined) data.role = role;
  if (username !== undefined) data.username = username;
  if (displayName !== undefined) {
    data.displayName = displayName || null;
    data.displayNameUpdatedAt = displayName ? new Date() : null;
  }
  if (email !== undefined) data.email = email;
  if (password) data.passwordHash = hashPassword(password);
  if (isActive !== undefined) data.isActive = isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  let updated: { id: string; username: string; email: string | null; role: string; createdAt: Date };
  try {
    updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true, displayName: true, email: true, role: true, isActive: true, createdAt: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Username, display name, or email already exists." }, { status: 409 });
    }
    throw error;
  }

  await invalidateCachePrefixAsync("user-language-tags:get:");
  await invalidateCachePrefixAsync("test-results:get:");
  await invalidateCachePrefixAsync("competitions:get");
  await invalidateCachePrefixAsync("competition:get:");

  return NextResponse.json({ data: updated });
}

type CreateUserBody = {
  username?: string;
  displayName?: string;
  email?: string | null;
  password?: string;
  role?: AppUserRole;
};

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:users:post", session.id), 40, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const body = (await request.json()) as CreateUserBody;
  const username = sanitizeUsername(body.username);
  const displayName = sanitizeDisplayName(body.displayName);
  const password = sanitizePassword(body.password);
  const role = typeof body.role === "string" && ALLOWED_ROLES.includes(body.role) ? body.role : "user";

  let email: string | null;
  try {
    email = normalizeEmail(body.email);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid email." }, { status: 400 });
  }

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (displayName && displayName.length < 3) {
    return NextResponse.json({ error: "Display name must be 3-12 characters." }, { status: 400 });
  }

  try {
    const created = await prisma.user.create({
      data: {
        username,
        displayName: displayName || null,
        displayNameUpdatedAt: displayName ? new Date() : null,
        email,
        role,
        isActive: true,
        passwordHash: hashPassword(password),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await invalidateCachePrefixAsync("user-language-tags:get:");
    await invalidateCachePrefixAsync("test-results:get:");
    await invalidateCachePrefixAsync("competitions:get");
    await invalidateCachePrefixAsync("competition:get:");

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Username, display name, or email already exists." }, { status: 409 });
    }
    throw error;
  }
}
