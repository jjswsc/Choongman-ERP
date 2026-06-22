import { normalizeMemberTierCodeForDiscount } from '@/lib/member-tier-discount'

/** POS 결제 `discountReason` — 등급 할인 문구 여부 */
export function isMemberTierDiscountReasonText(reason: string): boolean {
  const r = String(reason ?? '').trim().toLowerCase()
  if (!r) return false
  const needles = [
    'tier discount',
    '등급 할인',
    'ส่วนลดระดับ',
    'member tier',
  ]
  return needles.some((needle) => r.includes(needle))
}

export function formatMemberTierDiscountReason(tierCodeRaw: string, discountRate: number): string {
  const tierCode = normalizeMemberTierCodeForDiscount(tierCodeRaw)
  const pct = (Math.max(0, Number(discountRate || 0)) * 100).toFixed(1)
  return `등급 할인 (${tierCode} ${pct}%)`
}

export function resolveMemberTierDiscountLabel(
  order: { tier_discount_amt?: number | null; member_tier_code?: string | null; discount_reason?: string | null },
  fallback = '등급 할인'
): string {
  const tierCode = normalizeMemberTierCodeForDiscount(String(order.member_tier_code || ''))
  if (tierCode && tierCode !== 'BRONZE') return `${fallback} (${tierCode})`
  if (isMemberTierDiscountReasonText(String(order.discount_reason || ''))) {
    const match = String(order.discount_reason || '').match(/등급 할인\s*\(([^)]+)\)/i)
    if (match?.[1]) return `등급 할인 (${match[1].trim()})`
  }
  return fallback
}
