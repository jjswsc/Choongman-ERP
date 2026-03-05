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
  | "open"
  | "close"
  | "receipt"
  | "attendance"
  | "expense"
  | "settings"
  | "refresh"

export type TileVariant = "primary" | "accent" | "default"

export type TileGroup = "order" | "other"

export interface POSTile {
  id: string
  type: POSTileType
  label: string
  labelEn?: string
  sublabel?: string
  icon: string
  variant: TileVariant
  size: "large" | "medium" | "small"
  enabled: boolean
  order: number
  group?: TileGroup
}

export const DEFAULT_TILES: POSTile[] = [
  { id: "1", type: "dine-in", label: "매장 주문", labelEn: "Dine In", sublabel: "Dine-in", icon: "utensils", variant: "primary", size: "large", enabled: true, order: 1, group: "order" },
  { id: "2", type: "takeout", label: "포장", labelEn: "Takeout", sublabel: "Takeout", icon: "package", variant: "primary", size: "medium", enabled: true, order: 2, group: "order" },
  { id: "3", type: "delivery", label: "배달", labelEn: "Delivery", sublabel: "Delivery", icon: "truck", variant: "accent", size: "medium", enabled: true, order: 3, group: "order" },
  { id: "4", type: "open", label: "영업시작", labelEn: "Open", sublabel: "Open", icon: "folder-open", variant: "default", size: "medium", enabled: true, order: 4, group: "other" },
  { id: "5", type: "close", label: "영업 마감", labelEn: "Closing", sublabel: "Close", icon: "folder-closed", variant: "default", size: "medium", enabled: true, order: 5, group: "other" },
  { id: "6", type: "receipt", label: "영수증 관리", labelEn: "Receipts", sublabel: "Receipts", icon: "receipt", variant: "default", size: "medium", enabled: true, order: 6, group: "other" },
  { id: "7", type: "expense", label: "경비", labelEn: "Expense", sublabel: "Expense", icon: "wallet", variant: "default", size: "small", enabled: true, order: 7, group: "other" },
  { id: "8", type: "attendance", label: "근태 관리", labelEn: "Attendance", sublabel: "Attendance", icon: "clock", variant: "default", size: "small", enabled: true, order: 8, group: "other" },
  { id: "9", type: "settings", label: "운영 관리", labelEn: "Settings", sublabel: "Settings", icon: "settings", variant: "default", size: "small", enabled: true, order: 9, group: "other" },
  { id: "10", type: "refresh", label: "새로고침", labelEn: "Refresh", sublabel: "Refresh", icon: "refresh-cw", variant: "default", size: "small", enabled: true, order: 10, group: "other" },
]
