import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/**
 * campaign_no를 프로모 코드 접두어로 쓸 때 허용 최대 길이.
 * 이보다 길면(또는 비어 있으면) `C{marketing_campaigns.id}`로 짧게 고정해 영수증·목록 가독성을 맞춘다.
 */
export const MAX_CAMPAIGN_PROMO_CODE_BASE_LEN = 12

function normalizePromoCodeToken(raw: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  return t
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** POS/메뉴 코드에 안전한 토큰 (캠페인 번호 기반) */
export function sanitizePromoCodeSegment(raw: string): string {
  const n = normalizePromoCodeToken(raw)
  return n.slice(0, 48)
}

export async function getCampaignPromoCodeBase(campaignId: number): Promise<string> {
  const rows = (await supabaseSelectFilter('marketing_campaigns', `id=eq.${campaignId}`, {
    limit: 1,
    select: 'id,campaign_no',
  })) as { id?: number; campaign_no?: string }[] | null
  const cleaned = normalizePromoCodeToken(String(rows?.[0]?.campaign_no ?? ''))
  if (cleaned.length > 0 && cleaned.length <= MAX_CAMPAIGN_PROMO_CODE_BASE_LEN) return cleaned
  return `C${campaignId}`
}

/**
 * 신규 프로모션 세트용 전역 유일 코드. 패턴: {짧은 접두}-S01, S02, …
 * 접두는 campaign_no(정규화 후 12자 이하일 때만) 또는 C{캠페인 id}.
 */
export async function allocateNextPromoCodeForCampaign(campaignId: number): Promise<string> {
  const base = await getCampaignPromoCodeBase(campaignId)
  const allRows = (await supabaseSelect('pos_promos', {
    select: 'code',
    limit: 20000,
  })) as { code?: string }[] | null
  const used = new Set(
    (allRows || []).map((r) => String(r.code ?? '').trim()).filter(Boolean)
  )
  for (let i = 1; i < 9999; i++) {
    const candidate = `${base}-S${String(i).padStart(2, '0')}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error('allocateNextPromoCodeForCampaign: exhausted')
}

/** 메뉴 관리 세트 전용: 캠페인 없이 저장할 때 전역 유일 코드 (SET-1, SET-2 …) */
export async function allocateNextStandaloneSetPromoCode(): Promise<string> {
  const allRows = (await supabaseSelect('pos_promos', {
    select: 'code',
    limit: 20000,
  })) as { code?: string }[] | null
  const used = new Set((allRows || []).map((r) => String(r.code ?? '').trim()).filter(Boolean))
  for (let i = 1; i < 99999; i++) {
    const candidate = `SET-${i}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error('allocateNextStandaloneSetPromoCode: exhausted')
}
