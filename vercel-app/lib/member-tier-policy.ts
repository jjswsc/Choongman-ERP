import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type MemberTierUpgradeBasis = 'amount' | 'points'

export const MEMBER_TIER_UPGRADE_BASIS_KEY = 'member_tier_upgrade_basis'

export const DEFAULT_MEMBER_TIER_UPGRADE_BASIS: MemberTierUpgradeBasis = 'points'

export type MemberTierRowLike = {
  code?: string
  name?: string
  min_amount?: number
  min_points?: number
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

export function parseMemberTierUpgradeBasis(raw: unknown): MemberTierUpgradeBasis {
  const v = toText(raw).toLowerCase()
  if (v === 'amount' || v === 'lifetime_amount' || v === 'spend') return 'amount'
  return 'points'
}

export async function loadMemberTierUpgradeBasis(): Promise<MemberTierUpgradeBasis> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_TIER_UPGRADE_BASIS_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
    if (raw == null) return DEFAULT_MEMBER_TIER_UPGRADE_BASIS
    if (typeof raw === 'string') return parseMemberTierUpgradeBasis(raw)
    return parseMemberTierUpgradeBasis(raw)
  } catch {
    return DEFAULT_MEMBER_TIER_UPGRADE_BASIS
  }
}

export async function saveMemberTierUpgradeBasis(basis: unknown): Promise<MemberTierUpgradeBasis> {
  const next = parseMemberTierUpgradeBasis(basis)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: MEMBER_TIER_UPGRADE_BASIS_KEY,
        value_json: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  return next
}

export function pickTierByQualification(
  tiers: MemberTierRowLike[],
  value: number,
  basis: MemberTierUpgradeBasis
): string {
  let next = 'BRONZE'
  for (const tier of tiers) {
    const threshold =
      basis === 'points' ? Math.max(0, Math.trunc(Number(tier.min_points || 0))) : Number(tier.min_amount || 0)
    if (value >= threshold) next = toText(tier.code).toUpperCase() || next
  }
  return next
}

export function computeTierProgress(params: {
  tiers: MemberTierRowLike[]
  currentTierCode: string
  qualificationValue: number
  basis: MemberTierUpgradeBasis
}): {
  progressPercent: number
  toNext: number
  nextTierCode: string | null
  nextTierName: string | null
  currentMin: number
  nextMin: number
} {
  const sorted = [...params.tiers].sort((a, b) => {
    const aVal =
      params.basis === 'points'
        ? Math.max(0, Math.trunc(Number(a.min_points || 0)))
        : Number(a.min_amount || 0)
    const bVal =
      params.basis === 'points'
        ? Math.max(0, Math.trunc(Number(b.min_points || 0)))
        : Number(b.min_amount || 0)
    return aVal - bVal
  })
  const currentCode = toText(params.currentTierCode).toUpperCase() || 'BRONZE'
  const currentIdx = Math.max(0, sorted.findIndex((t) => toText(t.code).toUpperCase() === currentCode))
  const currentTier = sorted[currentIdx] || sorted[0]
  const nextTier = sorted[currentIdx + 1] || null
  const currentMin =
    params.basis === 'points'
      ? Math.max(0, Math.trunc(Number(currentTier?.min_points || 0)))
      : Number(currentTier?.min_amount || 0)
  const nextMin = nextTier
    ? params.basis === 'points'
      ? Math.max(0, Math.trunc(Number(nextTier.min_points || 0)))
      : Number(nextTier.min_amount || 0)
    : currentMin
  const span = Math.max(1, nextMin - currentMin)
  const progressPercent = nextTier
    ? Math.min(100, Math.max(0, ((params.qualificationValue - currentMin) / span) * 100))
    : 100
  const toNext = nextTier ? Math.max(0, nextMin - params.qualificationValue) : 0
  return {
    progressPercent: Math.round(progressPercent),
    toNext: Math.round(toNext),
    nextTierCode: nextTier ? toText(nextTier.code) : null,
    nextTierName: nextTier ? toText(nextTier.name) || toText(nextTier.code) : null,
    currentMin,
    nextMin,
  }
}
