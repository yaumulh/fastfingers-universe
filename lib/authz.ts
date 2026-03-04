import { getSessionUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export type AppUserRole = "user" | "mod" | "admin";

export function normalizeRole(value: string | null | undefined): AppUserRole {
  if (value === "admin") return "admin";
  if (value === "mod") return "mod";
  return "user";
}

export async function getSessionUserWithRole(): Promise<{
  id: string;
  username: string;
  displayName: string | null;
  needsDisplayNameSetup: boolean;
  role: AppUserRole;
} | null> {
  const session = await getSessionUser();
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, displayName: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    needsDisplayNameSetup: !user.displayName,
    role: normalizeRole(user.role),
  };
}

export async function requireAdminSession(): Promise<{
  id: string;
  username: string;
  displayName: string | null;
  needsDisplayNameSetup: boolean;
  role: "admin";
} | null> {
  const user = await getSessionUserWithRole();
  if (!user || user.role !== "admin") {
    return null;
  }
  return { ...user, role: "admin" };
}
