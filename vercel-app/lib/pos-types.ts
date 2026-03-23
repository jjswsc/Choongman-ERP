/**
 * POS 도메인 타입 (V0 UI 연동용)
 * - 테이블/플로어플랜, 주문, 매장 공통 타입
 * - API(api-client)의 PosTableItem, PosOrder 등과 변환 시 width/height↔w/h 등 매핑 사용
 */

export interface Table {
  id: string
  name: string
  seats: number
  x: number
  y: number
  width: number
  height: number
  shape: "square" | "rectangle" | "round"
  rotation: number
  isOccupied: boolean
  order?: Order
}

export interface Order {
  id: string
  tableId?: string
  type: "dine-in" | "delivery" | "takeout"
  items: OrderItem[]
  total: number
  status: "pending" | "preparing" | "ready" | "paid" | "completed"
  createdAt: Date
  customerName?: string
  customerPhone?: string
  address?: string
  memo?: string
  /** POS 주문 번호 (예: ST01-20250314-093000-ABCD) */
  orderNo?: string
  /** 홀(dine-in) 손님 수 (POS guest_count) */
  guestCount?: number
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
  options?: string[]
  servedAt?: string | null
  servedBy?: string | null
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

export interface Store {
  id: string
  name: string
  tables: Table[]
  gridCols: number
  gridRows: number
}

export interface FloorPlan {
  storeId: string
  tables: Table[]
  gridCols: number
  gridRows: number
}
