import type { PosMenu } from "@/lib/api-client"
import type { MemberSummary } from "@/lib/members-server"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import type { LangCode } from "@/lib/lang-context"
import type { MemberPortalContentItem } from "@/lib/member-portal-content"
import { memberPortalStoreMatchesQuery } from "@/lib/member-portal-stores"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"
import { mainCategoryMatches } from "@/lib/pos-menu-categories"

// ── Types ──

export type StoreRow = { storeCode: string; displayName: string; mapQuery: string }

export type DeliveryLinks = { grab: string; lineman: string; shopee: string }

export type CartLine = {
  cartKey: string
  menuId: string
  optionId?: string
  optionCode?: string
  optionCodes?: string[]
  code?: string
  name: string
  price: number
  qty: number
}

export type MenuListSection = { key: string; title: string; items: PosMenu[] }

export type MemberOrderRow = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pointUsed: number
  pickupHint: string
  createdAt: string
  awaitingPayment: boolean
  paymentExpired: boolean
  paymentExpiresAt?: string | null
}

export type OrderView = "hub" | "delivery" | "pickup"

export type MemberPortalOrderTabProps = {
  lang: LangCode
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
  member: MemberSummary
  stores: StoreRow[]
  favoriteStoreCodes: string[]
  contentItems?: MemberPortalContentItem[]
  onSelectContentItem?: (item: MemberPortalContentItem) => void
  onBottomNavSuppressChange?: (suppressed: boolean) => void
  /** 결제·적립 후 홈 카드·포인트 잔액 갱신 */
  onSessionRefresh?: () => void | Promise<void>
}

// ── Constants ──

export const DEFAULT_DELIVERY_LINKS: DeliveryLinks = {
  grab: "https://food.grab.com/th/th/",
  lineman: "https://lineman.line.me/",
  shopee: "https://shopeefood.th/",
}

// ── Helper functions ──

export function cartLineKey(menuId: string, optionId?: string): string {
  return `${menuId}:${optionId || ""}`
}

export function scheduleAfterPaint(task: () => void) {
  requestAnimationFrame(() => {
    task()
  })
}

export async function postMemberOrder(body: Record<string, unknown>) {
  const res = await fetch("/api/member-portal/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string; orderNo?: string }>
}

export function orderStoreMatchesQuery(store: StoreRow, query: string): boolean {
  return memberPortalStoreMatchesQuery(
    {
      storeCode: store.storeCode,
      displayName: store.displayName,
      address: "",
      mapQuery: store.mapQuery,
      photoUrl: "",
      sortOrder: 0,
      isActive: true,
    },
    query
  )
}

export function menuMatchesSubcategory(
  menu: PosMenu,
  main: string,
  sub: string
): boolean {
  const subOk =
    main === PROMOTION_MAIN_CATEGORY
      ? promotionSubcategoriesEqual(menu.category, sub)
      : String(menu.category ?? "").trim() === sub
  return mainCategoryMatches(main, menu.categoryMain, menu.code) && subOk
}

export function buildAllMenuSections(menus: PosMenu[], mainTabs: string[]): MenuListSection[] {
  const sections: MenuListSection[] = []
  const used = new Set<string>()
  for (const main of mainTabs) {
    const subs = uniqueSubcategoriesForMainMenu(
      main,
      menus
        .filter((m) => mainCategoryMatches(main, m.categoryMain, m.code))
        .map((m) => String(m.category || "").trim())
        .filter(Boolean)
    )
    for (const sub of subs) {
      const items = menus.filter((m) => menuMatchesSubcategory(m, main, sub))
      if (items.length === 0) continue
      const key = `${main}::${sub}`
      used.add(key)
      sections.push({
        key,
        title: `${main} · ${normalizePromotionSubcategory(sub)}`,
        items,
      })
    }
  }
  const uncategorized = menus.filter((m) => {
    const main = String(m.categoryMain || "").trim()
    const sub = String(m.category || "").trim()
    const key = main && sub ? `${main}::${sub}` : ""
    return !key || !used.has(key)
  })
  if (uncategorized.length > 0) {
    sections.push({ key: "__other", title: "—", items: uncategorized })
  }
  return sections
}
