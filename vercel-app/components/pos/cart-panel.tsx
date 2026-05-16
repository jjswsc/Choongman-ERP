'use client'

import {
  Fragment,
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  ShoppingCart,
  Trash2,
  Tag,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
  Users,
  Receipt,
  Building2,
  User,
  X,
  Pencil,
  LayoutGrid,
  ArrowLeft,
  Bike,
  Package,
  CircleDollarSign,
  Sparkles,
  Handshake,
} from 'lucide-react'
import type { Store, Table, OrderItem } from '@/lib/pos-types'
import { cn, formatBahtNum } from '@/lib/utils'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { useAuth } from '@/lib/auth-context'
import {
  getPosMenuOptions,
  getMembers,
  getPosCollabCampaigns,
  getPosPaymentMethodItems,
  getPosTaxInvoiceRecipients,
  upsertPosTaxInvoiceRecipient,
  validatePosCoupon,
  type PosMenu,
  type PosMenuOption,
  type PosPaymentMethodItem,
  type PosTaxInvoiceRecipientRow,
} from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { collabDiscountAmountForCart } from '@/lib/pos-collab-discount'
import { encodeTaxInvoiceMemoValue } from '@/lib/pos-tax-invoice'
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  type PosPricingAdjustments,
  type PosPricingResult,
} from '@/lib/pos-pricing'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { getPosCartSessionKey } from '@/lib/pos-cart-session'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { resolvePromoSublineOptionDisplayName } from '@/lib/pos-promo-subline-option-label'
import { usePosTour } from '@/lib/pos-tour'
import { Separator } from '@/components/ui/separator'

export type CartOrderType = 'dine-in' | 'delivery' | 'takeout'
export type CartDeliveryApp = 'grab' | 'lineman' | 'shopee' | (string & {})

/** Grab 녹색 · 라인맨 하늘색 · 쇼피 주황 — 장바구니 칩/뱃지 */
function deliveryAppBrandClasses(app: string | undefined) {
  switch (app) {
    case 'grab':
      return {
        bike: 'text-emerald-700 dark:text-emerald-300',
        chip: cn(
          'border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-950',
          'dark:border-emerald-500/35 dark:from-emerald-950/50 dark:to-emerald-900/60 dark:text-emerald-50',
          'shadow-sm ring-1 ring-emerald-700/10 dark:ring-emerald-400/15'
        ),
        badge:
          'border-emerald-600/35 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-500/40 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-950/70',
      }
    case 'lineman':
      return {
        bike: 'text-sky-600 dark:text-sky-300',
        chip: cn(
          'border-sky-600/40 bg-gradient-to-b from-sky-50 to-sky-100/90 text-sky-950',
          'dark:border-sky-500/35 dark:from-sky-950/50 dark:to-sky-900/60 dark:text-sky-50',
          'shadow-sm ring-1 ring-sky-700/10 dark:ring-sky-400/15'
        ),
        badge:
          'border-sky-600/35 bg-sky-50 text-sky-900 hover:bg-sky-100/90 dark:border-sky-500/40 dark:bg-sky-950/55 dark:text-sky-50 dark:hover:bg-sky-950/70',
      }
    case 'shopee':
      return {
        bike: 'text-orange-600 dark:text-orange-400',
        chip: cn(
          'border-orange-500/45 bg-gradient-to-b from-orange-50 to-orange-100/90 text-orange-950',
          'dark:border-orange-500/40 dark:from-orange-950/50 dark:to-orange-900/55 dark:text-orange-50',
          'shadow-sm ring-1 ring-orange-600/15 dark:ring-orange-400/20'
        ),
        badge:
          'border-orange-500/40 bg-orange-50 text-orange-950 hover:bg-orange-100/90 dark:border-orange-500/40 dark:bg-orange-950/55 dark:text-orange-50 dark:hover:bg-orange-950/70',
      }
    default:
      return {
        bike: 'text-emerald-700 dark:text-emerald-300',
        chip: cn(
          'border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-950',
          'dark:border-emerald-500/35 dark:from-emerald-950/50 dark:to-emerald-900/60 dark:text-emerald-50',
          'shadow-sm ring-1 ring-emerald-700/10 dark:ring-emerald-400/15'
        ),
        badge:
          'border-emerald-600/35 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-500/40 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-950/70',
      }
  }
}

type PaymentMethodTab = 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'
type MenuLineDiscountMode = 'none' | 'discount' | 'service' | 'cancel'

function paymentTabTourTarget(tab: PaymentMethodTab): string {
  switch (tab) {
    case 'cash':
      return 'pos-tour-payment-tab-cash'
    case 'card':
      return 'pos-tour-payment-tab-card'
    case 'qr':
      return 'pos-tour-payment-tab-qr'
    case 'delivery_app':
      return 'pos-tour-payment-tab-delivery-app'
    case 'other':
      return 'pos-tour-payment-tab-other'
    default:
      return 'pos-tour-payment-tab-cash'
  }
}

/** printReceiptNow 첫 인자와 동일 스냅샷 (결제 모달 직전 홀 주문서 자동 인쇄 등) */
export type CartPanelBeforePaymentReceiptPayload = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  items: { id: string; name: string; price: number; qty: number; note?: string; isAddon?: boolean }[]
  subtotal: number
  discountAmt: number
  total: number
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay?: number
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  /** 홀 결제 직전 영수증 스냅샷용 */
  guestCount?: number
}

export type CartPanelPaymentPayload = {
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  /** payment_other 합과 일치하는 세부(저장·검색·결산용) */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
}
export type CartPanelOrderLinePayload = {
  id: string
  name: string
  price: number
  quantity: number
  note?: string
  menuId?: string
  optionId?: string
}
export type CartPanelSplitReceiptPayload = {
  key: string
  label: string
  items: CartPanelOrderLinePayload[]
  subtotal: number
  discountAmt: number
  total: number
  /** 해당 인원 결제 시점에 입력한 수단(분할 영수증 인쇄용) */
  payment?: CartPanelPaymentPayload
}
type TaxSearchField = 'memberNo' | 'phone' | 'name' | 'taxId'
type TaxInvoiceProfile = {
  type: 'individual' | 'corporate'
  name: string
  taxId: string
  branchCode: string
  phone: string
  email: string
  address: string
}

/** 로컬 레지스트리 키: 회원번호 우선, 없으면 taxId_branch (비회원) */
function taxRegistryLocalKey(
  memberNoInput: string,
  linkedMemberNo: string | undefined,
  taxId: string,
  branchNo: string
): string {
  const m = (memberNoInput || linkedMemberNo || '').trim()
  if (m) return m
  return `${taxId}_${branchNo}`
}

function isSyntheticTaxRegistryKey(key: string): boolean {
  return /^\d{13}_\d{5}$/.test(key)
}

function rowToTaxProfile(row: PosTaxInvoiceRecipientRow): TaxInvoiceProfile {
  return {
    type: row.customer_type === 'company' ? 'corporate' : 'individual',
    name: row.name || '',
    taxId: row.tax_id || '',
    branchCode: row.branch_no || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
  }
}

export type CartPanelAddItemPayload = {
  id: string
  name: string
  price: number
  note?: string
  /** 카탈로그 메뉴 id — items_json·주방 라우팅에 전달 */
  menuId?: string
  optionId?: string | null
  optionCode?: string | null
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number; optionName?: string | null }[]
}

export interface CartPanelHandle {
  addItem: (item: CartPanelAddItemPayload) => void
  clearCart: () => void
  openDineInPaymentFromOrder: (payload: {
    tableName: string
    orderNo?: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
  }) => void
  openTakeoutPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
    /** 기존 pos_orders 행 결제 시 부모가 넘기는 id (CartPanel 언마운트·ref 타이밍 대비) */
    existingOrderId?: number | null
  }) => void
  openDeliveryPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
    /** 기존 pos_orders 행 결제 시 부모가 넘기는 id (CartPanel 언마운트·ref 타이밍 대비) */
    existingOrderId?: number | null
  }) => void
}

function normalizeExistingPosOrderId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const id = Math.trunc(n)
  return id > 0 ? id : null
}

interface CartPanelProps {
  stores: Store[]
  currentStoreId: string
  selectedTable?: Table | null
  onStoreChange: (storeId: string) => void
  t?: (k: string) => string
  /** 터미널에서 진입 시 주문 타입 고정 (타입 선택 UI 숨김) */
  lockOrderType?: boolean
  orderType?: CartOrderType
  deliveryApp?: CartDeliveryApp
  /** 배달앱 표시명 (설정 기반, 없으면 code로 매핑) */
  deliveryAppName?: string
  /** 배달 주문 번호 (플랫폼 주문 ID, API 연동 전까지 수동 입력) */
  deliveryOrderNo?: string
  /** 포장 슬롯/회원명 식별값 (예: 포장 1, 홍길동) */
  takeoutLabel?: string
  /**
   * 홀(dine-in) 세션/브리지 키용 테이블 id. 부모의 selectedTableId를 넘기면
   * selectedTable 객체가 늦게 채워져도 키가 안 흔들림 (장바구니 초기화 방지).
   */
  cartSessionTableId?: string | null
  /** 홀(테이블) 주문 시 플로어로 돌아가기 — 터미널에서 메뉴 상단과 중복 방지용 */
  onBackToTableSelection?: () => void
  /** 부모에서 POS 저장 API 처리 중(중복 탭·이중 요청 방지) */
  posBackendActionInFlight?: boolean
  /** 홀 주문 전송 (주방 전달) - 부모에서 savePosOrder 호출 후 pendingOrderId 전달 */
  onOrderSubmit?: (payload: {
    items: {
      id: string
      name: string
      price: number
      quantity: number
      note?: string
      menuId?: string
      optionId?: string
      orderType?: string
      deliveryAppCode?: string
      promoId?: string
      promoCode?: string
      promoItems?: { menuId: string; optionId: string | null; quantity: number; optionName?: string | null }[]
    }[]
    tableName: string
    memo?: string
    discountAmt: number
    discountReason: string
    serviceAmt?: number
    serviceReason?: string
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
    /** 홀 주문 인원 (매출 분석용) */
    guestCount?: number
  }) => void
  /** 포장 주문 결제 완료 시 (기존 주문에 결제 반영, 테이블과 동일 결제 모달) */
  onDeliveryOrderComplete?: (payload: {
    items: CartPanelOrderLinePayload[]
    orderLabel: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    serviceAmt?: number
    serviceReason?: string
    payment?: CartPanelPaymentPayload
    splitReceipts?: CartPanelSplitReceiptPayload[]
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }, existingOrderId?: number) => void
  /** 포장 주문 결제 완료 시 (기존 주문에 결제 반영, 테이블과 동일 결제 모달) */
  onTakeoutOrderComplete?: (payload: {
    items: CartPanelOrderLinePayload[]
    orderLabel: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    serviceAmt?: number
    serviceReason?: string
    payment?: CartPanelPaymentPayload
    splitReceipts?: CartPanelSplitReceiptPayload[]
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }, existingOrderId?: number) => void
  /** 홀 주문 결제 완료 시. existingOrderId 있으면 해당 주문에 결제만 반영(updatePosOrder) */
  onDineInOrderComplete?: (payload: {
    items: CartPanelOrderLinePayload[]
    tableName: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    serviceAmt?: number
    serviceReason?: string
    payment?: CartPanelPaymentPayload
    splitReceipts?: CartPanelSplitReceiptPayload[]
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
    /** 선불: 결제 후 테이블 유지. 후불: 결제 시 테이블 초기화 */
    isPrepaid?: boolean
    guestCount?: number
  }, existingOrderId?: number) => void
  /** 배달/포장 주문 결제 완료 시 */
  onNonDineOrderComplete?: (payload: {
    orderType: 'delivery' | 'takeout'
    orderLabel: string
    items: CartPanelOrderLinePayload[]
    memo?: string
    discountAmt?: number
    discountReason?: string
    serviceAmt?: number
    serviceReason?: string
    payment?: CartPanelPaymentPayload
    splitReceipts?: CartPanelSplitReceiptPayload[]
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }) => void
  /** 주문 버튼으로 이미 전송된 주문 ID (결제 시 해당 주문에 결제 반영용) */
  pendingOrderId?: number | null
  /** 최종 가격 반영 옵션(부가세/서비스비/카드비/기타) */
  pricingAdjustments?: PosPricingAdjustments
  /**
   * 터미널 등: ref 외에 layout effect로 imperative API를 등록해
   * 태블릿에서 forwardRef 타이밍보다 먼저 메뉴 탭이 오는 경우에도 담기가 동작하도록 함.
   */
  onImperativeBridge?: (api: CartPanelHandle | null) => void
  debugOwner?: 'inline-mobile' | 'side-panel' | 'inline-delivery' | 'inline-takeout' | 'unknown'
  /** 터미널: 줄 단위 장바구니만 부모 단일 상태와 동기화 (좁은/넓은 패널 공유) */
  cartItems?: OrderItem[]
  setCartItems?: Dispatch<SetStateAction<OrderItem[]>>
  /** 협업 할인: 장바구니 줄·메뉴 대분류 매칭용 */
  posMenus?: PosMenu[]
  /** 터미널 고객 모니터: 결제 모달이 열려 있을 때 수단별 입력 금액 브로드캐스트 */
  onCustomerDisplayPaymentDraftChange?: (draft: CartPanelPaymentPayload | null) => void
  /** 결제 모달을 열기 직전 (최종 홀 주문서 자동 인쇄 등) */
  onBeforeOpenPayment?: (payload: CartPanelBeforePaymentReceiptPayload) => void | Promise<void>
  /** 터미널 투어: 결제 Dialog 열림 (데모) */
  onPaymentModalOpenChange?: (open: boolean) => void
  /** 터미널 투어: 결제 모달의 현재 탭 */
  onPaymentTabChange?: (tab: PaymentMethodTab) => void
  /** 터미널 투어: 세금계산서 토글 상태 */
  onTaxInvoiceToggleChange?: (enabled: boolean) => void
  /** 터미널 투어: 결제 완료 버튼이 실제 실행됨 */
  onPaymentComplete?: () => void
  /** 터미널 데모: 홀에서 손님 수가 0이면 지정 값으로(투어 주문 버튼) */
  posDineInDemoDefaultGuestCount?: number
  /** 터미널 투어 등: 홀 손님 수 변경 시 부모 동기 */
  onGuestCountChange?: (guestCount: number) => void
}

type CartItem = OrderItem

const CART_ITEMS_CACHE = new Map<string, CartItem[]>()
const cloneCartItems = (items: CartItem[]): CartItem[] =>
  items.map((i) => ({
    ...i,
    promoItems: i.promoItems ? i.promoItems.map((p) => ({ ...p })) : undefined,
  }))

