import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import type { LangCode } from '@/lib/lang-context'
import {
  MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB,
  MEMBER_PORTAL_HOME_PROMO_TARGET_TAB,
} from '@/lib/member-portal-content'

export type MemberPortalContentTranslator = (key: string) => string

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

export type MemberPortalContentAdminTab = 'all' | 'popup' | 'info' | 'promo' | 'new_menu'

export type MemberPortalContentDisplayStatus = 'live' | 'scheduled' | 'expired' | 'paused'

export type MemberPortalContentAdminCategory = 'promo' | 'new_menu' | 'popup' | 'info' | 'other'

export type ContentAdminSort = 'sort_order' | 'updated_desc' | 'title' | 'starts_desc'

export type ContentAdminStatusFilter = 'all' | MemberPortalContentDisplayStatus

export type ContentAdminSummary = {
  total: number
  live: number
  scheduled: number
  expired: number
  paused: number
}

function intlLocaleForLang(lang: LangCode): string {
  switch (lang) {
    case 'ko':
      return 'ko-KR'
    case 'en':
      return 'en-US'
    case 'th':
      return 'th-TH-u-ca-gregory'
    case 'mm':
      return 'my-MM'
    case 'la':
      return 'lo-LA'
    case 'kh':
      return 'km-KH'
    case 'vi':
      return 'vi-VN'
    case 'ms':
      return 'ms-MY'
    default:
      return 'en-US'
  }
}

export function memberPortalContentPlacementLabel(
  targetTab: string,
  contentType: string,
  t: MemberPortalContentTranslator
): string {
  const tab = String(targetTab || '').trim()
  if (tab === MEMBER_PORTAL_HOME_PROMO_TARGET_TAB) return t('mpAdmin_placementHomePromo')
  if (tab === MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB) return t('mpAdmin_placementHomeNewMenu')
  if (tab === 'home') return t('mpAdmin_placementHomeNotice')
  if (tab === 'location') return t('mpAdmin_placementLocation')
  if (contentType === 'popup') return t('mpAdmin_placementPopup')
  if (contentType === 'store_photo') return t('mpAdmin_placementStorePhoto')
  if (tab) return tab
  return t('mpAdmin_placementGeneral')
}

export function formatMemberPortalAdminPeriod(
  startsAt: string,
  endsAt: string,
  t: MemberPortalContentTranslator,
  lang: LangCode = 'ko'
): string {
  const start = formatAdminDateTime(startsAt, lang)
  const end = formatAdminDateTime(endsAt, lang)
  if (start && end) return `${start} – ${end}`
  if (start) return `${start} ~`
  if (end) return `~ ${end}`
  return t('mpAdmin_periodUnset')
}

function formatAdminDateTime(raw: string, lang: LangCode = 'ko'): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  const normalized = v.includes('T') ? v : v.replace(' ', 'T')
  const d = new Date(normalized.length <= 16 ? `${normalized}:00+07:00` : normalized)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16)
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatMemberPortalAdminUpdatedAt(raw: string, lang: LangCode = 'ko'): string {
  const v = String(raw || '').trim()
  if (!v) return '—'
  const normalized = v.includes('T') ? v : v.replace(' ', 'T')
  const d = new Date(normalized.length <= 16 ? `${normalized}:00+07:00` : normalized)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16)
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: 'Asia/Bangkok',
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
  return item.contentType === 'info' && item.targetTab === MEMBER_PORTAL_HOME_PROMO_TARGET_TAB
}

export function isHomeNewMenuContent(item: MemberPortalContentAdminItem): boolean {
  return item.contentType === 'info' && item.targetTab === MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB
}

export function memberPortalContentAdminCategory(item: MemberPortalContentAdminItem): MemberPortalContentAdminCategory {
  if (item.contentType === 'popup') return 'popup'
  if (isHomePromoContent(item)) return 'promo'
  if (isHomeNewMenuContent(item)) return 'new_menu'
  if (item.contentType === 'info') return 'info'
  return 'other'
}

export function memberPortalContentAdminCategoryLabel(
  category: MemberPortalContentAdminCategory,
  t: MemberPortalContentTranslator,
  short = false
): string {
  if (category === 'promo') return short ? t('mpAdmin_catPromoShort') : t('mpAdmin_catPromo')
  if (category === 'new_menu') return t('mpAdmin_catNewMenu')
  if (category === 'popup') return t('mpAdmin_catPopup')
  if (category === 'info') return t('mpAdmin_catInfo')
  return t('mpAdmin_catOther')
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

export function memberPortalContentDisplayStatusLabel(
  status: MemberPortalContentDisplayStatus,
  t: MemberPortalContentTranslator
): string {
  if (status === 'live') return t('mpAdmin_statusLive')
  if (status === 'scheduled') return t('mpAdmin_statusScheduled')
  if (status === 'expired') return t('mpAdmin_statusExpired')
  return t('mpAdmin_statusPaused')
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
  if (tab === 'new_menu') return items.filter((x) => isHomeNewMenuContent(x))
  return items.filter((x) => x.contentType === 'info' && !isHomePromoContent(x) && !isHomeNewMenuContent(x))
}

export function searchContentAdminItems(
  items: MemberPortalContentAdminItem[],
  query: string,
  t: MemberPortalContentTranslator
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
      memberPortalContentPlacementLabel(item.targetTab, item.contentType, t),
      memberPortalContentAdminCategoryLabel(memberPortalContentAdminCategory(item), t),
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
