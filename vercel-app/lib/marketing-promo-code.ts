import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** POS/메뉴 코드에 안전한 토큰 (캠페인 번호 기반) */
export function sanitizePromoCodeSegment(raw: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  return t
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
}

export async function getCampaignPromoCodeBase(campaignId: number): Promise<string> {
  const rows = (await supabaseSelectFilter('marketing_campaigns', `id=eq.${campaignId}`, {
    limit: 1,
    select: 'id,campaign_no',
  })) as { id?: number; campaign_no?: string }[] | null
  const fromNo = sanitizePromoCodeSegment(String(rows?.[0]?.campaign_no ?? ''))
  if (fromNo) return fromNo
  return `C${campaignId}`
}

/**
 * 신규 프로모션 세트용 전역 유일 코드. 패턴: {캠페인번호}-S01, S02, …
 * (동일 캠페인에 여러 세트가 있어도 충돌 없음)
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

/** 메뉴 관리 세트 전용: 마케팅 캠페인 없이 저장할 때 전역 유일 코드 (SET-0001 …) */
export async function allocateNextStandaloneSetPromoCode(): Promise<string> {
  const allRows = (await supabaseSelect('pos_promos', {
    select: 'code',
    limit: 20000,
  })) as { code?: string }[] | null
  const used = new Set((allRows || []).map((r) => String(r.code ?? '').trim()).filter(Boolean))
  for (let i = 1; i < 99999; i++) {
    const candidate = `SET-${String(i).padStart(4, '0')}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error('allocateNextStandaloneSetPromoCode: exhausted')
}
