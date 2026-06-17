import {
  isBangkokDateTimeAfter,
  isBangkokDateTimeBefore,
} from '@/lib/bangkok-time'

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
  if (item.startsAt && isBangkokDateTimeAfter(item.startsAt, nowIso)) return false
  if (item.endsAt && isBangkokDateTimeBefore(item.endsAt, nowIso)) return false
  return true
}

export function pickMemberPortalHomePopup(items: MemberPortalContentItem[]): MemberPortalContentItem | null {
  const popups = items
    .filter((x) => x.contentType === 'popup' && (!x.targetTab || x.targetTab === 'home'))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  return popups[0] || null
}

function contentDateYmd(raw: string): string {
  const s = asText(raw)
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

export const MEMBER_PORTAL_HOME_PROMO_DINE_TARGET_TAB = 'home_promo_dine'
export const MEMBER_PORTAL_HOME_PROMO_DELIVERY_TARGET_TAB = 'home_promo_delivery'
/** @deprecated 신규는 home_promo_dine — 레거시 home_promo 는 매장과 동일 취급 */
export const MEMBER_PORTAL_HOME_PROMO_TARGET_TAB = 'home_promo'
export const MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB = 'home_feature'

export type MemberPortalHomePromoChannel = 'dine' | 'delivery'

const HOME_PROMO_DINE_TABS = new Set([
  MEMBER_PORTAL_HOME_PROMO_DINE_TARGET_TAB,
  MEMBER_PORTAL_HOME_PROMO_TARGET_TAB,
])

export function normalizeMemberPortalHomePromoChannel(
  targetTab: string
): MemberPortalHomePromoChannel | null {
  const tab = asText(targetTab)
  if (tab === MEMBER_PORTAL_HOME_PROMO_DELIVERY_TARGET_TAB) return 'delivery'
  if (HOME_PROMO_DINE_TABS.has(tab)) return 'dine'
  return null
}

export function memberPortalHomePromoTargetTabForChannel(
  channel: MemberPortalHomePromoChannel
): string {
  return channel === 'delivery'
    ? MEMBER_PORTAL_HOME_PROMO_DELIVERY_TARGET_TAB
    : MEMBER_PORTAL_HOME_PROMO_DINE_TARGET_TAB
}

export function isMemberPortalHomePromoItem(item: MemberPortalContentItem): boolean {
  return item.contentType === 'info' && normalizeMemberPortalHomePromoChannel(item.targetTab) !== null
}

export function isMemberPortalHomePromoItemForChannel(
  item: MemberPortalContentItem,
  channel: MemberPortalHomePromoChannel
): boolean {
  return normalizeMemberPortalHomePromoChannel(item.targetTab) === channel
}

export function isMemberPortalHomeNewMenuItem(item: MemberPortalContentItem): boolean {
  return item.contentType === 'info' && item.targetTab === MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB
}

/** 방콕 달력 월(YYYY-MM)과 콘텐츠 노출 기간이 겹치는지 */
export function memberPortalContentOverlapsBangkokMonthForTarget(
  item: MemberPortalContentItem,
  targetTab: string,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): boolean {
  if (!item.isActive || item.contentType !== 'info' || item.targetTab !== targetTab) return false

  const startYmd = contentDateYmd(item.startsAt)
  const endYmd = contentDateYmd(item.endsAt)

  if (!startYmd && !endYmd) {
    return yearMonth === monthRange.startStr.slice(0, 7)
  }

  const periodStart = startYmd || '1970-01-01'
  const periodEnd = endYmd || '2099-12-31'
  return periodStart <= monthRange.endStr && periodEnd >= monthRange.startStr
}

function memberPortalContentOverlapsBangkokMonthCore(
  item: MemberPortalContentItem,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): boolean {
  const startYmd = contentDateYmd(item.startsAt)
  const endYmd = contentDateYmd(item.endsAt)

  if (!startYmd && !endYmd) {
    return yearMonth === monthRange.startStr.slice(0, 7)
  }

  const periodStart = startYmd || '1970-01-01'
  const periodEnd = endYmd || '2099-12-31'
  return periodStart <= monthRange.endStr && periodEnd >= monthRange.startStr
}

/** 월별 프로모션 — 매장/배달 채널별 기간 겹침 */
export function memberPortalContentOverlapsBangkokMonthForPromo(
  item: MemberPortalContentItem,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string },
  channel?: MemberPortalHomePromoChannel
): boolean {
  if (!item.isActive || item.contentType !== 'info') return false
  const itemChannel = normalizeMemberPortalHomePromoChannel(item.targetTab)
  if (!itemChannel) return false
  if (channel && itemChannel !== channel) return false
  return memberPortalContentOverlapsBangkokMonthCore(item, yearMonth, monthRange)
}

/** @deprecated use memberPortalContentOverlapsBangkokMonthForTarget */
export function memberPortalContentOverlapsBangkokMonth(
  item: MemberPortalContentItem,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): boolean {
  return memberPortalContentOverlapsBangkokMonthForTarget(
    item,
    MEMBER_PORTAL_HOME_PROMO_TARGET_TAB,
    yearMonth,
    monthRange
  )
}

export function listMemberPortalHomeContentForMonth(
  items: MemberPortalContentItem[],
  targetTab: string,
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): MemberPortalContentItem[] {
  return items
    .filter((x) => memberPortalContentOverlapsBangkokMonthForTarget(x, targetTab, yearMonth, monthRange))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return b.updatedAt.localeCompare(a.updatedAt)
    })
}

export function listMemberPortalHomePromosForMonth(
  items: MemberPortalContentItem[],
  yearMonth: string,
  monthRange: { startStr: string; endStr: string },
  channel?: MemberPortalHomePromoChannel
): MemberPortalContentItem[] {
  return items
    .filter((x) => memberPortalContentOverlapsBangkokMonthForPromo(x, yearMonth, monthRange, channel))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return b.updatedAt.localeCompare(a.updatedAt)
    })
}

export function listMemberPortalHomeNewMenusForMonth(
  items: MemberPortalContentItem[],
  yearMonth: string,
  monthRange: { startStr: string; endStr: string }
): MemberPortalContentItem[] {
  return listMemberPortalHomeContentForMonth(items, MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB, yearMonth, monthRange)
}

export function shiftBangkokYearMonth(yearMonth: string, deltaMonths: number): string {
  const ym = /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : '1970-01'
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + deltaMonths
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

