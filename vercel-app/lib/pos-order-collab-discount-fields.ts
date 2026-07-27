/** CartPanel·터미널 payload → savePosOrder/updatePosOrder 협업 할인 필드 */

export function parseMarketingCampaignIdForOrderSave(
  raw: string | number | null | undefined
): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

export function posOrderCollabDiscountFieldsFromPayload(payload: {
  collabDiscountAmt?: number
  collabCampaignId?: string | number | null
  marketingCampaignId?: string | number | null
}): { collabDiscountAmt?: number; collabCampaignId?: number } {
  const collabDiscountAmt = Math.max(0, Number(payload.collabDiscountAmt ?? 0))
  const campaignId = parseMarketingCampaignIdForOrderSave(
    payload.collabCampaignId ?? payload.marketingCampaignId
  )
  return {
    ...(collabDiscountAmt > 0.0001 ? { collabDiscountAmt } : {}),
    ...(campaignId != null ? { collabCampaignId: campaignId } : {}),
  }
}
