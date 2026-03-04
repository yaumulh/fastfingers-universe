import { NextResponse } from "next/server";
import { getBrandingData } from "@/lib/branding";

export async function GET() {
  const branding = await getBrandingData();
  return NextResponse.json({ data: branding });
}

