import type { TierFamily } from '@/lib/member-portal-tier-visual'

/** 등급별 3D 젬 렌더 (256px WebP, `/public/member-portal/tiers/`) */
export function tierGemAssetUrl(family: TierFamily): string {
  const key = family === 'default' ? 'default' : family
  return `/member-portal/tiers/${key}.webp`
}
