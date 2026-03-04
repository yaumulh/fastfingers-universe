import { NextResponse } from "next/server";
import { getBrandingData } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const branding = await getBrandingData();
  return NextResponse.json({ data: branding });
}
