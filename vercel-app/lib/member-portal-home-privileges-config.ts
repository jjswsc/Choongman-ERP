import type { LangCode } from '@/lib/lang-context'

export const MEMBER_PORTAL_HOME_PRIVILEGES_KEY = 'member_portal_home_privileges'

export const MEMBER_PORTAL_HOME_PRIVILEGE_ICONS = ['percent', 'cake', 'crown', 'ticket', 'gift', 'stamp'] as const
export type MemberPortalHomePrivilegeIcon = (typeof MEMBER_PORTAL_HOME_PRIVILEGE_ICONS)[number]

export const MEMBER_PORTAL_HOME_PRIVILEGE_LINK_TABS = ['privilege', 'order', 'location', 'me', 'none'] as const
export type MemberPortalHomePrivilegeLinkTab = (typeof MEMBER_PORTAL_HOME_PRIVILEGE_LINK_TABS)[number]

export type MemberPortalHomePrivilegeLocalized = {
  ko: string
  en: string
  th: string
}

export type MemberPortalHomePrivilegeItem = {
  id: string
  icon: MemberPortalHomePrivilegeIcon
  title: MemberPortalHomePrivilegeLocalized
  subtitle: MemberPortalHomePrivilegeLocalized
  linkTab: MemberPortalHomePrivilegeLinkTab
  enabled: boolean
}

export type MemberPortalHomePrivilegeResolved = {
  id: string
  icon: MemberPortalHomePrivilegeIcon
  title: string
  subtitle: string
  linkTab: MemberPortalHomePrivilegeLinkTab
}

export const DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES: MemberPortalHomePrivilegeItem[] = [
  {
    id: 'points',
    icon: 'percent',
    title: { ko: '포인트', en: 'Points', th: 'พอยท์' },
    subtitle: { ko: '구매 금액 적립', en: 'Earn on every order', th: 'สะสมทุกออเดอร์' },
    linkTab: 'privilege',
    enabled: true,
  },
  {
    id: 'birthday',
    icon: 'cake',
    title: { ko: '생일 혜택', en: 'Birthday treat', th: 'สิทธิวันเกิด' },
    subtitle: { ko: '생일 쿠폰', en: 'Birthday coupon', th: 'คูปองวันเกิด' },
    linkTab: 'privilege',
    enabled: true,
  },
  {
    id: 'tier',
    icon: 'crown',
    title: { ko: '등급 혜택', en: 'Tier benefits', th: 'สิทธิตามระดับ' },
    subtitle: { ko: 'BRONZE ~ DIAMOND', en: 'BRONZE ~ DIAMOND', th: 'BRONZE ~ DIAMOND' },
    linkTab: 'privilege',
    enabled: true,
  },
]

function emptyLocalized(): MemberPortalHomePrivilegeLocalized {
  return { ko: '', en: '', th: '' }
}

function parseLocalized(raw: unknown): MemberPortalHomePrivilegeLocalized {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    ko: String(o.ko || '').trim(),
    en: String(o.en || '').trim(),
    th: String(o.th || '').trim(),
  }
}

function parseIcon(raw: unknown): MemberPortalHomePrivilegeIcon {
  const v = String(raw || '').trim().toLowerCase()
  return (MEMBER_PORTAL_HOME_PRIVILEGE_ICONS as readonly string[]).includes(v)
    ? (v as MemberPortalHomePrivilegeIcon)
    : 'percent'
}

function parseLinkTab(raw: unknown): MemberPortalHomePrivilegeLinkTab {
  const v = String(raw || '').trim().toLowerCase()
  return (MEMBER_PORTAL_HOME_PRIVILEGE_LINK_TABS as readonly string[]).includes(v)
    ? (v as MemberPortalHomePrivilegeLinkTab)
    : 'privilege'
}

function parseItem(raw: unknown, fallback: MemberPortalHomePrivilegeItem): MemberPortalHomePrivilegeItem {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const title = parseLocalized(o.title)
  const subtitle = parseLocalized(o.subtitle)
  return {
    id: String(o.id || fallback.id).trim() || fallback.id,
    icon: parseIcon(o.icon ?? fallback.icon),
    title: {
      ko: title.ko || fallback.title.ko,
      en: title.en || fallback.title.en,
      th: title.th || fallback.title.th,
    },
    subtitle: {
      ko: subtitle.ko || fallback.subtitle.ko,
      en: subtitle.en || fallback.subtitle.en,
      th: subtitle.th || fallback.subtitle.th,
    },
    linkTab: parseLinkTab(o.linkTab ?? fallback.linkTab),
    enabled: o.enabled === false ? false : true,
  }
}

export function parseMemberPortalHomePrivileges(raw: unknown): MemberPortalHomePrivilegeItem[] {
  const list = Array.isArray(raw) ? raw : []
  return DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES.map((fallback, index) =>
    parseItem(list[index], fallback)
  )
}

export function normalizeMemberPortalHomePrivilegesInput(
  raw: unknown
): MemberPortalHomePrivilegeItem[] {
  const list = Array.isArray(raw) ? raw.slice(0, 3) : []
  while (list.length < 3) list.push({})
  return parseMemberPortalHomePrivileges(list)
}

export function resolveMemberPortalHomePrivilegeText(
  localized: MemberPortalHomePrivilegeLocalized,
  lang: LangCode
): string {
  const primary = localized[lang as keyof MemberPortalHomePrivilegeLocalized]
  if (primary) return primary
  return localized.en || localized.ko || localized.th || ''
}

export function resolveMemberPortalHomePrivilegesForLang(
  items: MemberPortalHomePrivilegeItem[],
  lang: LangCode
): MemberPortalHomePrivilegeResolved[] {
  return items
    .filter((item) => item.enabled)
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      title: resolveMemberPortalHomePrivilegeText(item.title, lang),
      subtitle: resolveMemberPortalHomePrivilegeText(item.subtitle, lang),
      linkTab: item.linkTab,
    }))
    .filter((item) => item.title.trim().length > 0)
}

export function memberPortalHomePrivilegeItemToForm(
  item: MemberPortalHomePrivilegeItem
): MemberPortalHomePrivilegeItem {
  return {
    id: item.id,
    icon: item.icon,
    title: { ...item.title },
    subtitle: { ...item.subtitle },
    linkTab: item.linkTab,
    enabled: item.enabled,
  }
}

export function emptyMemberPortalHomePrivilegeFormItem(id: string): MemberPortalHomePrivilegeItem {
  return {
    id,
    icon: 'percent',
    title: emptyLocalized(),
    subtitle: emptyLocalized(),
    linkTab: 'privilege',
    enabled: true,
  }
}
