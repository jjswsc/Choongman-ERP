export type MemberPortalContentType = 'popup' | 'info' | 'store_photo'

export type MemberPortalContentRow = {
  id?: number
  content_key?: string
  content_type?: string
  store_code?: string | null
  title?: string | null
  body?: string | null
  image_url?: string | null
  target_tab?: string | null
  is_active?: boolean | null
  sort_order?: number | null
  starts_at?: string | null
  ends_at?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

export type MemberPortalContentItem = {
  id: number
  contentKey: string
  contentType: MemberPortalContentType
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

function asText(v: unknown): string {
  return String(v || '').trim()
}

export function normalizeMemberPortalContentType(raw: unknown): MemberPortalContentType {
  const v = asText(raw)
  if (v === 'popup' || v === 'store_photo') return v
  return 'info'
}

export function mapMemberPortalContentRow(row: MemberPortalContentRow): MemberPortalContentItem {
  return {
    id: Number(row.id || 0),
    contentKey: asText(row.content_key),
    contentType: normalizeMemberPortalContentType(row.content_type),
    storeCode: asText(row.store_code),
    title: asText(row.title),
    body: asText(row.body),
    imageUrl: asText(row.image_url),
    targetTab: asText(row.target_tab),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    startsAt: asText(row.starts_at),
    endsAt: asText(row.ends_at),
    updatedAt: asText(row.updated_at),
    updatedBy: asText(row.updated_by),
  }
}

export function isMemberPortalContentVisibleNow(item: MemberPortalContentItem, nowIso: string): boolean {
  if (!item.isActive) return false
  if (item.startsAt && item.startsAt > nowIso) return false
  if (item.endsAt && item.endsAt < nowIso) return false
  return true
}

function contentDateYmd(raw: string): string {
  const s = asText(raw)
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

export function isMemberPortalHomePromoItem(item: MemberPortalContentItem): boolean {
  return item.contentType === 'info' && item.targetTab === 'home_promo'
}

/** 방콕 달력 월(YYYY-MM)과 콘텐츠 노출 기간이 겹치는지 */
export function memberPortalContentOverlapsBangkokMonth(
  item: MemberPortalContentItem,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): boolean {
  if (!item.isActive || !isMemberPortalHomePromoItem(item)) return false

  const startYmd = contentDateYmd(item.startsAt)
  const endYmd = contentDateYmd(item.endsAt)

  if (!startYmd && !endYmd) {
    return yearMonth === monthRange.startStr.slice(0, 7)
  }

  const periodStart = startYmd || '1970-01-01'
  const periodEnd = endYmd || '2099-12-31'
  return periodStart <= monthRange.endStr && periodEnd >= monthRange.startStr
}

export function listMemberPortalHomePromosForMonth(
  items: MemberPortalContentItem[],
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): MemberPortalContentItem[] {
  return items
    .filter((x) => memberPortalContentOverlapsBangkokMonth(x, yearMonth, monthRange))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return b.updatedAt.localeCompare(a.updatedAt)
    })
}

export function shiftBangkokYearMonth(yearMonth: string, deltaMonths: number): string {
  const ym = /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : '1970-01'
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + deltaMonths
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** 홈 통계 타일 — 신메뉴·프로모션 (target_tab=home_feature 우선) */
export function pickHomeFeatureContent(items: MemberPortalContentItem[]): MemberPortalContentItem | null {
  const sorted = [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  const featured = sorted.find((x) => x.contentType === 'info' && x.targetTab === 'home_feature')
  if (featured) return featured
  const promo = sorted.find(
    (x) => x.contentType === 'info' && x.targetTab === 'home_promo' && (x.title || x.imageUrl)
  )
  if (promo) return promo
  return (
    sorted.find(
      (x) =>
        x.contentType === 'info' &&
        x.imageUrl &&
        (!x.targetTab || x.targetTab === 'home') &&
        (x.title || x.body)
    ) || null
  )
}

