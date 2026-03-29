import type { MarketingCampaign } from './api-client'
import { marketingCampaignTouchesClosedDateRange } from './marketing-campaign-periods'
import { campaignDesignTouchesRange } from './marketing-campaign-periods'

/** 캠페인 유형 필터 (빈 문자열이면 전체; other는 other: 접두 포함) */
export function campaignMatchesTypeFilter(c: MarketingCampaign, typeFilter: string): boolean {
  const want = typeFilter.trim()
  if (!want) return true
  const t = (c.campaignType ?? '').trim()
  if (want === 'other') return t === 'other' || t.startsWith('other:')
  return t === want
}

/**
 * 목록·허브 지점 필터.
 * - 빈 값: 전체
 * - `_allStoresPlan`: 참여 지점이 비어 있는 캠페인만
 * - 그 외 매장명: 해당 매장이 branches에 있거나, 전체 매장 기획(branches 비어 있음) 포함
 */
export function campaignMatchesBranchListFilter(c: MarketingCampaign, branchKey: string): boolean {
  const key = branchKey.trim()
  if (!key) return true
  const branches = Array.isArray(c.branches)
    ? c.branches.map((x) => String(x).trim()).filter(Boolean)
    : []
  if (key === '_allStoresPlan') return branches.length === 0
  if (branches.length === 0) return true
  return branches.includes(key)
}

/** 캠페인 전체·차수 기간이 조회 구간과 겹치는지 (빈 구간이면 필터 없음) */
export function campaignMatchesPeriodFilter(c: MarketingCampaign, from: string, to: string): boolean {
  const fs = from.trim().slice(0, 10)
  const te = to.trim().slice(0, 10)
  if (!fs && !te) return true
  if (fs && te) {
    const [a, b] = fs <= te ? [fs, te] : [te, fs]
    return marketingCampaignTouchesClosedDateRange(c, a, b)
  }
  const day = fs || te
  return marketingCampaignTouchesClosedDateRange(c, day, day)
}

/** 목록: 협업관리 / 프로모션·광고·인플루언서·홍보물 등 허브 메뉴 연동 여부 */
export type CampaignHubLinkFilterValue =
  | ''
  | 'collab'
  | 'promo_set'
  | 'ads_roas'
  | 'influencer'
  | 'materials'

export function campaignMatchesHubLinkFilter(
  c: MarketingCampaign,
  filter: string,
  sets: {
    promo: Set<string>
    ads: Set<string>
    influencer: Set<string>
    materials: Set<string>
  }
): boolean {
  const f = String(filter ?? '').trim() as CampaignHubLinkFilterValue
  if (!f) return true
  if (f === 'collab') return c.collabManagement === true
  if (f === 'promo_set') return sets.promo.has(c.id)
  if (f === 'ads_roas') return sets.ads.has(c.id)
  if (f === 'influencer') return sets.influencer.has(c.id)
  if (f === 'materials') return sets.materials.has(c.id)
  return true
}

/** 디자인 일정 구간 필터 (빈 구간이면 필터 없음, 한쪽만 입력 시 해당 일) */
export function campaignMatchesDesignPeriodFilter(c: MarketingCampaign, from: string, to: string): boolean {
  const fs = from.trim().slice(0, 10)
  const te = to.trim().slice(0, 10)
  if (!fs && !te) return true
  if (fs && te) {
    const [a, b] = fs <= te ? [fs, te] : [te, fs]
    return campaignDesignTouchesRange(c, a, b)
  }
  const day = fs || te
  return campaignDesignTouchesRange(c, day, day)
}
