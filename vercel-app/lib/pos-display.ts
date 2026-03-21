/**
 * POS Display Configuration
 * Oll star pos 15dlscl (8G 256G) / 1024x768, 1366x768 최적화
 */
export const POS_BREAKPOINTS = {
  small: 1024,
  medium: 1200,
  large: 1366,
} as const

export const CART_PANEL_WIDTH = {
  small: 260,
  large: 320,
} as const

export const MENU_GRID_COLUMNS = {
  small: 3,
  medium: 4,
  large: 5,
} as const

export const MAIN_GRID_COLUMNS = {
  small: 2,
  medium: 3,
  large: 4,
} as const

export const TOUCH_MIN_SIZE = 44
export const MENU_BUTTON_MIN_HEIGHT = 88

export const PADDING = {
  small: { page: 12, gap: 8, card: 12 },
  large: { page: 16, gap: 12, card: 16 },
} as const

export function getResponsiveValue<T>(
  width: number,
  values: { small: T; medium?: T; large: T }
): T {
  if (width <= POS_BREAKPOINTS.small) return values.small
  if (width < POS_BREAKPOINTS.medium && values.medium !== undefined) return values.medium
  return values.large
}

export const GRID_CLASSES = {
  main: "grid-cols-2 min-[1025px]:grid-cols-3 min-[1200px]:grid-cols-4",
  menu: "grid-cols-3 min-[1025px]:grid-cols-4 min-[1200px]:grid-cols-5",
} as const

export type POSTileType =
  | "dine-in"
  | "takeout"
  | "delivery"
  | "receipt"
  | "attendance"
  | "sales"
  | "members"
  | "business"
  | "cash"
  | "petty-cash"
  | "operations"
  | "open"
  | "close"
  | "cash-deposit"
  | "cash-withdrawal"
  | "cash-drawer"
  | "settings"
  | "refresh"
  | "logout"
  | "preload_offline"

export type TileVariant = "primary" | "accent" | "default"

export type TileGroup = "order" | "other"

export interface POSTile {
  id: string
  type: POSTileType
  label: string
  labelEn?: string
  sublabel?: string
  /** i18n key for label (use t(labelKey) when present) */
  labelKey?: string
  icon: string
  variant: TileVariant
  size: "large" | "medium" | "small"
  enabled: boolean
  order: number
  group?: TileGroup
}

/** 세부 메뉴: 메인 타일 클릭 시 다이얼로그에 표시되는 항목 (type + labelKey) */
export interface POSSubMenuItem {
  type: POSTileType
  labelKey: string
}

export const POS_SUBMENUS: Record<"business" | "operations", POSSubMenuItem[]> = {
  business: [
    { type: "open", labelKey: "posBusinessOpen" },
    { type: "close", labelKey: "posBusinessClose" },
  ],
  operations: [
    { type: "preload_offline", labelKey: "posPreloadOffline" },
    { type: "refresh", labelKey: "posRefresh" },
    { type: "logout", labelKey: "posLogout" },
    { type: "settings", labelKey: "posSettings" },
  ],
}

/** 주문: 매장/포장/배달 → 터미널. 관리: 매출→영수증→근태→영업관리(세부: 영업시작/마감)→시재관리(입금/출금/돈통)→운영관리(새로고침/로그아웃/설정) */
export const DEFAULT_TILES: POSTile[] = [
  { id: "1", type: "dine-in", label: "매장 주문", labelEn: "Dine In", labelKey: "posOrderTypeDineIn", icon: "utensils", variant: "primary", size: "large", enabled: true, order: 1, group: "order" },
  { id: "2", type: "takeout", label: "포장", labelEn: "Takeout", labelKey: "posOrderTypeTakeout", icon: "package", variant: "primary", size: "medium", enabled: true, order: 2, group: "order" },
  { id: "3", type: "delivery", label: "배달", labelEn: "Delivery", labelKey: "posOrderTypeDelivery", icon: "truck", variant: "accent", size: "medium", enabled: true, order: 3, group: "order" },
  { id: "m1", type: "sales", label: "매출 관리", labelEn: "Sales", labelKey: "posSalesManage", icon: "bar-chart", variant: "default", size: "medium", enabled: true, order: 10, group: "other" },
  { id: "m2", type: "receipt", label: "영수증 관리", labelEn: "Receipts", labelKey: "posReceiptManage", icon: "receipt", variant: "default", size: "medium", enabled: true, order: 11, group: "other" },
  { id: "m3", type: "attendance", label: "근태 관리", labelEn: "Attendance", labelKey: "posAttendanceManage", icon: "clock", variant: "default", size: "medium", enabled: true, order: 12, group: "other" },
  { id: "m3b", type: "members", label: "회원 관리", labelEn: "Members", labelKey: "posMemberManage", icon: "users", variant: "default", size: "medium", enabled: true, order: 12.5, group: "other" },
  { id: "m4", type: "business", label: "영업 관리", labelEn: "Business", labelKey: "posBusinessManage", icon: "folder-open", variant: "default", size: "medium", enabled: true, order: 13, group: "other" },
  { id: "m5", type: "cash", label: "시재 관리", labelEn: "Cash", labelKey: "posCashManage", icon: "wallet", variant: "default", size: "medium", enabled: true, order: 14, group: "other" },
  { id: "m5b", type: "petty-cash", label: "패티 캐쉬", labelEn: "Petty Cash", labelKey: "adminPettyCash", icon: "banknote", variant: "default", size: "medium", enabled: true, order: 14.5, group: "other" },
  { id: "m6", type: "operations", label: "운영 관리", labelEn: "Operations", labelKey: "posOperationsManage", icon: "settings", variant: "default", size: "medium", enabled: true, order: 15, group: "other" },
]
