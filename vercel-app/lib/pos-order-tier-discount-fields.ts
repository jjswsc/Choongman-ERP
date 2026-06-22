/** CartPanel·터미널 payload → savePosOrder/updatePosOrder 등급 할인 필드 */
export function posOrderTierDiscountFieldsFromPayload(payload: {
  tierDiscountAmt?: number
  memberTierCode?: string
}): { tierDiscountAmt?: number; memberTierCode?: string } {
  const tierDiscountAmt = Math.max(0, Number(payload.tierDiscountAmt ?? 0))
  const memberTierCode = String(payload.memberTierCode ?? '').trim().toUpperCase()
  return {
    ...(tierDiscountAmt > 0.0001 ? { tierDiscountAmt } : {}),
    ...(memberTierCode ? { memberTierCode } : {}),
  }
}
