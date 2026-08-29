/**
 * 마케팅 하위 메뉴(프로모션 세트·협업 할인·작업·성과)에서 고른 캠페인을
 * 메뉴를 옮겨도 유지하기 위한 세션 저장소.
 */
const STORAGE_KEY = "cm_marketing_selected_campaign"

/** URL 쿼리가 있으면 그것을, 없으면 직전에 고른 캠페인을 쓴다. */
export function resolveInitialMarketingCampaignId(params: {
  fromQuery?: string | null
  remembered?: string | null
}): string {
  const q = String(params.fromQuery ?? "").trim()
  if (q) return q
  return String(params.remembered ?? "").trim()
}

export function readSelectedMarketingCampaignId(): string {
  if (typeof window === "undefined") return ""
  try {
    return String(window.sessionStorage.getItem(STORAGE_KEY) || "").trim()
  } catch {
    return ""
  }
}

export function writeSelectedMarketingCampaignId(campaignId: string): void {
  if (typeof window === "undefined") return
  try {
    const v = String(campaignId || "").trim()
    if (v) window.sessionStorage.setItem(STORAGE_KEY, v)
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 사파리 프라이빗 모드 등 — 기억하지 않고 넘어간다 */
  }
}
