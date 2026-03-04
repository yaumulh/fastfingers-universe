import { NextResponse } from "next/server";
import { BRANDING_SLOTS, type BrandingSlot, clearBrandLogoDataUrl, getBrandingData, setBrandLogoDataUrl } from "@/lib/branding";
import { requireAdminSession } from "@/lib/authz";
import { createRateLimitResponse, enforceRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;

function isAllowedImageMime(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || mime === "image/svg+xml";
}

function isBrandingSlot(value: string): value is BrandingSlot {
  return BRANDING_SLOTS.includes(value as BrandingSlot);
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:branding:get", session.id), 60, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const data = await getBrandingData();
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:branding:post", session.id), 15, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const form = await request.formData();
    const slotRaw = String(form.get("slot") ?? "");
    if (!isBrandingSlot(slotRaw)) {
      return NextResponse.json({ error: "Invalid logo slot." }, { status: 400 });
    }
    const logo = form.get("logo");
    if (!(logo instanceof File)) {
      return NextResponse.json({ error: "Logo file is required." }, { status: 400 });
    }

    if (!isAllowedImageMime(logo.type)) {
      return NextResponse.json({ error: "Only PNG, JPG, WEBP, or SVG is allowed." }, { status: 400 });
    }

    if (logo.size <= 0 || logo.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Logo size must be between 1 byte and 3MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await logo.arrayBuffer());
    const dataUrl = `data:${logo.type};base64,${bytes.toString("base64")}`;

    await setBrandLogoDataUrl(slotRaw, dataUrl);

    return NextResponse.json({
      data: {
        slot: slotRaw,
        logoDataUrl: dataUrl,
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2021") {
      return NextResponse.json({ error: "Branding table is not ready yet. Run db push first." }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to upload logo due to server error." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = await enforceRateLimit(getRateLimitKey(request, "admin:branding:delete", session.id), 20, 60_000);
  if (!rate.ok) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const url = new URL(request.url);
  const slotRaw = String(url.searchParams.get("slot") ?? "");
  if (!isBrandingSlot(slotRaw)) {
    return NextResponse.json({ error: "Invalid logo slot." }, { status: 400 });
  }

  await clearBrandLogoDataUrl(slotRaw);
  return NextResponse.json({ data: { ok: true, slot: slotRaw } });
}
