/**
 * POS 도메인 타입 (V0 UI 연동용)
 * - 테이블/플로어플랜, 주문, 매장 공통 타입
 * - API(api-client)의 PosTableItem, PosOrder 등과 변환 시 width/height↔w/h 등 매핑 사용
 */

import type { PosAppliedCouponLine } from '@/lib/pos-coupon-domain'

export interface Table {
  id: string
  name: string
  /** 테이블 배치 층 (1~3) — 다층 매장 홀 주문 매칭용 */
  floor?: 1 | 2 | 3
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
  status: "pending" | "preparing" | "ready" | "paid" | "completed" | "cancelled"
  createdAt: Date
  /** 결제 완료 시각 (pos_orders.paid_at) — Cook 타이머 종료 기준 */
  paidAt?: string
  updatedAt?: string
  /** API `table_name` (배달: 플랫폼/테이블 표시 — 주문 번호·채널 추론에 사용) */
  tableName?: string
  customerName?: string
  customerPhone?: string
  address?: string
  memo?: string
  /** POS 주문 번호 (예: ST01-20250314-093000-ABCD) */
  orderNo?: string
  /** pos_orders.delivery_app_code (배달 탭에서 선택한 앱) */
  deliveryAppCode?: string
  /** 홀(dine-in) 손님 수 (POS guest_count) */
  guestCount?: number
  /** `updatePosOrder` 시 기존 값 유지용 (pos_orders에서 채움) */
  discountAmt?: number
  discountReason?: string
  /** 서비스처리(무료 제공) 금액/사유 — 할인과 분리 저장 */
  serviceAmt?: number
  serviceReason?: string
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCouponLine[]
  pointUsed?: number
  pointEarned?: number
  /** 저장 직후 목록 refetch에 아직 안 잡힐 때 UI 유지(서버 id 확정 건) */
  pendingListSync?: boolean
}

export interface OrderItem {
  id: string
  name: string
  /** `items_json`의 menu_id1 등 — 있으면 표시명을 POS 메뉴 id로 복원 */
  menuId?: string
  /** 반반 등 2메뉴 구성 — items_json menu_id1 / option_id1 */
  menuId1?: string
  optionId1?: string
  optionCode1?: string
  menuId2?: string
  optionId2?: string
  optionCode2?: string
  /** `items_json`의 option_id1 등 — 포장 체크리스트 옵션 매핑용 */
  optionId?: string
  /** `items_json`의 option_code1 등 — 메뉴별 고유 옵션 코드 */
  optionCode?: string
  quantity: number
  price: number
  /** 줄 단위 메모 (주방·items_json) */
  note?: string
  options?: string[]
  servedAt?: string | null
  servedBy?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  promoId?: string
  promoCode?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    quantity: number
    optionName?: string | null
    menuName?: string | null
  }[]
  setChildrenState?: Record<
    string,
    {
      servedAt?: string | null
      servedBy?: string | null
      packedAt?: string | null
      packedBy?: string | null
    }
  >
  /** items_json 줄 단위 (연동 등) */
  deliveryAppCode?: string
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
