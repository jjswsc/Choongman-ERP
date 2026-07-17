export type MemberTierDiscountRow = {
  code?: string | null
  discount_rate?: number | null
  name?: string | null
}

export function normalizeMemberTierCodeForDiscount(raw: string): string {
  const code = String(raw || '').trim().toUpperCase()
  if (code === 'VIP' || code === 'PLATINUM') return 'DIAMOND'
  return code || 'BRONZE'
}

export function resolveMemberTierDiscountRate(
  tiers: MemberTierDiscountRow[],
  tierCodeRaw: string
): { tierCode: string; discountRate: number } {
  const tierCode = normalizeMemberTierCodeForDiscount(tierCodeRaw)
  const currentTier =
    tiers.find((t) => normalizeMemberTierCodeForDiscount(String(t.code || '')) === tierCode) ||
    tiers.find((t) => normalizeMemberTierCodeForDiscount(String(t.code || '')) === 'BRONZE') ||
    tiers[0]
  return {
    tierCode,
    discountRate: Math.max(0, Number(currentTier?.discount_rate ?? 0)),
  }
}

/** eligibleSubtotal: 취소·서비스 제외 후 할인 대상 금액 */
export function computeMemberTierDiscountAmount(eligibleSubtotal: number, discountRate: number): number {
  const base = Math.max(0, Number(eligibleSubtotal || 0))
  const rate = Math.max(0, Number(discountRate || 0))
  if (base <= 0 || rate <= 0) return 0
  return Math.min(Math.floor(base * rate), base)
}

export function buildMemberTierDiscountRateMap(
  tiers: MemberTierDiscountRow[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of tiers || []) {
    const code = normalizeMemberTierCodeForDiscount(String(row.code || ''))
    if (!code) continue
    out[code] = Math.max(0, Number(row.discount_rate ?? 0))
  }
  return out
}

export function buildMemberTierNameMap(tiers: MemberTierDiscountRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of tiers || []) {
    const code = normalizeMemberTierCodeForDiscount(String(row.code || ''))
    if (!code) continue
    const name = String(row.name || '').trim()
    out[code] = name || code
  }
  return out
}

export function resolveMemberTierDisplayLabel(
  tierCodeRaw: string,
  names?: Record<string, string>
): string {
  const code = normalizeMemberTierCodeForDiscount(tierCodeRaw)
  return names?.[code] || code
}