/** POS 결제 모달 — 금액 요약(소계·할인·수수료·합계) */
function PosPaymentModalAmountCard({
  subtotal,
  discount,
  pricing,
  total,
  totalLabelKey,
  cartItems,
  lineDiscountModeByItemId,
  onLineDiscountModeChange,
  onDiscountLineSelected,
  t,
}: {
  subtotal: number
  discount: number
  pricing: PosPricingResult
  total: number
  /** i18n 키 (없으면 posPaymentTotalLabel) */
  totalLabelKey?: string
  cartItems?: CartItem[]
  lineDiscountModeByItemId?: Record<string, MenuLineDiscountMode>
  onLineDiscountModeChange?: (itemId: string, nextMode: MenuLineDiscountMode) => void
  onDiscountLineSelected?: () => void
  t: (key: string) => string
}) {
  const [showLineDiscountPicker, setShowLineDiscountPicker] = useState(false)
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const totalLineLabel = totalLabelKey ? t(totalLabelKey) : (t('posPaymentTotalLabel') || '결제 금액')
  const hasLineDiscountPicker = !!onLineDiscountModeChange && !!cartItems?.length
  const subtotalDisplay = resolveReceiptSubtotalPrintAmount({
    subtotal,
    vatFeeMode: pricing.vatFeeMode,
    receiptExclusiveSubtotalDisplay: pricing.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: pricing.baseTotal,
  })
  const vatDisplay = resolveReceiptVatPrintAmount({
    vatFeeAmt: pricing.vatFeeAmt,
    receiptVatDisplayAmt: pricing.receiptVatDisplayAmt,
  })
  const feeRows: { show: boolean; label: ReactNode; value: string; valueClass?: string }[] = [
    {
      show: vatDisplay > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posVatLabel') || '부가세'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.vatFeeMode === 'separate' ? '+' : ''}${formatBahtNum(vatDisplay)} ฿`,
    },
    {
      show: pricing.serviceFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posServiceFee') || '서비스비'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.serviceFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.serviceFeeAmt)} ฿`,
    },
    {
      show: pricing.cardFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posCardFee') || '카드비'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.cardFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.cardFeeAmt)} ฿`,
    },
    {
      show: pricing.otherFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posOtherFee') || '기타'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.otherFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.otherFeeAmt)} ฿`,
    },
  ]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-muted/45 via-muted/25 to-background/95 p-3 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="flex gap-2.5">
        <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner">
            <Receipt className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.25} />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-0">
          <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-1 text-sm leading-tight">
            <span className="text-muted-foreground">{t('posSubtotal')}</span>
            <span className="shrink-0 tabular-nums font-semibold text-foreground">{formatBahtNum(subtotalDisplay)} ฿</span>
          </div>
          {hasLineDiscountPicker && (
            <Collapsible open={showLineDiscountPicker} onOpenChange={setShowLineDiscountPicker}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-8 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span className="mr-1">{tr('posMenuLineDiscountToggle', '메뉴별 할인/서비스/취소')}</span>
                  {showLineDiscountPicker ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {cartItems?.map((item) => {
                    const mode = lineDiscountModeByItemId?.[item.id] ?? 'none'
                    const lineTotal = Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
                    return (
                      <div key={item.id} className="rounded-xl border border-border/60 bg-background/70 p-2">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('qty') || '수량'} {formatBahtNum(item.quantity)} · {formatBahtNum(lineTotal)} ฿
                            </p>
                          </div>
                          {mode !== 'none' ? (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {mode === 'service'
                                ? tr('posServiceHandled', '서비스처리')
                                : mode === 'cancel'
                                  ? tr('posLineCancelledShort', '취소처리')
                                  : tr('posDiscountApplied', '할인적용')}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'discount' ? 'default' : 'outline'}
                            className="h-7 rounded-lg text-[11px]"
                            onClick={() => {
                              const nextMode: MenuLineDiscountMode = mode === 'discount' ? 'none' : 'discount'
                              onLineDiscountModeChange?.(item.id, nextMode)
                              if (nextMode === 'discount') onDiscountLineSelected?.()
                            }}
                          >
                            {tr('posDiscountApplied', '할인적용')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'service' ? 'default' : 'outline'}
                            className={cn(
                              'h-7 rounded-lg text-[11px]',
                              mode === 'service'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                            )}
                            onClick={() => onLineDiscountModeChange?.(item.id, mode === 'service' ? 'none' : 'service')}
                          >
                            {tr('posServiceHandled', '서비스처리')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'cancel' ? 'destructive' : 'outline'}
                            className={cn(
                              'h-7 rounded-lg text-[11px]',
                              mode === 'cancel'
                                ? ''
                                : 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30'
                            )}
                            onClick={() => onLineDiscountModeChange?.(item.id, mode === 'cancel' ? 'none' : 'cancel')}
                          >
                            {tr('posLineCancelledShort', '취소처리')}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {discount > 0 && (
            <div className="flex items-baseline justify-between gap-2 py-1 text-[13px] leading-tight">
              <span className="flex min-w-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-3 w-3 shrink-0 opacity-80" />
                {t('posDiscount')}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                −{formatBahtNum(discount)} ฿
              </span>
            </div>
          )}
          {feeRows.some((r) => r.show) && (
            <>
              <Separator className="my-1 bg-border/60" />
              <div className="space-y-0">
                {feeRows
                  .filter((r) => r.show)
                  .map((row, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 py-1 text-[12px] leading-tight">
                      <div className="min-w-0">{row.label}</div>
                      <span className="shrink-0 tabular-nums text-foreground/90">{row.value}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
          <Separator className="my-1.5 bg-border/70" />
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-primary/8 px-2 py-2 dark:bg-primary/15">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
              <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-primary" />
              {totalLineLabel}
            </span>
            <span className="shrink-0 text-base font-bold tabular-nums tracking-tight text-primary">{formatBahtNum(total)} ฿</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const CartPanel = forwardRef<CartPanelHandle, CartPanelProps>(function CartPanel({
  stores: _stores,
  currentStoreId,
  selectedTable,
  onStoreChange: _onStoreChange,
  t: tProp,
  lockOrderType,
  orderType: orderTypeProp,
  deliveryApp: deliveryAppProp,
  deliveryAppName: deliveryAppNameProp,
  deliveryOrderNo: deliveryOrderNoProp,
  takeoutLabel: takeoutLabelProp,
  cartSessionTableId: cartSessionTableIdProp,
  onBackToTableSelection,
  posBackendActionInFlight = false,
  onOrderSubmit,
  onTakeoutOrderComplete,
  onDeliveryOrderComplete,
  onDineInOrderComplete,
  onNonDineOrderComplete,
  pendingOrderId,
  pricingAdjustments,
  onImperativeBridge,
  debugOwner = 'unknown',
  cartItems: cartItemsProp,
  setCartItems: setCartItemsProp,
  posMenus,
  onCustomerDisplayPaymentDraftChange,
  onBeforeOpenPayment,
  onPaymentModalOpenChange,
  onPaymentTabChange,
  onTaxInvoiceToggleChange,
  onPaymentComplete,
  posDineInDemoDefaultGuestCount,
  onGuestCountChange,
}, ref) {
  const { currentStep, showTourStepOverlay } = usePosTour()
  const { auth } = useAuth()
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const scrollIntoViewOnFocus = useScrollIntoViewOnFocus()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const trMenuLine = (s: string) => translatePosMenuLineForReceipt(s, t)

  const mapCartItemToOrderPayload = (i: CartItem, quantityOverride?: number) => {
    const orderTypeNorm = orderType === 'dine-in' ? 'dine_in' : orderType
    const lineNote = String(i.note ?? '').trim()
    const quantity =
      quantityOverride != null
        ? resolveCartLineQuantityForSave({ quantity: quantityOverride })
        : resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown })
    const menuIdLine = String(i.menuId ?? '').trim()
    const optionIdLine = String(i.optionId ?? '').trim()
    const optionCodeLine = String(i.optionCode ?? '').trim()
    return {
      id: i.id,
      name: i.name,
      price: i.price,
      quantity,
      orderType: orderTypeNorm,
      ...(lineNote ? { note: lineNote } : {}),
      ...(menuIdLine ? { menuId: menuIdLine } : {}),
      ...(optionIdLine ? { optionId: optionIdLine } : {}),
      ...(optionCodeLine ? { optionCode: optionCodeLine } : {}),
      ...(orderType === 'delivery' && deliveryAppProp ? { deliveryAppCode: String(deliveryAppProp) } : {}),
      ...(i.promoId
        ? {
            promoId: i.promoId,
            ...(i.promoCode ? { promoCode: i.promoCode } : {}),
            ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
          }
        : {}),
    }
  }

  const [orderTypeInternal, setOrderTypeInternal] = useState<CartOrderType>('dine-in')
  const orderType = lockOrderType && orderTypeProp != null ? orderTypeProp : orderTypeInternal
  const canSubmit =
    !lockOrderType ||
    (orderType === 'dine-in'
      ? !!selectedTable
      : orderType === 'delivery'
        ? !!deliveryAppProp && !!String(deliveryOrderNoProp || '').trim()
        : true)
  const tableIdForCartSessionKey =
    orderType === 'dine-in'
      ? (cartSessionTableIdProp ?? selectedTable?.id ?? '')
      : (selectedTable?.id ?? '')
  const cartItemsCacheKey = getPosCartSessionKey({
    currentStoreId,
    orderType,
    selectedTableId: tableIdForCartSessionKey,
    deliveryApp: deliveryAppProp,
    deliveryOrderNo: deliveryOrderNoProp,
    takeoutLabel: takeoutLabelProp,
  })
  const isCartControlled = cartItemsProp !== undefined && setCartItemsProp !== undefined
  /** 터미널: 배달/포장 상세 패널 → 카트 전환 시 `pendingOrderId` prop 한 틱 늦음·effect 미실행 대비 */
  const checkoutExistingPosOrderIdRef = useRef<number | null>(null)
  /** 기존 pos_orders 행에 매장 결제 등 → 전체 결제 UI(현금/카드). 신규 배달(플랫폼 결제)만 단순 안내 다이얼로그 */
  const [isExistingOrderCheckout, setIsExistingOrderCheckout] = useState(false)
  const [internalCartItems, setInternalCartItems] = useState<CartItem[]>(() => {
    if (cartItemsProp !== undefined && setCartItemsProp !== undefined) return []
    return cloneCartItems(CART_ITEMS_CACHE.get(cartItemsCacheKey) ?? [])
  })
  const cartItems = isCartControlled ? cartItemsProp! : internalCartItems
  const setCartItems = isCartControlled ? setCartItemsProp! : setInternalCartItems
  const [takeoutSlot, setTakeoutSlot] = useState<string>('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberKeyword, setMemberKeyword] = useState('')
  const [memberOptions, setMemberOptions] = useState<{ value: string; label: string }[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, { id: number; memberNo: string; name: string; phone: string; email: string }>>({})
  const [, setRecentMemberIds] = useState<string[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [guestCount, setGuestCount] = useState(0)
  const [guestDirectOpen, setGuestDirectOpen] = useState(false)
  const [guestDirectValue, setGuestDirectValue] = useState('10')
  const [customerMemo, setCustomerMemo] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponAppliedCode, setCouponAppliedCode] = useState('')
  const [couponAppliedAmt, setCouponAppliedAmt] = useState(0)
  const [pointUsed, setPointUsed] = useState('0')
  const [couponMessage, setCouponMessage] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [lineDiscountModeByItemId, setLineDiscountModeByItemId] = useState<Record<string, MenuLineDiscountMode>>({})
  const manualDiscountCardRef = useRef<HTMLDivElement | null>(null)
  const paymentMethodSectionRef = useRef<HTMLDivElement | null>(null)
  const manualDiscountFlashTimerRef = useRef<number | null>(null)
  const [manualDiscountFlash, setManualDiscountFlash] = useState(false)
  const [collabOptions, setCollabOptions] = useState<
    { id: string; topic: string; campaignNo?: string; collabDetail: MarketingCollabDetail }[]
  >([])
  const [appliedCollabId, setAppliedCollabId] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  /** 결제 확정 직후: 현금 거스름 안내(확인 버튼으로만 닫음) */
  const [postPaymentCashChangeBaht, setPostPaymentCashChangeBaht] = useState<number | null>(null)
  useEffect(() => {
    onPaymentModalOpenChange?.(showPaymentModal)
  }, [showPaymentModal, onPaymentModalOpenChange])
  const [activePaymentTab, setActivePaymentTab] = useState<PaymentMethodTab>('cash')
  const [payCash, setPayCash] = useState('')
  const [cashTendered, setCashTendered] = useState('')
  const [payCard, setPayCard] = useState('')
  const [payTrueMoney, setPayTrueMoney] = useState('')
  const [payWeChat, setPayWeChat] = useState('')
  const [payAlipay, setPayAlipay] = useState('')
  const [payPromptPay, setPayPromptPay] = useState('')
  const [payLinePay, setPayLinePay] = useState('')
  const [payShopeePay, setPayShopeePay] = useState('')
  const [payOther, setPayOther] = useState('')
  const [payDeliveryApp, setPayDeliveryApp] = useState('')
  const [deliveryPaymentChannel, setDeliveryPaymentChannel] = useState<'grab' | 'lineman' | 'shopee'>('grab')
  const [showOtherPayments, setShowOtherPayments] = useState(false)
  /** 관리자 POS 설정 > 결제 관리(pos_payment_method_items)의 qr·other 분류 — POS 기타 세부와 연동 */
  const [posPaymentMethodItems, setPosPaymentMethodItems] = useState<PosPaymentMethodItem[]>([])
  const [posMenuOptions, setPosMenuOptions] = useState<PosMenuOption[]>([])
  const [payAdminLineAmounts, setPayAdminLineAmounts] = useState<Record<string, string>>({})
  const [needTaxInvoice, setNeedTaxInvoice] = useState(false)
  const [showTaxInvoiceDetails, setShowTaxInvoiceDetails] = useState(true)
  const [invoiceCustomerType, setInvoiceCustomerType] = useState<'person' | 'company'>('person')
  const [taxSearchField, setTaxSearchField] = useState<TaxSearchField>('memberNo')
  const [taxSearchKeyword, setTaxSearchKeyword] = useState('')
  const [taxSearchMessage, setTaxSearchMessage] = useState('')
  const [taxMemberNo, setTaxMemberNo] = useState('')
  const [taxMemberRegistry, setTaxMemberRegistry] = useState<Record<string, TaxInvoiceProfile>>({})
  const [taxName, setTaxName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [taxBranchNo, setTaxBranchNo] = useState('')
  const [taxPhone, setTaxPhone] = useState('')
  const [taxEmail, setTaxEmail] = useState('')
  const [taxAddress, setTaxAddress] = useState('')
  const [splitCount, setSplitCount] = useState(2)
  const [splitPaidSteps, setSplitPaidSteps] = useState(0)
  const [showSplit, setShowSplit] = useState(false)
  const [splitMode, setSplitMode] = useState<'amount' | 'menu'>('amount')
  const [menuSplitTargetPerson, setMenuSplitTargetPerson] = useState(0)
  const [menuSplitAssigned, setMenuSplitAssigned] = useState<Record<string, number[]>>({})
  const [menuSplitPaidByPerson, setMenuSplitPaidByPerson] = useState<number[]>([])
  const menuSplitAutoAppliedKeyRef = useRef<string>('')
  const splitPaymentsByPersonRef = useRef<(CartPanelPaymentPayload | undefined)[]>([])
  const splitDraftAssignedRef = useRef<{ target: MoveTarget; amount: number; personIdx: number | null } | null>(null)
  const [menuNameTooltipOpen, setMenuNameTooltipOpen] = useState<string | null>(null)
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null)
  const [editingCustomerMemo, setEditingCustomerMemo] = useState(false)
  const [paymentTableNameOverride, setPaymentTableNameOverride] = useState<string | null>(null)
  const [isPrepaid, setIsPrepaid] = useState(false)
  const prevSelectedTableIdRef = useRef<string | null>(selectedTable?.id ?? null)
  const instanceIdRef = useRef(`cart-${Math.random().toString(36).slice(2, 10)}`)
  const cartItemsRef = useRef<CartItem[]>(cartItems)
  cartItemsRef.current = cartItems

  useEffect(() => {
    if (!showPaymentModal) return
    onPaymentTabChange?.(activePaymentTab)
  }, [showPaymentModal, activePaymentTab, onPaymentTabChange])

  useEffect(() => {
    if (!showPaymentModal) return
    onTaxInvoiceToggleChange?.(needTaxInvoice)
  }, [showPaymentModal, needTaxInvoice, onTaxInvoiceToggleChange])

  const adminQrLines = useMemo(
    () =>
      posPaymentMethodItems
        .filter((i) => i.category === 'qr' && !i.hidden)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [posPaymentMethodItems]
  )
  const adminOtherLines = useMemo(
    () =>
      posPaymentMethodItems
        .filter((i) => i.category === 'other' && !i.hidden)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [posPaymentMethodItems]
  )
  const adminPaymentLines = useMemo(() => [...adminQrLines, ...adminOtherLines], [adminQrLines, adminOtherLines])
  const useAdminPaymentLines = adminPaymentLines.length > 0
  const adminPaymentLinesRef = useRef(adminPaymentLines)
  adminPaymentLinesRef.current = adminPaymentLines

  useEffect(() => {
    if (!currentStoreId?.trim()) {
      setPosPaymentMethodItems([])
      return
    }
    getPosPaymentMethodItems({ storeCode: currentStoreId })
      .then((list) => setPosPaymentMethodItems(Array.isArray(list) ? list : []))
      .catch(() => setPosPaymentMethodItems([]))
  }, [currentStoreId])

  useEffect(() => {
    if (!showPaymentModal || !currentStoreId?.trim()) return
    let cancelled = false
    getPosCollabCampaigns({ storeCode: currentStoreId })
      .then((rows) => {
        if (cancelled) return
        setCollabOptions(rows)
        setAppliedCollabId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null))
      })
      .catch(() => {
        if (!cancelled) setCollabOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [showPaymentModal, currentStoreId])

  useEffect(() => {
    setPayAdminLineAmounts((prev) => {
      const next: Record<string, string> = {}
      for (const i of adminPaymentLines) next[i.id] = prev[i.id] ?? '0'
      return next
    })
  }, [adminPaymentLines])

  /** 비제어 모드: 패널 전환 시 캐시에 즉시 반영 (제어 모드는 부모가 진실) */
  useLayoutEffect(() => {
    if (isCartControlled) return
    const key = cartItemsCacheKey
    return () => {
      CART_ITEMS_CACHE.set(key, cloneCartItems(cartItemsRef.current))
    }
  }, [cartItemsCacheKey, isCartControlled])

  useEffect(() => {
    if (isCartControlled) return
    if (orderType !== 'dine-in') {
      setCartItems(cloneCartItems(CART_ITEMS_CACHE.get(cartItemsCacheKey) ?? []))
      return
    }
    const fromNew = cloneCartItems(CART_ITEMS_CACHE.get(cartItemsCacheKey) ?? [])
    if (fromNew.length > 0) {
      setCartItems(fromNew)
      return
    }
    const dineInWithTakeoutTail = `${currentStoreId}|dine-in|${tableIdForCartSessionKey}|||${takeoutLabelProp ?? ''}`
    const fromTakeoutTail = cloneCartItems(CART_ITEMS_CACHE.get(dineInWithTakeoutTail) ?? [])
    if (fromTakeoutTail.length > 0) {
      setCartItems(fromTakeoutTail)
      return
    }
    const legacyKey = `${currentStoreId}|dine-in|${tableIdForCartSessionKey}|${deliveryAppProp ?? ''}|${deliveryOrderNoProp ?? ''}|${takeoutLabelProp ?? ''}`
    if (legacyKey === cartItemsCacheKey) {
      setCartItems(fromNew)
      return
    }
    setCartItems(cloneCartItems(CART_ITEMS_CACHE.get(legacyKey) ?? []))
  }, [
    cartItemsCacheKey,
    orderType,
    currentStoreId,
    tableIdForCartSessionKey,
    deliveryAppProp,
    deliveryOrderNoProp,
    takeoutLabelProp,
    isCartControlled,
  ])

  useEffect(() => {
    if (isCartControlled) return
    CART_ITEMS_CACHE.set(cartItemsCacheKey, cloneCartItems(cartItems))
  }, [cartItemsCacheKey, cartItems, isCartControlled])

  useEffect(() => {
    if (showPaymentModal && orderType === 'dine-in') {
      setIsPrepaid(!pendingOrderId)
    }
  }, [showPaymentModal, orderType, pendingOrderId])

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  useEffect(() => {
    setLineDiscountModeByItemId((prev) => {
      const validIds = new Set(cartItems.map((item) => item.id))
      let changed = false
      const next: Record<string, MenuLineDiscountMode> = {}
      for (const [id, mode] of Object.entries(prev)) {
        if (validIds.has(id)) next[id] = mode
        else changed = true
      }
      return changed ? next : prev
    })
  }, [cartItems])
  const setLineDiscountModeForItem = useCallback((itemId: string, nextMode: MenuLineDiscountMode) => {
    setLineDiscountModeByItemId((prev) => {
      const current = prev[itemId] ?? 'none'
      if (current === nextMode) return prev
      if (nextMode === 'none') {
        if (!(itemId in prev)) return prev
        const { [itemId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: nextMode }
    })
  }, [])
  const serviceDiscountAmt = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if ((lineDiscountModeByItemId[item.id] ?? 'none') !== 'service') return sum
      return sum + Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
    }, 0)
  }, [cartItems, lineDiscountModeByItemId])
  const cancelledLineAmt = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if ((lineDiscountModeByItemId[item.id] ?? 'none') !== 'cancel') return sum
      return sum + Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
    }, 0)
  }, [cartItems, lineDiscountModeByItemId])
  const selectedDiscountSubtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if ((lineDiscountModeByItemId[item.id] ?? 'none') !== 'discount') return sum
      return sum + Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
    }, 0)
  }, [cartItems, lineDiscountModeByItemId])
  const selectedDiscountLineCount = useMemo(() => {
    return cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') === 'discount').length
  }, [cartItems, lineDiscountModeByItemId])
  const selectedServiceLineCount = useMemo(() => {
    return cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') === 'service').length
  }, [cartItems, lineDiscountModeByItemId])
  const selectedCancelledLineCount = useMemo(() => {
    return cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') === 'cancel').length
  }, [cartItems, lineDiscountModeByItemId])
  const hasSelectedDiscountScope = selectedDiscountLineCount > 0
  const subtotalAfterCancel = Math.max(0, subtotal - cancelledLineAmt)
  const clearLineDiscountSelection = useCallback(() => {
    setLineDiscountModeByItemId((prev) => {
      let changed = false
      const next: Record<string, MenuLineDiscountMode> = {}
      for (const [id, mode] of Object.entries(prev)) {
        if (mode === 'discount') {
          changed = true
          continue
        }
        next[id] = mode
      }
      return changed ? next : prev
    })
  }, [])
  const discountScopeSubtotal = hasSelectedDiscountScope
    ? selectedDiscountSubtotal
    : Math.max(0, subtotalAfterCancel - serviceDiscountAmt)
  const menuByIdForCollab = useMemo(() => {
    if (!posMenus?.length) return new Map<string, PosMenu>()
    return new Map(posMenus.map((m) => [String(m.id), m]))
  }, [posMenus])
  const optionById = useMemo(() => {
    if (!posMenuOptions.length) return new Map<string, PosMenuOption>()
    return new Map(posMenuOptions.map((o) => [String(o.id), o]))
  }, [posMenuOptions])
  const optionByCode = useMemo(() => {
    if (!posMenuOptions.length) return new Map<string, PosMenuOption>()
    const map = new Map<string, PosMenuOption>()
    for (const opt of posMenuOptions) {
      const code = String(opt.optionCode ?? '').trim()
      if (!code) continue
      map.set(code, opt)
    }
    return map
  }, [posMenuOptions])
  const optionsByMenuIdForOrder = useMemo(() => {
    const sellKey: keyof PosMenuOption =
      orderType === 'dine-in' ? 'sellHall' : orderType === 'delivery' ? 'sellDelivery' : 'sellPackaging'
    const m = new Map<string, PosMenuOption[]>()
    for (const o of posMenuOptions) {
      if (o[sellKey] === false) continue
      const mid = String(o.menuId)
      if (!m.has(mid)) m.set(mid, [])
      m.get(mid)!.push(o)
    }
    return m
  }, [posMenuOptions, orderType])
  const appliedCollab = useMemo(
    () => collabOptions.find((c) => c.id === appliedCollabId) ?? null,
    [collabOptions, appliedCollabId]
  )
  const collabDiscountAmt = useMemo(() => {
    if (!appliedCollab || menuByIdForCollab.size === 0) return 0
    const collabScopeItems = hasSelectedDiscountScope
      ? cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') === 'discount')
      : cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') !== 'cancel')
    if (!collabScopeItems.length) return 0
    return collabDiscountAmountForCart(collabScopeItems, menuByIdForCollab, appliedCollab.collabDetail)
  }, [appliedCollab, cartItems, hasSelectedDiscountScope, lineDiscountModeByItemId, menuByIdForCollab])
  const manualDiscountInputAmt =
    discountType === 'percent' ? Math.floor((discountScopeSubtotal * discountValue) / 100) : discountValue
  const manualDiscountAmt = Math.min(Math.max(0, manualDiscountInputAmt), Math.max(0, subtotalAfterCancel - serviceDiscountAmt))
  const baseDiscount = cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt
  const discount = Math.min(subtotal, baseDiscount + collabDiscountAmt)
  const discountExpectedTotal = Math.min(subtotal, cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt + collabDiscountAmt)
  const paymentDiscountReason = useMemo(() => {
    const base = discountReason.trim()
    const collabPart = appliedCollab ? `${t('posCollabDiscount')}: ${appliedCollab.topic}` : ''
    const lineDiscountCount = cartItems.filter((item) => (lineDiscountModeByItemId[item.id] ?? 'none') === 'discount').length
    const linePart = [
      lineDiscountCount > 0 ? `${tr('posDiscount', '할인')} ${lineDiscountCount}${tr('posMenuLineUnit', '건')}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const cancelPart =
      selectedCancelledLineCount > 0
        ? `${tr('posLineCancelledShort', '취소처리')} ${selectedCancelledLineCount}${tr('posMenuLineUnit', '건')}`
        : ''
    const parts = [base, collabPart, linePart, cancelPart].filter(Boolean)
    return parts.join(' · ')
  }, [appliedCollab, cartItems, discountReason, lineDiscountModeByItemId, selectedCancelledLineCount, t])
  const paymentServiceReason = useMemo(() => {
    if (selectedServiceLineCount <= 0) return ''
    return `${tr('posServiceHandled', '서비스처리')} ${selectedServiceLineCount}${tr('posMenuLineUnit', '건')}`
  }, [selectedServiceLineCount, t])
  const pointUsedNum = Math.max(0, Math.trunc(Number(pointUsed || 0)))
  const pricing = computePosPricing({
    subtotal,
    discountAmt: discount + pointUsedNum,
    cardPaymentAmount: parseFloat(payCard) || 0,
    adjustments: pricingAdjustments,
  })
  const total = pricing.finalTotal
  const receiptSubtotalForUi = resolveReceiptSubtotalPrintAmount({
    subtotal,
    vatFeeMode: pricing.vatFeeMode,
    receiptExclusiveSubtotalDisplay: pricing.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: pricing.baseTotal,
  })
  const receiptVatForUi = resolveReceiptVatPrintAmount({
    vatFeeAmt: pricing.vatFeeAmt,
    receiptVatDisplayAmt: pricing.receiptVatDisplayAmt,
  })
  const scrollToPaymentMethods = useCallback(() => {
    if (!showPaymentModal) return
    const run = () => {
      const el = paymentMethodSectionRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    requestAnimationFrame(() => requestAnimationFrame(run))
  }, [showPaymentModal])

  const selectMenuSplitTargetPerson = useCallback(
    (idx: number) => {
      setMenuSplitTargetPerson(idx)
      scrollToPaymentMethods()
    },
    [scrollToPaymentMethods]
  )

  const focusManualDiscountCard = useCallback(() => {
    const target = manualDiscountCardRef.current
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setManualDiscountFlash(true)
    if (manualDiscountFlashTimerRef.current != null) {
      window.clearTimeout(manualDiscountFlashTimerRef.current)
    }
    manualDiscountFlashTimerRef.current = window.setTimeout(() => {
      setManualDiscountFlash(false)
      manualDiscountFlashTimerRef.current = null
    }, 1200)
  }, [])
  useEffect(
    () => () => {
      if (manualDiscountFlashTimerRef.current != null) {
        window.clearTimeout(manualDiscountFlashTimerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    void getPosMenuOptions()
      .then((rows) => {
        if (cancelled) return
        setPosMenuOptions(rows || [])
      })
      .catch(() => {
        if (cancelled) return
        setPosMenuOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const confirmGuestDirect = () => {
    const v = parseInt(guestDirectValue, 10)
    if (!Number.isNaN(v)) setGuestCount(Math.max(1, Math.min(99, v)))
    setGuestDirectOpen(false)
  }

  const legacyWalletPaymentSum =
    (parseFloat(payTrueMoney) || 0) +
    (parseFloat(payWeChat) || 0) +
    (parseFloat(payAlipay) || 0) +
    (parseFloat(payLinePay) || 0) +
    (parseFloat(payShopeePay) || 0) +
    (parseFloat(payOther) || 0)
  const adminConfiguredWalletSum = adminPaymentLines.reduce(
    (s, i) => s + (parseFloat(payAdminLineAmounts[i.id] || '0') || 0),
    0
  )
  const paymentSum =
    (parseFloat(payCash) || 0) +
    (parseFloat(payCard) || 0) +
    (parseFloat(payPromptPay) || 0) +
    (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
    (parseFloat(payDeliveryApp) || 0)
  const nonCashPaymentSum =
    (parseFloat(payCard) || 0) +
    (parseFloat(payPromptPay) || 0) +
    (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
    (parseFloat(payDeliveryApp) || 0)
  const cashRequiredAmount = Math.max(0, total - nonCashPaymentSum)
  const cashTenderedNum = parseFloat(cashTendered) || 0
  const _cashChangeAmount = Math.max(0, cashTenderedNum - cashRequiredAmount)
  const _cashShortAmount = Math.max(0, cashRequiredAmount - cashTenderedNum)
  const paymentSumMatch = Math.abs(paymentSum - total) < 0.01

  const buildPaymentOtherBreakdownSnapshot = useCallback((): PosPaymentOtherBreakdown | undefined => {
    const r2 = (n: number) => Math.round(Math.max(0, n) * 100) / 100
    if (useAdminPaymentLines) {
      const admin: Record<string, number> = {}
      for (const line of adminPaymentLines) {
        const v = r2(parseFloat(payAdminLineAmounts[line.id] || '0') || 0)
        if (v > 0.005) admin[String(line.id)] = v
      }
      if (Object.keys(admin).length === 0) return undefined
      return { admin }
    }
    const out: PosPaymentOtherBreakdown = {}
    const tm = r2(parseFloat(payTrueMoney) || 0)
    const wc = r2(parseFloat(payWeChat) || 0)
    const ap = r2(parseFloat(payAlipay) || 0)
    const lp = r2(parseFloat(payLinePay) || 0)
    const sp = r2(parseFloat(payShopeePay) || 0)
    const misc = r2(parseFloat(payOther) || 0)
    if (tm > 0.005) out.trueMoney = tm
    if (wc > 0.005) out.weChat = wc
    if (ap > 0.005) out.alipay = ap
    if (lp > 0.005) out.linePay = lp
    if (sp > 0.005) out.shopeePay = sp
    if (misc > 0.005) out.misc = misc
    if (
      !out.trueMoney &&
      !out.weChat &&
      !out.alipay &&
      !out.linePay &&
      !out.shopeePay &&
      !out.misc
    ) {
      return undefined
    }
    return out
  }, [
    useAdminPaymentLines,
    adminPaymentLines,
    payAdminLineAmounts,
    payTrueMoney,
    payWeChat,
    payAlipay,
    payLinePay,
    payShopeePay,
    payOther,
  ])

  const buildPaymentSnapshot = useCallback((): CartPanelPaymentPayload => {
    const payDel = parseFloat(payDeliveryApp) || 0
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? { paymentDeliveryApp: payDel, deliveryPaymentChannel }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum
    const ob = buildPaymentOtherBreakdownSnapshot()
    return {
      paymentCash: parseFloat(payCash) || 0,
      paymentCard: parseFloat(payCard) || 0,
      paymentQr: parseFloat(payPromptPay) || 0,
      paymentOther: paymentOtherSum,
      ...(ob ? { paymentOtherBreakdown: ob } : {}),
      ...deliveryPayPart,
    }
  }, [
    payCash,
    payCard,
    payPromptPay,
    payDeliveryApp,
    deliveryPaymentChannel,
    useAdminPaymentLines,
    adminConfiguredWalletSum,
    legacyWalletPaymentSum,
    buildPaymentOtherBreakdownSnapshot,
  ])

  const paymentSnapshotHasAmount = (snap: CartPanelPaymentPayload) => {
    const eps = 0.005
    return (
      snap.paymentCash > eps ||
      snap.paymentCard > eps ||
      snap.paymentQr > eps ||
      snap.paymentOther > eps ||
      (snap.paymentDeliveryApp ?? 0) > eps
    )
  }

  const captureSplitPaymentForPerson = useCallback(
    (personIdx: number) => {
      const snap = buildPaymentSnapshot()
      if (!paymentSnapshotHasAmount(snap)) return
      const arr = [...splitPaymentsByPersonRef.current]
      while (arr.length <= personIdx) arr.push(undefined)
      arr[personIdx] = snap
      splitPaymentsByPersonRef.current = arr
    },
    [buildPaymentSnapshot]
  )

  const customerDisplayPaymentDraft = useMemo((): CartPanelPaymentPayload | null => {
    if (!showPaymentModal) return null
    return buildPaymentSnapshot()
  }, [showPaymentModal, buildPaymentSnapshot])

  useEffect(() => {
    onCustomerDisplayPaymentDraftChange?.(customerDisplayPaymentDraft)
  }, [customerDisplayPaymentDraft, onCustomerDisplayPaymentDraftChange])
  /** 더치 패널을 열지 않아도: 합계 미달·일부 결제 진행 중이면 수단 탭이 더치 방식(1인분/잔액)으로 동작 */
  const splitFlowForInputs =
    showSplit || splitPaidSteps > 0 || (total > 0 && !paymentSumMatch)
  /** 더치 패널: 인원 고정. 그 외: 일부 결제 단계에 맞춰 인원수를 가정(최소 2) */
  const effectiveDutchCount = showSplit
    ? Math.max(1, Number(splitCount) || 1)
    : Math.max(splitPaidSteps + 1, 2)
  const round2 = (n: number) => Math.round(n * 100) / 100
  const menuSplitQtyByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    const qtyByPerson = Array.from({ length: count }, () => 0)
    for (const item of cartItems) {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      for (let i = 0; i < count; i += 1) {
        qtyByPerson[i] += Math.max(0, Number(row[i] || 0))
      }
    }
    return qtyByPerson
  }, [cartItems, menuSplitAssigned, splitCount])
  const menuSplitBaseByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    const baseByPerson = Array.from({ length: count }, () => 0)
    for (const item of cartItems) {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      for (let i = 0; i < count; i += 1) {
        const qty = Math.max(0, Number(row[i] || 0))
        baseByPerson[i] += (Number(item.price) || 0) * qty
      }
    }
    return baseByPerson.map((v) => round2(v))
  }, [cartItems, menuSplitAssigned, splitCount])
  const menuSplitDueByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    const dueByPerson = Array.from({ length: count }, () => 0)
    if (total <= 0 || subtotal <= 0) return dueByPerson
    let acc = 0
    for (let i = 0; i < count; i += 1) {
      if (i === count - 1) {
        dueByPerson[i] = round2(Math.max(0, total - acc))
      } else {
        const raw = (total * Math.max(0, menuSplitBaseByPerson[i] || 0)) / subtotal
        const rounded = round2(raw)
        dueByPerson[i] = rounded
        acc = round2(acc + rounded)
      }
    }
    return dueByPerson
  }, [menuSplitBaseByPerson, splitCount, subtotal, total])
  const menuSplitRemainingByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    return Array.from({ length: count }, (_, i) =>
      round2(Math.max(0, Number(menuSplitDueByPerson[i] || 0) - Number(menuSplitPaidByPerson[i] || 0)))
    )
  }, [menuSplitDueByPerson, menuSplitPaidByPerson, splitCount])
  const menuSplitUnassignedQty = useMemo(() => {
    let sum = 0
    for (const item of cartItems) {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
      sum += Math.max(0, (Number(item.quantity) || 0) - assigned)
    }
    return round2(sum)
  }, [cartItems, menuSplitAssigned])
  const menuSplitUnassignedAmount = useMemo(() => {
    let sum = 0
    for (const item of cartItems) {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
      const remain = Math.max(0, (Number(item.quantity) || 0) - assigned)
      sum += remain * (Number(item.price) || 0)
    }
    return round2(sum)
  }, [cartItems, menuSplitAssigned])
  const dutchUnitAmount =
    total <= 0 ? 0 : Math.max(0, Math.round((total / Math.max(1, effectiveDutchCount)) * 100) / 100)
  const currentSplitPersonIndex = Math.min(splitPaidSteps, Math.max(0, Math.max(1, Number(splitCount) || 1) - 1))
  const menuSplitTargetPersonIndex = Math.min(
    Math.max(0, Number(menuSplitTargetPerson) || 0),
    Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
  )
  const currentSplitTargetAmount =
    showSplit && splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
      : dutchUnitAmount
  const cashRequiredForTendered = splitFlowForInputs ? currentSplitTargetAmount : cashRequiredAmount
  const cashChangeAmountForTendered = Math.max(0, cashTenderedNum - cashRequiredForTendered)
  const cashShortAmountForTendered = Math.max(0, cashRequiredForTendered - cashTenderedNum)
  const amountSplitDueByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    const due = Array.from({ length: count }, () => 0)
    if (total <= 0) return due
    let acc = 0
    for (let i = 0; i < count; i += 1) {
      if (i === count - 1) {
        due[i] = round2(Math.max(0, total - acc))
      } else {
        const one = round2(total / count)
        due[i] = one
        acc = round2(acc + one)
      }
    }
    return due
  }, [round2, splitCount, total])
  const dutchRemainingPeople = showSplit ? Math.max(0, splitCount - splitPaidSteps) : 0
  const partialPayDisabled = showSplit
    ? dutchRemainingPeople <= 0 ||
      (splitMode === 'menu' && (menuSplitUnassignedQty > 0 || currentSplitTargetAmount <= 0))
    : total <= 0 || paymentSumMatch
  const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30, 50]
  const paymentTabs: { id: PaymentMethodTab; label: string; icon: typeof Banknote }[] = [
    { id: 'cash', label: t('posPaymentCash') || '현금', icon: Banknote },
    { id: 'card', label: t('posPaymentCard') || '카드', icon: CreditCard },
    { id: 'qr', label: tr('posPaymentQrCode', 'QR Code'), icon: QrCode },
    { id: 'delivery_app', label: t('posPaymentDeliveryApp') || '배달앱', icon: Bike },
    { id: 'other', label: t('posPaymentOther') || '기타', icon: Wallet },
  ]
  const isMemberOrder = selectedMemberId !== ''
  const selectedMemberDetail = memberMap[selectedMemberId]
  const memberSearchEmpty = !membersLoading && memberKeyword.trim().length >= 2 && memberOptions.length === 0
  const normalizedTaxId = taxId.replace(/\D/g, '').slice(0, 13)
  const normalizedTaxBranchNo = taxBranchNo.replace(/\D/g, '').slice(0, 5)
  const normalizedTaxPhone = taxPhone.replace(/\D/g, '').slice(0, 10)
  const normalizedTaxEmail = taxEmail.trim()
  const normalizedTaxAddress = taxAddress.trim()
  const normalizedTaxName = taxName.trim()
  const taxBranchRequired = invoiceCustomerType === 'company'
  const effectiveTaxBranchNo = taxBranchRequired ? normalizedTaxBranchNo : (normalizedTaxBranchNo || '00000')
  const emailValid = normalizedTaxEmail.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedTaxEmail)
  const taxInvoiceValidationErrors: string[] = []
  if (needTaxInvoice) {
    if (!normalizedTaxName) taxInvoiceValidationErrors.push('name')
    if (normalizedTaxId.length !== 13) taxInvoiceValidationErrors.push('taxId')
    if (taxBranchRequired && effectiveTaxBranchNo.length !== 5) taxInvoiceValidationErrors.push('branch')
    if (!taxBranchRequired && normalizedTaxBranchNo && normalizedTaxBranchNo.length !== 5) taxInvoiceValidationErrors.push('branch')
    if (normalizedTaxPhone.length < 9 || normalizedTaxPhone.length > 10) taxInvoiceValidationErrors.push('phone')
    if (!normalizedTaxAddress) taxInvoiceValidationErrors.push('address')
    if (!emailValid) taxInvoiceValidationErrors.push('email')
  }
  const taxInvoiceInvalid = needTaxInvoice && taxInvoiceValidationErrors.length > 0
  const deliveryAppLabel =
    deliveryAppNameProp && deliveryAppNameProp.trim()
      ? deliveryAppNameProp.trim()
      : deliveryAppProp === 'grab'
        ? t('posDeliveryAppGrab')
        : deliveryAppProp === 'lineman'
          ? t('posDeliveryAppLineMan')
          : deliveryAppProp === 'shopee'
            ? t('posDeliveryAppShopee')
            : deliveryAppProp || ''
  const deliveryBrand = deliveryAppBrandClasses(deliveryAppProp)

  const loadMembers = async (keyword?: string) => {
    setMembersLoading(true)
    try {
      const rawKeyword = String(keyword || '').trim()
      const normalizedPhoneKeyword = rawKeyword.replace(/[^\d+]/g, '')
      const q = normalizedPhoneKeyword.length >= 4 ? normalizedPhoneKeyword : rawKeyword
      const rows = await getMembers({ q, limit: 20 })
      const options = rows
        .filter((row) => row.status !== 'inactive')
        .map((row) => ({
          value: String(row.id),
          label: `${row.name}${row.memberNo ? ` (${row.memberNo})` : ''}${row.phone ? ` · ${row.phone}` : ''}`,
        }))
      const map: Record<string, { id: number; memberNo: string; name: string; phone: string; email: string }> = {}
      for (const row of rows) {
        map[String(row.id)] = {
          id: row.id,
          memberNo: row.memberNo || '',
          name: row.name || '',
          phone: row.phone || '',
          email: row.email || '',
        }
      }
      setMemberOptions(options)
      setMemberMap(map)
    } catch (e) {
      console.error('getMembers:', e)
      setMemberOptions([])
      setMemberMap({})
    } finally {
      setMembersLoading(false)
    }
  }

  const handleMemberSearch = () => {
    loadMembers(memberKeyword)
  }

  const buildSplitReceiptPayloads = (): CartPanelSplitReceiptPayload[] | undefined => {
    if (!showSplit) return undefined
    const count = Math.max(1, Number(splitCount) || 1)
    if (count <= 1) return undefined
    const round2Local = (n: number) => Math.round(n * 100) / 100
    if (splitMode === 'menu') {
      const entries: CartPanelSplitReceiptPayload[] = []
      for (let personIdx = 0; personIdx < count; personIdx += 1) {
        const lines: CartPanelOrderLinePayload[] = []
        let subtotalByPerson = 0
        for (const item of cartItems) {
          const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
          const qty = Math.max(0, Number(row[personIdx] || 0))
          if (qty <= 0) continue
          lines.push(mapCartItemToOrderPayload(item, qty))
          subtotalByPerson += (Number(item.price) || 0) * qty
        }
        const subtotalRounded = round2Local(subtotalByPerson)
        const due = round2Local(Math.max(0, Number(menuSplitDueByPerson[personIdx] || 0)))
        const totalByPerson = due > 0 ? due : subtotalRounded
        const discountByPerson = Math.max(0, round2Local(subtotalRounded - totalByPerson))
        if (lines.length === 0 && totalByPerson <= 0) continue
        entries.push({
          key: `menu-${personIdx + 1}`,
          label: `${tr('posCurrentPerson', '현재 인원')} ${personIdx + 1}/${count}`,
          items: lines,
          subtotal: subtotalRounded,
          discountAmt: discountByPerson,
          total: totalByPerson,
          payment: splitPaymentsByPersonRef.current[personIdx],
        })
      }
      return entries.length > 0 ? entries : undefined
    }
    const dueByPerson = Array.from({ length: count }, () => 0)
    let accum = 0
    for (let i = 0; i < count; i += 1) {
      if (i === count - 1) {
        dueByPerson[i] = round2Local(Math.max(0, total - accum))
      } else {
        const raw = total / count
        const rounded = round2Local(raw)
        dueByPerson[i] = rounded
        accum = round2Local(accum + rounded)
      }
    }
    const fullMenuLines = cartItems.map((item) => mapCartItemToOrderPayload(item))
    const entries: CartPanelSplitReceiptPayload[] = dueByPerson
      .map((due, idx) => ({
        key: `amount-${idx + 1}`,
        label: `${tr('posCurrentPerson', '현재 인원')} ${idx + 1}/${count}`,
        items: [
          ...fullMenuLines,
          {
            id: `dutch-amount-${idx + 1}`,
            name: `${tr('posDutchPayHeader', '더치페이')} ${idx + 1}/${count}`,
            price: due,
            quantity: 1,
          },
        ],
        subtotal: due,
        discountAmt: 0,
        total: due,
        payment: splitPaymentsByPersonRef.current[idx],
      }))
      .filter((entry) => entry.total > 0)
    return entries.length > 0 ? entries : undefined
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos-recent-member-ids')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentMemberIds(parsed.map((x) => String(x || '')).filter(Boolean).slice(0, 6))
      }
    } catch {
      setRecentMemberIds([])
    }
  }, [])

  useEffect(() => {
    if (!selectedMemberId) return
    setRecentMemberIds((prev) => {
      const next = [selectedMemberId, ...prev.filter((x) => x !== selectedMemberId)].slice(0, 6)
      try {
        localStorage.setItem('pos-recent-member-ids', JSON.stringify(next))
      } catch {
        // ignore storage failures
      }
      return next
    })
  }, [selectedMemberId])

  useEffect(() => {
    if (!selectedMemberId) return
    const detail = selectedMemberDetail
    if (!detail) return
    if (!taxMemberNo.trim()) setTaxMemberNo(detail.memberNo || selectedMemberId)
    if (!taxName.trim()) setTaxName(detail.name || '')
    if (detail?.phone && !taxPhone.trim()) setTaxPhone(detail.phone)
    if (detail?.email && !taxEmail.trim()) setTaxEmail(detail.email)
  }, [selectedMemberId, selectedMemberDetail, taxName, taxMemberNo, taxPhone, taxEmail])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos-tax-member-registry')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setTaxMemberRegistry(parsed as Record<string, TaxInvoiceProfile>)
      }
    } catch {
      setTaxMemberRegistry({})
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('pos-tax-member-registry', JSON.stringify(taxMemberRegistry))
    } catch {
      // ignore storage failures
    }
  }, [taxMemberRegistry])

  const fillTaxFieldsFromProfile = (profile: TaxInvoiceProfile) => {
    setInvoiceCustomerType(profile.type === 'corporate' ? 'company' : 'person')
    setTaxName(profile.name || '')
    setTaxId(profile.taxId || '')
    setTaxBranchNo(profile.branchCode || '')
    setTaxPhone(profile.phone || '')
    setTaxEmail(profile.email || '')
    setTaxAddress(profile.address || '')
  }

  /** registryKey: localStorage 객체 키(회원번호 또는 taxId_branch) */
  const applyTaxProfile = (registryKey: string, profile: TaxInvoiceProfile) => {
    setTaxMemberNo(isSyntheticTaxRegistryKey(registryKey) ? '' : registryKey)
    fillTaxFieldsFromProfile(profile)
  }

  const applyTaxProfileFromServerRow = (row: PosTaxInvoiceRecipientRow) => {
    const profile = rowToTaxProfile(row)
    setTaxMemberNo(row.member_no?.trim() || '')
    fillTaxFieldsFromProfile(profile)
    const lk = taxRegistryLocalKey(row.member_no?.trim() || '', undefined, row.tax_id, row.branch_no)
    setTaxMemberRegistry((prev) => ({ ...prev, [lk]: profile }))
  }

  const handleTaxProfileSearch = async () => {
    const keyword = taxSearchKeyword.trim()
    if (!keyword) {
      setTaxSearchMessage(t('posTaxSearchNeedKeyword'))
      return
    }
    const byApi: 'phone' | 'taxId' | 'name' | 'memberNo' =
      taxSearchField === 'memberNo'
        ? 'memberNo'
        : taxSearchField === 'taxId'
          ? 'taxId'
          : taxSearchField === 'name'
            ? 'name'
            : 'phone'
    const qForApi =
      taxSearchField === 'taxId' || taxSearchField === 'phone'
        ? keyword.replace(/\D/g, '')
        : keyword

    if (auth?.store && auth?.role && currentStoreId && qForApi.length > 0) {
      try {
        const res = await getPosTaxInvoiceRecipients({
          userStore: auth.store,
          userRole: auth.role,
          storeCode: currentStoreId,
          q: qForApi,
          by: byApi,
          limit: 20,
        })
        if (res.success && res.rows?.length) {
          const usable = res.rows.filter((r) => r.is_active)
          const pick = (usable.length ? usable : res.rows)[0]
          applyTaxProfileFromServerRow(pick)
          setTaxSearchMessage(t('posTaxSearchLoadedServer'))
          return
        }
      } catch (e) {
        console.error('getPosTaxInvoiceRecipients:', e)
      }
    }

    const entries = Object.entries(taxMemberRegistry)
    let found: [string, TaxInvoiceProfile] | undefined
    if (taxSearchField === 'memberNo') {
      found = entries.find(([memberNo]) => memberNo === keyword)
    } else if (taxSearchField === 'phone') {
      const k = keyword.replace(/\D/g, '')
      found = entries.find(([, profile]) => String(profile.phone || '').replace(/\D/g, '').includes(k))
    } else if (taxSearchField === 'taxId') {
      const k = keyword.replace(/\D/g, '')
      found = entries.find(([, profile]) => {
        const tid = String(profile.taxId || '').replace(/\D/g, '')
        return tid === k || (k.length >= 5 && tid.includes(k))
      })
    } else {
      const k = keyword.toLowerCase()
      found = entries.find(([, profile]) => String(profile.name || '').toLowerCase().includes(k))
    }
    if (!found) {
      setTaxSearchMessage(t('posTaxSearchNoSavedProfile'))
      return
    }
    applyTaxProfile(found[0], found[1])
    const displayNo = isSyntheticTaxRegistryKey(found[0]) ? found[1].taxId || found[0] : found[0]
    setTaxSearchMessage(t('posTaxSearchLoaded').replace('{no}', displayNo))
  }

  const resetPaymentInputs = () => {
    setPayCash('0')
    setCashTendered('')
    setPayCard('0')
    setPayPromptPay('0')
    setPayTrueMoney('0')
    setPayWeChat('0')
    setPayAlipay('0')
    setPayLinePay('0')
    setPayShopeePay('0')
    setPayOther('0')
    setPayDeliveryApp('0')
    const lines = adminPaymentLinesRef.current
    setPayAdminLineAmounts(Object.fromEntries(lines.map((i) => [i.id, '0'])))
  }

  /** 결제 세션마다 초기화: 이전 주문·취소 건의 세금계산서 ON/필드가 다음 주문 memo·버튼 활성에 남지 않도록 */
  const resetTaxInvoiceUiState = () => {
    setNeedTaxInvoice(false)
    setShowTaxInvoiceDetails(true)
    setInvoiceCustomerType('person')
    setTaxSearchField('memberNo')
    setTaxSearchKeyword('')
    setTaxSearchMessage('')
    setTaxMemberNo('')
    setTaxName('')
    setTaxId('')
    setTaxBranchNo('')
    setTaxPhone('')
    setTaxEmail('')
    setTaxAddress('')
  }

  const moveAllAmountTo = (target: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other' | 'truemoney' | 'wechat' | 'alipay' | 'linepay' | 'shopeepay') => {
    const st = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const amount = Math.max(0, st - discount - pointUsedNum)
    resetPaymentInputs()
    const lines = adminPaymentLinesRef.current
    const walletToAdmin =
      lines.length > 0 &&
      (target === 'other' ||
        target === 'truemoney' ||
        target === 'wechat' ||
        target === 'alipay' ||
        target === 'linepay' ||
        target === 'shopeepay')
    if (walletToAdmin) {
      setPayAdminLineAmounts(Object.fromEntries(lines.map((li, idx) => [li.id, idx === 0 ? String(amount) : '0'])))
      return
    }
    if (target === 'cash') setPayCash(String(amount))
    if (target === 'card') setPayCard(String(amount))
    if (target === 'qr') setPayPromptPay(String(amount))
    if (target === 'delivery_app') setPayDeliveryApp(String(amount))
    if (target === 'other') setPayOther(String(amount))
    if (target === 'truemoney') setPayTrueMoney(String(amount))
    if (target === 'wechat') setPayWeChat(String(amount))
    if (target === 'alipay') setPayAlipay(String(amount))
    if (target === 'linepay') setPayLinePay(String(amount))
    if (target === 'shopeepay') setPayShopeePay(String(amount))
  }

  type MoveTarget =
    | 'cash'
    | 'card'
    | 'qr'
    | 'delivery_app'
    | 'other'
    | 'truemoney'
    | 'wechat'
    | 'alipay'
    | 'linepay'
    | 'shopeepay'

  const isWalletMoveTarget = (target: MoveTarget) =>
    target === 'other' ||
    target === 'truemoney' ||
    target === 'wechat' ||
    target === 'alipay' ||
    target === 'linepay' ||
    target === 'shopeepay'

  const splitDraftBadgeText = (() => {
    const draft = splitDraftAssignedRef.current
    if (!draft || draft.amount <= 0.0001) return ''
    return `${tr('posDutchDraftAssigned', '임시 배정')} ${formatBahtNum(draft.amount)} ฿`
  })()

  const applyDeltaToTarget = (target: MoveTarget, delta: number) => {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return
    const lines = adminPaymentLinesRef.current
    const walletTarget = isWalletMoveTarget(target)
    if (lines.length > 0 && walletTarget) {
      setShowOtherPayments(true)
      const id0 = lines[0].id
      setPayAdminLineAmounts((prev) => {
        const next: Record<string, string> = {}
        for (const li of lines) next[li.id] = String(Math.max(0, parseFloat(prev[li.id] || '0') || 0))
        next[id0] = String(Math.max(0, (parseFloat(next[id0]) || 0) + delta))
        return next
      })
      return
    }
    if (target === 'cash') setPayCash((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    if (target === 'card') setPayCard((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    if (target === 'qr') setPayPromptPay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    if (target === 'delivery_app') setPayDeliveryApp((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    if (target === 'other') {
      setShowOtherPayments(true)
      setPayOther((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    }
    if (target === 'truemoney') { setShowOtherPayments(true); setPayTrueMoney((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'wechat') { setShowOtherPayments(true); setPayWeChat((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'alipay') { setShowOtherPayments(true); setPayAlipay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'linepay') { setShowOtherPayments(true); setPayLinePay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'shopeepay') { setShowOtherPayments(true); setPayShopeePay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
  }

  /** 탭/라벨 클릭 시: 1인 금액만 해당 수단에 반영 (replace 모드면 기존 임시 배정분을 이동) */
  const addDutchAmountOnly = (target: MoveTarget, opts?: { replaceCurrentDraft?: boolean }) => {
    const replaceCurrentDraft = opts?.replaceCurrentDraft === true
    const count = effectiveDutchCount
    let perPerson = showSplit && splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
      : currentSplitTargetAmount
    if (replaceCurrentDraft) {
      const prevDraft = splitDraftAssignedRef.current
      if (prevDraft && prevDraft.amount > 0) {
        applyDeltaToTarget(prevDraft.target, -prevDraft.amount)
        if (showSplit && splitMode === 'menu' && prevDraft.personIdx != null) {
          setMenuSplitPaidByPerson((prev) => {
            const next = Array.from({ length: Math.max(1, Number(splitCount) || 1) }, (_, i) =>
              Math.max(0, Number(prev[i] || 0))
            )
            const i = Math.max(0, Math.min(next.length - 1, prevDraft.personIdx || 0))
            next[i] = round2(Math.max(0, next[i] - prevDraft.amount))
            return next
          })
          const paidNow = Math.max(
            0,
            Number(menuSplitPaidByPerson[menuSplitTargetPersonIndex] || 0) -
              (prevDraft.personIdx === menuSplitTargetPersonIndex ? prevDraft.amount : 0)
          )
          perPerson = Math.max(0, Number(menuSplitDueByPerson[menuSplitTargetPersonIndex] || 0) - paidNow)
        }
      }
      if (!(showSplit && splitMode === 'menu')) {
        const idx = Math.min(splitPaidSteps, Math.max(0, amountSplitDueByPerson.length - 1))
        perPerson = Math.max(0, Number(amountSplitDueByPerson[idx] || currentSplitTargetAmount || 0))
      }
    }
    const adminLineSum = adminPaymentLines.reduce(
      (s, i) => s + (parseFloat(payAdminLineAmounts[i.id] || '0') || 0),
      0
    )
    const legacyWalletSum =
      (parseFloat(payTrueMoney) || 0) +
      (parseFloat(payWeChat) || 0) +
      (parseFloat(payAlipay) || 0) +
      (parseFloat(payLinePay) || 0) +
      (parseFloat(payShopeePay) || 0) +
      (parseFloat(payOther) || 0)
    const currentSum =
      (parseFloat(payCash) || 0) +
      (parseFloat(payCard) || 0) +
      (parseFloat(payPromptPay) || 0) +
      (useAdminPaymentLines ? adminLineSum : legacyWalletSum) +
      (parseFloat(payDeliveryApp) || 0)
    const remain = Math.max(0, total - currentSum)
    const addAmount =
      showSplit && splitMode === 'menu'
        ? Math.min(perPerson, remain)
        : (splitPaidSteps >= count - 1 ? remain : Math.min(perPerson, remain))
    if (addAmount <= 0) return
    applyDeltaToTarget(target, addAmount)
    if (showSplit && splitMode === 'menu') {
      setMenuSplitPaidByPerson((prev) => {
        const next = Array.from({ length: Math.max(1, Number(splitCount) || 1) }, (_, i) =>
          Math.max(0, Number(prev[i] || 0))
        )
        next[menuSplitTargetPersonIndex] = round2(next[menuSplitTargetPersonIndex] + addAmount)
        return next
      })
    }
    if (replaceCurrentDraft) {
      splitDraftAssignedRef.current = {
        target,
        amount: addAmount,
        personIdx: showSplit && splitMode === 'menu' ? menuSplitTargetPersonIndex : null,
      }
    }
  }

  const applyFullAmountToSingleAdminLine = (lineId: string) => {
    const st = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const amount = Math.max(0, st - discount - pointUsedNum)
    resetPaymentInputs()
    const lines = adminPaymentLinesRef.current
    setPayAdminLineAmounts(Object.fromEntries(lines.map((li) => [li.id, li.id === lineId ? String(amount) : '0'])))
  }

  const addDutchAmountToAdminLine = (lineId: string) => {
    const count = effectiveDutchCount
    const perPerson = showSplit && splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
      : currentSplitTargetAmount
    const adminLineSum = adminPaymentLines.reduce(
      (s, i) => s + (parseFloat(payAdminLineAmounts[i.id] || '0') || 0),
      0
    )
    const legacyWalletSum =
      (parseFloat(payTrueMoney) || 0) +
      (parseFloat(payWeChat) || 0) +
      (parseFloat(payAlipay) || 0) +
      (parseFloat(payLinePay) || 0) +
      (parseFloat(payShopeePay) || 0) +
      (parseFloat(payOther) || 0)
    const currentSum =
      (parseFloat(payCash) || 0) +
      (parseFloat(payCard) || 0) +
      (parseFloat(payPromptPay) || 0) +
      (useAdminPaymentLines ? adminLineSum : legacyWalletSum) +
      (parseFloat(payDeliveryApp) || 0)
    const remain = Math.max(0, total - currentSum)
    const addAmount =
      showSplit && splitMode === 'menu'
        ? Math.min(perPerson, remain)
        : (splitPaidSteps >= count - 1 ? remain : Math.min(perPerson, remain))
    if (addAmount <= 0) return
    setShowOtherPayments(true)
    setPayAdminLineAmounts((prev) => {
      const lines = adminPaymentLinesRef.current
      const next: Record<string, string> = {}
      for (const li of lines) next[li.id] = String(parseFloat(prev[li.id] || '0') || 0)
      next[lineId] = String((parseFloat(next[lineId]) || 0) + addAmount)
      return next
    })
    if (showSplit && splitMode === 'menu') {
      setMenuSplitPaidByPerson((prev) => {
        const next = Array.from({ length: Math.max(1, Number(splitCount) || 1) }, (_, i) =>
          Math.max(0, Number(prev[i] || 0))
        )
        next[menuSplitTargetPersonIndex] = round2(next[menuSplitTargetPersonIndex] + addAmount)
        return next
      })
    }
  }

  useEffect(() => {
    if (!showPaymentModal || !showSplit || splitMode !== 'menu') {
      menuSplitAutoAppliedKeyRef.current = ''
      return
    }
    if (menuSplitUnassignedQty > 0.009) return
    const targetAmount = Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
    if (targetAmount <= 0.009) {
      menuSplitAutoAppliedKeyRef.current = ''
      return
    }
    const activeTarget = activePaymentTab as MoveTarget
    const key = `${menuSplitTargetPersonIndex}|${activeTarget}|${targetAmount.toFixed(2)}`
    if (menuSplitAutoAppliedKeyRef.current === key) return
    menuSplitAutoAppliedKeyRef.current = key
    addDutchAmountOnly(activeTarget, { replaceCurrentDraft: true })
  }, [
    showPaymentModal,
    showSplit,
    splitMode,
    menuSplitUnassignedQty,
    menuSplitTargetPersonIndex,
    menuSplitRemainingByPerson,
    activePaymentTab,
  ])

  const adjustMenuSplitQty = (itemId: string, delta: number) => {
    if (!showSplit || splitMode !== 'menu' || !Number.isFinite(delta) || delta === 0) return
    const personIdx = menuSplitTargetPersonIndex
    const targetItem = cartItems.find((it) => it.id === itemId)
    if (!targetItem) return
    const qtyTotal = Math.max(0, Number(targetItem.quantity) || 0)
    setMenuSplitAssigned((prev) => {
      const count = Math.max(1, Number(splitCount) || 1)
      const currentRow = Array.from({ length: count }, (_, i) =>
        Math.max(0, Number((prev[itemId] || [])[i] || 0))
      )
      const totalWithoutCurrent = currentRow.reduce(
        (s, v, i) => s + (i === personIdx ? 0 : Math.max(0, Number(v || 0))),
        0
      )
      const current = Math.max(0, Number(currentRow[personIdx] || 0))
      const maxForCurrent = Math.max(0, qtyTotal - totalWithoutCurrent)
      const next = Math.max(0, Math.min(maxForCurrent, current + delta))
      currentRow[personIdx] = round2(next)
      return { ...prev, [itemId]: currentRow }
    })
    if (delta > 0) scrollToPaymentMethods()
  }

  useEffect(() => {
    setMenuSplitTargetPerson((prev) => {
      const maxIdx = Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
      return Math.min(Math.max(0, prev), maxIdx)
    })
  }, [splitCount])

  /** 더치페이 「일부 결제」: 진행만 누적 (금액은 탭 클릭으로 이미 입력됨). 패널 없이도 일부 결제만으로 단계 증가 가능 */
  const confirmSplitStep = () => {
    if (showSplit) {
      const count = Math.max(1, Number(splitCount) || 1)
      if (splitPaidSteps >= count) return
      if (splitMode === 'menu') {
        if (menuSplitUnassignedQty > 0) return
        if (Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0)) > 0.009) return
        captureSplitPaymentForPerson(menuSplitTargetPersonIndex)
        resetPaymentInputs()
        const nextPending = menuSplitRemainingByPerson.findIndex((amt) => Math.max(0, Number(amt || 0)) > 0.009)
        if (nextPending >= 0) selectMenuSplitTargetPerson(nextPending)
        else scrollToPaymentMethods()
        splitDraftAssignedRef.current = null
        return
      }
      captureSplitPaymentForPerson(splitPaidSteps)
      resetPaymentInputs()
      splitDraftAssignedRef.current = null
      setSplitPaidSteps((prev) => Math.min(count, prev + 1))
      scrollToPaymentMethods()
    } else {
      splitDraftAssignedRef.current = null
      setSplitPaidSteps((prev) => prev + 1)
    }
  }

  const finalizeSplitPaymentsForReceipt = () => {
    if (!showSplit) return
    const count = Math.max(1, Number(splitCount) || 1)
    const personIdx =
      splitMode === 'menu'
        ? Math.min(menuSplitTargetPersonIndex, count - 1)
        : Math.min(splitPaidSteps, count - 1)
    captureSplitPaymentForPerson(personIdx)
  }

  useEffect(() => {
    if (!showPaymentModal) return
    setSplitPaidSteps(0)
    splitPaymentsByPersonRef.current = []
  }, [showPaymentModal, splitCount, total])

  useEffect(() => {
    if (!showPaymentModal || !showSplit || splitMode !== 'menu') return
    const count = Math.max(1, Number(splitCount) || 1)
    const completed = Array.from({ length: count }, (_, i) =>
      Math.max(0, Number(menuSplitRemainingByPerson[i] || 0)) <= 0.009
    ).filter(Boolean).length
    setSplitPaidSteps(Math.min(count, completed))
  }, [showPaymentModal, showSplit, splitMode, splitCount, menuSplitRemainingByPerson])

  /** 모달을 닫을 때 더치페이·일부 결제 진행 초기화 (다음 결제 시 전액 자동 입력과 충돌 방지) */
  useEffect(() => {
    if (!showPaymentModal) {
      resetPaymentInputs()
      setShowSplit(false)
      setSplitPaidSteps(0)
      setSplitMode('amount')
      setMenuSplitAssigned({})
      setMenuSplitPaidByPerson([])
      splitPaymentsByPersonRef.current = []
      splitDraftAssignedRef.current = null
    }
  }, [showPaymentModal])

  /**
   * 더치페이 켜짐·인원 변경 시 결제 입력을 비움.
   * (모달 오픈 직후 전액이 현금 등에 채워진 뒤, CollapsibleTrigger asChild로 onClick이 누락되면 전액이 남는 문제 방지)
   */
  useEffect(() => {
    if (!showPaymentModal || !showSplit) return
    resetPaymentInputs()
    setSplitPaidSteps(0)
    setMenuSplitPaidByPerson([])
    splitPaymentsByPersonRef.current = []
    splitDraftAssignedRef.current = null
  }, [showPaymentModal, showSplit, splitCount])

  useEffect(() => {
    if (!showPaymentModal || !showSplit || splitMode !== 'menu') return
    resetPaymentInputs()
    setSplitPaidSteps(0)
    setMenuSplitAssigned({})
    setMenuSplitPaidByPerson([])
    splitDraftAssignedRef.current = null
  }, [showPaymentModal, showSplit, splitMode, splitCount, cartItems])

  useEffect(() => {
    if (activePaymentTab !== 'other') {
      setShowOtherPayments(false)
    }
  }, [activePaymentTab])

  // 할인/포인트 변경 시 결제 입력 금액 즉시 반영 (더치페이·일부 분할 입력 중에는 건너뜀)
  // 기존 합계가 일시적으로 불일치해도 즉시 재정렬해서 "결제 완료" 버튼이 바로 복구되도록 한다.
  useEffect(() => {
    if (!showPaymentModal || total <= 0 || showSplit) return
    if (splitPaidSteps > 0) return
    const st = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const newTotal = computePosPricing({
      subtotal: st,
      discountAmt: discount + pointUsedNum,
      adjustments: pricingAdjustments,
    }).finalTotal
    resetPaymentInputs()
    if (activePaymentTab === 'cash') {
      setPayCash(String(newTotal))
      return
    }
    if (activePaymentTab === 'card') {
      setPayCard(String(newTotal))
      return
    }
    if (activePaymentTab === 'qr') {
      setPayPromptPay(String(newTotal))
      return
    }
    if (activePaymentTab === 'delivery_app') {
      setPayDeliveryApp(String(newTotal))
      return
    }
    if (useAdminPaymentLines) {
      const firstLineId = adminPaymentLinesRef.current[0]?.id
      if (firstLineId) {
        setPayAdminLineAmounts({
          ...Object.fromEntries(adminPaymentLinesRef.current.map((line) => [line.id, '0'])),
          [firstLineId]: String(newTotal),
        })
        return
      }
    }
    setPayOther(String(newTotal))
  }, [
    showPaymentModal,
    total,
    discount,
    discountValue,
    discountType,
    pointUsedNum,
    showSplit,
    splitPaidSteps,
    cartItems,
    pricingAdjustments,
    activePaymentTab,
    useAdminPaymentLines,
  ])

  /**
   * 결제 모달을 연 직후에는 수단 금액을 비워 둠(위 할인·합계 동기화 effect가 현금 전액을 넣어
   * 「수단 선택 전 결제 완료」가 활성화되던 문제 방지). 동일 틱에서 할인 effect 다음에 실행.
   */
  useEffect(() => {
    if (!showPaymentModal) return
    resetPaymentInputs()
  }, [showPaymentModal])

  const buildOrderMemo = (
    baseMemo: string,
    /** 모달 직후 동기 콜백에서는 setState 반영 전이라, 명시적으로 세금 블록을 빼야 함 */
    opts?: { includeTaxInvoice?: boolean }
  ) => {
    const includeTax = opts?.includeTaxInvoice !== false && needTaxInvoice
    if (!includeTax) return baseMemo
    const lines = [
      '[TAX_INVOICE]',
      `memberNo=${encodeTaxInvoiceMemoValue(taxMemberNo.trim())}`,
      `customerType=${invoiceCustomerType}`,
      `name=${encodeTaxInvoiceMemoValue(normalizedTaxName)}`,
      `taxId=${encodeTaxInvoiceMemoValue(normalizedTaxId)}`,
      `branchNo=${encodeTaxInvoiceMemoValue(effectiveTaxBranchNo)}`,
      `phone=${encodeTaxInvoiceMemoValue(normalizedTaxPhone)}`,
      `email=${encodeTaxInvoiceMemoValue(normalizedTaxEmail)}`,
      `address=${encodeTaxInvoiceMemoValue(normalizedTaxAddress)}`,
      `member=${isMemberOrder ? 'Y' : 'N'}`,
    ]
    const taxMemo = lines.join(' | ')
    return baseMemo.trim() ? `${baseMemo.trim()}\n${taxMemo}` : taxMemo
  }

  const openPaymentModalWithAmount = async (
    amount: number,
    /** 기존 주문에서 결제 모달을 열 때 setCartItems 직후라 cartItems가 아직 비어 있음 → 스냅샷을 넘겨야 함 */
    receiptOpts?: {
      receiptLines?: Array<{ id?: string; name: string; price: number; quantity?: number; note?: string }>
      receiptSubtotal?: number
      /** 미입력 시 현재 할인+포인트(상태) */
      receiptDiscountTotal?: number
      /** setState 반영 전 결제 진입 시 영수증 테이블명 고정 */
      receiptTableName?: string
      /** setState 반영 전 결제 진입 시 영수증 주문번호 고정 */
      receiptOrderNo?: string
    }
  ) => {
    if (amount <= 0) return
    resetTaxInvoiceUiState()
    if (onBeforeOpenPayment) {
      const deliveryLabelForPrint = [deliveryAppLabel, deliveryOrderNoProp?.trim() ? `#${deliveryOrderNoProp.trim()}` : '']
        .filter(Boolean)
        .join(' ')
      const dineInTableName = (
        receiptOpts?.receiptTableName ||
        selectedTable?.name ||
        paymentTableNameOverride ||
        ''
      ).trim()
      const orderTypeLabel =
        orderType === 'dine-in'
          ? t('posOrderTypeDineIn') || '매장'
          : orderType === 'delivery'
            ? t('posOrderTypeDelivery') || '배달'
            : t('posOrderTypeTakeout') || '포장'
      const orderNo =
        orderType === 'dine-in'
          ? String(
              receiptOpts?.receiptOrderNo ||
              selectedTable?.order?.orderNo ||
              ''
            ).trim()
          : ''
      let tableNameForPrint: string | undefined
      if (orderType === 'dine-in') {
        tableNameForPrint = dineInTableName || undefined
      } else if (orderType === 'delivery') {
        tableNameForPrint = deliveryLabelForPrint || undefined
      } else {
        tableNameForPrint = (takeoutLabelProp?.trim() || takeoutSlot || '').trim() || undefined
      }
      const memoStr = buildOrderMemo(customerMemo, { includeTaxInvoice: false })
      const linesForReceipt = receiptOpts?.receiptLines ?? cartItems
      const receiptSubtotal =
        receiptOpts?.receiptSubtotal ??
        linesForReceipt.reduce(
          (sum, i) => sum + Number(i.price ?? 0) * Math.max(1, Number(i.quantity ?? 1) || 1),
          0
        )
      const receiptItems = linesForReceipt.map((i) => ({
        id: String(i.id ?? ''),
        name: String(i.name ?? ''),
        price: Number(i.price ?? 0),
        qty: Math.max(1, Number(i.quantity ?? 1) || 1),
        ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
      }))
      const discountTotal =
        receiptOpts?.receiptDiscountTotal !== undefined
          ? receiptOpts.receiptDiscountTotal
          : discount + pointUsedNum
      const pricingSnapshot = computePosPricing({
        subtotal: receiptSubtotal,
        discountAmt: discountTotal,
        cardPaymentAmount: 0,
        adjustments: pricingAdjustments,
      })
      await Promise.resolve(
        onBeforeOpenPayment({
          orderNo,
          storeCode: currentStoreId,
          orderType: orderTypeLabel,
          tableName: tableNameForPrint,
          memo: memoStr || undefined,
          items: receiptItems,
          subtotal: receiptSubtotal,
          discountAmt: discountTotal,
          total: pricingSnapshot.finalTotal,
          vatFeeAmt: pricingSnapshot.vatFeeAmt,
          vatFeeMode: pricingSnapshot.vatFeeMode,
          ...receiptTaxDisplayFieldsFromPricing(pricingSnapshot),
          serviceFeeAmt: pricingSnapshot.serviceFeeAmt,
          serviceFeeMode: pricingSnapshot.serviceFeeMode,
          cardFeeAmt: pricingSnapshot.cardFeeAmt,
          cardFeeMode: pricingSnapshot.cardFeeMode,
          otherFeeAmt: pricingSnapshot.otherFeeAmt,
          otherFeeMode: pricingSnapshot.otherFeeMode,
          ...(orderType === 'dine-in'
            ? { guestCount: Math.max(0, Math.min(99, Math.trunc(Number(guestCount) || 0))) }
            : {}),
        })
      )
    }
    resetPaymentInputs()
    setDeliveryPaymentChannel('grab')
    setPostPaymentCashChangeBaht(null)
    setShowPaymentModal(true)
  }
  const openPaymentModal = () => {
    checkoutExistingPosOrderIdRef.current = null
    setIsExistingOrderCheckout(false)
    void openPaymentModalWithAmount(total)
  }

  const submitNonDineOrder = (withPayment: boolean) => {
    if (orderType === 'dine-in') return
    if (!onNonDineOrderComplete) return
    const payDel = parseFloat(payDeliveryApp) || 0
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? { paymentDeliveryApp: payDel, deliveryPaymentChannel }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = useAdminPaymentLines
      ? adminConfiguredWalletSum
      : (parseFloat(payTrueMoney) || 0) +
        (parseFloat(payWeChat) || 0) +
        (parseFloat(payAlipay) || 0) +
        (parseFloat(payLinePay) || 0) +
        (parseFloat(payShopeePay) || 0) +
        (parseFloat(payOther) || 0)
    const payOtherBreakdown = buildPaymentOtherBreakdownSnapshot()
    const deliveryLabel = [deliveryAppLabel, deliveryOrderNoProp?.trim() ? `#${deliveryOrderNoProp.trim()}` : '']
      .filter(Boolean)
      .join(' ')
    const selectedMemberNo = memberMap[selectedMemberId]?.memberNo || ''
    if (withPayment) finalizeSplitPaymentsForReceipt()
    const splitReceipts = withPayment ? buildSplitReceiptPayloads() : undefined
    onNonDineOrderComplete({
      orderType,
      orderLabel: orderType === 'delivery'
        ? (deliveryLabel || t('posOrderTypeDelivery') || '배달')
        : (takeoutLabelProp?.trim() || (t('posOrderTypeTakeout') || '포장')),
      items: cartItems.map(mapCartItemToOrderPayload),
      memo: buildOrderMemo(customerMemo),
      discountAmt: discount,
      discountReason: paymentDiscountReason,
      serviceAmt: serviceDiscountAmt,
      serviceReason: paymentServiceReason || undefined,
      memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
      memberNo: selectedMemberNo || undefined,
      couponCode: couponAppliedCode || undefined,
      couponDiscountAmt: couponAppliedAmt || undefined,
      pointUsed: pointUsedNum || undefined,
      payment: withPayment
        ? {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            ...deliveryPayPart,
          }
        : {
            paymentCash: 0,
            paymentCard: 0,
            paymentQr: 0,
            paymentOther: 0,
            paymentDeliveryApp: 0,
            deliveryPaymentChannel: null,
          },
      ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
    })
  }

  const handlePaymentComplete = () => {
    const dineInTableName = selectedTable?.name || paymentTableNameOverride
    const payDel = parseFloat(payDeliveryApp) || 0
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? { paymentDeliveryApp: payDel, deliveryPaymentChannel }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = useAdminPaymentLines
      ? adminConfiguredWalletSum
      : (parseFloat(payTrueMoney) || 0) +
        (parseFloat(payWeChat) || 0) +
        (parseFloat(payAlipay) || 0) +
        (parseFloat(payLinePay) || 0) +
        (parseFloat(payShopeePay) || 0) +
        (parseFloat(payOther) || 0)
    const payOtherBreakdown = buildPaymentOtherBreakdownSnapshot()
    finalizeSplitPaymentsForReceipt()
    const splitReceipts = buildSplitReceiptPayloads()
    if (needTaxInvoice && !taxInvoiceInvalid) {
      const profile: TaxInvoiceProfile = {
        type: invoiceCustomerType === 'company' ? 'corporate' : 'individual',
        name: normalizedTaxName,
        taxId: normalizedTaxId,
        branchCode: effectiveTaxBranchNo,
        phone: normalizedTaxPhone,
        email: normalizedTaxEmail,
        address: normalizedTaxAddress,
      }
      const regKey = taxRegistryLocalKey(
        taxMemberNo.trim(),
        memberMap[selectedMemberId]?.memberNo,
        normalizedTaxId,
        effectiveTaxBranchNo
      )
      setTaxMemberRegistry((prev) => ({ ...prev, [regKey]: profile }))
      if (auth?.store && auth?.role && currentStoreId) {
        void upsertPosTaxInvoiceRecipient({
          userStore: auth.store,
          userRole: auth.role,
          storeCode: currentStoreId,
          memberId: selectedMemberId ? Number(selectedMemberId) : null,
          memberNo: taxMemberNo.trim() || memberMap[selectedMemberId]?.memberNo || null,
          customerType: invoiceCustomerType === 'company' ? 'company' : 'person',
          name: normalizedTaxName,
          taxId: normalizedTaxId,
          branchNo: effectiveTaxBranchNo,
          phone: normalizedTaxPhone,
          email: normalizedTaxEmail,
          address: normalizedTaxAddress,
          source: 'pos_payment',
        }).catch(() => {})
      }
    }
    const resolvedExistingCheckoutId =
      checkoutExistingPosOrderIdRef.current ?? normalizeExistingPosOrderId(pendingOrderId)

    if (orderType === 'dine-in' && dineInTableName && onDineInOrderComplete) {
      onDineInOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          tableName: dineInTableName,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            ...deliveryPayPart,
          },
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponAppliedCode || undefined,
          couponDiscountAmt: couponAppliedAmt || undefined,
          pointUsed: pointUsedNum || undefined,
          isPrepaid,
          guestCount: guestCount > 0 ? guestCount : undefined,
        },
        pendingOrderId ?? undefined
      )
    } else if (
      orderType === 'delivery' &&
      resolvedExistingCheckoutId != null &&
      paymentTableNameOverride &&
      onDeliveryOrderComplete
    ) {
      onDeliveryOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            ...deliveryPayPart,
          },
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponAppliedCode || undefined,
          couponDiscountAmt: couponAppliedAmt || undefined,
          pointUsed: pointUsedNum || undefined,
        },
        resolvedExistingCheckoutId
      )
    } else if (
      orderType === 'takeout' &&
      resolvedExistingCheckoutId != null &&
      paymentTableNameOverride &&
      onTakeoutOrderComplete
    ) {
      onTakeoutOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            ...deliveryPayPart,
          },
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponAppliedCode || undefined,
          couponDiscountAmt: couponAppliedAmt || undefined,
          pointUsed: pointUsedNum || undefined,
        },
        resolvedExistingCheckoutId
      )
    } else if (orderType !== 'dine-in' && onNonDineOrderComplete) {
      submitNonDineOrder(true)
    }
    const cashPayRecorded = parseFloat(payCash) || 0
    const tenderChangeRounded = round2(Math.max(0, cashChangeAmountForTendered))
    const showPostCashChangeReminder = cashPayRecorded > 0.001 && tenderChangeRounded > 0.001

    onPaymentComplete?.()
    setShowPaymentModal(false)
    handleClearCart()
    if (showPostCashChangeReminder) {
      setPostPaymentCashChangeBaht(tenderChangeRounded)
    }
  }

  const addItem = (item: CartPanelAddItemPayload) => {
    setCartItems((prev) => mergeCartPanelAddItem(prev, item))
  }

  const applyCouponCode = async () => {
    const code = couponCode.trim()
    if (!code) {
      setCouponMessage(t('posCouponPleaseEnterCode'))
      return
    }
    try {
      const res = await validatePosCoupon({ code, subtotal })
      if (!res.valid) {
        setCouponAppliedCode('')
        setCouponAppliedAmt(0)
        setCouponMessage(res.message || t('posCouponInvalid'))
        return
      }
      const amount = Math.max(0, Number(res.discountAmt || 0))
      setDiscountType('fixed')
      setDiscountValue(amount)
      setDiscountReason(
        String(res.discountReason || i18nTr(t, 'posCouponDiscountReason', { code: code.toUpperCase() }))
      )
      setCouponAppliedCode(code.toUpperCase())
      setCouponAppliedAmt(amount)
      setCouponMessage(i18nTr(t, 'posCouponAppliedSuccess', { code: code.toUpperCase() }))
    } catch (e) {
      console.error('validatePosCoupon:', e)
      setCouponMessage(t('posCouponValidateError'))
    }
  }

  const openDineInPaymentFromOrder = (payload: {
    tableName: string
    orderNo?: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
  }) => {
    checkoutExistingPosOrderIdRef.current = null
    setIsExistingOrderCheckout(false)
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(String(i.menuId ?? '').trim() ? { menuId: String(i.menuId).trim() } : {}),
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.tableName)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal: pointUsedNum,
      receiptTableName: payload.tableName,
      receiptOrderNo: payload.orderNo,
    })
  }

  const openTakeoutPaymentFromOrder = (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
    existingOrderId?: number | null
  }) => {
    const existingId = normalizeExistingPosOrderId(payload.existingOrderId)
    checkoutExistingPosOrderIdRef.current = existingId
    setIsExistingOrderCheckout(existingId != null)
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(String(i.menuId ?? '').trim() ? { menuId: String(i.menuId).trim() } : {}),
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal: pointUsedNum,
    })
  }

  const openDeliveryPaymentFromOrder = async (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
    existingOrderId?: number | null
  }) => {
    const existingId = normalizeExistingPosOrderId(payload.existingOrderId)
    checkoutExistingPosOrderIdRef.current = existingId
    setIsExistingOrderCheckout(existingId != null)
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(String(i.menuId ?? '').trim() ? { menuId: String(i.menuId).trim() } : {}),
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setAppliedCollabId(null)
    setCouponCode('')
    setCouponAppliedCode('')
    setCouponAppliedAmt(0)
    setCouponMessage('')
    setPointUsed('0')
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal: 0,
    })
  }

  /** 배달 기존 주문 「ชำระที่ร้าน」: 플랫폼 정산 전제 — 결제 수단 없이 할인만 조정 후 완료 */
  const completeDeliveryPayInStoreFromModal = () => {
    const existingId = normalizeExistingPosOrderId(checkoutExistingPosOrderIdRef.current)
    if (!onDeliveryOrderComplete || existingId == null) return
    if (total <= 0) return
    const payChannel =
      typeof deliveryAppProp === 'string' && deliveryAppProp.trim().length > 0
        ? deliveryAppProp.trim().toLowerCase()
        : null
    onDeliveryOrderComplete(
      {
        items: cartItems.map(mapCartItemToOrderPayload),
        orderLabel: (paymentTableNameOverride ?? '').trim() || '',
        memo: buildOrderMemo(customerMemo),
        discountAmt: discount,
        discountReason: paymentDiscountReason,
        payment: {
          paymentCash: 0,
          paymentCard: 0,
          paymentQr: 0,
          paymentOther: 0,
          paymentDeliveryApp: total,
          deliveryPaymentChannel: payChannel,
        },
        memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
        memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
        couponCode: couponAppliedCode || undefined,
        couponDiscountAmt: couponAppliedAmt || undefined,
        pointUsed: pointUsedNum || undefined,
      },
      existingId
    )
    onPaymentComplete?.()
    handleClearCart()
    setShowPaymentModal(false)
  }

  const handleClearCart = () => {
    resetTaxInvoiceUiState()
    setCartItems([])
    setLineDiscountModeByItemId({})
    setGuestCount(0)
    setCustomerMemo('')
    setCouponCode('')
    setCouponAppliedCode('')
    setCouponAppliedAmt(0)
    setPointUsed('0')
    setCouponMessage('')
    setDiscountValue(0)
    setDiscountReason('')
    setAppliedCollabId(null)
    setPaymentTableNameOverride(null)
    checkoutExistingPosOrderIdRef.current = null
    setIsExistingOrderCheckout(false)
  }

  const imperativeApiRef = useRef<CartPanelHandle | null>(null)
  imperativeApiRef.current = {
    addItem,
    clearCart: handleClearCart,
    openDineInPaymentFromOrder,
    openTakeoutPaymentFromOrder,
    openDeliveryPaymentFromOrder,
  }

  useImperativeHandle(
    ref,
    () => ({
      addItem: (item) => imperativeApiRef.current?.addItem(item),
      clearCart: () => imperativeApiRef.current?.clearCart(),
      openDineInPaymentFromOrder: (p) => imperativeApiRef.current?.openDineInPaymentFromOrder(p),
      openTakeoutPaymentFromOrder: (p) => imperativeApiRef.current?.openTakeoutPaymentFromOrder(p),
      openDeliveryPaymentFromOrder: (p) => imperativeApiRef.current?.openDeliveryPaymentFromOrder(p),
    }),
    []
  )

  useLayoutEffect(() => {
    if (!onImperativeBridge) return
    const api: CartPanelHandle = {
      addItem: (item) => imperativeApiRef.current?.addItem(item),
      clearCart: () => imperativeApiRef.current?.clearCart(),
      openDineInPaymentFromOrder: (p) => imperativeApiRef.current?.openDineInPaymentFromOrder(p),
      openTakeoutPaymentFromOrder: (p) => imperativeApiRef.current?.openTakeoutPaymentFromOrder(p),
      openDeliveryPaymentFromOrder: (p) => imperativeApiRef.current?.openDeliveryPaymentFromOrder(p),
    }
    ;(api as CartPanelHandle & { __debug?: Record<string, string> }).__debug = {
      instanceId: instanceIdRef.current,
      debugOwner,
      cacheKey: cartItemsCacheKey,
    }
    onImperativeBridge(api)
    return () => onImperativeBridge(null)
    // cartItemsCacheKey 제외: 변경 시 cleanup이 cartRef를 null로 만들어 담기가 실패함
  }, [onImperativeBridge, debugOwner])

  const updateItemQuantity = (itemId: string, delta: number) => {
    setCartItems(prev =>
      prev
        .map(item => {
          if (item.id === itemId) {
            const newQty = Math.max(0, item.quantity + delta)
            return newQty === 0 ? null : { ...item, quantity: newQty }
          }
          return item
        })
        .filter((item): item is CartItem => item != null)
    )
  }

  useEffect(() => {
    if (orderType !== 'dine-in') {
      prevSelectedTableIdRef.current = selectedTable?.id ?? null
      return
    }

    const nextTableId = selectedTable?.id ?? null
    const prevTableId = prevSelectedTableIdRef.current
    const activeOrder = selectedTable?.order

    // 테이블 미선택(서빙 패널 등): ref만 맞추고 손님 수는 건드리지 않음(다음 테이블 선택 시 다시 계산)
    if (!nextTableId) {
      prevSelectedTableIdRef.current = null
      return
    }

    // 다른 테이블로 바꿀 때만 장바구니·쿠폰 등 초기화
    if (prevTableId && nextTableId && prevTableId !== nextTableId) {
      handleClearCart()
    }

    if (activeOrder?.id) {
      // 진행 중 주문이 있는 테이블(추가 주문): DB 손님 수를 기본값으로 — 테이블 id 전환이 없어도 매번 맞춤
      // (prevRef가 이미 같은 id면 예전 로직은 손님 수를 안 넣었음)
      const raw = Math.max(0, Math.trunc(Number(activeOrder.guestCount ?? 0) || 0))
      setGuestCount(raw > 0 ? raw : 1)
    } else if (prevTableId !== nextTableId) {
      // 빈 테이블로 새 홀 주문: 테이블을 바꿨을 때만 0으로
      setGuestCount(0)
    }

    prevSelectedTableIdRef.current = nextTableId
  }, [orderType, selectedTable?.id, selectedTable?.order?.id, selectedTable?.order?.guestCount])

  useEffect(() => {
    if (posDineInDemoDefaultGuestCount == null) return
    if (orderType !== 'dine-in' || !selectedTable?.id) return
    if (selectedTable?.order?.id) return
    if (guestCount > 0) return
    setGuestCount(posDineInDemoDefaultGuestCount)
  }, [posDineInDemoDefaultGuestCount, orderType, selectedTable?.id, selectedTable?.order?.id, guestCount])

  useEffect(() => {
    onGuestCountChange?.(guestCount)
  }, [guestCount, onGuestCountChange])

  const lockPaymentModalForTour = useMemo(() => {
    if (!showTourStepOverlay) return false
    const id = currentStep?.id
    if (!id) return false
    return (
      id === 'w19_payment' ||
      id === 'w19a_dutch_toggle' ||
      id === 'w19b_partial_pay' ||
      id === 'w19c_dutch_menu_mode' ||
      id === 'w19d_dutch_menu_panel' ||
      id === 'w20_payment_tabs' ||
      id === 'w21_payment_card' ||
      id === 'w22_payment_qr' ||
      id === 'w23_payment_delivery_app' ||
      id === 'w24_payment_other' ||
      id === 'w25_tax_invoice_toggle' ||
      id === 'w26_tax_invoice_fields' ||
      id === 'w26a_tax_id' ||
      id === 'w26b_tax_branch' ||
      id === 'w26c_tax_phone' ||
      id === 'w26d_tax_address'
    )
  }, [currentStep?.id, showTourStepOverlay])

  return (
    <>
    <Card className="h-full flex flex-col min-w-0 overflow-hidden" data-tour="pos-tour-cart">
      <CardHeader className="border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          {orderType === 'dine-in' && typeof onBackToTableSelection === 'function' && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                'h-10 w-10 shrink-0 rounded-xl border-border bg-background shadow-sm',
                'hover:bg-muted'
              )}
              onClick={onBackToTableSelection}
              aria-label={t('posBackToTableSelect') || '테이블 선택'}
            >
              <ArrowLeft className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            </Button>
          )}

          <div
            className={cn(
              'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1 shadow-sm',
              'dark:bg-muted/20'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="truncate text-sm font-semibold leading-none">
                {t('posCart')}
              </CardTitle>
              {cartItems.length > 0 && (
                <span className="inline-flex h-6 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {cartItems.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </div>

            {orderType === 'dine-in' && (
              <>
                <div className="h-6 w-px shrink-0 bg-border/80" aria-hidden />
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  title={t('posTableLabel') || ''}
                >
                  <LayoutGrid
                    className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'inline-flex h-8 min-w-[2rem] max-w-[3rem] items-center justify-center rounded-full border px-1.5',
                      'border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-950',
                      'dark:border-emerald-500/35 dark:from-emerald-950/50 dark:to-emerald-900/60 dark:text-emerald-50',
                      'shadow-sm ring-1 ring-emerald-700/10 dark:ring-emerald-400/15'
                    )}
                    aria-label={
                      selectedTable?.name
                        ? translateReceiptTableDisplayName(selectedTable.name, t)
                        : t('posSelectTableNone')
                    }
                  >
                    <span className="truncate text-center text-xs font-extrabold tabular-nums leading-none">
                      {selectedTable?.name
                        ? translateReceiptTableDisplayName(selectedTable.name, t)
                        : '—'}
                    </span>
                  </span>
                </div>
              </>
            )}

            {orderType === 'delivery' && (
              <>
                <div className="h-6 w-px shrink-0 bg-border/80" aria-hidden />
                <div
                  className="flex min-w-0 shrink-0 items-center gap-1.5"
                  title={
                    [
                      deliveryAppLabel,
                      deliveryOrderNoProp?.trim() ? `#${deliveryOrderNoProp.trim()}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || (t('posOrderTypeDelivery') || '')
                  }
                >
                  <Bike
                    className={cn('h-4 w-4 shrink-0', deliveryBrand.bike)}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'inline-flex h-8 max-w-[5.5rem] min-w-[2rem] items-center justify-center rounded-full border px-1.5 sm:max-w-[7rem]',
                      deliveryBrand.chip
                    )}
                  >
                    <span className="truncate text-center text-xs font-extrabold leading-none">
                      {deliveryAppLabel || (t('posSelectDeliveryApp') || '—')}
                    </span>
                  </span>
                </div>
              </>
            )}

            {orderType === 'takeout' && (
              <>
                <div className="h-6 w-px shrink-0 bg-border/80" aria-hidden />
                <div
                  className="flex min-w-0 shrink-0 items-center gap-1.5"
                  title={
                    takeoutLabelProp?.trim() ||
                    (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', '1')
                  }
                >
                  <Package
                    className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'inline-flex h-8 max-w-[5.5rem] min-w-[2rem] items-center justify-center rounded-full border px-1.5 sm:max-w-[7rem]',
                      'border-amber-600/40 bg-gradient-to-b from-amber-50 to-amber-100/90 text-amber-950',
                      'dark:border-amber-500/35 dark:from-amber-950/45 dark:to-amber-900/55 dark:text-amber-50',
                      'shadow-sm ring-1 ring-amber-700/10 dark:ring-amber-400/15'
                    )}
                  >
                    <span className="truncate text-center text-xs font-extrabold leading-none">
                      {takeoutLabelProp?.trim() ||
                        (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', '1')}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl border-border bg-background shadow-sm hover:bg-muted"
            onClick={handleClearCart}
            title={t('posClearCart') || ''}
            aria-label={t('posClearCart') || ''}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col py-2 gap-1.5 min-h-0 overflow-y-auto overflow-x-hidden px-0">
        {/* Cart Items - 메뉴 리스트를 맨 위에 배치해 좁은 패널에서도 항상 보이게 */}
        <div className="min-w-0 shrink-0">
          {cartItems.length === 0 ? (
            <div className="min-h-[60px] flex items-center justify-center text-muted-foreground text-sm px-3">
              {t('posCartEmpty')}
            </div>
          ) : (
            <TooltipProvider delayDuration={0}>
              <div className="space-y-1.5 w-full max-w-full min-w-0 overflow-hidden pr-2">
                {cartItems.map(item => {
                  const lineDiscountMode = lineDiscountModeByItemId[item.id] ?? 'none'
                  const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                  const mainName = optMatch ? optMatch[1].trim() : item.name
                  const optionPart = optMatch ? optMatch[2].trim() : null
                  const mainNameDisp = trMenuLine(mainName)
                  const optionPartDisp = optionPart ? trMenuLine(optionPart) : null
                  const isBanban = optionPart?.includes(' / ')
                  const [flavor1, flavor2] = isBanban && optionPart ? optionPart.split(/\s*\/\s*/).map((s) => s.trim()) : [null, null]
                  const flavor1Disp = flavor1 ? trMenuLine(flavor1) : null
                  const flavor2Disp = flavor2 ? trMenuLine(flavor2) : null
                  /**
                   * 세트 자식 라인의 옵션 이름.
                   * 1순위: 카트에 add될 때 미리 채워진 `p.optionName` (sell 채널/캐시 누락 영향 없음)
                   * 2순위: optionId/메뉴 옵션 lookup으로 추정
                   */
                  const resolveSubOptionName = (p: { menuId: string; optionId: string | null; optionCode?: string | null; optionName?: string | null }) => {
                    const cached = String(p.optionName ?? '').trim()
                    if (cached) return cached
                    const menu = menuByIdForCollab.get(String(p.menuId))
                    return resolvePromoSublineOptionDisplayName({
                      optionId: p.optionId,
                      optionCode: p.optionCode,
                      optionById,
                      optionByCode,
                      menuOptions: optionsByMenuIdForOrder.get(String(p.menuId)),
                      orderChannel: orderType,
                      menuCode: menu?.code,
                    })
                  }
                  const promoComposeLines =
                    Array.isArray(item.promoItems) && item.promoItems.length > 0
                      ? item.promoItems.slice(0, 4).map((p) => {
                          const menuName = menuByIdForCollab.get(String(p.menuId))?.name?.trim() || `#${String(p.menuId)}`
                          const optionName = resolveSubOptionName(p)
                          const optionLabel = optionName ? ` (${trMenuLine(optionName)})` : ''
                          return `${trMenuLine(menuName)}${optionLabel} x${Math.max(1, Number(p.quantity) || 1)}`
                        })
                      : []
                  const promoComposeAllLines =
                    Array.isArray(item.promoItems) && item.promoItems.length > 0
                      ? item.promoItems.map((p) => {
                          const menuName = menuByIdForCollab.get(String(p.menuId))?.name?.trim() || `#${String(p.menuId)}`
                          const optionName = resolveSubOptionName(p)
                          const optionLabel = optionName ? ` (${trMenuLine(optionName)})` : ''
                          return `${trMenuLine(menuName)}${optionLabel} x${Math.max(1, Number(p.quantity) || 1)}`
                        })
                      : []
                  const promoComposeMoreCount =
                    promoComposeLines.length > 0 && item.promoItems
                      ? Math.max(0, item.promoItems.length - promoComposeLines.length)
                      : 0
                  return (
                  <div
                    key={item.id}
                    className="bg-secondary/50 w-full min-w-0 max-w-full rounded-sm overflow-hidden"
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start py-1.5 px-2">
                      <div className="min-w-0 overflow-hidden">
                        <Tooltip
                          open={menuNameTooltipOpen === item.id}
                          onOpenChange={(open) => setMenuNameTooltipOpen(open ? item.id : null)}
                        >
                          <TooltipTrigger asChild>
                            <p
                              className="text-sm font-medium cursor-default touch-manipulation select-none line-clamp-2 min-w-0"
                              title={trMenuLine(item.name)}
                              onClick={() => setMenuNameTooltipOpen((prev) => (prev === item.id ? null : item.id))}
                            >
                              {mainNameDisp}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[min(20rem,85vw)] text-left whitespace-normal">
                            {trMenuLine(item.name)}
                          </TooltipContent>
                        </Tooltip>
                        {isBanban && flavor1 && flavor2 ? (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            <span>① {flavor1Disp}</span>
                            <span className="mx-1">·</span>
                            <span>② {flavor2Disp}</span>
                          </p>
                        ) : optionPartDisp ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-w-0 break-words" title={optionPartDisp}>
                            {optionPartDisp}
                          </p>
                        ) : null}
                        {promoComposeLines.length > 0 ? (
                          <div className="mt-0.5 space-y-0.5">
                            {promoComposeLines.map((line, idx) => (
                              <p
                                key={`${item.id}-promo-line-${idx}`}
                                className="text-xs text-blue-700/90 dark:text-blue-300 min-w-0 break-words"
                                title={line}
                              >
                                - {trMenuLine(line)}
                              </p>
                            ))}
                            {promoComposeMoreCount > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="inline-block cursor-help text-[10px] text-blue-700/70 dark:text-blue-300/80">
                                    +{promoComposeMoreCount}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[min(20rem,85vw)] text-left whitespace-normal">
                                  <div className="space-y-0.5">
                                    {promoComposeAllLines.map((line, idx) => (
                                      <p key={`${item.id}-promo-all-line-${idx}`} className="text-xs break-words">
                                        - {trMenuLine(line)}
                                      </p>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        ) : null}
                        {lineDiscountMode !== 'none' ? (
                          <div className="mt-1">
                            <Badge
                              variant="secondary"
                              className={cn(
                                'h-5 rounded-md px-1.5 text-[10px]',
                                lineDiscountMode === 'service'
                                  ? 'border-emerald-400/50 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                                  : lineDiscountMode === 'cancel'
                                    ? 'border-rose-400/50 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
                                    : 'border-amber-400/50 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                              )}
                            >
                              {lineDiscountMode === 'service'
                                ? tr('posServiceHandled', '서비스처리')
                                : lineDiscountMode === 'cancel'
                                  ? tr('posLineCancelledShort', '취소처리')
                                  : tr('posDiscountApplied', '할인적용')}
                            </Badge>
                          </div>
                        ) : null}
                        <p className="text-xs text-muted-foreground tabular-nums shrink-0 mt-0.5">
                          {formatBahtNum(item.price)} ฿
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 w-[5.5rem] shrink-0 justify-end self-start pt-0.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => updateItemQuantity(item.id, -1)}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => updateItemQuantity(item.id, 1)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {((item.note ?? '').trim() || editingNoteItemId === item.id) ? (
                      <div className={cn(
                        "px-2 pb-1.5 pt-0",
                        (item.note ?? '').trim() && "rounded-md bg-blue-900/15 dark:bg-blue-800/25 border border-blue-700/40 dark:border-blue-500/40"
                      )}>
                        {editingNoteItemId === item.id ? (
                          <Input
                            aria-label={tr('posLineNote', 'Note')}
                            placeholder=""
                            value={item.note ?? ''}
                            onChange={(e) =>
                              setCartItems((prev) =>
                                prev.map((p) => (p.id === item.id ? { ...p, note: e.target.value } : p))
                              )
                            }
                            onBlur={() => setEditingNoteItemId(null)}
                            className="h-7 text-xs border-0 bg-transparent focus-visible:ring-2"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-h-7">
                            <p className="flex-1 text-xs font-medium text-blue-800 dark:text-blue-200 break-words">
                              {(item.note ?? '').trim()}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-blue-600 hover:text-blue-800"
                              onClick={() => setEditingNoteItemId(item.id)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-2 pb-1 pt-0 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          aria-label={tr('posLineNote', '메모')}
                          title={tr('posLineNote', '메모')}
                          onClick={() => setEditingNoteItemId(item.id)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </TooltipProvider>
          )}
        </div>

        {/* 주문 타입 / 회원 / 테이블 등 */}
        <div className="space-y-1 shrink-0 px-3">
          {!lockOrderType && (
            <div className="flex items-center gap-2">
              <Label className="text-sm w-12 flex-shrink-0">{t('posOrderTypeLabel')}</Label>
              <div className="flex gap-1">
                {[
                  { value: 'dine-in' as const, labelKey: 'posOrderTypeDineIn' },
                  { value: 'delivery' as const, labelKey: 'posOrderTypeDelivery' },
                  { value: 'takeout' as const, labelKey: 'posOrderTypeTakeout' }
                ].map(type => (
                  <Button
                    key={type.value}
                    variant={orderType === type.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setOrderTypeInternal(type.value)}
                  >
                    {t(type.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 1행: 회원검색 + 손님(테이블현황만) */}
          <div className="flex flex-nowrap items-center gap-1.5">
            <Input
              placeholder={t('posMemberSearchPh') || '회원번호/이름/번호'}
              value={memberKeyword}
              onChange={(e) => setMemberKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleMemberSearch())}
              onFocus={scrollIntoViewOnFocus}
              className="h-8 flex-1 w-0 min-w-0 max-w-[9rem]"
            />
            <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={handleMemberSearch} disabled={membersLoading}>
              {membersLoading ? '...' : (t('posSearch') || '검색')}
            </Button>
            {orderType === 'dine-in' && (
              <div
                className="flex items-center gap-1.5 shrink-0 rounded-lg border border-sky-500/45 bg-sky-500/[0.08] px-2 py-1 shadow-sm dark:bg-sky-950/25"
                title={t('posOrderGuestCount') || '홀 주문 손님 수(매출·통계용)'}
                aria-label={t('posOrderGuestCount') || undefined}
                data-tour="pos-tour-cart-guest-count"
              >
                <Users className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
                <Select
                  value={guestCount === 0 ? '__zero__' : guestCount >= 1 && guestCount <= 9 ? String(guestCount) : '__direct__'}
                  onValueChange={(v) => {
                    if (v === '__zero__') setGuestCount(0)
                    else if (v === '__direct__') {
                      setGuestDirectValue(String(guestCount > 9 ? guestCount : 10))
                      setGuestDirectOpen(true)
                    } else setGuestCount(Number(v))
                  }}
                >
                  <SelectTrigger className="h-8 w-[3.25rem] border-sky-600/35 bg-background/90 [&>span]:flex [&>span]:items-center [&>span]:justify-center dark:border-sky-500/40">
                    <span className="tabular-nums font-semibold">{guestCount}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__zero__">0</SelectItem>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                    <SelectItem value="__direct__">{t('posGuestDirectInput') || '직접 입력'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 2행: 배달앱+주문번호(배달) / 포장(포장) — 홀은 테이블명을 카드 헤더에 표시 */}
          {orderType === 'delivery' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posDeliveryApp')}</Label>
                <Badge variant="secondary" className={cn('h-7 border px-3', deliveryBrand.badge)}>
                  {deliveryAppLabel || t('posSelectDeliveryApp')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posDeliveryOrderNo') || '주문 번호'}</Label>
                <span className="text-sm text-muted-foreground min-w-0 truncate max-w-[8rem]">
                  {deliveryOrderNoProp || '—'}
                </span>
              </div>
            </div>
          )}
          {orderType === 'takeout' && (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm flex-shrink-0">{t('posTakeoutSlot') || '포장'}</Label>
              {lockOrderType ? (
                <Badge variant="secondary" className="h-7 px-3">
                  {takeoutLabelProp?.trim() || (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', '1')}
                </Badge>
              ) : (
                <>
                  <Select value={takeoutSlot} onValueChange={(v) => setTakeoutSlot(v)}>
                    <SelectTrigger className="w-28 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {(t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', String(n))}
                        </SelectItem>
                      ))}
                      <SelectItem value="__member__">{t('posTakeoutMemberName') || '회원 이름'}</SelectItem>
                    </SelectContent>
                  </Select>
                  {takeoutSlot === '__member__' && (
                    <Input
                      placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                      value={takeoutMemberName}
                      onChange={(e) => setTakeoutMemberName(e.target.value)}
                      className="h-8 flex-1 min-w-0 max-w-[10rem] text-sm"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* 회원 검색 결과 & 비회원 버튼 — 비어 있을 때는 높이를 두지 않아 손님 메모와 간격 축소 */}
          <div
            className={cn(
              'flex flex-wrap items-center gap-1',
              selectedMemberId || memberOptions.length > 0 ? 'min-h-[26px]' : 'min-h-0'
            )}
          >
            {selectedMemberId && (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSelectedMemberId('')}>
                {t('posMemberNone') || '비회원'}
              </Button>
            )}
            {memberOptions.length > 0 && memberOptions.map((m) => (
              <Button
                key={m.value}
                type="button"
                size="sm"
                variant={selectedMemberId === m.value ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedMemberId(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          {memberSearchEmpty && (
            <p className="text-xs text-amber-600">
              {t('posMemberSearchEmpty') || '검색 결과가 없습니다. ERP 회원관리에서 회원을 먼저 등록해 주세요.'}
            </p>
          )}

          <Dialog open={guestDirectOpen} onOpenChange={setGuestDirectOpen}>
                  <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                      <DialogTitle>{t('posGuestDirectInput') || '직접 입력'}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 py-2">
                      <Label className="text-sm text-muted-foreground">{tr('posGuestHowManyPh', '몇 명?')}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        className="tabular-nums"
                        value={guestDirectValue}
                        onChange={(e) => setGuestDirectValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmGuestDirect())}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setGuestDirectOpen(false)}>
                        {t('posCancel') ?? t('cancel') ?? '취소'}
                      </Button>
                      <Button size="sm" onClick={confirmGuestDirect}>
                        {t('posConfirm') || '확인'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
        </div>

        {/* Options - 쿠폰/할인은 결제 페이지에서 입력. 손님 메모는 내용 있을 때만 표시 */}
        <div className="space-y-1.5 border-t pt-1.5 shrink-0 px-3" aria-label={t('posCustomerMemo') || '손님 메모'}>
          {customerMemo.trim() || editingCustomerMemo ? (
            <div className={cn(
              "rounded-md p-2",
              customerMemo.trim() && "bg-blue-900/15 dark:bg-blue-800/25 border border-blue-700/40 dark:border-blue-500/40"
            )}>
              {editingCustomerMemo ? (
                <Input
                  placeholder={t('posCustomerMemoPh') || '알레르기, 맵기 조절 등'}
                  value={customerMemo}
                  onChange={e => setCustomerMemo(e.target.value)}
                  onBlur={() => setEditingCustomerMemo(false)}
                  className="h-8 text-sm border-0 bg-transparent focus-visible:ring-2"
                  autoFocus
                  aria-label={t('posCustomerMemo') || '손님 메모'}
                />
              ) : (
                <div className="flex items-center gap-1.5 min-h-8">
                  <p className="flex-1 text-sm font-medium text-blue-800 dark:text-blue-200 break-words">
                    {customerMemo.trim()}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-blue-600 hover:text-blue-800"
                    onClick={() => setEditingCustomerMemo(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditingCustomerMemo(true)}
              aria-label={t('posCustomerMemo') || '손님 메모'}
            >
              + {t('posCustomerMemo') || '손님 메모'}
            </Button>
          )}
        </div>

        {/* Totals — 컴팩트, 라벨 열 정렬 */}
        <div className="flex gap-2 border-t px-3 pt-2">
          <div className="w-0.5 shrink-0 rounded-full bg-border self-stretch min-h-[2rem]" aria-hidden />
          <div className="min-w-0 flex-1 space-y-0 text-xs leading-tight">
            <div className="flex justify-between gap-2 py-0.5 text-sm">
              <span className="min-w-0 pl-0.5 text-muted-foreground">{t('posSubtotal')}</span>
              <span className="shrink-0 tabular-nums">{formatBahtNum(receiptSubtotalForUi)} ฿</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between gap-2 py-0.5 text-destructive">
                <span className="min-w-0 pl-0.5">{t('posDiscount')}</span>
                <span className="shrink-0 tabular-nums">-{formatBahtNum(discount)} ฿</span>
              </div>
            )}
            {receiptVatForUi > 0 && (
              <div className="flex justify-between gap-2 py-0.5 text-muted-foreground">
                <span className="min-w-0 pl-0.5">
                  {t('posVatLabel') || '부가세'} ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
                </span>
                <span className="shrink-0 tabular-nums">{pricing.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(receiptVatForUi)} ฿</span>
              </div>
            )}
            {pricing.serviceFeeAmt > 0 && (
              <div className="flex justify-between gap-2 py-0.5 text-muted-foreground">
                <span className="min-w-0 pl-0.5">
                  {t('posServiceFee') || '서비스비'} ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
                </span>
                <span className="shrink-0 tabular-nums">{pricing.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.serviceFeeAmt)} ฿</span>
              </div>
            )}
            {pricing.cardFeeAmt > 0 && (
              <div className="flex justify-between gap-2 py-0.5 text-muted-foreground">
                <span className="min-w-0 pl-0.5">
                  {t('posCardFee') || '카드비'} ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
                </span>
                <span className="shrink-0 tabular-nums">{pricing.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.cardFeeAmt)} ฿</span>
              </div>
            )}
            {pricing.otherFeeAmt > 0 && (
              <div className="flex justify-between gap-2 py-0.5 text-muted-foreground">
                <span className="min-w-0 pl-0.5">
                  {t('posOtherFee') || '기타'} ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
                </span>
                <span className="shrink-0 tabular-nums">{pricing.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.otherFeeAmt)} ฿</span>
              </div>
            )}
            <div className="flex justify-between gap-2 border-t border-border/60 pt-1 mt-0.5 text-sm font-bold">
              <span className="min-w-0 pl-0.5">{t('posInputTotal')}</span>
              <span className="shrink-0 tabular-nums">{formatBahtNum(total)} ฿</span>
            </div>
          </div>
        </div>

        <div className="px-3 flex flex-col gap-2">
          {orderType === 'dine-in' && selectedTable && guestCount <= 0 && (
            <p className="text-xs text-amber-700">
              {t('posTourTableGuestRequired') || '테이블 주문은 인원을 먼저 선택해야 주문할 수 있습니다.'}
            </p>
          )}
          {orderType === 'dine-in' && selectedTable && (
            <Button
              data-tour="pos-tour-cart-order"
              className="w-full h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700"
              disabled={cartItems.length === 0 || guestCount <= 0 || posBackendActionInFlight}
              onClick={() => {
                if (!selectedTable || cartItems.length === 0 || guestCount <= 0 || posBackendActionInFlight) return
                const submitItems = cartItems.map(mapCartItemToOrderPayload)
                onOrderSubmit?.({
                  items: submitItems,
                  tableName: selectedTable.name,
                  memo: buildOrderMemo(customerMemo),
                  discountAmt: discount,
                  discountReason: paymentDiscountReason,
                  serviceAmt: serviceDiscountAmt,
                  serviceReason: paymentServiceReason || undefined,
                  memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
                  memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
                  couponCode: couponAppliedCode || undefined,
                  couponDiscountAmt: couponAppliedAmt || undefined,
                  pointUsed: pointUsedNum || undefined,
                  guestCount,
                })
              }}
            >
              {t('posOrderButton') || '주문'}
            </Button>
          )}
          {orderType !== 'dine-in' && (
            <div className="w-full grid grid-cols-2 gap-2">
              <Button
                className="h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700"
                disabled={!canSubmit || cartItems.length === 0 || posBackendActionInFlight}
                onClick={() => {
                  if (posBackendActionInFlight) return
                  submitNonDineOrder(false)
                  handleClearCart()
                }}
              >
                {t('posOrderButton') || '주문'}
              </Button>
              <Button
                className="h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
                data-tour="pos-tour-cart-pay"
                disabled={total <= 0 || !canSubmit || posBackendActionInFlight}
                onClick={() => {
                  if (posBackendActionInFlight) return
                  openPaymentModal()
                }}
              >
                {t('posPayButton')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog
      open={showPaymentModal}
      onOpenChange={(open) => {
        if (!open && lockPaymentModalForTour) return
        if (!open && orderType === 'delivery' && checkoutExistingPosOrderIdRef.current != null) {
          handleClearCart()
        }
        setShowPaymentModal(open)
      }}
    >
      <DialogContent
        data-tour="pos-tour-payment-dialog"
        hideCloseButton
        onEscapeKeyDown={(e) => {
          if (lockPaymentModalForTour) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (lockPaymentModalForTour) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (lockPaymentModalForTour) e.preventDefault()
        }}
        className="flex h-[min(95vh,720px)] w-[95vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-border/60 p-0 shadow-2xl sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 bg-gradient-to-b from-card to-card/95 px-5 py-4 text-left backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight">
                {orderType === 'delivery' && isExistingOrderCheckout
                  ? t('posDeliveryPaymentConfirmTitle') || '결제 확인'
                  : t('posSplitPayment') || '결제 수단 입력'}
              </DialogTitle>
            </div>
            {!lockPaymentModalForTour && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
                onClick={() => setShowPaymentModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </DialogHeader>
        {orderType === 'delivery' && !isExistingOrderCheckout ? (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
              <PosPaymentModalAmountCard
                subtotal={subtotal}
                discount={discount}
                pricing={pricing}
                total={total}
                totalLabelKey="posInputTotal"
                cartItems={cartItems}
                lineDiscountModeByItemId={lineDiscountModeByItemId}
                onLineDiscountModeChange={setLineDiscountModeForItem}
                onDiscountLineSelected={focusManualDiscountCard}
                t={t}
              />
              <div className="flex gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5 text-sm leading-relaxed text-muted-foreground dark:bg-emerald-500/10">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <Bike className="h-4 w-4" />
                </div>
                <p>{t('posDeliveryPaymentNote') || '배달 주문은 플랫폼에서 결제 완료되며, 익일 통장으로 정산됩니다.'}</p>
              </div>
            </div>
            <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/85 sm:flex-row sm:justify-end">
              {!lockPaymentModalForTour && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl sm:w-auto"
                  onClick={() => setShowPaymentModal(false)}
                >
                  {t('posCancel') || '취소'}
                </Button>
              )}
              <Button
                className="h-12 w-full rounded-xl font-semibold sm:min-w-[8rem]"
                onClick={() => {
                  submitNonDineOrder(false)
                  setShowPaymentModal(false)
                  handleClearCart()
                }}
              >
                {t('posConfirm') || '확인'}
              </Button>
            </DialogFooter>
          </>
        ) : orderType === 'delivery' && isExistingOrderCheckout ? (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
              <PosPaymentModalAmountCard
                subtotal={subtotal}
                discount={discount}
                pricing={pricing}
                total={total}
                totalLabelKey="posInputTotal"
                cartItems={cartItems}
                lineDiscountModeByItemId={lineDiscountModeByItemId}
                onLineDiscountModeChange={setLineDiscountModeForItem}
                onDiscountLineSelected={focusManualDiscountCard}
                t={t}
              />
              <div className="flex gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5 text-sm leading-relaxed text-muted-foreground dark:bg-emerald-500/10">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <Bike className="h-4 w-4" />
                </div>
                <p>{t('posDeliveryPaymentNote') || '배달 주문은 플랫폼에서 결제 완료되며, 익일 통장으로 정산됩니다.'}</p>
              </div>
              <div
                ref={manualDiscountCardRef}
                className={cn(
                  'rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-50/90 via-card to-card p-4 shadow-sm transition-shadow dark:from-amber-950/25 dark:via-card dark:to-card',
                  manualDiscountFlash ? 'ring-2 ring-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]' : ''
                )}
              >
                <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold">{t('posPaymentSectionManualDiscount')}</p>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0">
                        {selectedDiscountLineCount > 0
                          ? `${tr('posManualDiscountScopeSelected', '할인적용 메뉴')} ${selectedDiscountLineCount}${tr('posMenuLineUnit', '건')} · ${tr('posManualDiscountScopeAmount', '대상금액')} ${formatBahtNum(selectedDiscountSubtotal)} ฿`
                          : `${tr('posManualDiscountScopeAll', '할인적용 메뉴 미선택: 서비스처리 제외 전체 메뉴에 적용')}`}
                      </p>
                      {selectedDiscountLineCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 rounded-md px-2 text-[11px] text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
                          onClick={clearLineDiscountSelection}
                        >
                          {tr('posManualDiscountScopeClear', '할인 메뉴 해제')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      {tr('posManualDiscountExpected', '직접 할인 예상')}: {formatBahtNum(manualDiscountAmt)} ฿ ·{' '}
                      {tr('posCollabDiscountExpected', '협업 할인 예상')}: {formatBahtNum(collabDiscountAmt)} ฿
                    </p>
                    <p className="mt-0.5">
                      {tr('posTotalDiscountExpected', '총 할인 예상')}: {formatBahtNum(discountExpectedTotal)} ฿
                    </p>
                  </div>
                  <div className="flex gap-2 flex-nowrap overflow-x-auto pb-1">
                    {DISCOUNT_PRESETS.map((pct) => (
                      <Button
                        key={pct}
                        type="button"
                        size="default"
                        variant={discountType === 'percent' && discountValue === pct ? 'default' : 'outline'}
                        className="h-10 min-w-[3.75rem] shrink-0 px-3 text-sm font-semibold touch-manipulation"
                        onClick={() => {
                          setDiscountType('percent')
                          setDiscountValue(pct)
                        }}
                      >
                        {pct}%
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_7rem_1fr]">
                    <Button
                      type="button"
                      size="default"
                      variant="outline"
                      className="h-12 px-3 text-sm font-semibold rounded-xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      onClick={() => {
                        setDiscountType('percent')
                        setDiscountValue(0)
                      }}
                    >
                      {tr('reset', '초기화')}
                    </Button>
                    <Select
                      value={discountType}
                      onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}
                    >
                      <SelectTrigger className="h-12 w-[5.5rem] rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="fixed">฿</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      step={discountType === 'percent' ? 1 : 0.01}
                      placeholder={
                        discountType === 'percent'
                          ? (t('posDiscount') || '할인') + ' %'
                          : (t('posDiscount') || '할인') + ' ฿'
                      }
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value || 0)))}
                      className="h-11 text-sm rounded-xl px-2.5"
                    />
                    <Input
                      placeholder={t('posDiscountReasonPh')}
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="h-12 text-base rounded-xl sm:col-span-1"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/85 sm:flex-row sm:justify-end">
              {!lockPaymentModalForTour && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl sm:w-auto"
                  onClick={() => setShowPaymentModal(false)}
                >
                  {t('posCancel') || '취소'}
                </Button>
              )}
              <Button
                type="button"
                className="h-12 w-full rounded-xl font-semibold sm:min-w-[8rem]"
                disabled={total <= 0}
                onClick={completeDeliveryPayInStoreFromModal}
              >
                {t('posDeliveryPaymentComplete') || t('posConfirm') || '확인'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-5 py-5">
            <PosPaymentModalAmountCard
              subtotal={subtotal}
              discount={discount}
              pricing={pricing}
              total={total}
              cartItems={cartItems}
              lineDiscountModeByItemId={lineDiscountModeByItemId}
              onLineDiscountModeChange={setLineDiscountModeForItem}
              onDiscountLineSelected={focusManualDiscountCard}
              t={t}
            />

            {orderType === 'dine-in' && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-3 shadow-sm dark:bg-sky-950/25">
                <div className="mb-2 flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold leading-tight">{t('posOrderGuestCount') || '손님 수'}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {tr('posPaymentGuestCountHint', '결제 완료 전까지 여기서 손님 수를 바꿀 수 있어요.')}
                    </p>
                  </div>
                  <Select
                    value={guestCount === 0 ? '__zero__' : guestCount >= 1 && guestCount <= 9 ? String(guestCount) : '__direct__'}
                    onValueChange={(v) => {
                      if (v === '__zero__') setGuestCount(0)
                      else if (v === '__direct__') {
                        setGuestDirectValue(String(guestCount > 9 ? guestCount : 10))
                        setGuestDirectOpen(true)
                      } else setGuestCount(Number(v))
                    }}
                  >
                    <SelectTrigger
                      className="h-10 w-[3.5rem] shrink-0 border-sky-600/40 bg-background/95 [&>span]:flex [&>span]:items-center [&>span]:justify-center dark:border-sky-500/45"
                      aria-label={t('posOrderGuestCount') || undefined}
                    >
                      <span className="tabular-nums font-semibold">{guestCount}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__zero__">0</SelectItem>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                      <SelectItem value="__direct__">{t('posGuestDirectInput') || '직접 입력'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* 협업 할인 — 항상 표시, 없음 선택 가능 */}
              <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-50/80 via-card to-card p-4 shadow-sm dark:from-violet-950/25 dark:via-card dark:to-card">
                <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-800 dark:text-violet-200">
                    <Handshake className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t('posPaymentSectionCollab')}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t('posCollabSelectLabel')}</p>
                  </div>
                </div>
                <Select
                  value={appliedCollabId ?? '__none__'}
                  onValueChange={(v) => setAppliedCollabId(v === '__none__' ? null : v)}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('posCollabNoneOption')}</SelectItem>
                    {collabOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.campaignNo ? `[${c.campaignNo}] ` : '') + c.topic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!posMenus?.length ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{t('posCollabMenusNotLoaded')}</p>
                ) : null}
                {appliedCollabId && collabDiscountAmt <= 0 && posMenus?.length ? (
                  <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">{t('posCollabNoMatchingLines')}</p>
                ) : null}
              </div>

              {/* 직접 할인 */}
              <div
                ref={manualDiscountCardRef}
                className={cn(
                  'rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-50/90 via-card to-card p-4 shadow-sm transition-shadow dark:from-amber-950/25 dark:via-card dark:to-card',
                  manualDiscountFlash ? 'ring-2 ring-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]' : ''
                )}
              >
                <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold">{t('posPaymentSectionManualDiscount')}</p>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0">
                        {selectedDiscountLineCount > 0
                          ? `${tr('posManualDiscountScopeSelected', '할인적용 메뉴')} ${selectedDiscountLineCount}${tr('posMenuLineUnit', '건')} · ${tr('posManualDiscountScopeAmount', '대상금액')} ${formatBahtNum(selectedDiscountSubtotal)} ฿`
                          : `${tr('posManualDiscountScopeAll', '할인적용 메뉴 미선택: 서비스처리 제외 전체 메뉴에 적용')}`}
                      </p>
                      {selectedDiscountLineCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 rounded-md px-2 text-[11px] text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
                          onClick={clearLineDiscountSelection}
                        >
                          {tr('posManualDiscountScopeClear', '할인 메뉴 해제')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      {tr('posManualDiscountExpected', '직접 할인 예상')}: {formatBahtNum(manualDiscountAmt)} ฿ ·{' '}
                      {tr('posCollabDiscountExpected', '협업 할인 예상')}: {formatBahtNum(collabDiscountAmt)} ฿
                    </p>
                    <p className="mt-0.5">
                      {tr('posTotalDiscountExpected', '총 할인 예상')}: {formatBahtNum(discountExpectedTotal)} ฿
                    </p>
                  </div>
                  <div className="flex gap-2 flex-nowrap overflow-x-auto pb-1">
                    {DISCOUNT_PRESETS.map((pct) => (
                      <Button
                        key={pct}
                        type="button"
                        size="default"
                        variant={discountType === 'percent' && discountValue === pct ? 'default' : 'outline'}
                        className="h-10 min-w-[3.75rem] shrink-0 px-3 text-sm font-semibold touch-manipulation"
                        onClick={() => {
                          setDiscountType('percent')
                          setDiscountValue(pct)
                        }}
                      >
                        {pct}%
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_7rem_1fr]">
                    <Button
                      type="button"
                      size="default"
                      variant="outline"
                      className="h-12 px-3 text-sm font-semibold rounded-xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      onClick={() => {
                        setDiscountType('percent')
                        setDiscountValue(0)
                      }}
                    >
                      {tr('reset', '초기화')}
                    </Button>
                    <Select
                      value={discountType}
                      onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}
                    >
                      <SelectTrigger className="h-12 w-[5.5rem] rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="fixed">฿</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      step={discountType === 'percent' ? 1 : 0.01}
                      placeholder={
                        discountType === 'percent'
                          ? (t('posDiscount') || '할인') + ' %'
                          : (t('posDiscount') || '할인') + ' ฿'
                      }
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value || 0)))}
                      className="h-11 text-sm rounded-xl px-2.5"
                    />
                    <Input
                      placeholder={t('posDiscountReasonPh')}
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="h-12 text-base rounded-xl sm:col-span-1"
                    />
                  </div>
                </div>
              </div>

              {/* 쿠폰 코드 — 제목 옆 입력 (직접 할인 아래) */}
              <div className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-50/80 via-card to-card p-3 shadow-sm dark:from-sky-950/20 dark:via-card dark:to-card">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex shrink-0 items-center gap-2 sm:min-w-[7.5rem]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-800 dark:text-sky-200">
                      <Tag className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold leading-tight">{t('posPaymentSectionCoupon')}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input
                      placeholder={t('posCouponCodePh')}
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="h-10 min-w-0 flex-1 text-sm rounded-xl sm:max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-10 shrink-0 rounded-xl px-4"
                      onClick={applyCouponCode}
                    >
                      {t('posCouponApply')}
                    </Button>
                  </div>
                </div>
                {!!couponMessage && <p className="mt-2 text-xs text-muted-foreground">{couponMessage}</p>}
              </div>

              {/* 포인트 사용 — 제목 옆 입력 */}
              <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-50/70 via-card to-card p-3 shadow-sm dark:from-teal-950/20 dark:via-card dark:to-card">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex shrink-0 items-center gap-2 sm:min-w-[7.5rem]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-800 dark:text-teal-200">
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold leading-tight">{t('posPaymentSectionPoints')}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={pointUsed}
                    onChange={(e) => setPointUsed(String(Math.max(0, Math.trunc(Number(e.target.value || 0)))))}
                    className="h-10 w-full max-w-[12rem] text-sm rounded-xl sm:w-auto"
                  />
                </div>
              </div>
            </div>

            <div ref={paymentMethodSectionRef} className="scroll-mt-3 space-y-2" data-pos-payment-method-section>
              <p className="text-sm font-semibold">{tr('posPaymentMethodSection', '결제 수단')}</p>
            {/* 결제 수단 탭 */}
            <div className="grid grid-cols-5 gap-1 rounded-2xl border border-border/60 bg-muted/50 p-1.5 shadow-inner" data-tour="pos-tour-payment-tabs">
              {paymentTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-[4.25rem] flex-col gap-0.5 rounded-xl px-1 transition-all',
                      activePaymentTab === tab.id
                        ? 'bg-card text-card-foreground shadow-md ring-1 ring-border/70'
                        : 'text-muted-foreground hover:bg-muted/80'
                    )}
                    onClick={() => {
                      setActivePaymentTab(tab.id)
                      if (splitFlowForInputs) {
                        addDutchAmountOnly(tab.id as MoveTarget, { replaceCurrentDraft: true })
                        if (tab.id === 'other') setShowOtherPayments(true)
                      } else {
                        if (tab.id === 'cash') moveAllAmountTo('cash')
                        if (tab.id === 'card') moveAllAmountTo('card')
                        if (tab.id === 'qr') moveAllAmountTo('qr')
                        if (tab.id === 'delivery_app') moveAllAmountTo('delivery_app')
                        if (tab.id === 'other') {
                          setShowOtherPayments(true)
                          moveAllAmountTo('other')
                        }
                      }
                    }}
                    data-tour={paymentTabTourTarget(tab.id)}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', activePaymentTab === tab.id ? 'text-primary' : '')} />
                    <span className="text-[11px] font-medium leading-tight text-center">{tab.label}</span>
                    {splitFlowForInputs &&
                      splitDraftAssignedRef.current &&
                      (tab.id === 'other'
                        ? isWalletMoveTarget(splitDraftAssignedRef.current.target)
                        : splitDraftAssignedRef.current.target === tab.id) && (
                        <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] font-semibold text-primary">
                          {tr('posDutchDraftShort', '임시')}
                        </span>
                      )}
                  </Button>
                )
              })}
            </div>
            </div>

            {/* 결제 수단 */}
            <div className="grid gap-3">
              {[
                { key: 'cash', value: payCash, set: setPayCash, label: t('posPaymentCash') || '현금', icon: Banknote },
                { key: 'card', value: payCard, set: setPayCard, label: t('posPaymentCard') || '카드', icon: CreditCard },
                { key: 'qr', value: payPromptPay, set: setPayPromptPay, label: `${t('posPaymentQr') || 'QR'} 코드`, icon: QrCode },
              ]
                .filter(({ key }) => (activePaymentTab === 'other' || activePaymentTab === 'delivery_app' ? false : key === activePaymentTab))
                .map(({ key, value, set, label, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-colors focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-none">{label}</p>
                        {splitFlowForInputs &&
                          splitDraftAssignedRef.current?.target === (key as MoveTarget) &&
                          splitDraftBadgeText && (
                            <p className="mt-1 text-[11px] font-semibold text-primary">{splitDraftBadgeText}</p>
                          )}
                        <button
                          type="button"
                          className="mt-1 text-left text-[11px] font-medium text-primary hover:underline"
                          onClick={() =>
                            splitFlowForInputs
                              ? addDutchAmountOnly(key as MoveTarget, { replaceCurrentDraft: true })
                              : moveAllAmountTo(key as 'cash' | 'card' | 'qr')
                          }
                        >
                          {tr('posPayAllToThisMethod', '이 수단으로 전액')}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:max-w-[14rem] sm:flex-1">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="h-12 flex-1 rounded-xl border-border/80 text-right text-lg font-semibold tabular-nums tracking-tight"
                  />
                  <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground">฿</span>
                    </div>
                  </div>
                  {key === 'cash' && (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-foreground">
                        {tr('posCashChangeCalculatorTitle', '거스름돈 계산')}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-end">
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-sky-800 dark:text-sky-300">
                            {tr('posCashTenderedAmount', '받은 금액')}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={cashTendered}
                              onChange={(e) => setCashTendered(e.target.value)}
                              className="h-10 rounded-lg border-sky-300/70 bg-sky-50/60 text-right tabular-nums text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-100"
                              placeholder="0"
                            />
                            <span className="w-4 shrink-0 text-sm font-semibold text-sky-800 dark:text-sky-300">฿</span>
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-violet-800 dark:text-violet-300">
                            {splitFlowForInputs
                              ? tr('posCashRequiredAmountCurrentPerson', '필요 현금(현재 인원)')
                              : tr('posCashRequiredAmount', '필요 현금')}
                          </Label>
                          <div className="h-10 rounded-lg border border-violet-300/60 bg-violet-50/70 px-3 text-right text-sm font-semibold leading-10 tabular-nums text-violet-800 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200">
                            {formatBahtNum(cashRequiredForTendered)} ฿
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-emerald-800 dark:text-emerald-300">
                            {tr('posCashChangeAmount', '거슬러줄 금액')}
                          </Label>
                          <div className="h-10 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 text-right text-lg font-extrabold leading-10 tabular-nums text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300">
                            {formatBahtNum(cashChangeAmountForTendered)} ฿
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {[10, 20, 100, 200, 500, 1000].map((amount) => (
                          <Button
                            key={amount}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md px-3 text-sm font-semibold tabular-nums justify-center"
                            onClick={() => setCashTendered(String(amount))}
                          >
                            {amount}฿
                          </Button>
                        ))}
                      </div>
                      <div className="mt-2 grid gap-1 text-xs">
                        {cashShortAmountForTendered > 0.001 && (
                          <p className="font-medium text-amber-700 dark:text-amber-400">
                            {tr('posCashShortAmount', '추가로 받아야 할 금액')}: {formatBahtNum(cashShortAmountForTendered)} ฿
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {activePaymentTab === 'delivery_app' && (
                <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-colors focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                        <Bike className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-none">{t('posPaymentDeliveryApp') || '배달앱'}</p>
                      {splitFlowForInputs &&
                        splitDraftAssignedRef.current?.target === 'delivery_app' &&
                        splitDraftBadgeText && (
                          <p className="mt-1 text-[11px] font-semibold text-primary">{splitDraftBadgeText}</p>
                        )}
                        <button
                          type="button"
                          className="mt-1 text-left text-[11px] font-medium text-primary hover:underline"
                          onClick={() =>
                            splitFlowForInputs ? addDutchAmountOnly('delivery_app', { replaceCurrentDraft: true }) : moveAllAmountTo('delivery_app')
                          }
                        >
                          {tr('posPayAllToThisMethod', '이 수단으로 전액')}
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">{t('posDeliveryPaymentChannel') || '채널'}</Label>
                        <Select
                          value={deliveryPaymentChannel}
                          onValueChange={(v) => setDeliveryPaymentChannel(v as 'grab' | 'lineman' | 'shopee')}
                        >
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grab">{t('posDeliveryPayGrab') || 'Grab'}</SelectItem>
                            <SelectItem value="lineman">{t('posDeliveryPayLineman') || 'Line Man'}</SelectItem>
                            <SelectItem value="shopee">{t('posDeliveryPayShopeeFood') || 'Shopee Food'}</SelectItem>
                          </SelectContent>
                        </Select>
                        {orderType === 'dine-in' && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {'테이블 결제에서 배달앱을 선택하면 주문은 자동으로 Dine in으로 인식됩니다. 채널은 Grab/Line Man/Shopee 중에서 선택하세요.'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={payDeliveryApp}
                          onChange={(e) => setPayDeliveryApp(e.target.value)}
                          className="h-12 flex-1 rounded-xl border-border/80 text-right text-lg font-semibold tabular-nums tracking-tight"
                        />
                        <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground">฿</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePaymentTab === 'other' && (
                <Collapsible open={showSplit ? true : showOtherPayments} onOpenChange={(v) => { if (!showSplit) setShowOtherPayments(v) }}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 w-full justify-between rounded-xl border-dashed px-3 text-sm font-semibold"
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-primary" />
                        {t('posPaymentOther') || '기타'} · {tr('posPaymentOtherExpand', '세부 수단')}
                        {splitFlowForInputs &&
                          splitDraftAssignedRef.current &&
                          isWalletMoveTarget(splitDraftAssignedRef.current.target) &&
                          splitDraftBadgeText && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {splitDraftBadgeText}
                            </span>
                          )}
                      </span>
                      {showSplit ? <ChevronUp className="w-4 h-4" /> : (showOtherPayments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-2 border-l-2 border-primary/20 pl-3 pt-3">
                    {splitFlowForInputs &&
                      splitDraftAssignedRef.current &&
                      isWalletMoveTarget(splitDraftAssignedRef.current.target) &&
                      splitDraftBadgeText && (
                        <p className="mb-1 text-[11px] font-semibold text-primary">
                          {splitDraftBadgeText}
                        </p>
                      )}
                    {useAdminPaymentLines && (
                      <p className="text-[10px] leading-snug text-muted-foreground -mt-1 mb-1">
                        {tr(
                          'posPaymentAdminLinesHint',
                          '항목은 관리자 › POS 설정 › 결제 관리에서 편집합니다. (QR·모바일·기타 분류)'
                        )}
                      </p>
                    )}
                    {useAdminPaymentLines &&
                      adminPaymentLines.map((item, idx) => {
                        const prev = adminPaymentLines[idx - 1]
                        const showCatHead = !prev || prev.category !== item.category
                        return (
                          <Fragment key={item.id}>
                            {showCatHead && (
                              <p className="text-[11px] font-semibold text-muted-foreground pt-1">
                                {item.category === 'qr'
                                  ? tr('posPaymentAdminQrSection', 'QR · 모바일')
                                  : tr('posPaymentAdminOtherSection', '기타')}
                              </p>
                            )}
                            <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:items-center">
                                <div className="min-w-0 shrink">
                                  <button
                                    type="button"
                                    className="min-w-0 shrink text-left text-sm font-medium hover:underline"
                                    onClick={() =>
                                      splitFlowForInputs
                                        ? addDutchAmountToAdminLine(item.id)
                                        : applyFullAmountToSingleAdminLine(item.id)
                                    }
                                  >
                                    {item.name}
                                  </button>
                                </div>
                                {splitFlowForInputs && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 shrink-0 px-2 text-xs"
                                    onClick={() => addDutchAmountToAdminLine(item.id)}
                                  >
                                    +{formatBahtNum(currentSplitTargetAmount)} ฿
                                  </Button>
                                )}
                              </div>
                              <div className="flex items-center gap-2 sm:max-w-[12rem]">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={payAdminLineAmounts[item.id] ?? '0'}
                                  onChange={(e) =>
                                    setPayAdminLineAmounts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  className="h-11 flex-1 rounded-xl text-right text-base font-semibold tabular-nums"
                                />
                                <span className="w-4 shrink-0 text-xs font-medium text-muted-foreground">฿</span>
                              </div>
                            </div>
                          </Fragment>
                        )
                      })}
                    {!useAdminPaymentLines &&
                      [
                        { value: payTrueMoney, set: setPayTrueMoney, labelKey: 'posPaymentTrueMoney', moveKey: 'truemoney' as const },
                        { value: payWeChat, set: setPayWeChat, labelKey: 'posPaymentWeChat', moveKey: 'wechat' as const },
                        { value: payAlipay, set: setPayAlipay, labelKey: 'posPaymentAlipay', moveKey: 'alipay' as const },
                        { value: payLinePay, set: setPayLinePay, labelKey: 'posPaymentLinePay', moveKey: 'linepay' as const },
                        { value: payShopeePay, set: setPayShopeePay, labelKey: 'posPaymentShopeePay', moveKey: 'shopeepay' as const },
                        { value: payOther, set: setPayOther, labelKey: 'posPaymentOtherEtc', moveKey: 'other' as const },
                      ].map(({ value, set, labelKey, moveKey }) => (
                        <div key={labelKey} className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:items-center">
                            <div className="min-w-0 shrink">
                              <button
                                type="button"
                                className="min-w-0 shrink text-left text-sm font-medium hover:underline"
                                onClick={() =>
                                  splitFlowForInputs ? addDutchAmountOnly(moveKey, { replaceCurrentDraft: true }) : moveAllAmountTo(moveKey)
                                }
                              >
                                {t(labelKey)}
                              </button>
                              {splitFlowForInputs &&
                                splitDraftAssignedRef.current?.target === moveKey &&
                                splitDraftBadgeText && (
                                  <p className="mt-1 text-[11px] font-semibold text-primary">{splitDraftBadgeText}</p>
                                )}
                            </div>
                            {splitFlowForInputs && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 shrink-0 px-2 text-xs"
                                onClick={() => addDutchAmountOnly(moveKey)}
                              >
                                +{formatBahtNum(currentSplitTargetAmount)} ฿
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:max-w-[12rem]">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={value}
                              onChange={(e) => set(e.target.value)}
                              className="h-11 flex-1 rounded-xl text-right text-base font-semibold tabular-nums"
                            />
                            <span className="w-4 shrink-0 text-xs font-medium text-muted-foreground">฿</span>
                          </div>
                        </div>
                      ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {/* Tax Invoice */}
            <Collapsible open={showTaxInvoiceDetails} onOpenChange={setShowTaxInvoiceDetails}>
              <div className="min-h-[72px] space-y-2 rounded-2xl border border-border/70 bg-gradient-to-br from-slate-50/80 to-card p-4 shadow-sm dark:from-slate-950/40 dark:to-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Receipt className="h-5 w-5 text-primary" />
                    </div>
                    <Label className="text-sm font-semibold">{t('posReceiptTaxInvoice')}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant={needTaxInvoice ? 'default' : 'outline'}
                      className="h-8"
                      data-tour="pos-tour-tax-invoice-toggle"
                      onClick={() => setNeedTaxInvoice((v) => !v)}
                    >
                      {needTaxInvoice ? t('posTaxInvoiceOn') : t('posTaxInvoiceOff')}
                    </Button>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 rounded-xl">
                      {showTaxInvoiceDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  {needTaxInvoice && (
                    <div className="grid gap-2 pt-1" data-tour="pos-tour-tax-invoice-fields">
                  <div className="grid gap-2 lg:grid-cols-[auto_auto_1fr_auto] items-center">
                    <Button
                      type="button"
                      size="default"
                      variant={invoiceCustomerType === 'person' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      onClick={() => setInvoiceCustomerType('person')}
                    >
                      <User className="h-4 w-4 mr-1.5" />
                      {t('posTaxCustomerIndividual')}
                    </Button>
                    <Button
                      type="button"
                      size="default"
                      variant={invoiceCustomerType === 'company' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      onClick={() => setInvoiceCustomerType('company')}
                    >
                      <Building2 className="h-4 w-4 mr-1.5" />
                      {t('posTaxCustomerCorporate')}
                    </Button>
                    <div className="grid grid-cols-[7.5rem_1fr_auto] gap-2 min-w-0">
                      <Select value={taxSearchField} onValueChange={(v) => setTaxSearchField(v as TaxSearchField)}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="memberNo">{t('posMemberNo') || '회원번호'}</SelectItem>
                          <SelectItem value="phone">{t('posPhone') || '전화번호'}</SelectItem>
                          <SelectItem value="name">{t('posName') || '이름'}</SelectItem>
                          <SelectItem value="taxId">{t('posTaxIdLabel') || 'Tax ID'}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={
                          taxSearchField === 'memberNo'
                            ? (t('posMemberNoInputPh') || '회원번호 입력')
                            : taxSearchField === 'phone'
                              ? (t('posPhoneInputPh') || '전화번호 입력')
                              : taxSearchField === 'taxId'
                                ? (t('posTaxIdThirteenPlaceholder') || 'Tax ID 13자리')
                                : (t('posNameInputPh') || '이름 입력')
                        }
                        value={taxSearchKeyword}
                        onChange={(e) => setTaxSearchKeyword(e.target.value)}
                        className="h-12 rounded-xl"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleTaxProfileSearch()
                          }
                        }}
                      />
                      <Button type="button" size="default" variant="secondary" className="h-12 rounded-xl" onClick={handleTaxProfileSearch}>
                        {t('posSearch') || '검색'}
                      </Button>
                    </div>
                    {isMemberOrder && (
                      <span className="text-xs text-muted-foreground self-center">
                        {t('posTaxMemberLinkedHint')}
                      </span>
                    )}
                  </div>
                  {!!taxSearchMessage && (
                    <p className="text-xs text-muted-foreground">{taxSearchMessage}</p>
                  )}
                  <Input
                    placeholder={t('posMemberNo') || '회원번호'}
                    value={taxMemberNo}
                    onChange={(e) => setTaxMemberNo(e.target.value.trim())}
                    className="h-12 rounded-xl max-w-[10rem]"
                  />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxRecipientNamePlaceholder')}
                      value={taxName}
                      onChange={(e) => setTaxName(e.target.value)}
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxIdThirteenPlaceholder')}
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                      inputMode="numeric"
                      data-tour="pos-tour-tax-id-input"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={taxBranchRequired ? t('posTaxBranchFiveCompany') : t('posTaxBranchFivePerson')}
                      value={taxBranchNo}
                      onChange={(e) => setTaxBranchNo(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      inputMode="numeric"
                      data-tour="pos-tour-tax-branch-input"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxPhonePlaceholder')}
                      value={taxPhone}
                      onChange={(e) => setTaxPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      inputMode="numeric"
                      data-tour="pos-tour-tax-phone-input"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxEmailOptionalPlaceholder')}
                      value={taxEmail}
                      onChange={(e) => setTaxEmail(e.target.value)}
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxAddressPlaceholder')}
                      value={taxAddress}
                      onChange={(e) => setTaxAddress(e.target.value)}
                      data-tour="pos-tour-tax-address-input"
                    />
                  </div>
                  {taxInvoiceInvalid && (
                    <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 space-y-0.5">
                      <p>{t('posTaxValidationTitle')}</p>
                      {taxInvoiceValidationErrors.includes('name') && <p>- {t('posTaxErrName')}</p>}
                      {taxInvoiceValidationErrors.includes('taxId') && <p>- {t('posTaxErrTaxId')}</p>}
                      {taxInvoiceValidationErrors.includes('branch') && <p>- {t('posTaxErrBranch')}</p>}
                      {taxInvoiceValidationErrors.includes('phone') && <p>- {t('posTaxErrPhone')}</p>}
                      {taxInvoiceValidationErrors.includes('address') && <p>- {t('posTaxErrAddress')}</p>}
                      {taxInvoiceValidationErrors.includes('email') && <p>- {t('posTaxErrEmail')}</p>}
                    </div>
                  )}
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Dutch Pay - 가로 compact, 터치 44px */}
            <Collapsible
              open={showSplit}
              onOpenChange={(open) => {
                setShowSplit(open)
                if (open) scrollToPaymentMethods()
              }}
            >
              <div className="w-full rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-50/90 to-card p-3 shadow-sm dark:from-violet-950/30 dark:to-card">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-11 w-full justify-between rounded-xl px-2 py-2"
                    data-tour="pos-tour-dutch-pay-toggle"
                  >
                    <span className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300">
                        <Users className="h-5 w-5 shrink-0" />
                      </div>
                      <span className="text-left font-semibold">{tr('posDutchPayTitle', '더치페이')}</span>
                    </span>
                    {showSplit ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-wrap items-center gap-2 pt-3">
                  <div className="flex w-full items-center gap-2" data-tour="pos-tour-dutch-mode-row">
                    <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'amount' ? 'default' : 'outline'}
                      className="h-9"
                      data-tour="pos-tour-dutch-mode-amount"
                      onClick={() => {
                        setSplitMode('amount')
                        if (showSplit) scrollToPaymentMethods()
                      }}
                    >
                      {tr('posDutchSplitModeAmount', '금액 기준')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'menu' ? 'default' : 'outline'}
                      className="h-9"
                      data-tour="pos-tour-dutch-mode-menu"
                      onClick={() => {
                        setSplitMode('menu')
                        if (showSplit) scrollToPaymentMethods()
                      }}
                    >
                      {tr('posDutchSplitModeMenu', '메뉴 기준')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2" data-tour="pos-tour-dutch-split-count-row">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-muted-foreground">{tr('posSplitPeople', '인원')}</span>
                      <Input
                        type="number"
                        min={1}
                        value={splitCount}
                        onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value || 1)))}
                        className="h-11 w-14 rounded-lg text-center text-base shrink-0"
                        data-tour="pos-tour-dutch-split-count"
                      />
                    </div>
                  </div>
                  <div
                    className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-50/30 px-2 py-2 dark:bg-violet-950/15"
                    data-tour="pos-tour-dutch-progress-row"
                  >
                    <div className="flex items-center gap-1.5 shrink-0 min-h-11 px-2 rounded-lg bg-primary/5">
                      <span className="text-sm">
                        {splitMode === 'menu'
                          ? tr('posCurrentPersonAmount', '현재 인원 금액')
                          : tr('posPerPersonAmount', '1인 금액')}
                      </span>
                      <span className="font-semibold tabular-nums">{formatBahtNum(currentSplitTargetAmount)}฿</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 min-h-11 px-2 rounded-lg bg-primary/5 text-sm">
                      <span>
                        {tr('posProgress', '진행')}{' '}
                        <span className="font-semibold tabular-nums">
                          {splitPaidSteps}/{Math.max(1, splitCount)}
                          {tr('posPeopleUnit', '명')}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {formatBahtNum(paymentSum)}/{formatBahtNum(total)}฿
                      </span>
                    </div>
                  </div>
                  {splitMode === 'menu' && (
                    <div
                      className="w-full space-y-2 rounded-xl border border-violet-400/25 bg-violet-50/40 p-2.5 dark:bg-violet-900/10"
                      data-tour="pos-tour-dutch-menu-panel"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-violet-100 px-2 py-1 font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                          {tr('posCurrentPerson', '현재 인원')} {Math.min(splitPaidSteps + 1, Math.max(1, splitCount))}
                        </span>
                        <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                          {tr('posAssignTargetPerson', '배정 대상 인원')} {menuSplitTargetPersonIndex + 1}
                        </span>
                        <span className="text-muted-foreground">
                          {tr('posUnassignedQty', '미배정 수량')}: {formatBahtNum(menuSplitUnassignedQty)}
                        </span>
                        <span className="text-muted-foreground">
                          {tr('posUnassignedAmount', '미배정 금액')}: {formatBahtNum(menuSplitUnassignedAmount)} ฿
                        </span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: Math.max(1, splitCount) }).map((_, idx) => (
                          <div
                            key={`split-person-${idx}`}
                            className={cn(
                              'rounded-lg border px-2 py-1.5 text-xs',
                              idx === currentSplitPersonIndex
                                ? 'border-violet-500/60 bg-violet-100/60 dark:bg-violet-900/30'
                                : 'border-border/70 bg-card'
                            )}
                          >
                            <div className="font-semibold">
                              {tr('posPeopleUnit', '명')} {idx + 1}
                            </div>
                            <div className="tabular-nums text-muted-foreground">
                              {tr('posAssignedQty', '배정 수량')}: {formatBahtNum(menuSplitQtyByPerson[idx] || 0)}
                            </div>
                            <div className="tabular-nums text-muted-foreground">
                              {tr('posAssignedAmount', '배정 금액')}: {formatBahtNum(menuSplitDueByPerson[idx] || 0)} ฿
                            </div>
                            <div className="tabular-nums text-muted-foreground">
                              {tr('posPaidAmount', '결제됨')}: {formatBahtNum(menuSplitPaidByPerson[idx] || 0)} ฿
                            </div>
                            <div className="tabular-nums font-semibold text-violet-700 dark:text-violet-300">
                              {tr('posRemainingAmount', '남음')}: {formatBahtNum(menuSplitRemainingByPerson[idx] || 0)} ฿
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={idx === menuSplitTargetPersonIndex ? 'default' : 'outline'}
                              className="mt-1 h-7 w-full text-[11px]"
                              onClick={() => selectMenuSplitTargetPerson(idx)}
                            >
                              {tr('posSelectAssignTarget', '여기에 배정')}
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-border/70 bg-card p-2">
                        {cartItems.map((item) => {
                          const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
                          const currentQty = Math.max(0, Number(row[menuSplitTargetPersonIndex] || 0))
                          const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
                          const remain = Math.max(0, (Number(item.quantity) || 0) - assigned)
                          return (
                            <div
                              key={`split-item-${item.id}`}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{trMenuLine(item.name)}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {tr('qty', '수량')}: {formatBahtNum(item.quantity)} · {tr('posUnassignedShort', '미배정')}: {formatBahtNum(remain)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0"
                                  onClick={() => adjustMenuSplitQty(item.id, -1)}
                                  disabled={currentQty <= 0}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <span className="w-8 text-center text-xs font-semibold tabular-nums">
                                  {formatBahtNum(currentQty)}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0"
                                  onClick={() => adjustMenuSplitQty(item.id, 1)}
                                  disabled={remain <= 0}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <p
                    className="w-full text-[11px] text-muted-foreground sm:w-auto sm:flex-1 sm:min-w-[12rem]"
                    data-tour="pos-tour-dutch-hint"
                  >
                    {splitMode === 'menu'
                      ? tr(
                          'posDutchPayMenuHint',
                          '현재 인원에게 메뉴 수량을 배정한 뒤 결제 수단을 탭하고, 「일부 결제」로 다음 인원으로 진행하세요.'
                        )
                      : tr('posDutchPayFooterHint', '수단을 탭해 금액을 넣은 뒤, 하단 「일부 결제」로 한 명씩 진행하세요.')}
                  </p>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {orderType === 'dine-in' && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm select-none">
                <input
                  type="checkbox"
                  checked={isPrepaid}
                  onChange={(e) => setIsPrepaid(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="font-medium">{tr('posPrepaidKeepTable', '선불 (결제 후 테이블 유지)')}</span>
              </label>
            )}
            <div
              className={cn(
                'space-y-2 rounded-2xl border px-4 py-3 shadow-sm',
                paymentSumMatch
                  ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-amber-500/35 bg-amber-500/[0.08] text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50'
              )}
              data-tour="pos-tour-dutch-payment-sum-box"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{t('posPaymentSum') || '입력 합계'}</span>
                <span className="tabular-nums text-base font-bold">
                  {formatBahtNum(paymentSum)} <span className="text-muted-foreground font-medium">/</span>{' '}
                  {formatBahtNum(total)} ฿
                </span>
              </div>
              {total > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-background/60 dark:bg-background/20">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      paymentSumMatch ? 'bg-emerald-500' : 'bg-amber-500'
                    )}
                    style={{ width: `${Math.min(100, (paymentSum / total) * 100)}%` }}
                  />
                </div>
              )}
              {!paymentSumMatch && total > 0 && (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  {tr('posPaymentRemaining', '남은 금액')}: {formatBahtNum(Math.max(0, total - paymentSum))} ฿
                </p>
              )}
            </div>
            {!paymentSumMatch && (
              <p className="text-center text-xs text-amber-700 dark:text-amber-400">{t('posPaymentSumMismatch') || '결제 합계가 주문 금액과 일치해야 합니다.'}</p>
            )}
            </div>

            <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/85 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3">
              <Button
                variant="secondary"
                className="h-12 w-full rounded-xl sm:w-auto sm:min-w-[7rem]"
                onClick={() => setShowPaymentModal(false)}
              >
                {t('posCancel') || '취소'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'h-12 w-full rounded-xl border-violet-500/40 font-semibold sm:w-auto sm:min-w-[9rem]',
                  partialPayDisabled ? 'opacity-60' : ''
                )}
                disabled={partialPayDisabled}
                onClick={confirmSplitStep}
                data-tour="pos-tour-payment-partial"
              >
                {tr('posPartialPaymentButton', '일부 결제')}
              </Button>
              <Button
                className={cn(
                  'h-12 w-full rounded-xl px-8 font-bold sm:w-auto sm:min-w-[10rem]',
                  !paymentSumMatch ||
                    taxInvoiceInvalid ||
                    (showSplit && splitPaidSteps < Math.max(1, splitCount)) ||
                    (orderType === 'dine-in' && guestCount <= 0)
                    ? 'bg-muted text-muted-foreground hover:bg-muted'
                    : 'shadow-md'
                )}
                disabled={
                  !paymentSumMatch ||
                  taxInvoiceInvalid ||
                  (showSplit && splitPaidSteps < Math.max(1, splitCount)) ||
                  (orderType === 'dine-in' && guestCount <= 0)
                }
                onClick={handlePaymentComplete}
                data-tour="pos-tour-payment-confirm"
              >
                {t('posPayConfirm') || '결제 완료'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={postPaymentCashChangeBaht != null}>
      <DialogContent
        hideCloseButton
        className="max-w-sm gap-5 sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{tr('posCashChangePostPaymentTitle', '거스름돈')}</DialogTitle>
          <DialogDescription>{tr('posCashChangePostPaymentBody', '결제가 완료되었습니다. 아래 금액을 거슬러 주세요.')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-5 text-center dark:border-emerald-500/40 dark:bg-emerald-950/35">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            {tr('posCashChangeAmount', '거슬러줄 금액')}
          </p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
            {postPaymentCashChangeBaht != null ? `${formatBahtNum(postPaymentCashChangeBaht)} ฿` : ''}
          </p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button type="button" className="h-12 w-full rounded-xl font-bold sm:max-w-xs" onClick={() => setPostPaymentCashChangeBaht(null)}>
            {t('posConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
})
