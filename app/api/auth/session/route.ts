import { NextResponse } from "next/server";
import { getSessionUserWithRole } from "@/lib/authz";

export async function GET() {
  const user = await getSessionUserWithRole();
  return NextResponse.json({ data: user });
}
