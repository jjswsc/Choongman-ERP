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

export function filterContentForAdminTab(
  items: MemberPortalContentAdminItem[],
  tab: 'popup' | 'info' | 'promo'
): MemberPortalContentAdminItem[] {
  if (tab === 'popup') return items.filter((x) => x.contentType === 'popup')
  if (tab === 'promo') return items.filter((x) => isHomePromoContent(x))
  return items.filter((x) => x.contentType === 'info' && !isHomePromoContent(x))
}
