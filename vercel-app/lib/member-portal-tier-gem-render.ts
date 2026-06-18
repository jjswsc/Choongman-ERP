export type MemberPortalTierGemRenderMode = 'svg' | 'photo'

export function parseMemberPortalTierGemRenderMode(
  raw: string | null | undefined
): MemberPortalTierGemRenderMode {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'photo' || v === 'webp' || v === '3d') return 'photo'
  return 'svg'
}
