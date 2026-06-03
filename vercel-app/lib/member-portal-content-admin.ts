import { getBangkokDateTimeString } from '@/lib/bangkok-time'

export type MemberPortalContentAdminItem = {
  id: number
  contentKey: string
  contentType: 'popup' | 'info' | 'store_photo'
  storeCode: string
  title: string
  body: string
  imageUrl: string
  targetTab: string
  isActive: boolean
  sortOrder: number
  startsAt: string
  endsAt: string
  updatedAt: string
  updatedBy: string
}

export type MemberPortalContentAdminTab = 'all' | 'popup' | 'info' | 'promo'

export type MemberPortalContentDisplayStatus = 'live' | 'scheduled' | 'expired' | 'paused'

export type MemberPortalContentAdminCategory = 'promo' | 'popup' | 'info' | 'other'

export type ContentAdminSort = 'sort_order' | 'updated_desc' | 'title' | 'starts_desc'

export type ContentAdminStatusFilter = 'all' | MemberPortalContentDisplayStatus

export type ContentAdminSummary = {
  total: number
  live: number
  scheduled: number
  expired: number
  paused: number
}

export function memberPortalContentPlacementLabel(targetTab: string, contentType: string): string {
  const tab = String(targetTab || '').trim()
  if (tab === 'home_promo') return '홈 · 월별 프로모션'
  if (tab === 'home_feature') return '홈 · 추천 타일'
  if (tab === 'home') return '홈 · 공지'
  if (tab === 'location') return '매장 탭'
  if (contentType === 'popup') return '팝업'
  if (contentType === 'store_photo') return '매장 사진'
  if (tab) return tab
  return '일반'
}

export function formatMemberPortalAdminPeriod(startsAt: string, endsAt: string): string {
  const start = formatAdminDateTime(startsAt)
  const end = formatAdminDateTime(endsAt)
  if (start && end) return `${start} – ${end}`
  if (start) return `${start} ~`
  if (end) return `~ ${end}`
  return '기간 미설정'
}

function formatAdminDateTime(raw: string): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  const normalized = v.includes('T') ? v : v.replace(' ', 'T')
  const d = new Date(normalized.length <= 16 ? `${normalized}:00+07:00` : normalized)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function toDatetimeLocalValue(iso: string): string {
  const v = String(iso || '').trim()
  if (!v) return ''
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!m) return ''
  return `${m[1]}T${m[2]}`
}

export function isHomePromoContent(item: MemberPortalContentAdminItem): boolean {
  return item.contentType === 'info' && item.targetTab === 'home_promo'
}

export function memberPortalContentAdminCategory(item: MemberPortalContentAdminItem): MemberPortalContentAdminCategory {
  if (item.contentType === 'popup') return 'popup'
  if (isHomePromoContent(item)) return 'promo'
  if (item.contentType === 'info') return 'info'
  return 'other'
}

export function memberPortalContentAdminCategoryLabel(category: MemberPortalContentAdminCategory): string {
  if (category === 'promo') return '월별 프로모션'
  if (category === 'popup') return '팝업'
  if (category === 'info') return '정보·공지'
  return '기타'
}

export function resolveMemberPortalContentDisplayStatus(
  item: MemberPortalContentAdminItem,
  nowIso = getBangkokDateTimeString()
): MemberPortalContentDisplayStatus {
  if (!item.isActive) return 'paused'
  if (item.startsAt && item.startsAt > nowIso) return 'scheduled'
  if (item.endsAt && item.endsAt < nowIso) return 'expired'
  return 'live'
}

export function memberPortalContentDisplayStatusLabel(status: MemberPortalContentDisplayStatus): string {
  if (status === 'live') return '노출 중'
  if (status === 'scheduled') return '예정'
  if (status === 'expired') return '종료'
  return '중지'
}

export function filterContentForAdminTab(
  items: MemberPortalContentAdminItem[],
  tab: MemberPortalContentAdminTab
): MemberPortalContentAdminItem[] {
  if (tab === 'all') {
    return items.filter((x) => x.contentType === 'popup' || x.contentType === 'info')
  }
  if (tab === 'popup') return items.filter((x) => x.contentType === 'popup')
  if (tab === 'promo') return items.filter((x) => isHomePromoContent(x))
  return items.filter((x) => x.contentType === 'info' && !isHomePromoContent(x))
}

export function searchContentAdminItems(
  items: MemberPortalContentAdminItem[],
  query: string
): MemberPortalContentAdminItem[] {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    const haystack = [
      item.contentKey,
      item.title,
      item.body,
      item.storeCode,
      item.targetTab,
      memberPortalContentPlacementLabel(item.targetTab, item.contentType),
      memberPortalContentAdminCategoryLabel(memberPortalContentAdminCategory(item)),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function filterContentAdminByStatus(
  items: MemberPortalContentAdminItem[],
  statusFilter: ContentAdminStatusFilter,
  nowIso = getBangkokDateTimeString()
): MemberPortalContentAdminItem[] {
  if (statusFilter === 'all') return items
  return items.filter((item) => resolveMemberPortalContentDisplayStatus(item, nowIso) === statusFilter)
}

export function sortContentAdminItems(
  items: MemberPortalContentAdminItem[],
  sort: ContentAdminSort
): MemberPortalContentAdminItem[] {
  const sorted = [...items]
  if (sort === 'title') {
    return sorted.sort((a, b) => (a.title || a.contentKey).localeCompare(b.title || b.contentKey, 'ko'))
  }
  if (sort === 'starts_desc') {
    return sorted.sort((a, b) => (b.startsAt || '').localeCompare(a.startsAt || ''))
  }
  if (sort === 'updated_desc') {
    return sorted.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }
  return sorted.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
}

export function summarizeContentAdminItems(
  items: MemberPortalContentAdminItem[],
  nowIso = getBangkokDateTimeString()
): ContentAdminSummary {
  const summary: ContentAdminSummary = {
    total: items.length,
    live: 0,
    scheduled: 0,
    expired: 0,
    paused: 0,
  }
  for (const item of items) {
    const status = resolveMemberPortalContentDisplayStatus(item, nowIso)
    summary[status] += 1
  }
  return summary
}

export function countContentForAdminTab(
  items: MemberPortalContentAdminItem[],
  tab: MemberPortalContentAdminTab
): number {
  return filterContentForAdminTab(items, tab).length
}
