import { prisma } from "@/lib/prisma";

export const BRANDING_SLOTS = [
  "headerWordmark",
  "headerIcon",
  "sideRailIcon",
  "favicon",
  "appleTouch",
  "homeHero",
  "loadingIcon",
] as const;

export type BrandingSlot = (typeof BRANDING_SLOTS)[number];
export type BrandingLogos = Partial<Record<BrandingSlot, string | null>>;
export type BrandingData = {
  logos: BrandingLogos;
};

function toSettingKey(slot: BrandingSlot): string {
  return `brand.logo.${slot}`;
}

export async function getBrandingData(): Promise<BrandingData> {
  const keys = BRANDING_SLOTS.map(toSettingKey);
  const settings = await prisma.siteSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const logos: BrandingLogos = {};
  for (const slot of BRANDING_SLOTS) {
    const row = settings.find((item) => item.key === toSettingKey(slot));
    logos[slot] = row?.value ?? null;
  }
  return { logos };
}

export async function setBrandLogoDataUrl(slot: BrandingSlot, dataUrl: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: toSettingKey(slot) },
    update: { value: dataUrl },
    create: { key: toSettingKey(slot), value: dataUrl },
  });
}

export async function clearBrandLogoDataUrl(slot: BrandingSlot): Promise<void> {
  await prisma.siteSetting.deleteMany({
    where: { key: toSettingKey(slot) },
  });
}
