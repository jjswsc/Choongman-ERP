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
  X,
  Pencil,
  LayoutGrid,
  ArrowLeft,
  Bike,
  Package,
  CircleDollarSign,
  Sparkles,
  Handshake,
  CheckCircle2,
  Clock3,
} from 'lucide-react'
import type { Store, Table, OrderItem } from '@/lib/pos-types'
import { cn, formatBahtNum, formatBahtWhole, formatPosQtyCompact } from '@/lib/utils'
import { formatBahtAmountForField, formatBahtInputDisplay, formatIntegerInputDisplay, parseBahtAmount, parseIntegerInput, parsePosDiscountValueInput } from '@/lib/baht-input-format'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { appAlert } from '@/lib/app-message'
import { useAuth } from '@/lib/auth-context'
import {
  getPosMenuOptions,
  getPosCollabCampaigns,
  getPosPaymentMethodItems,
  upsertPosTaxInvoiceRecipient,
  validatePosCoupons,
  type PosAppliedCoupon,
  type PosMenu,
  type PosMenuOption,
  type PosPaymentMethodItem,
} from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import {
  buildCartPanelLineDiscountAllocations,
  collabDiscountAmountForCart,
  collabSupportsQuantityEntry,
} from '@/lib/pos-collab-discount'
import { normalizeMemberTierCodeForDiscount } from '@/lib/member-tier-discount'
import { buildCouponDiscountLineAllocations, summarizeLegacyCouponFields } from '@/lib/pos-coupon-domain'
import { localizeApiMessage } from '@/lib/translate-api-message'
import {
  isMemberCouponQrPayload,
  isMemberCouponScanPayload,
  normalizeCouponScanDelimiters,
  parseLooseMemberCouponScanInput,
} from '@/lib/member-coupon-qr'
import {
  playPosScanBeep,
  POS_SCAN_FIELD_FLASH_MS,
  POS_SCAN_IDLE_REFOCUS_MS,
  POS_SCAN_IDLE_SUBMIT_MS,
  posScanFieldFlashClass,
  type PosScanFieldFlash,
} from '@/lib/pos-scan-feedback'
import { isMemberPosScanPayload, parseMemberPosScanInput } from '@/lib/member-pos-qr'
import { PosCouponQrScannerDialog } from '@/components/pos/pos-coupon-qr-scanner-dialog'
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  type PosPricingAdjustments,
  type PosPricingResult,
} from '@/lib/pos-pricing'
import type { PosExistingOrderCheckoutDiscount } from '@/lib/pos-existing-order-checkout-discount'
import {
  seedCheckoutMemberFromExistingOrder,
  type PosExistingOrderCheckoutMember,
} from '@/lib/pos-existing-order-checkout-member'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import {
  translateReceiptTableDisplayName,
  translateTakeoutOrderDisplayLabel,
} from '@/lib/pos-print-translate'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { usePosCartMember } from '@/hooks/use-pos-cart-member'
import { getPosCartSessionKey } from '@/lib/pos-cart-session'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'
import { computeMenuSplitDueByPerson, computeMenuSplitDueFromBaseSum } from '@/lib/pos-menu-split-due'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { PosCollabQuantityControl } from '@/components/pos/pos-collab-quantity-control'
import { resolvePromoSublineOptionDisplayName } from '@/lib/pos-promo-subline-option-label'
import { usePosTour } from '@/lib/pos-tour'
import {
  resolveDefaultDeliveryPaymentChannel,
  resolveDeliveryPaymentChannelForSave,
  type ReceiptDeliveryChannelContext,
} from '@/lib/pos-delivery-platform'
import { Separator } from '@/components/ui/separator'
import {
  type CartPanelAddItemPayload,
  type CartPanelBeforePaymentReceiptPayload,
  type CartPanelHandle,
  type CartPanelOrderCompleteResult,
  type CartPanelOrderLinePayload,
  type CartPanelPaymentPayload,
  type CartPanelSplitReceiptPayload,
  type CartDeliveryApp,
  type CartOrderType,
} from '@/components/pos/cart-panel-types'
import { clonePosCartItems, peekPosCartItemsCache, readPosCartItemsCache, replacePosCartItemsCache, writePosCartItemsCache } from '@/lib/pos-cart-items-cache'

export type {
  CartPanelAddItemPayload,
  CartPanelBeforePaymentReceiptPayload,
  CartPanelHandle,
  CartPanelOrderCompleteResult,
  CartPanelOrderLinePayload,
  CartPanelPaymentPayload,
  CartPanelSplitReceiptPayload,
  CartDeliveryApp,
  CartOrderType,
} from '@/components/pos/cart-panel-types'
export { readPosCartItemsCache, writePosCartItemsCache } from '@/lib/pos-cart-items-cache'
import { cartPanelDeliveryChannelContext, deliveryAppBrandClasses } from '@/components/pos/cart-panel-delivery-brand'
import {
  PosPaymentModalAmountCard,
  type CartPanelMenuLineDiscountMode,
} from '@/components/pos/cart-panel-payment-modal-amount-card'
import {
  buildPaymentPayloadForOrderSubmit,
  capCartPanelPaymentSnapshot,
  mergeSplitOrderPaymentForSubmit,
  paymentTabTourTarget,
  sumCartPanelPaymentSnapshot,
  type CartPanelPaymentMethodTab,
} from '@/lib/cart-panel-payment-utils'
import {
  buildCartPanelOrderMemoWithTaxInvoice,
  isSyntheticTaxRegistryKey,
  normalizeTaxInvoiceFields,
  profileToTaxInvoiceSavePayload,
  taxRegistryLocalKey,
  validateTaxInvoiceFields,
  type TaxInvoiceProfile,
  type TaxSearchField,
} from '@/lib/cart-panel-tax-invoice-utils'
import { searchCartPanelTaxInvoiceProfile } from '@/lib/cart-panel-tax-invoice-search'
import { CartPanelTaxInvoiceSection } from '@/components/pos/cart-panel-tax-invoice-section'
import {
  normalizeExistingPosOrderId,
  resetCheckoutDiscountUiState,
  seedCheckoutDiscountFromExistingOrder,
  resolveDineInTableNameForStorage,
} from '@/lib/cart-panel-checkout-helpers'

type PaymentMethodTab = CartPanelPaymentMethodTab
type MenuLineDiscountMode = CartPanelMenuLineDiscountMode

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
  /** 2층 이상 테이블 배치 — 홀 주문 `table_name`에 층 접두(예: `2F-3`) 저장 */
  dineInMultiFloorLayout?: boolean
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
    appliedCoupons?: PosAppliedCoupon[]
    tierDiscountAmt?: number
    memberTierCode?: string
    pointUsed?: number
    /** 홀 주문 인원 (매출 분석용) */
    guestCount?: number
    /** 테이블에 이미 열린 주문이 있으면 해당 주문 id */
    existingOrderId?: number
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
    appliedCoupons?: PosAppliedCoupon[]
    tierDiscountAmt?: number
    memberTierCode?: string
    pointUsed?: number
  }, existingOrderId?: number) => CartPanelOrderCompleteResult
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
    appliedCoupons?: PosAppliedCoupon[]
    tierDiscountAmt?: number
    memberTierCode?: string
    pointUsed?: number
  }, existingOrderId?: number) => CartPanelOrderCompleteResult
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
    appliedCoupons?: PosAppliedCoupon[]
    tierDiscountAmt?: number
    memberTierCode?: string
    pointUsed?: number
    /** 선불: 결제 후 테이블 유지. 후불: 결제 시 테이블 초기화 */
    isPrepaid?: boolean
    guestCount?: number
  }, existingOrderId?: number) => CartPanelOrderCompleteResult
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
    appliedCoupons?: PosAppliedCoupon[]
    tierDiscountAmt?: number
    memberTierCode?: string
    pointUsed?: number
  }) => CartPanelOrderCompleteResult
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
  /**
   * 더치·분할 결제에서 인원별 결제가 확정될 때(현금 포함 시).
   * 터미널에서 즉시 돈통을 열어 거스름돈을 받을 수 있게 함.
   */
  onSplitCashPaymentStep?: (payment: CartPanelPaymentPayload) => void
  /** 터미널 데모: 홀에서 손님 수가 0이면 지정 값으로(투어 주문 버튼) */
  posDineInDemoDefaultGuestCount?: number
  /** 터미널 투어 등: 홀 손님 수 변경 시 부모 동기 */
  onGuestCountChange?: (guestCount: number) => void
  /**
   * 터미널: 결제 후 거스름 안내를 부모(사이드 패널 언마운트 후에도 유지)에서 표시.
   * 지정 시 CartPanel 내부 다이얼로그는 렌더하지 않음.
   */
  onPostPaymentCashChange?: (baht: number | null) => void
}

type CartItem = OrderItem

/**
 * 열린 Radix Select/Popover/Dropdown이 있는지 검사.
 * 스캔 input 자동 포커스가 열린 드롭다운의 포커스를 뺏어 즉시 닫는 것을 막기 위함.
 * (메인 POS 기기는 폴링·refetch로 리렌더가 잦아 그때마다 포커스를 뺏겼음)
 */
function isRadixOverlayOpen(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(
    document.querySelector(
      '[data-radix-popper-content-wrapper], [role="listbox"][data-state="open"], [data-radix-select-viewport], [role="menu"][data-state="open"]'
    )
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
  dineInMultiFloorLayout = false,
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
  onSplitCashPaymentStep,
  posDineInDemoDefaultGuestCount,
  onGuestCountChange,
  onPostPaymentCashChange,
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

  const [orderTypeInternal, setOrderTypeInternal] = useState<CartOrderType>('dine-in')
  const orderType = lockOrderType && orderTypeProp != null ? orderTypeProp : orderTypeInternal
  const canSubmit =
    !lockOrderType ||
    (orderType === 'dine-in'
      ? !!selectedTable
      : orderType === 'delivery'
        ? !!deliveryAppProp
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
    return clonePosCartItems(peekPosCartItemsCache(cartItemsCacheKey) ?? [])
  })
  const cartItems = isCartControlled ? cartItemsProp! : internalCartItems
  const setCartItems = isCartControlled ? setCartItemsProp! : setInternalCartItems
  const [takeoutSlot, setTakeoutSlot] = useState<string>('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [guestCount, setGuestCount] = useState(0)
  const [guestDirectOpen, setGuestDirectOpen] = useState(false)
  const [guestDirectValue, setGuestDirectValue] = useState('10')
  const [customerMemo, setCustomerMemo] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const pendingMemberCouponQrRawRef = useRef<string | null>(null)
  const lastScanBeepAtRef = useRef(0)
  const couponUsbScanBufferRef = useRef({ chars: '', lastAt: 0 })
  const memberScanInputRef = useRef<HTMLInputElement>(null)
  const paymentMemberScanInputRef = useRef<HTMLInputElement>(null)
  const couponScanInputRef = useRef<HTMLInputElement>(null)
  const [memberScanFlash, setMemberScanFlash] = useState<PosScanFieldFlash>(null)
  const [couponScanFlash, setCouponScanFlash] = useState<PosScanFieldFlash>(null)
  const scanFieldFlashTimerRef = useRef<number | null>(null)
  const lastPosActivityRef = useRef(Date.now())
  const couponScanAutoSubmitRef = useRef<string | null>(null)
  const memberFieldCouponAutoRef = useRef<string | null>(null)
  const [couponQuantityInput, setCouponQuantityInput] = useState('1')
  const couponQuantity = Math.max(1, Math.min(99, parseIntegerInput(couponQuantityInput, 1)))
  const [appliedCoupons, setAppliedCoupons] = useState<PosAppliedCoupon[]>([])
  const [couponQrScannerOpen, _setCouponQrScannerOpen] = useState(false)
  const couponQrScannerOpenRef = useRef(false)
  const couponQrScannerClosingRef = useRef(false)
  const setCouponQrScannerOpen = useCallback((open: boolean) => {
    if (!open && couponQrScannerOpenRef.current) {
      couponQrScannerClosingRef.current = true
      couponQrScannerOpenRef.current = false
      _setCouponQrScannerOpen(false)
      window.setTimeout(() => {
        couponQrScannerClosingRef.current = false
      }, 350)
      return
    }
    couponQrScannerOpenRef.current = open
    _setCouponQrScannerOpen(open)
  }, [])
  const isCouponQrScannerOverlayActive = useCallback(
    () => couponQrScannerOpenRef.current || couponQrScannerClosingRef.current,
    []
  )
  const [pointUsed, setPointUsed] = useState('')
  const [couponMessage, setCouponMessage] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValueInput, setDiscountValueInput] = useState('')
  const discountValue = parsePosDiscountValueInput(discountValueInput, discountType)
  const [discountReason, setDiscountReason] = useState('')
  const [lineDiscountModeByItemId, setLineDiscountModeByItemId] = useState<Record<string, MenuLineDiscountMode>>({})
  const manualDiscountCardRef = useRef<HTMLDivElement | null>(null)
  /** 결제 모달 금액·할인·포인트 입력 중 자동 합계 덮어쓰기·스캔 포커스가 키보드를 끊지 않도록 */
  const paymentAmountInputFocusedRef = useRef(false)
  const paymentAmountInputBlurTimerRef = useRef<number | null>(null)
  const activePaymentAmountInputRef = useRef<HTMLInputElement | null>(null)
  const lastPaymentAmountInputAtRef = useRef(0)
  const PAYMENT_AMOUNT_INPUT_BLUR_MS = 320
  const PAYMENT_AMOUNT_TYPING_GRACE_MS = 800
  const isPaymentAmountInputEl = useCallback(
    (el: Element | null | undefined): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.dataset.posPaymentAmount === '1',
    []
  )
  const [discountPaymentSyncTick, setDiscountPaymentSyncTick] = useState(0)
  const bumpDiscountPaymentSync = useCallback(() => {
    setDiscountPaymentSyncTick((t) => t + 1)
  }, [])
  const markPaymentAmountInputFocused = useCallback((el?: HTMLInputElement | null) => {
    if (paymentAmountInputBlurTimerRef.current != null) {
      window.clearTimeout(paymentAmountInputBlurTimerRef.current)
      paymentAmountInputBlurTimerRef.current = null
    }
    if (el) activePaymentAmountInputRef.current = el
    lastPaymentAmountInputAtRef.current = Date.now()
    paymentAmountInputFocusedRef.current = true
  }, [])
  const isActivelyEditingPaymentAmount = useCallback(() => {
    if (paymentAmountInputFocusedRef.current) return true
    if (Date.now() - lastPaymentAmountInputAtRef.current < PAYMENT_AMOUNT_TYPING_GRACE_MS) return true
    return isPaymentAmountInputEl(document.activeElement)
  }, [isPaymentAmountInputEl])
  const restorePaymentAmountInputFocus = useCallback((el: HTMLInputElement) => {
    window.requestAnimationFrame(() => {
      if (document.activeElement !== el) {
        el.focus({ preventScroll: true })
      }
    })
  }, [])
  const handlePaymentBahtInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, apply: (formatted: string) => void) => {
      const el = e.currentTarget
      markPaymentAmountInputFocused(el)
      apply(formatBahtInputDisplay(e.target.value))
      restorePaymentAmountInputFocus(el)
    },
    [markPaymentAmountInputFocused, restorePaymentAmountInputFocus]
  )
  const handlePaymentIntegerInputChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      apply: (formatted: string) => void,
      maxDigits = 6
    ) => {
      const el = e.currentTarget
      markPaymentAmountInputFocused(el)
      apply(formatIntegerInputDisplay(e.target.value, maxDigits))
      restorePaymentAmountInputFocus(el)
    },
    [markPaymentAmountInputFocused, restorePaymentAmountInputFocus]
  )
  const bindPaymentAmountInputFocus = useCallback(
    (opts?: { syncPaymentOnBlur?: boolean }) => ({
      'data-pos-payment-amount': '1' as const,
      onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
        markPaymentAmountInputFocused(e.currentTarget)
      },
      onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
        markPaymentAmountInputFocused(e.currentTarget)
      },
      onBlur: () => {
        if (paymentAmountInputBlurTimerRef.current != null) {
          window.clearTimeout(paymentAmountInputBlurTimerRef.current)
        }
        // 태블릿·OSK·윈도우 POS: Dialog/가상키보드 blur 직후 합계 덮어쓰기·스캔 포커스가 끊기지 않게
        paymentAmountInputBlurTimerRef.current = window.setTimeout(() => {
          paymentAmountInputBlurTimerRef.current = null
          const nowFocused = document.activeElement
          if (isPaymentAmountInputEl(nowFocused)) return
          // 사용자가 의도적으로 다른 input으로 이동한 경우 포커스를 뺏지 않음
          if (
            nowFocused instanceof HTMLInputElement ||
            nowFocused instanceof HTMLTextAreaElement ||
            nowFocused instanceof HTMLSelectElement ||
            (nowFocused instanceof HTMLElement && nowFocused.isContentEditable)
          ) {
            activePaymentAmountInputRef.current = null
            paymentAmountInputFocusedRef.current = false
            if (opts?.syncPaymentOnBlur) bumpDiscountPaymentSync()
            return
          }
          const recentlyTyping =
            Date.now() - lastPaymentAmountInputAtRef.current < PAYMENT_AMOUNT_TYPING_GRACE_MS
          if (recentlyTyping) {
            const el = activePaymentAmountInputRef.current
            if (el) {
              el.focus({ preventScroll: true })
              return
            }
          }
          activePaymentAmountInputRef.current = null
          paymentAmountInputFocusedRef.current = false
          if (opts?.syncPaymentOnBlur) bumpDiscountPaymentSync()
        }, PAYMENT_AMOUNT_INPUT_BLUR_MS)
      },
    }),
    [bumpDiscountPaymentSync, isPaymentAmountInputEl, markPaymentAmountInputFocused]
  )
  const triggerScanFieldFeedback = useCallback(
    (field: 'member' | 'coupon', outcome: 'success' | 'error') => {
      playPosScanBeep(outcome, lastScanBeepAtRef)
      const setter = field === 'member' ? setMemberScanFlash : setCouponScanFlash
      setter(outcome)
      if (scanFieldFlashTimerRef.current != null) {
        window.clearTimeout(scanFieldFlashTimerRef.current)
      }
      scanFieldFlashTimerRef.current = window.setTimeout(() => {
        setter(null)
        scanFieldFlashTimerRef.current = null
      }, POS_SCAN_FIELD_FLASH_MS)
    },
    []
  )
  const paymentMethodSectionRef = useRef<HTMLDivElement | null>(null)
  const dutchMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const splitModePrevRef = useRef<'amount' | 'menu'>('amount')
  const manualDiscountFlashTimerRef = useRef<number | null>(null)
  const [manualDiscountFlash, setManualDiscountFlash] = useState(false)
  const [collabOptions, setCollabOptions] = useState<
    { id: string; topic: string; campaignNo?: string; collabDetail: MarketingCollabDetail }[]
  >([])
  const [appliedCollabId, setAppliedCollabId] = useState<string | null>(null)
  const [collabQuantity, setCollabQuantity] = useState(1)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const refocusActiveScanInput = useCallback(() => {
    window.setTimeout(() => {
      if (couponQrScannerOpenRef.current) return
      if (isRadixOverlayOpen()) return
      if (showPaymentModal) couponScanInputRef.current?.focus()
      else memberScanInputRef.current?.focus()
    }, 60)
  }, [showPaymentModal])
  const finishCouponScanInput = useCallback(
    (outcome: 'success' | 'error') => {
      triggerScanFieldFeedback('coupon', outcome)
      couponScanAutoSubmitRef.current = null
      pendingMemberCouponQrRawRef.current = null
      couponUsbScanBufferRef.current = { chars: '', lastAt: 0 }
      if (outcome === 'success') setCouponCode('')
      refocusActiveScanInput()
    },
    [refocusActiveScanInput, triggerScanFieldFeedback]
  )
  /** 결제 확정 직후: 현금 거스름 안내(확인 버튼으로만 닫음). 터미널은 onPostPaymentCashChange로 부모에 위임 */
  const [postPaymentCashChangeBaht, setPostPaymentCashChangeBaht] = useState<number | null>(null)
  const [paymentSubmitInFlight, setPaymentSubmitInFlight] = useState(false)
  const setPostPaymentCashChange = useCallback(
    (baht: number | null) => {
      if (onPostPaymentCashChange) onPostPaymentCashChange(baht)
      else setPostPaymentCashChangeBaht(baht)
    },
    [onPostPaymentCashChange]
  )
  useEffect(() => {
    onPaymentModalOpenChange?.(showPaymentModal)
  }, [showPaymentModal, onPaymentModalOpenChange])
  const [activePaymentTab, setActivePaymentTab] = useState<PaymentMethodTab>('cash')
  const [payCash, setPayCash] = useState('')
  const [cashTendered, setCashTendered] = useState('')
  /** capture/스냅샷 시 setState 직후 값 누락 방지(더치·일부결제) */
  const cashTenderedRef = useRef('')
  const cashTenderedInputRef = useRef<HTMLInputElement>(null)
  const [payCard, setPayCard] = useState('')
  const [payTrueMoney, setPayTrueMoney] = useState('')
  const [payWeChat, setPayWeChat] = useState('')
  const [payAlipay, setPayAlipay] = useState('')
  const [payUnionPay, setPayUnionPay] = useState('')
  const [payPromptPay, setPayPromptPay] = useState('')
  const [payQrType, setPayQrType] = useState<'THAI_QR' | 'CREDIT_CARD'>('THAI_QR')
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
  const [splitCountDraft, setSplitCountDraft] = useState<string | null>(null)
  const [splitPaidSteps, setSplitPaidSteps] = useState(0)
  const [showSplit, setShowSplit] = useState(false)
  const [splitMode, setSplitMode] = useState<'amount' | 'menu'>('amount')
  const [amountSplitTargetPerson, setAmountSplitTargetPerson] = useState(0)
  const [amountSplitPaidByPerson, setAmountSplitPaidByPerson] = useState<number[]>([])
  const [menuSplitTargetPerson, setMenuSplitTargetPerson] = useState(0)
  const [menuSplitAssigned, setMenuSplitAssigned] = useState<Record<string, number[]>>({})
  /** 메뉴 기준 1단계: 인원 확정 전 선택 수량(메뉴 → 명 → 결제) */
  const [menuSplitPendingQty, setMenuSplitPendingQty] = useState<Record<string, number>>({})
  const [menuSplitPaidByPerson, setMenuSplitPaidByPerson] = useState<number[]>([])
  const menuSplitAutoAppliedKeyRef = useRef<string>('')
  const splitPaymentsByPersonRef = useRef<(CartPanelPaymentPayload | undefined)[]>([])
  const [splitCaptureTick, setSplitCaptureTick] = useState(0)
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
      replacePosCartItemsCache(key, clonePosCartItems(cartItemsRef.current))
    }
  }, [cartItemsCacheKey, isCartControlled])

  useEffect(() => {
    if (isCartControlled) return
    if (orderType !== 'dine-in') {
      setCartItems(clonePosCartItems(peekPosCartItemsCache(cartItemsCacheKey) ?? []))
      return
    }
    const fromNew = clonePosCartItems(peekPosCartItemsCache(cartItemsCacheKey) ?? [])
    if (fromNew.length > 0) {
      setCartItems(fromNew)
      return
    }
    const dineInWithTakeoutTail = `${currentStoreId}|dine-in|${tableIdForCartSessionKey}|||${takeoutLabelProp ?? ''}`
    const fromTakeoutTail = clonePosCartItems(peekPosCartItemsCache(dineInWithTakeoutTail) ?? [])
    if (fromTakeoutTail.length > 0) {
      setCartItems(fromTakeoutTail)
      return
    }
    const legacyKey = `${currentStoreId}|dine-in|${tableIdForCartSessionKey}|${deliveryAppProp ?? ''}|${deliveryOrderNoProp ?? ''}|${takeoutLabelProp ?? ''}`
    if (legacyKey === cartItemsCacheKey) {
      setCartItems(fromNew)
      return
    }
    setCartItems(clonePosCartItems(peekPosCartItemsCache(legacyKey) ?? []))
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
    replacePosCartItemsCache(cartItemsCacheKey, clonePosCartItems(cartItems))
  }, [cartItemsCacheKey, cartItems, isCartControlled])

  useEffect(() => {
    if (showPaymentModal && orderType === 'dine-in') {
      const hasExistingOrder =
        isExistingOrderCheckout || normalizeExistingPosOrderId(pendingOrderId) != null
      setIsPrepaid(!hasExistingOrder)
    }
  }, [showPaymentModal, orderType, pendingOrderId, isExistingOrderCheckout])

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
  const {
    selectedMemberId,
    setSelectedMemberId,
    memberKeyword,
    setMemberKeyword,
    memberOptions,
    setMemberOptions,
    memberMap,
    setMemberMap,
    membersLoading,
    tierDiscountRates,
    memberScanAutoSubmitRef,
    isMemberOrder,
    selectedMemberDetail,
    memberSearchEmpty,
    selectedMemberTierDiscountRate,
    tierDiscountAmt,
    tierOrderFields,
    linkMemberByMemberNo,
    linkMemberById,
    handleMemberSearch,
    handleMemberKeywordInput,
    finishMemberScanInput,
  } = usePosCartMember({
    discountScopeSubtotal,
    triggerScanFieldFeedback,
    refocusActiveScanInput,
    pendingMemberCouponQrRawRef,
    couponUsbScanBufferRef,
  })
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
    return collabDiscountAmountForCart(
      collabScopeItems,
      menuByIdForCollab,
      appliedCollab.collabDetail,
      collabQuantity
    )
  }, [appliedCollab, cartItems, collabQuantity, hasSelectedDiscountScope, lineDiscountModeByItemId, menuByIdForCollab])
  const manualDiscountInputAmt =
    discountType === 'percent' ? Math.floor((discountScopeSubtotal * discountValue) / 100) : discountValue
  const manualDiscountAmt = Math.min(Math.max(0, manualDiscountInputAmt), Math.max(0, subtotalAfterCancel - serviceDiscountAmt))
  const couponDiscountTotal = useMemo(
    () =>
      Math.round(
        appliedCoupons.reduce((sum, row) => sum + Math.max(0, Number(row.discountAmt ?? 0) || 0), 0) * 100
      ) / 100,
    [appliedCoupons]
  )
  const buildCouponCartLines = useCallback(
    () =>
      cartItems.map((item) => {
        const menuId = String((item as { menuId?: string }).menuId ?? '').trim() || undefined
        const menu = menuId ? menuByIdForCollab.get(menuId) : undefined
        const categoryCode =
          String((item as { categoryCode?: string }).categoryCode ?? '').trim() ||
          String(menu?.category ?? menu?.categoryMain ?? '').trim() ||
          undefined
        return {
          menuId,
          menuCode: String(menu?.code ?? '').trim() || undefined,
          categoryCode,
          quantity: Math.max(1, Number(item.quantity || 1)),
          lineSubtotal: Math.max(0, Number(item.price || 0) * Math.max(1, Number(item.quantity || 1))),
        }
      }),
    [cartItems, menuByIdForCollab]
  )
  const couponLineAlloc = useMemo(
    () => buildCouponDiscountLineAllocations(buildCouponCartLines(), appliedCoupons),
    [appliedCoupons, buildCouponCartLines]
  )
  const couponPayloadFields = useMemo(() => {
    const legacy = summarizeLegacyCouponFields(appliedCoupons)
    return {
      appliedCoupons: appliedCoupons.length ? appliedCoupons : undefined,
      couponCode: legacy.couponCode || undefined,
      couponDiscountAmt: legacy.couponDiscountAmt || undefined,
    }
  }, [appliedCoupons])
  const baseDiscount = cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt + couponDiscountTotal + tierDiscountAmt
  const discount = Math.min(subtotal, baseDiscount + collabDiscountAmt)
  const discountExpectedTotal = Math.min(subtotal, cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt + couponDiscountTotal + tierDiscountAmt + collabDiscountAmt)
  const lineDiscountSnapshot = useMemo(() => {
    const totalDiscount = Math.max(0, Number(discount) || 0)
    if (!Array.isArray(cartItems) || cartItems.length === 0 || totalDiscount <= 0.0001) {
      return cartItems.map(() => 0)
    }
    return buildCartPanelLineDiscountAllocations({
      lines: cartItems.map((i) => ({
        id: String(i.id ?? ''),
        name: String(i.name ?? ''),
        price: Number(i.price ?? 0),
        qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
        ...(i.promoId ? { promoId: String(i.promoId) } : {}),
        ...(i.menuId ? { menuId: String(i.menuId) } : {}),
        ...(i.menuId1 != null ? { menuId1: i.menuId1, menuId2: i.menuId2 } : {}),
      })),
      menuById: menuByIdForCollab,
      lineModeById: lineDiscountModeByItemId,
      hasSelectedDiscountScope,
      collabDetail: appliedCollab?.collabDetail ?? null,
      collabDiscountAmt: appliedCollab ? collabDiscountAmt : 0,
      serviceDiscountAmt,
      cancelledLineAmt,
      tierDiscountAmt,
      manualDiscountAmt,
      couponLineAlloc,
    })
  }, [
    appliedCollab,
    cancelledLineAmt,
    cartItems,
    collabDiscountAmt,
    tierDiscountAmt,
    couponLineAlloc,
    discount,
    hasSelectedDiscountScope,
    lineDiscountModeByItemId,
    manualDiscountAmt,
    menuByIdForCollab,
    serviceDiscountAmt,
  ])

  const mapCartItemToOrderPayload = (i: CartItem, quantityOverride?: number, lineIdx?: number) => {
    const orderTypeNorm = orderType === 'dine-in' ? 'dine_in' : orderType
    const lineNote = String(i.note ?? '').trim()
    const quantity =
      quantityOverride != null
        ? resolveCartLineQuantityForSave({ quantity: quantityOverride })
        : resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown })
    const menuIdLine = String(i.menuId ?? '').trim()
    const optionIdLine = String(i.optionId ?? '').trim()
    const optionCodeLine = String(i.optionCode ?? '').trim()
    const lineDiscountAmt =
      lineIdx != null && lineIdx >= 0 ? Math.max(0, Number(lineDiscountSnapshot[lineIdx] ?? 0) || 0) : 0
    return {
      id: i.id,
      name: i.name,
      price: i.price,
      quantity,
      orderType: orderTypeNorm,
      ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
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

  const paymentDiscountReason = useMemo(() => {
    const base = discountReason.trim()
    const collabPart = appliedCollab
      ? `${t('posCollabDiscount')}: ${appliedCollab.topic}${
          collabSupportsQuantityEntry(appliedCollab.collabDetail) && collabQuantity > 1
            ? ` × ${collabQuantity}`
            : ''
        }`
      : ''
    const tierPart =
      tierDiscountAmt > 0
        ? `${tr('posTierDiscount', '등급 할인')} (${normalizeMemberTierCodeForDiscount(memberMap[selectedMemberId]?.tierCode || 'BRONZE')} ${(selectedMemberTierDiscountRate * 100).toFixed(1)}%)`
        : ''
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
    const parts = [base, collabPart, tierPart, linePart, cancelPart].filter(Boolean)
    return parts.join(' · ')
  }, [appliedCollab, cartItems, collabQuantity, discountReason, lineDiscountModeByItemId, memberMap, selectedCancelledLineCount, selectedMemberId, selectedMemberTierDiscountRate, t, tierDiscountAmt])
  const paymentServiceReason = useMemo(() => {
    if (selectedServiceLineCount <= 0) return ''
    return `${tr('posServiceHandled', '서비스처리')} ${selectedServiceLineCount}${tr('posMenuLineUnit', '건')}`
  }, [selectedServiceLineCount, t])
  const pointUsedNum = Math.max(0, parseIntegerInput(pointUsed, 0))
  const pricing = computePosPricing({
    subtotal,
    discountAmt: discount + pointUsedNum,
    cardPaymentAmount: parseBahtAmount(payCard) || 0,
    adjustments: pricingAdjustments,
  })
  const total = pricing.finalTotal
  const round2 = (n: number) => Math.round(n * 100) / 100
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
      if (scanFieldFlashTimerRef.current != null) {
        window.clearTimeout(scanFieldFlashTimerRef.current)
      }
      if (paymentAmountInputBlurTimerRef.current != null) {
        window.clearTimeout(paymentAmountInputBlurTimerRef.current)
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
    const v = parseIntegerInput(guestDirectValue, 0)
    if (v > 0) setGuestCount(Math.max(1, Math.min(99, v)))
    setGuestDirectOpen(false)
  }

  const legacyWalletPaymentSum =
    (parseBahtAmount(payTrueMoney) || 0) +
    (parseBahtAmount(payWeChat) || 0) +
    (parseBahtAmount(payAlipay) || 0) +
    (parseBahtAmount(payUnionPay) || 0) +
    (parseBahtAmount(payLinePay) || 0) +
    (parseBahtAmount(payShopeePay) || 0) +
    (parseBahtAmount(payOther) || 0)
  const adminConfiguredWalletSum = adminPaymentLines.reduce(
    (s, i) => s + (parseBahtAmount(payAdminLineAmounts[i.id] || '0') || 0),
    0
  )
  const paymentSum =
    (parseBahtAmount(payCash) || 0) +
    (parseBahtAmount(payCard) || 0) +
    (parseBahtAmount(payPromptPay) || 0) +
    (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
    (parseBahtAmount(payDeliveryApp) || 0)
  const SPLIT_AMOUNT_EPS = 0.02
  const paymentTotalsReconcile = (entered: number, due: number) =>
    Math.abs(round2(entered) - round2(due)) <= SPLIT_AMOUNT_EPS ||
    Math.round(entered) === Math.round(due)
  /** 더치페이: 일부 결제로 확정된 인원 합 + 현재 입력란 */
  const splitCapturedPaymentSum = useMemo(() => {
    if (!showSplit) return 0
    let sum = 0
    for (const snap of splitPaymentsByPersonRef.current) {
      if (snap) sum += sumCartPanelPaymentSnapshot(snap)
    }
    return Math.round(sum * 100) / 100
  }, [showSplit, splitPaidSteps, splitCaptureTick, paymentSum])
  const displayPaymentSum = showSplit
    ? paymentTotalsReconcile(splitCapturedPaymentSum, total)
      ? splitCapturedPaymentSum
      : Math.round((splitCapturedPaymentSum + paymentSum) * 100) / 100
    : paymentSum
  const nonCashPaymentSum =
    (parseBahtAmount(payCard) || 0) +
    (parseBahtAmount(payPromptPay) || 0) +
    (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
    (parseBahtAmount(payDeliveryApp) || 0)
  const cashRequiredAmount = Math.max(0, total - nonCashPaymentSum)
  const cashTenderedNum = parseBahtAmount(cashTendered)
  const _cashChangeAmount = Math.max(0, cashTenderedNum - cashRequiredAmount)
  const _cashShortAmount = Math.max(0, cashRequiredAmount - cashTenderedNum)
  const paymentEnteredSum = showSplit ? displayPaymentSum : paymentSum
  const paymentSumMatch = paymentTotalsReconcile(paymentEnteredSum, total)

  const buildPaymentOtherBreakdownSnapshot = useCallback((): PosPaymentOtherBreakdown | undefined => {
    const r2 = (n: number) => Math.round(Math.max(0, n) * 100) / 100
    if (useAdminPaymentLines) {
      const admin: Record<string, number> = {}
      for (const line of adminPaymentLines) {
        const v = r2(parseBahtAmount(payAdminLineAmounts[line.id] || '0') || 0)
        if (v > 0.005) admin[String(line.id)] = v
      }
      if (Object.keys(admin).length === 0) return undefined
      return { admin }
    }
    const out: PosPaymentOtherBreakdown = {}
    const tm = r2(parseBahtAmount(payTrueMoney) || 0)
    const wc = r2(parseBahtAmount(payWeChat) || 0)
    const ap = r2(parseBahtAmount(payAlipay) || 0)
    const up = r2(parseBahtAmount(payUnionPay) || 0)
    const lp = r2(parseBahtAmount(payLinePay) || 0)
    const sp = r2(parseBahtAmount(payShopeePay) || 0)
    const misc = r2(parseBahtAmount(payOther) || 0)
    if (tm > 0.005) out.trueMoney = tm
    if (wc > 0.005) out.weChat = wc
    if (ap > 0.005) out.alipay = ap
    if (up > 0.005) out.unionPay = up
    if (lp > 0.005) out.linePay = lp
    if (sp > 0.005) out.shopeePay = sp
    if (misc > 0.005) out.misc = misc
    if (
      !out.trueMoney &&
      !out.weChat &&
      !out.alipay &&
      !out.unionPay &&
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
    payUnionPay,
    payLinePay,
    payShopeePay,
    payOther,
  ])

  const buildPaymentSnapshot = useCallback((): CartPanelPaymentPayload => {
    const payDel = parseBahtAmount(payDeliveryApp) || 0
    const channelCtx = cartPanelDeliveryChannelContext({
      deliveryAppProp,
      deliveryOrderNoProp,
      paymentTableNameOverride,
      customerMemo,
      deliveryPaymentChannel,
    })
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? {
            paymentDeliveryApp: payDel,
            deliveryPaymentChannel: resolveDeliveryPaymentChannelForSave({
              ...channelCtx,
              paymentDeliveryApp: payDel,
            }),
          }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum
    const ob = buildPaymentOtherBreakdownSnapshot()
    const cashPay = parseBahtAmount(payCash) || 0
    const tenderedRaw =
      parseBahtAmount(cashTenderedRef.current) || parseBahtAmount(cashTendered)
    const nonCashPay =
      (parseBahtAmount(payCard) || 0) +
      (parseBahtAmount(payPromptPay) || 0) +
      (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
      (parseBahtAmount(payDeliveryApp) || 0)
    const cashOnlyPay = nonCashPay <= 0.005 && cashPay > 0.005
    const effectiveTendered = tenderedRaw > 0.005 ? tenderedRaw : cashOnlyPay ? cashPay : 0
    return {
      paymentCash: cashPay,
      paymentCard: parseBahtAmount(payCard) || 0,
      paymentQr: parseBahtAmount(payPromptPay) || 0,
      paymentQrType: payQrType,
      paymentOther: paymentOtherSum,
      ...(ob ? { paymentOtherBreakdown: ob } : {}),
      ...deliveryPayPart,
      ...(effectiveTendered > 0.005 ? { paymentCashTendered: effectiveTendered } : {}),
    }
  }, [
    payCash,
    payCard,
    payPromptPay,
    payQrType,
    payDeliveryApp,
    deliveryPaymentChannel,
    deliveryAppProp,
    deliveryOrderNoProp,
    paymentTableNameOverride,
    customerMemo,
    useAdminPaymentLines,
    adminConfiguredWalletSum,
    legacyWalletPaymentSum,
    buildPaymentOtherBreakdownSnapshot,
    cashTendered,
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
    (personIdx: number, maxAmount?: number) => {
      let snap = buildPaymentSnapshot()
      if (!paymentSnapshotHasAmount(snap)) return
      if (maxAmount != null && maxAmount > 0.005) {
        snap = capCartPanelPaymentSnapshot(snap, maxAmount)
      }
      const arr = [...splitPaymentsByPersonRef.current]
      while (arr.length <= personIdx) arr.push(undefined)
      arr[personIdx] = snap
      splitPaymentsByPersonRef.current = arr
      setSplitCaptureTick((t) => t + 1)
      if ((snap.paymentCash || 0) > 0.005) {
        onSplitCashPaymentStep?.(snap)
      }
    },
    [buildPaymentSnapshot, onSplitCashPaymentStep]
  )

  const buildOrderPaymentFromSplit = useCallback((): CartPanelPaymentPayload => {
    const captures: CartPanelPaymentPayload[] = []
    for (const snap of splitPaymentsByPersonRef.current) {
      if (snap && paymentSnapshotHasAmount(snap)) captures.push(snap)
    }
    return mergeSplitOrderPaymentForSubmit({
      captures,
      current: buildPaymentSnapshot(),
      orderTotal: total,
    })
  }, [buildPaymentSnapshot, total])

  /** 고객용 모니터·터미널 상위 리렌더가 결제 입력 포커스를 끊지 않도록 디바운스 */
  useEffect(() => {
    if (!showPaymentModal) {
      onCustomerDisplayPaymentDraftChange?.(null)
      return
    }
    const id = window.setTimeout(() => {
      onCustomerDisplayPaymentDraftChange?.(buildPaymentSnapshot())
    }, 250)
    return () => window.clearTimeout(id)
  }, [showPaymentModal, buildPaymentSnapshot, onCustomerDisplayPaymentDraftChange])
  /** 더치페이·일부 결제 단계가 실제로 진행 중일 때만 금액 누적(add) 입력 */
  const activeDutchSplitFlow = showSplit || splitPaidSteps > 0
  /** UI 표시용: 합계 불일치 시에도 잔액·진행 바 등 강조 (금액 입력은 activeDutchSplitFlow일 때만 add) */
  const splitFlowForInputs = activeDutchSplitFlow || (total > 0 && !paymentSumMatch)
  /** 더치 패널: 인원 고정. 그 외: 일부 결제 단계에 맞춰 인원수를 가정(최소 2) */
  const effectiveDutchCount = showSplit
    ? Math.max(1, Number(splitCount) || 1)
    : Math.max(splitPaidSteps + 1, 2)
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
  const menuSplitDueByPerson = useMemo(
    () =>
      computeMenuSplitDueByPerson({
        total,
        subtotal,
        baseByPerson: menuSplitBaseByPerson,
        round2,
      }),
    [menuSplitBaseByPerson, subtotal, total]
  )
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
  const menuSplitPendingQtyTotal = useMemo(() => {
    let sum = 0
    for (const item of cartItems) {
      sum += Math.max(0, Number(menuSplitPendingQty[item.id] || 0))
    }
    return round2(sum)
  }, [cartItems, menuSplitPendingQty])
  const menuSplitPendingAmount = useMemo(() => {
    let baseSum = 0
    for (const item of cartItems) {
      const qty = Math.max(0, Number(menuSplitPendingQty[item.id] || 0))
      baseSum += qty * (Number(item.price) || 0)
    }
    return computeMenuSplitDueFromBaseSum({ total, subtotal, baseSum, round2 })
  }, [cartItems, menuSplitPendingQty, subtotal, total])
  const menuSplitItemStatuses = useMemo(() => {
    return cartItems.map((item) => {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      const qtyTotal = Math.max(0, Number(item.quantity) || 0)
      const pendingQty = Math.max(0, Number(menuSplitPendingQty[item.id] || 0))
      const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
      const unassigned = Math.max(0, qtyTotal - assigned - pendingQty)
      const holders = row
        .map((q, idx) => ({ idx, qty: Math.max(0, Number(q || 0)) }))
        .filter((h) => h.qty > 0.009)
      const allHoldersPaid =
        holders.length > 0 &&
        holders.every(
          (h) =>
            Math.max(0, Number(menuSplitDueByPerson[h.idx] || 0)) > 0.009 &&
            Math.max(0, Number(menuSplitRemainingByPerson[h.idx] || 0)) <= 0.009
        )
      const fullyAssigned = unassigned <= 0.009 && pendingQty <= 0.009 && assigned > 0.009
      const settled = qtyTotal > 0.009 && fullyAssigned && allHoldersPaid
      const awaitingPay = fullyAssigned && !allHoldersPaid && assigned > 0.009
      const selecting = pendingQty > 0.009
      return {
        item,
        row,
        qtyTotal,
        pendingQty,
        assigned,
        unassigned,
        holders,
        settled,
        awaitingPay,
        selecting,
      }
    })
  }, [
    cartItems,
    menuSplitAssigned,
    menuSplitPendingQty,
    menuSplitDueByPerson,
    menuSplitRemainingByPerson,
  ])
  const menuSplitSettledItemCount = useMemo(
    () => menuSplitItemStatuses.filter((s) => s.settled).length,
    [menuSplitItemStatuses]
  )
  const dutchUnitAmount =
    total <= 0 ? 0 : Math.max(0, Math.round((total / Math.max(1, effectiveDutchCount)) * 100) / 100)
  const menuSplitTargetPersonIndex = Math.min(
    Math.max(0, Number(menuSplitTargetPerson) || 0),
    Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
  )
  const amountSplitTargetPersonIndex = Math.min(
    Math.max(0, Number(amountSplitTargetPerson) || 0),
    Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
  )
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
  const amountSplitRemainingByPerson = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    return Array.from({ length: count }, (_, i) =>
      round2(Math.max(0, Number(amountSplitDueByPerson[i] || 0) - Number(amountSplitPaidByPerson[i] || 0)))
    )
  }, [amountSplitDueByPerson, amountSplitPaidByPerson, splitCount])

  const amountSplitPersonStatuses = useMemo(() => {
    const count = Math.max(1, Number(splitCount) || 1)
    return Array.from({ length: count }, (_, idx) => {
      const due = Math.max(0, Number(amountSplitDueByPerson[idx] || 0))
      const remaining = Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
      const paid = Math.max(0, Number(amountSplitPaidByPerson[idx] || 0))
      const isPaid = due > 0.009 && remaining <= 0.009
      const isPayTarget = idx === amountSplitTargetPersonIndex
      return { idx, due, remaining, paid, isPaid, isPayTarget }
    })
  }, [
    splitCount,
    amountSplitDueByPerson,
    amountSplitRemainingByPerson,
    amountSplitPaidByPerson,
    amountSplitTargetPersonIndex,
  ])
  const amountSplitPaidPersonCount = useMemo(
    () => amountSplitPersonStatuses.filter((p) => p.isPaid).length,
    [amountSplitPersonStatuses]
  )
  /** 일부 결제 확정(캡처) 완료 인원 — splitPaidSteps와 별도로 실제 잔액 기준 */
  const splitSettledPersonCount = useMemo(() => {
    if (!showSplit) return 0
    const count = Math.max(1, Number(splitCount) || 1)
    if (splitMode === 'menu') {
      let settled = 0
      for (let i = 0; i < count; i += 1) {
        const due = Math.max(0, Number(menuSplitDueByPerson[i] || 0))
        const remaining = Math.max(0, Number(menuSplitRemainingByPerson[i] || 0))
        if (due > 0.009 && remaining <= 0.009) settled += 1
      }
      return settled
    }
    return amountSplitPaidPersonCount
  }, [
    showSplit,
    splitMode,
    splitCount,
    menuSplitDueByPerson,
    menuSplitRemainingByPerson,
    amountSplitPaidPersonCount,
  ])
  const currentSplitTargetAmount =
    showSplit && splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
      : showSplit && splitMode === 'amount'
        ? Math.max(0, Number(amountSplitRemainingByPerson[amountSplitTargetPersonIndex] || 0))
        : dutchUnitAmount
  /** 메뉴 선택 중(pending)에는 인원 배정 전 금액만 표시 — 전체 합계가 움직이지 않게 */
  const displayedSplitTargetAmount =
    showSplit && splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009
      ? menuSplitPendingAmount
      : currentSplitTargetAmount
  /** 결제 대상 손님 잔액 — 상단 진행 바에 강조 */
  const displayedSplitTargetRemaining = useMemo(() => {
    if (!showSplit) return Math.max(0, round2(total - paymentSum))
    if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return menuSplitPendingAmount
    const idx = splitMode === 'menu' ? menuSplitTargetPersonIndex : amountSplitTargetPersonIndex
    return splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
      : Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
  }, [
    showSplit,
    splitMode,
    menuSplitPendingQtyTotal,
    menuSplitPendingAmount,
    menuSplitTargetPersonIndex,
    amountSplitTargetPersonIndex,
    menuSplitRemainingByPerson,
    amountSplitRemainingByPerson,
    total,
    paymentSum,
    round2,
  ])
  const cashRequiredForTendered = activeDutchSplitFlow ? currentSplitTargetAmount : cashRequiredAmount
  const cashChangeAmountForTendered = Math.max(0, cashTenderedNum - cashRequiredForTendered)
  const cashShortAmountForTendered = Math.max(0, cashRequiredForTendered - cashTenderedNum)
  /** 더치·일부 결제 단계: 현금 확정 직후 거스름 안내(최종 결제 완료와 동일 UX) */
  const showPostCashChangeForSplitStepIfNeeded = useCallback(() => {
    const cashPay = parseBahtAmount(payCash) || 0
    if (cashPay <= 0.001) return
    const tenderedRaw = parseBahtAmount(cashTenderedRef.current) || parseBahtAmount(cashTendered)
    if (tenderedRaw <= 0.001) return
    const change = round2(Math.max(0, tenderedRaw - cashRequiredForTendered))
    if (change > 0.001) {
      setPostPaymentCashChange(change)
    }
  }, [payCash, cashTendered, cashRequiredForTendered, setPostPaymentCashChange, round2])

  /** 더치: 현재 손님 결제 입력을 영수증용 스냅샷에 반영(인원 탭 전환·일부 결제 공통) */
  const tryCommitCurrentSplitGuestPaymentCapture = useCallback((): boolean => {
    if (!showSplit || !showPaymentModal) return false
    const count = Math.max(1, Number(splitCount) || 1)
    const idx =
      splitMode === 'menu' ? menuSplitTargetPersonIndex : amountSplitTargetPersonIndex
    const remaining =
      splitMode === 'menu'
        ? Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
        : Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
    if (remaining <= SPLIT_AMOUNT_EPS) return false
    if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return false
    const snap = buildPaymentSnapshot()
    if (!paymentSnapshotHasAmount(snap)) return false
    const snapSum = round2(sumCartPanelPaymentSnapshot(snap))
    if (snapSum < remaining - SPLIT_AMOUNT_EPS) return false
    const paidThisStep = round2(Math.min(remaining, snapSum))
    captureSplitPaymentForPerson(idx, paidThisStep)
    showPostCashChangeForSplitStepIfNeeded()
    resetPaymentInputs()
    splitDraftAssignedRef.current = null
    if (splitMode === 'menu') {
      setMenuSplitPaidByPerson((prev) => {
        const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
        next[idx] = round2(Number(prev[idx] || 0) + paidThisStep)
        return next
      })
    } else {
      setAmountSplitPaidByPerson((prev) => {
        const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
        next[idx] = round2(Number(prev[idx] || 0) + paidThisStep)
        return next
      })
    }
    setSplitCaptureTick((t) => t + 1)
    return true
  }, [
    showSplit,
    showPaymentModal,
    splitCount,
    splitMode,
    menuSplitTargetPersonIndex,
    amountSplitTargetPersonIndex,
    menuSplitRemainingByPerson,
    amountSplitRemainingByPerson,
    menuSplitPendingQtyTotal,
    buildPaymentSnapshot,
    captureSplitPaymentForPerson,
    showPostCashChangeForSplitStepIfNeeded,
  ])

  /** 현재 인원 분이 결제 입력에 반영됐는지(수단 전환 후 remaining=0이어도 일부 결제 가능해야 함) */
  const splitCurrentPersonPaymentReady = useMemo(() => {
    if (!showSplit || total <= 0) return false
    if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return false
    const idx =
      splitMode === 'menu' ? menuSplitTargetPersonIndex : amountSplitTargetPersonIndex
    const due =
      splitMode === 'menu'
        ? Number(menuSplitDueByPerson[idx] || 0)
        : Number(amountSplitDueByPerson[idx] || 0)
    const personRemaining =
      splitMode === 'menu'
        ? Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
        : Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
    if (personRemaining <= SPLIT_AMOUNT_EPS) return false
    if (paymentSum <= SPLIT_AMOUNT_EPS) return false
    if (due <= SPLIT_AMOUNT_EPS) return false
    return paymentSum >= personRemaining - SPLIT_AMOUNT_EPS
  }, [
    showSplit,
    total,
    splitMode,
    menuSplitPendingQtyTotal,
    menuSplitTargetPersonIndex,
    amountSplitTargetPersonIndex,
    menuSplitDueByPerson,
    amountSplitDueByPerson,
    menuSplitRemainingByPerson,
    amountSplitRemainingByPerson,
    paymentSum,
  ])
  /** 인원별 미결제 잔액(>ε) 목록 — 금액·메뉴 공통 */
  const splitOpenRemainders = useMemo(() => {
    if (!showSplit) return [] as number[]
    const count = Math.max(1, Number(splitCount) || 1)
    const open: number[] = []
    for (let i = 0; i < count; i += 1) {
      const remaining =
        splitMode === 'menu'
          ? Math.max(0, Number(menuSplitRemainingByPerson[i] || 0))
          : Math.max(0, Number(amountSplitRemainingByPerson[i] || 0))
      if (remaining > SPLIT_AMOUNT_EPS) open.push(remaining)
    }
    return open
  }, [
    showSplit,
    splitMode,
    splitCount,
    menuSplitRemainingByPerson,
    amountSplitRemainingByPerson,
  ])
  /**
   * 더치페이 결제 완료 가능:
   * - 입력 합계(확정+현재란)가 주문 합계와 일치
   * - 전원 일부 결제 확정(잔액 0) 또는
   * - 마지막 1명만 미확정이고 현재란에 그 인원분 이상 입력됨(일부 결제 생략 허용)
   */
  const splitAllGuestsSettled = useMemo(() => {
    if (!showSplit) return false
    const count = Math.max(1, Number(splitCount) || 1)
    return splitSettledPersonCount >= count
  }, [showSplit, splitCount, splitSettledPersonCount])
  const splitReadyForComplete = useMemo(() => {
    if (!showSplit) return paymentSumMatch
    if (splitMode === 'menu' && menuSplitUnassignedQty > 0.009) return false
    const reconciled =
      paymentSumMatch ||
      (splitAllGuestsSettled && paymentTotalsReconcile(splitCapturedPaymentSum, total))
    if (!reconciled) return false
    if (splitOpenRemainders.length === 0) return true
    if (splitOpenRemainders.length === 1 && paymentSum >= splitOpenRemainders[0] - SPLIT_AMOUNT_EPS) {
      return true
    }
    return false
  }, [
    showSplit,
    paymentSumMatch,
    splitMode,
    menuSplitUnassignedQty,
    splitOpenRemainders,
    paymentSum,
    splitAllGuestsSettled,
    splitCapturedPaymentSum,
    total,
  ])
  /** 전원 확정·합계 일치 시에만 일부 결제 비활성(마지막 1명 입력만 된 경우는 일부 결제·결제 완료 둘 다 허용) */
  const partialPayDisabled = showSplit
    ? (splitOpenRemainders.length === 0 && paymentSumMatch) || !splitCurrentPersonPaymentReady
    : total <= 0 || paymentSumMatch
  const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30, 50]
  const paymentTabs: { id: PaymentMethodTab; label: string; icon: typeof Banknote }[] = [
    { id: 'cash', label: t('posPaymentCash') || '현금', icon: Banknote },
    { id: 'card', label: t('posPaymentCard') || '카드', icon: CreditCard },
    { id: 'qr', label: tr('posPaymentQrCode', 'QR Code'), icon: QrCode },
    { id: 'delivery_app', label: t('posPaymentDeliveryApp') || '배달앱', icon: Bike },
    { id: 'other', label: t('posPaymentOther') || '기타', icon: Wallet },
  ]
  const normalizedTaxFields = normalizeTaxInvoiceFields({
    taxName,
    taxId,
    taxBranchNo,
    taxPhone,
    taxEmail,
    taxAddress,
    invoiceCustomerType,
  })
  const taxBranchRequired = invoiceCustomerType === 'company'
  const { errors: taxInvoiceValidationErrors, invalid: taxInvoiceInvalid } = validateTaxInvoiceFields({
    needTaxInvoice,
    normalized: normalizedTaxFields,
    invoiceCustomerType,
  })
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
          {
            const cartIdx = cartItems.findIndex((c) => c.id === item.id)
            lines.push(mapCartItemToOrderPayload(item, qty, cartIdx >= 0 ? cartIdx : undefined))
          }
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
    const fullMenuLines = cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx))
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

  const handleTaxProfileSearch = async () => {
    const result = await searchCartPanelTaxInvoiceProfile({
      keyword: taxSearchKeyword,
      taxSearchField,
      taxMemberRegistry,
      authStore: auth?.store,
      authRole: auth?.role,
      currentStoreId,
    })
    if (!result.ok) {
      setTaxSearchMessage(t(result.messageKey))
      return
    }
    applyTaxProfile(result.registryKey, result.profile)
    setTaxMemberNo(result.memberNo)
    if (result.messageKey === 'posTaxSearchLoadedServer') {
      setTaxMemberRegistry((prev) => ({ ...prev, [result.registryKey]: result.profile }))
    }
    if (result.messageKey === 'posTaxSearchLoadedServer') {
      setTaxSearchMessage(t('posTaxSearchLoadedServer'))
    } else {
      setTaxSearchMessage(t('posTaxSearchLoaded').replace('{no}', result.displayNo || result.registryKey))
    }
  }

  useEffect(() => {
    cashTenderedRef.current = cashTendered
  }, [cashTendered])

  /** 현금 권종 버튼: 누적 합산(100+100=200). 터치 POS에서 입력 포커스 유지 */
  const addCashTenderedAmount = useCallback(
    (amount: number) => {
      const el = cashTenderedInputRef.current
      markPaymentAmountInputFocused(el)
      const next = formatBahtAmountForField((parseBahtAmount(cashTenderedRef.current) || 0) + amount)
      cashTenderedRef.current = next
      setCashTendered(next)
      if (el) restorePaymentAmountInputFocus(el)
    },
    [markPaymentAmountInputFocused, restorePaymentAmountInputFocus]
  )

  const resetPaymentInputs = () => {
    setPayCash('')
    cashTenderedRef.current = ''
    setCashTendered('')
    setPayCard('')
    setPayPromptPay('')
    setPayQrType('THAI_QR')
    setPayTrueMoney('0')
    setPayWeChat('0')
    setPayAlipay('0')
    setPayUnionPay('0')
    setPayLinePay('0')
    setPayShopeePay('0')
    setPayOther('0')
    setPayDeliveryApp('0')
    const lines = adminPaymentLinesRef.current
    setPayAdminLineAmounts(Object.fromEntries(lines.map((i) => [i.id, '0'])))
  }

  const selectMenuSplitTargetPerson = useCallback(
    (personIdx: number) => {
      if (!showSplit || splitMode !== 'menu') return
      const count = Math.max(1, Number(splitCount) || 1)
      const safeIdx = Math.min(Math.max(0, personIdx), count - 1)
      tryCommitCurrentSplitGuestPaymentCapture()
      const fillAmount = Math.max(0, Number(menuSplitRemainingByPerson[safeIdx] || 0))
      setMenuSplitTargetPerson(safeIdx)
      resetPaymentInputs()
      menuSplitAutoAppliedKeyRef.current = ''
      if (fillAmount > 0.009) {
        applyMenuSplitPersonPayment(fillAmount, safeIdx)
      } else {
        splitDraftAssignedRef.current = null
      }
      scrollToPaymentMethods()
    },
    [
      showSplit,
      splitMode,
      splitCount,
      menuSplitRemainingByPerson,
      activePaymentTab,
      scrollToPaymentMethods,
      tryCommitCurrentSplitGuestPaymentCapture,
    ]
  )

  const selectAmountSplitTargetPerson = useCallback(
    (personIdx: number) => {
      if (!showSplit || splitMode !== 'amount') return
      const count = Math.max(1, Number(splitCount) || 1)
      const safeIdx = Math.min(Math.max(0, personIdx), count - 1)
      tryCommitCurrentSplitGuestPaymentCapture()
      const fillAmount = Math.max(0, Number(amountSplitRemainingByPerson[safeIdx] || 0))
      setAmountSplitTargetPerson(safeIdx)
      resetPaymentInputs()
      splitDraftAssignedRef.current = null
      menuSplitAutoAppliedKeyRef.current = ''
      if (fillAmount > 0.009) {
        applyMenuSplitPersonPayment(fillAmount, safeIdx)
      }
      scrollToPaymentMethods()
    },
    [
      showSplit,
      splitMode,
      splitCount,
      amountSplitRemainingByPerson,
      activePaymentTab,
      scrollToPaymentMethods,
      tryCommitCurrentSplitGuestPaymentCapture,
    ]
  )

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

  const moveAllAmountTo = (target: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other' | 'truemoney' | 'wechat' | 'alipay' | 'unionpay' | 'linepay' | 'shopeepay') => {
    const amount = Math.max(0, round2(total))
    resetPaymentInputs()
    const lines = adminPaymentLinesRef.current
    const walletToAdmin =
      lines.length > 0 &&
      (target === 'other' ||
        target === 'truemoney' ||
        target === 'wechat' ||
        target === 'alipay' ||
        target === 'unionpay' ||
        target === 'linepay' ||
        target === 'shopeepay')
    if (walletToAdmin) {
      const firstOther = lines.find((li) => li.category === 'other')
      const targetLine = target === 'other' && firstOther ? firstOther : lines[0]
      setPayAdminLineAmounts(
        Object.fromEntries(lines.map((li) => [li.id, li.id === targetLine?.id ? formatBahtAmountForField(amount) : '0']))
      )
      return
    }
    if (target === 'cash') setPayCash(formatBahtAmountForField(amount))
    if (target === 'card') setPayCard(formatBahtAmountForField(amount))
    if (target === 'qr') setPayPromptPay(formatBahtAmountForField(amount))
    if (target === 'delivery_app') {
      setPayDeliveryApp(formatBahtAmountForField(amount))
      setDeliveryPaymentChannel(
        resolveDefaultDeliveryPaymentChannel(
          cartPanelDeliveryChannelContext({
            deliveryAppProp,
            deliveryOrderNoProp,
            paymentTableNameOverride,
            customerMemo,
          })
        )
      )
    }
    if (target === 'other') setPayOther(formatBahtAmountForField(amount))
    if (target === 'truemoney') setPayTrueMoney(formatBahtAmountForField(amount))
    if (target === 'wechat') setPayWeChat(formatBahtAmountForField(amount))
    if (target === 'alipay') setPayAlipay(formatBahtAmountForField(amount))
    if (target === 'unionpay') setPayUnionPay(formatBahtAmountForField(amount))
    if (target === 'linepay') setPayLinePay(formatBahtAmountForField(amount))
    if (target === 'shopeepay') setPayShopeePay(formatBahtAmountForField(amount))
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
    | 'unionpay'
    | 'linepay'
    | 'shopeepay'

  const isWalletMoveTarget = (target: MoveTarget) =>
    target === 'other' ||
    target === 'truemoney' ||
    target === 'wechat' ||
    target === 'alipay' ||
    target === 'unionpay' ||
    target === 'linepay' ||
    target === 'shopeepay'

  const splitDraftBadgeText = (() => {
    const draft = splitDraftAssignedRef.current
    if (!draft || draft.amount <= 0.0001) return ''
    return `${tr('posDutchDraftAssigned', '임시 배정')} ${formatBahtWhole(draft.amount)}`
  })()

  const renderSplitGuestAmountRows = (
    primaryAmount: number,
    paidAmount: number,
    primaryLabelKey: 'posSplitCardAssign' | 'posSplitCardShare',
    primaryFallback: string,
    paidComplete?: boolean
  ) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1.5 gap-y-0.5 leading-tight">
      <span className="truncate text-[11px] text-muted-foreground">
        {tr(primaryLabelKey, primaryFallback)}
      </span>
      <span className="text-right text-sm font-bold tabular-nums">{formatBahtWhole(primaryAmount)}</span>
      <span className="truncate text-[11px] text-muted-foreground">{tr('posSplitCardPaid', '결제')}</span>
      <span
        className={cn(
          'text-right text-sm font-bold tabular-nums',
          paidComplete && 'text-emerald-700 dark:text-emerald-300'
        )}
      >
        {formatBahtWhole(paidAmount)}
      </span>
    </div>
  )

  const applyDeltaToTarget = (target: MoveTarget, delta: number) => {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return
    const lines = adminPaymentLinesRef.current
    const walletTarget = isWalletMoveTarget(target)
    if (lines.length > 0 && walletTarget) {
      setShowOtherPayments(true)
      const firstOther = lines.find((li) => li.category === 'other')
      const focusId =
        target === 'other' && firstOther
          ? firstOther.id
          : lines.find((li) => li.category === 'qr')?.id ?? lines[0].id
      setPayAdminLineAmounts((prev) => {
        const next: Record<string, string> = {}
        for (const li of lines) next[li.id] = String(Math.max(0, parseFloat(prev[li.id] || '0') || 0))
        next[focusId] = String(Math.max(0, (parseFloat(next[focusId]) || 0) + delta))
        return next
      })
      return
    }
    if (target === 'cash') setPayCash((p) => formatBahtAmountForField(Math.max(0, parseBahtAmount(p) + delta)))
    if (target === 'card') setPayCard((p) => formatBahtAmountForField(Math.max(0, parseBahtAmount(p) + delta)))
    if (target === 'qr') setPayPromptPay((p) => formatBahtAmountForField(Math.max(0, parseBahtAmount(p) + delta)))
    if (target === 'delivery_app') setPayDeliveryApp((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    if (target === 'other') {
      setShowOtherPayments(true)
      setPayOther((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta)))
    }
    if (target === 'truemoney') { setShowOtherPayments(true); setPayTrueMoney((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'wechat') { setShowOtherPayments(true); setPayWeChat((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'alipay') { setShowOtherPayments(true); setPayAlipay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'unionpay') { setShowOtherPayments(true); setPayUnionPay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'linepay') { setShowOtherPayments(true); setPayLinePay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
    if (target === 'shopeepay') { setShowOtherPayments(true); setPayShopeePay((p) => String(Math.max(0, (parseFloat(p || '0') || 0) + delta))) }
  }

  const activePaymentTabToMoveTarget = (tab: PaymentMethodTab): MoveTarget =>
    tab === 'delivery_app' ? 'delivery_app' : tab === 'other' ? 'other' : tab

  /** 더치페이: 손님 확정 후 현재 결제 탭에 해당 인원분만 입력(메뉴·금액 공통) */
  const applyMenuSplitPersonPayment = (amount: number, personIdx: number) => {
    const amt = round2(Math.max(0, amount))
    if (amt <= 0.009 || !showSplit) return
    if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return
    const target = activePaymentTabToMoveTarget(activePaymentTab)
    applyDeltaToTarget(target, amt)
    splitDraftAssignedRef.current = {
      target,
      amount: amt,
      personIdx,
    }
  }

  /** 탭/라벨 클릭 시: 1인 금액만 해당 수단에 반영 (replace 모드면 기존 임시 배정분을 이동) */
  const addDutchAmountOnly = (target: MoveTarget, opts?: { replaceCurrentDraft?: boolean }) => {
    if (showSplit && splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return
    const replaceCurrentDraft = opts?.replaceCurrentDraft === true
    const count = effectiveDutchCount
    const prevDraft = replaceCurrentDraft ? splitDraftAssignedRef.current : null
    let perPerson = showSplit && splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
      : showSplit && splitMode === 'amount'
        ? Math.max(0, Number(amountSplitRemainingByPerson[amountSplitTargetPersonIndex] || 0))
        : currentSplitTargetAmount
    if (replaceCurrentDraft) {
      if (prevDraft && prevDraft.amount > 0) {
        applyDeltaToTarget(prevDraft.target, -prevDraft.amount)
        if (showSplit && splitMode === 'menu') {
          perPerson = Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
        }
        if (showSplit && splitMode === 'amount' && prevDraft.personIdx != null) {
          perPerson = Math.max(0, Number(amountSplitRemainingByPerson[amountSplitTargetPersonIndex] || 0))
        }
      }
    }
    const adminLineSum = adminPaymentLines.reduce(
      (s, i) => s + (parseBahtAmount(payAdminLineAmounts[i.id] || '0') || 0),
      0
    )
    const legacyWalletSum =
      (parseBahtAmount(payTrueMoney) || 0) +
      (parseBahtAmount(payWeChat) || 0) +
      (parseBahtAmount(payAlipay) || 0) +
      (parseBahtAmount(payUnionPay) || 0) +
      (parseBahtAmount(payLinePay) || 0) +
      (parseBahtAmount(payShopeePay) || 0) +
      (parseBahtAmount(payOther) || 0)
    const paymentFieldSum =
      (parseBahtAmount(payCash) || 0) +
      (parseBahtAmount(payCard) || 0) +
      (parseBahtAmount(payPromptPay) || 0) +
      (useAdminPaymentLines ? adminLineSum : legacyWalletSum) +
      (parseBahtAmount(payDeliveryApp) || 0)
    const draftRemoved =
      replaceCurrentDraft && prevDraft && prevDraft.amount > 0 ? prevDraft.amount : 0
    const remain = Math.max(0, total - Math.max(0, paymentFieldSum - draftRemoved))
    const addAmount =
      showSplit && (splitMode === 'menu' || splitMode === 'amount')
        ? Math.min(perPerson, remain)
        : splitPaidSteps >= count - 1
          ? remain
          : Math.min(perPerson, remain)
    if (addAmount <= 0) {
      if (replaceCurrentDraft && prevDraft && prevDraft.amount > 0) {
        applyDeltaToTarget(prevDraft.target, prevDraft.amount)
        splitDraftAssignedRef.current = prevDraft
      }
      return
    }
    applyDeltaToTarget(target, addAmount)
    if (replaceCurrentDraft) {
      splitDraftAssignedRef.current = {
        target,
        amount: addAmount,
        personIdx:
          showSplit && splitMode === 'menu'
            ? menuSplitTargetPersonIndex
            : showSplit && splitMode === 'amount'
              ? amountSplitTargetPersonIndex
              : null,
      }
    }
  }

  const applyFullAmountToSingleAdminLine = (lineId: string) => {
    const amount = Math.max(0, round2(total))
    resetPaymentInputs()
    const lines = adminPaymentLinesRef.current
    setPayAdminLineAmounts(Object.fromEntries(lines.map((li) => [li.id, li.id === lineId ? formatBahtAmountForField(amount) : '0'])))
  }

  const addDutchAmountToAdminLine = (lineId: string) => {
    const count = effectiveDutchCount
    const perPerson =
      showSplit && splitMode === 'menu'
        ? Math.max(0, Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0))
        : showSplit && splitMode === 'amount'
          ? Math.max(0, Number(amountSplitRemainingByPerson[amountSplitTargetPersonIndex] || 0))
          : currentSplitTargetAmount
    const adminLineSum = adminPaymentLines.reduce(
      (s, i) => s + (parseBahtAmount(payAdminLineAmounts[i.id] || '0') || 0),
      0
    )
    const legacyWalletSum =
      (parseBahtAmount(payTrueMoney) || 0) +
      (parseBahtAmount(payWeChat) || 0) +
      (parseBahtAmount(payAlipay) || 0) +
      (parseBahtAmount(payUnionPay) || 0) +
      (parseBahtAmount(payLinePay) || 0) +
      (parseBahtAmount(payShopeePay) || 0) +
      (parseBahtAmount(payOther) || 0)
    const currentSum =
      (parseBahtAmount(payCash) || 0) +
      (parseBahtAmount(payCard) || 0) +
      (parseBahtAmount(payPromptPay) || 0) +
      (useAdminPaymentLines ? adminLineSum : legacyWalletSum) +
      (parseBahtAmount(payDeliveryApp) || 0)
    const remain = Math.max(0, total - currentSum)
    const addAmount =
      showSplit && (splitMode === 'menu' || splitMode === 'amount')
        ? Math.min(perPerson, remain)
        : splitPaidSteps >= count - 1
          ? remain
          : Math.min(perPerson, remain)
    if (addAmount <= 0) return
    setShowOtherPayments(true)
    setPayAdminLineAmounts((prev) => {
      const lines = adminPaymentLinesRef.current
      const next: Record<string, string> = {}
      for (const li of lines) next[li.id] = String(parseFloat(prev[li.id] || '0') || 0)
      next[lineId] = String((parseFloat(next[lineId]) || 0) + addAmount)
      return next
    })
  }

  const adjustMenuSplitPendingQty = (itemId: string, delta: number) => {
    if (!showSplit || splitMode !== 'menu' || !Number.isFinite(delta) || delta === 0) return
    const targetItem = cartItems.find((it) => it.id === itemId)
    if (!targetItem) return
    const qtyTotal = Math.max(0, Number(targetItem.quantity) || 0)
    setMenuSplitPendingQty((prevPending) => {
      const row = Array.isArray(menuSplitAssigned[itemId]) ? menuSplitAssigned[itemId] : []
      const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
      const currentPending = Math.max(0, Number(prevPending[itemId] || 0))
      const pickable = Math.max(0, qtyTotal - assigned - currentPending)
      if (delta > 0) {
        if (pickable <= 0) return prevPending
        const nextPending = round2(currentPending + Math.min(pickable, delta))
        return { ...prevPending, [itemId]: nextPending }
      }
      const nextPending = round2(Math.max(0, currentPending + delta))
      if (nextPending <= 0.009) {
        const { [itemId]: _removed, ...rest } = prevPending
        return rest
      }
      return { ...prevPending, [itemId]: nextPending }
    })
    splitDraftAssignedRef.current = null
    menuSplitAutoAppliedKeyRef.current = ''
  }

  const commitMenuPendingToPerson = useCallback(
    (personIdx: number) => {
      if (!showSplit || splitMode !== 'menu') return
      const count = Math.max(1, Number(splitCount) || 1)
      const safeIdx = Math.min(Math.max(0, personIdx), count - 1)
      const pendingSnapshot = { ...menuSplitPendingQty }
      const pendingFillAmount = menuSplitPendingAmount
      let committed = false
      setMenuSplitAssigned((prev) => {
        const next: Record<string, number[]> = { ...prev }
        for (const item of cartItems) {
          const addQty = Math.max(0, Number(pendingSnapshot[item.id] || 0))
          if (addQty <= 0) continue
          const qtyTotal = Math.max(0, Number(item.quantity) || 0)
          const row = Array.from({ length: count }, (_, i) =>
            Math.max(0, Number((prev[item.id] || [])[i] || 0))
          )
          const others = row.reduce((s, v, i) => (i === safeIdx ? s : s + Math.max(0, Number(v || 0))), 0)
          const canAdd = Math.min(addQty, Math.max(0, qtyTotal - others - row[safeIdx]))
          if (canAdd <= 0) continue
          committed = true
          row[safeIdx] = round2(row[safeIdx] + canAdd)
          next[item.id] = row
        }
        return next
      })
      if (committed) setMenuSplitPendingQty({})
      setMenuSplitTargetPerson(safeIdx)
      resetPaymentInputs()
      menuSplitAutoAppliedKeyRef.current = ''
      const fillAmount = committed
        ? pendingFillAmount
        : Math.max(0, Number(menuSplitRemainingByPerson[safeIdx] || 0))
      if (fillAmount > 0.009) {
        applyMenuSplitPersonPayment(fillAmount, safeIdx)
      } else {
        splitDraftAssignedRef.current = null
      }
      scrollToPaymentMethods()
    },
    [
      showSplit,
      splitMode,
      splitCount,
      cartItems,
      menuSplitPendingQty,
      menuSplitPendingAmount,
      menuSplitRemainingByPerson,
      activePaymentTab,
      scrollToPaymentMethods,
    ]
  )

  useEffect(() => {
    setMenuSplitTargetPerson((prev) => {
      const maxIdx = Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
      return Math.min(Math.max(0, prev), maxIdx)
    })
    setAmountSplitTargetPerson((prev) => {
      const maxIdx = Math.max(0, Math.max(1, Number(splitCount) || 1) - 1)
      return Math.min(Math.max(0, prev), maxIdx)
    })
  }, [splitCount])

  /** 금액 더치: 결제 대상 인원 잔액이 0이면 다음 미결제 인원으로 자동 전환 */
  useEffect(() => {
    if (!showPaymentModal || !showSplit || splitMode !== 'amount') return
    const currentRemaining = Math.max(
      0,
      Number(amountSplitRemainingByPerson[amountSplitTargetPersonIndex] || 0)
    )
    if (currentRemaining > 0.009) return
    const nextIdx = amountSplitRemainingByPerson.findIndex((r) => Math.max(0, Number(r || 0)) > 0.009)
    if (nextIdx >= 0 && nextIdx !== amountSplitTargetPersonIndex) {
      setAmountSplitTargetPerson(nextIdx)
    }
  }, [
    showPaymentModal,
    showSplit,
    splitMode,
    amountSplitRemainingByPerson,
    amountSplitTargetPersonIndex,
  ])

  /** 메뉴 더치: 결제 대상 인원 잔액이 0이면 다음 미결제 인원으로 자동 전환 */
  useEffect(() => {
    if (!showPaymentModal || !showSplit || splitMode !== 'menu') return
    if (menuSplitPendingQtyTotal > 0.009) return
    const currentRemaining = Math.max(
      0,
      Number(menuSplitRemainingByPerson[menuSplitTargetPersonIndex] || 0)
    )
    if (currentRemaining > 0.009) return
    const nextIdx = menuSplitRemainingByPerson.findIndex((r) => Math.max(0, Number(r || 0)) > 0.009)
    if (nextIdx >= 0 && nextIdx !== menuSplitTargetPersonIndex) {
      setMenuSplitTargetPerson(nextIdx)
    }
  }, [
    showPaymentModal,
    showSplit,
    splitMode,
    menuSplitPendingQtyTotal,
    menuSplitRemainingByPerson,
    menuSplitTargetPersonIndex,
  ])

  /** 더치페이 「일부 결제」: 진행만 누적 (금액은 탭 클릭으로 이미 입력됨). 패널 없이도 일부 결제만으로 단계 증가 가능 */
  const confirmSplitStep = () => {
    if (showSplit) {
      const count = Math.max(1, Number(splitCount) || 1)
      if (splitPaidSteps >= count) return
      if (splitMode === 'menu') {
        if (menuSplitPendingQtyTotal > 0.009) return
        const idx = menuSplitTargetPersonIndex
        const remaining = Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
        const due = Math.max(0, Number(menuSplitDueByPerson[idx] || 0))
        if (due <= 0.009 || paymentSum < remaining - 0.009) return
        const paidThisStep = round2(Math.min(remaining, paymentSum))
        captureSplitPaymentForPerson(idx, paidThisStep)
        showPostCashChangeForSplitStepIfNeeded()
        let nextFillIdx = -1
        let nextFillAmount = 0
        setMenuSplitPaidByPerson((prev) => {
          const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
          next[idx] = round2(Number(prev[idx] || 0) + paidThisStep)
          nextFillIdx = next.findIndex(
            (_, i) =>
              round2(Math.max(0, Number(menuSplitDueByPerson[i] || 0) - Number(next[i] || 0))) > 0.009
          )
          if (nextFillIdx >= 0) {
            nextFillAmount = round2(
              Math.max(0, Number(menuSplitDueByPerson[nextFillIdx] || 0) - Number(next[nextFillIdx] || 0))
            )
            setMenuSplitTargetPerson(nextFillIdx)
          }
          return next
        })
        resetPaymentInputs()
        setSplitPaidSteps((prev) => Math.min(count, prev + 1))
        setMenuSplitPendingQty({})
        menuSplitAutoAppliedKeyRef.current = ''
        if (nextFillIdx >= 0 && nextFillAmount > 0.009) {
          applyMenuSplitPersonPayment(nextFillAmount, nextFillIdx)
        } else {
          splitDraftAssignedRef.current = null
        }
        scrollToPaymentMethods()
        return
      }
      const completedIdx = amountSplitTargetPersonIndex
      const remaining = Math.max(0, Number(amountSplitRemainingByPerson[completedIdx] || 0))
      const due = Math.max(0, Number(amountSplitDueByPerson[completedIdx] || 0))
      if (due <= 0.009) return
      if (remaining <= 0.009) {
        const pendingIdx = amountSplitRemainingByPerson.findIndex(
          (r) => Math.max(0, Number(r || 0)) > 0.009
        )
        if (pendingIdx >= 0) {
          setAmountSplitTargetPerson(pendingIdx)
          const nextFill = Math.max(0, Number(amountSplitRemainingByPerson[pendingIdx] || 0))
          if (nextFill > 0.009) applyMenuSplitPersonPayment(nextFill, pendingIdx)
        }
        return
      }
      if (paymentSum < remaining - 0.009) return
      const paidThisStep = round2(Math.min(remaining, paymentSum))
      captureSplitPaymentForPerson(completedIdx, paidThisStep)
      showPostCashChangeForSplitStepIfNeeded()
      let nextFillIdx = -1
      let nextFillAmount = 0
      setAmountSplitPaidByPerson((prev) => {
        const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
        next[completedIdx] = round2(Number(prev[completedIdx] || 0) + paidThisStep)
        nextFillIdx = next.findIndex(
          (_, i) =>
            round2(Math.max(0, Number(amountSplitDueByPerson[i] || 0) - Number(next[i] || 0))) > 0.009
        )
        if (nextFillIdx >= 0) {
          nextFillAmount = round2(
            Math.max(0, Number(amountSplitDueByPerson[nextFillIdx] || 0) - Number(next[nextFillIdx] || 0))
          )
          setAmountSplitTargetPerson(nextFillIdx)
        }
        return next
      })
      resetPaymentInputs()
      setSplitPaidSteps((prev) => Math.min(count, prev + 1))
      splitDraftAssignedRef.current = null
      menuSplitAutoAppliedKeyRef.current = ''
      if (nextFillIdx >= 0 && nextFillAmount > 0.009) {
        applyMenuSplitPersonPayment(nextFillAmount, nextFillIdx)
      }
      scrollToPaymentMethods()
      return
    } else {
      const snap = buildPaymentSnapshot()
      if ((snap.paymentCash || 0) > 0.005) {
        onSplitCashPaymentStep?.(snap)
        showPostCashChangeForSplitStepIfNeeded()
      }
      splitDraftAssignedRef.current = null
      setSplitPaidSteps((prev) => prev + 1)
    }
  }

  const finalizeSplitPaymentForPerson = (personIdx: number) => {
    const count = Math.max(1, Number(splitCount) || 1)
    const safeIdx = Math.min(Math.max(0, personIdx), count - 1)
    const existing = splitPaymentsByPersonRef.current[safeIdx]
    if (existing && paymentSnapshotHasAmount(existing)) return false
    const snap = buildPaymentSnapshot()
    if (!paymentSnapshotHasAmount(snap)) return false
    const remaining =
      splitMode === 'menu'
        ? Math.max(0, Number(menuSplitRemainingByPerson[safeIdx] || 0))
        : Math.max(0, Number(amountSplitRemainingByPerson[safeIdx] || 0))
    if (remaining <= SPLIT_AMOUNT_EPS) return false
    const snapSum = round2(sumCartPanelPaymentSnapshot(snap))
    if (snapSum <= SPLIT_AMOUNT_EPS) return false
    const paidThisStep = round2(Math.min(remaining, snapSum))
    captureSplitPaymentForPerson(safeIdx, paidThisStep)
    if (splitMode === 'menu') {
      setMenuSplitPaidByPerson((prev) => {
        const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
        next[safeIdx] = round2(Number(prev[safeIdx] || 0) + paidThisStep)
        return next
      })
    } else {
      setAmountSplitPaidByPerson((prev) => {
        const next = Array.from({ length: count }, (_, i) => Math.max(0, Number(prev[i] || 0)))
        next[safeIdx] = round2(Number(prev[safeIdx] || 0) + paidThisStep)
        return next
      })
    }
    setSplitCaptureTick((t) => t + 1)
    return true
  }

  const finalizeSplitPaymentsForReceipt = () => {
    if (!showSplit) return
    const count = Math.max(1, Number(splitCount) || 1)
    const targetIdx =
      splitMode === 'menu'
        ? Math.min(menuSplitTargetPersonIndex, count - 1)
        : Math.min(amountSplitTargetPersonIndex, count - 1)
    finalizeSplitPaymentForPerson(targetIdx)
    const pendingIdx =
      splitMode === 'menu'
        ? menuSplitRemainingByPerson.findIndex((r) => Math.max(0, Number(r || 0)) > SPLIT_AMOUNT_EPS)
        : amountSplitRemainingByPerson.findIndex((r) => Math.max(0, Number(r || 0)) > SPLIT_AMOUNT_EPS)
    if (pendingIdx >= 0 && pendingIdx !== targetIdx) {
      finalizeSplitPaymentForPerson(pendingIdx)
    }
  }

  useEffect(() => {
    if (!showPaymentModal) return
    setSplitPaidSteps(0)
    splitPaymentsByPersonRef.current = []
    setAmountSplitPaidByPerson([])
    setMenuSplitPaidByPerson([])
    setMenuSplitPendingQty({})
    setSplitCaptureTick((t) => t + 1)
  }, [showPaymentModal, splitCount, total])

  /** 모달을 닫을 때 더치페이·일부 결제 진행 초기화 (다음 결제 시 전액 자동 입력과 충돌 방지) */
  useEffect(() => {
    if (!showPaymentModal) {
      resetPaymentInputs()
      setShowSplit(false)
      setSplitPaidSteps(0)
      setSplitMode('amount')
      setMenuSplitAssigned({})
      setMenuSplitPendingQty({})
      setMenuSplitPaidByPerson([])
      setAmountSplitPaidByPerson([])
      setAmountSplitTargetPerson(0)
      splitPaymentsByPersonRef.current = []
      splitDraftAssignedRef.current = null
      menuSplitAutoAppliedKeyRef.current = ''
      couponScanAutoSubmitRef.current = null
      memberFieldCouponAutoRef.current = null
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
    setMenuSplitPendingQty({})
    setAmountSplitPaidByPerson([])
    setAmountSplitTargetPerson(0)
    splitPaymentsByPersonRef.current = []
    splitDraftAssignedRef.current = null
    menuSplitAutoAppliedKeyRef.current = ''
  }, [showPaymentModal, showSplit, splitCount])

  /** 더치페이 모드 전환·메뉴 기준 동기화 */
  useEffect(() => {
    if (!showPaymentModal || !showSplit) {
      splitModePrevRef.current = splitMode
      return
    }
    const prevMode = splitModePrevRef.current
    splitModePrevRef.current = splitMode
    if (prevMode !== 'amount' && splitMode === 'amount') {
      setAmountSplitPaidByPerson([])
      setAmountSplitTargetPerson(0)
      setSplitPaidSteps(0)
      resetPaymentInputs()
      splitPaymentsByPersonRef.current = []
      splitDraftAssignedRef.current = null
    }
    if (splitMode !== 'menu') return
    const enteredMenu = prevMode !== 'menu'
    if (enteredMenu) {
      setMenuSplitAssigned({})
      setMenuSplitPendingQty({})
      setMenuSplitPaidByPerson([])
      setMenuSplitTargetPerson(0)
      setSplitPaidSteps(0)
      resetPaymentInputs()
      splitPaymentsByPersonRef.current = []
      splitDraftAssignedRef.current = null
      menuSplitAutoAppliedKeyRef.current = ''
      return
    }
    const count = Math.max(1, Number(splitCount) || 1)
    setMenuSplitAssigned((prev) => {
      const next: Record<string, number[]> = {}
      for (const item of cartItems) {
        const oldRow = Array.isArray(prev[item.id]) ? prev[item.id] : []
        const row = Array.from({ length: count }, (_, i) => Math.max(0, Number(oldRow[i] || 0)))
        const qtyTotal = Math.max(0, Number(item.quantity) || 0)
        const sum = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
        if (sum > qtyTotal + 0.009) {
          let excess = round2(sum - qtyTotal)
          for (let i = count - 1; i >= 0 && excess > 0.009; i -= 1) {
            const take = Math.min(row[i], excess)
            row[i] = round2(Math.max(0, row[i] - take))
            excess = round2(excess - take)
          }
        }
        next[item.id] = row
      }
      return next
    })
  }, [showPaymentModal, showSplit, splitMode, splitCount, cartItems])

  useEffect(() => {
    if (activePaymentTab !== 'other') {
      setShowOtherPayments(false)
    }
  }, [activePaymentTab])

  // 협업·수동 할인 등으로 합계가 바뀌면 일반 결제(더치 아님)는 입력 금액을 새 합계로 덮어씀
  useEffect(() => {
    if (!showPaymentModal || total <= 0 || showSplit || splitPaidSteps > 0) return
    if (isActivelyEditingPaymentAmount()) return
    const newTotal = round2(total)
    resetPaymentInputs()
    if (activePaymentTab === 'cash') {
      setPayCash(formatBahtAmountForField(newTotal))
      return
    }
    if (activePaymentTab === 'card') {
      setPayCard(formatBahtAmountForField(newTotal))
      return
    }
    if (activePaymentTab === 'qr') {
      setPayPromptPay(formatBahtAmountForField(newTotal))
      return
    }
    if (activePaymentTab === 'delivery_app') {
      setPayDeliveryApp(formatBahtAmountForField(newTotal))
      return
    }
    if (useAdminPaymentLines) {
      const firstLineId = adminPaymentLinesRef.current[0]?.id
      if (firstLineId) {
        setPayAdminLineAmounts({
          ...Object.fromEntries(adminPaymentLinesRef.current.map((line) => [line.id, '0'])),
          [firstLineId]: formatBahtAmountForField(newTotal),
        })
        return
      }
    }
    setPayOther(formatBahtAmountForField(newTotal))
  }, [
    showPaymentModal,
    total,
    discount,
    discountType,
    pointUsedNum,
    collabDiscountAmt,
    appliedCollabId,
    showSplit,
    splitPaidSteps,
    pricingAdjustments,
    activePaymentTab,
    useAdminPaymentLines,
    discountPaymentSyncTick,
    isActivelyEditingPaymentAmount,
  ])

  /** 더치 패널 없이 할인만 바뀐 경우: 일부 결제 단계·누적 입력 초기화 (협업 할인 후 금액 이중 합산 방지) */
  useEffect(() => {
    if (!showPaymentModal || showSplit) return
    if (splitPaidSteps <= 0) return
    setSplitPaidSteps(0)
    splitPaymentsByPersonRef.current = []
    splitDraftAssignedRef.current = null
    setSplitCaptureTick((t) => t + 1)
  }, [
    showPaymentModal,
    showSplit,
    discount,
    collabDiscountAmt,
    appliedCollabId,
    pointUsedNum,
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
    return buildCartPanelOrderMemoWithTaxInvoice({
      baseMemo,
      includeTaxInvoice: includeTax,
      taxMemberNo,
      invoiceCustomerType,
      normalized: normalizedTaxFields,
      isMemberOrder,
    })
  }

  const openPaymentModalWithAmount = async (
    amount: number,
    /** 기존 주문에서 결제 모달을 열 때 setCartItems 직후라 cartItems가 아직 비어 있음 → 스냅샷을 넘겨야 함 */
    receiptOpts?: {
      receiptLines?: Array<
        Pick<CartItem, 'id' | 'name' | 'price' | 'quantity' | 'note' | 'menuId' | 'promoId' | 'menuId1' | 'menuId2'>
      >
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
      const dineInTableName = resolveDineInTableNameForStorage(
        selectedTable,
        receiptOpts?.receiptTableName || paymentTableNameOverride || '',
        dineInMultiFloorLayout
      )
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
      const discountTotal =
        receiptOpts?.receiptDiscountTotal !== undefined
          ? receiptOpts.receiptDiscountTotal
          : discount + pointUsedNum
      const receiptLinesMatchCart =
        linesForReceipt.length === cartItems.length &&
        linesForReceipt.every((l, i) => String(l.id ?? '') === String(cartItems[i]?.id ?? ''))
      const lineDiscountAlloc =
        discountTotal > 0.0001
          ? receiptLinesMatchCart && Math.abs(discountTotal - discount) < 0.02
            ? lineDiscountSnapshot
            : (() => {
                const receiptCouponLines = linesForReceipt.map((i) => {
                  const menuId = String(i.menuId ?? '').trim() || undefined
                  const menu = menuId ? menuByIdForCollab.get(menuId) : undefined
                  const qty = Math.max(1, Number(i.quantity ?? 1) || 1)
                  return {
                    menuId,
                    menuCode: String(menu?.code ?? '').trim() || undefined,
                    categoryCode:
                      String(menu?.category ?? menu?.categoryMain ?? '').trim() || undefined,
                    quantity: qty,
                    lineSubtotal: Math.max(0, Number(i.price ?? 0) * qty),
                  }
                })
                const receiptCouponAlloc = buildCouponDiscountLineAllocations(
                  receiptCouponLines,
                  appliedCoupons
                )
                const receiptCouponSum = receiptCouponAlloc.reduce((sum, v) => sum + v, 0)
                const otherAmt = Math.max(
                  0,
                  discountTotal -
                    (appliedCollab ? collabDiscountAmt : 0) -
                    serviceDiscountAmt -
                    cancelledLineAmt
                )
                const manualPart = Math.max(0, otherAmt - tierDiscountAmt - receiptCouponSum)
                return buildCartPanelLineDiscountAllocations({
                  lines: linesForReceipt.map((i) => ({
                    id: String(i.id ?? ''),
                    name: String(i.name ?? ''),
                    price: Number(i.price ?? 0),
                    qty: Math.max(1, Number(i.quantity ?? 1) || 1),
                    ...(i.promoId ? { promoId: String(i.promoId) } : {}),
                    ...(i.menuId ? { menuId: String(i.menuId) } : {}),
                    ...(i.menuId1 != null
                      ? {
                          menuId1: i.menuId1,
                          menuId2: i.menuId2,
                        }
                      : {}),
                  })),
                  menuById: menuByIdForCollab,
                  lineModeById: lineDiscountModeByItemId,
                  hasSelectedDiscountScope,
                  collabDetail: appliedCollab?.collabDetail ?? null,
                  collabDiscountAmt: appliedCollab ? collabDiscountAmt : 0,
                  serviceDiscountAmt,
                  cancelledLineAmt,
                  tierDiscountAmt,
                  manualDiscountAmt: manualPart,
                  couponLineAlloc: receiptCouponAlloc,
                })
              })()
          : []
      const receiptItems = linesForReceipt.map((i, idx) => ({
        id: String(i.id ?? ''),
        name: String(i.name ?? ''),
        price: Number(i.price ?? 0),
        qty: Math.max(1, Number(i.quantity ?? 1) || 1),
        ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
        ...(lineDiscountAlloc[idx] > 0.0001 ? { lineDiscountAmt: lineDiscountAlloc[idx] } : {}),
      }))
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
    setDeliveryPaymentChannel(
      resolveDefaultDeliveryPaymentChannel(
        cartPanelDeliveryChannelContext({
          deliveryAppProp,
          deliveryOrderNoProp,
          paymentTableNameOverride: receiptOpts?.receiptTableName ?? paymentTableNameOverride,
          customerMemo,
        })
      )
    )
    setPostPaymentCashChange(null)
    setShowPaymentModal(true)
  }
  const openPaymentModal = () => {
    checkoutExistingPosOrderIdRef.current = null
    setIsExistingOrderCheckout(false)
    void openPaymentModalWithAmount(total)
  }

  const submitNonDineOrder = async (withPayment: boolean): Promise<boolean> => {
    if (orderType === 'dine-in') return false
    if (!onNonDineOrderComplete) return false
    const payDel = parseBahtAmount(payDeliveryApp) || 0
    const channelCtx = cartPanelDeliveryChannelContext({
      deliveryAppProp,
      deliveryOrderNoProp,
      paymentTableNameOverride,
      customerMemo,
      deliveryPaymentChannel,
    })
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? {
            paymentDeliveryApp: payDel,
            deliveryPaymentChannel: resolveDeliveryPaymentChannelForSave({
              ...channelCtx,
              paymentDeliveryApp: payDel,
            }),
          }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = useAdminPaymentLines
      ? adminConfiguredWalletSum
      : (parseBahtAmount(payTrueMoney) || 0) +
        (parseBahtAmount(payWeChat) || 0) +
        (parseBahtAmount(payAlipay) || 0) +
        (parseBahtAmount(payUnionPay) || 0) +
        (parseBahtAmount(payLinePay) || 0) +
        (parseBahtAmount(payShopeePay) || 0) +
        (parseBahtAmount(payOther) || 0)
    const payOtherBreakdown = buildPaymentOtherBreakdownSnapshot()
    const deliveryLabel = [deliveryAppLabel, deliveryOrderNoProp?.trim() ? `#${deliveryOrderNoProp.trim()}` : '']
      .filter(Boolean)
      .join(' ')
    const selectedMemberNo = memberMap[selectedMemberId]?.memberNo || ''
    if (withPayment) finalizeSplitPaymentsForReceipt()
    if (withPayment && showSplit) {
      resetPaymentInputs()
      splitDraftAssignedRef.current = null
    }
    const splitReceipts = withPayment ? buildSplitReceiptPayloads() : undefined
    const paymentBase = withPayment
      ? showSplit
        ? buildOrderPaymentFromSplit()
        : buildPaymentSnapshot()
      : null
    const result = await onNonDineOrderComplete({
      orderType,
      orderLabel: orderType === 'delivery'
        ? (deliveryLabel || t('posOrderTypeDelivery') || '배달')
        : (takeoutLabelProp?.trim() || (t('posOrderTypeTakeout') || '포장')),
      items: cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx)),
      memo: buildOrderMemo(customerMemo),
      discountAmt: discount,
      discountReason: paymentDiscountReason,
      ...tierOrderFields,
      serviceAmt: serviceDiscountAmt,
      serviceReason: paymentServiceReason || undefined,
      memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
      memberNo: selectedMemberNo || undefined,
      couponCode: couponPayloadFields.couponCode,
      couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
      appliedCoupons: couponPayloadFields.appliedCoupons,
      pointUsed: pointUsedNum || undefined,
      payment: withPayment
        ? buildPaymentPayloadForOrderSubmit({
            base: paymentBase!,
            paymentOther: paymentBase!.paymentOther || paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            deliveryPayPart,
          })
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
    return result !== false
  }

  const handlePaymentComplete = async () => {
    if (paymentSubmitInFlight || posBackendActionInFlight) return
    setPaymentSubmitInFlight(true)
    try {
    const dineInTableName = resolveDineInTableNameForStorage(
      selectedTable,
      paymentTableNameOverride || '',
      dineInMultiFloorLayout
    )
    finalizeSplitPaymentsForReceipt()
    if (showSplit) {
      resetPaymentInputs()
      splitDraftAssignedRef.current = null
    }
    const resolvedPayment = showSplit ? buildOrderPaymentFromSplit() : buildPaymentSnapshot()
    const finalPaySum = round2(sumCartPanelPaymentSnapshot(resolvedPayment))
    if (total > 0.005 && !paymentTotalsReconcile(finalPaySum, total)) {
      scrollToPaymentMethods()
      return
    }
    const payDel = resolvedPayment.paymentDeliveryApp ?? 0
    const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
      payDel > 0
        ? { paymentDeliveryApp: payDel, deliveryPaymentChannel: resolvedPayment.deliveryPaymentChannel ?? null }
        : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
    const paymentOtherSum = resolvedPayment.paymentOther || 0
    const payOtherBreakdown = resolvedPayment.paymentOtherBreakdown
    const splitReceipts = buildSplitReceiptPayloads()
    if (needTaxInvoice && !taxInvoiceInvalid) {
      const profile = profileToTaxInvoiceSavePayload({
        profile: {
          type: invoiceCustomerType === 'company' ? 'corporate' : 'individual',
          name: normalizedTaxFields.name,
          taxId: normalizedTaxFields.taxId,
          branchCode: normalizedTaxFields.effectiveBranchNo,
          phone: normalizedTaxFields.phone,
          email: normalizedTaxFields.email,
          address: normalizedTaxFields.address,
        },
        invoiceCustomerType,
        normalized: normalizedTaxFields,
      })
      const regKey = taxRegistryLocalKey(
        taxMemberNo.trim(),
        memberMap[selectedMemberId]?.memberNo,
        normalizedTaxFields.taxId,
        normalizedTaxFields.effectiveBranchNo
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
          name: normalizedTaxFields.name,
          taxId: normalizedTaxFields.taxId,
          branchNo: normalizedTaxFields.effectiveBranchNo,
          phone: normalizedTaxFields.phone,
          email: normalizedTaxFields.email,
          address: normalizedTaxFields.address,
          source: 'pos_payment',
        }).catch(() => {})
      }
    }
    const resolvedExistingCheckoutId =
      checkoutExistingPosOrderIdRef.current ?? normalizeExistingPosOrderId(pendingOrderId)

    let paymentOk = false
    if (orderType === 'dine-in' && dineInTableName && onDineInOrderComplete) {
      paymentOk =
        (await onDineInOrderComplete(
        {
          items: cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx)),
          tableName: dineInTableName,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          ...tierOrderFields,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: buildPaymentPayloadForOrderSubmit({
            base: resolvedPayment,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            deliveryPayPart,
          }),
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponPayloadFields.couponCode,
          couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
          appliedCoupons: couponPayloadFields.appliedCoupons,
          pointUsed: pointUsedNum || undefined,
          isPrepaid,
          guestCount: guestCount > 0 ? guestCount : undefined,
        },
        resolvedExistingCheckoutId ?? undefined
      )) !== false
    } else if (
      orderType === 'delivery' &&
      resolvedExistingCheckoutId != null &&
      paymentTableNameOverride &&
      onDeliveryOrderComplete
    ) {
      paymentOk =
        (await onDeliveryOrderComplete(
        {
          items: cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx)),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          ...tierOrderFields,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: buildPaymentPayloadForOrderSubmit({
            base: resolvedPayment,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            deliveryPayPart,
          }),
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponPayloadFields.couponCode,
          couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
          appliedCoupons: couponPayloadFields.appliedCoupons,
          pointUsed: pointUsedNum || undefined,
        },
        resolvedExistingCheckoutId
      )) !== false
    } else if (
      orderType === 'takeout' &&
      resolvedExistingCheckoutId != null &&
      paymentTableNameOverride &&
      onTakeoutOrderComplete
    ) {
      paymentOk =
        (await onTakeoutOrderComplete(
        {
          items: cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx)),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: paymentDiscountReason,
          ...tierOrderFields,
          serviceAmt: serviceDiscountAmt,
          serviceReason: paymentServiceReason || undefined,
          payment: buildPaymentPayloadForOrderSubmit({
            base: resolvedPayment,
            paymentOther: paymentOtherSum,
            ...(payOtherBreakdown ? { paymentOtherBreakdown: payOtherBreakdown } : {}),
            deliveryPayPart,
          }),
          ...(splitReceipts && splitReceipts.length > 0 ? { splitReceipts } : {}),
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponPayloadFields.couponCode,
          couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
          appliedCoupons: couponPayloadFields.appliedCoupons,
          pointUsed: pointUsedNum || undefined,
        },
        resolvedExistingCheckoutId
      )) !== false
    } else if (orderType !== 'dine-in' && onNonDineOrderComplete) {
      paymentOk = await submitNonDineOrder(true)
    } else {
      paymentOk = true
    }

    if (!paymentOk) return

    const cashPayRecorded = resolvedPayment.paymentCash || 0
    const tenderChangeRounded = round2(Math.max(0, cashChangeAmountForTendered))
    const showPostCashChangeReminder = cashPayRecorded > 0.001 && tenderChangeRounded > 0.001

    onPaymentComplete?.()
    setShowPaymentModal(false)
    handleClearCart()
    if (showPostCashChangeReminder) {
      setPostPaymentCashChange(tenderChangeRounded)
    }
    } finally {
      setPaymentSubmitInFlight(false)
    }
  }

  const addItem = (item: CartPanelAddItemPayload) => {
    setCartItems((prev) => mergeCartPanelAddItem(prev, item))
  }

  const applyCouponWithParams = useCallback(
    async (params: {
      code: string
      memberId?: number
      memberIssueId?: number
      quantity?: number
      successNote?: string
    }) => {
      const code = String(params.code || '').trim()
      if (!code) {
        setCouponMessage(t('posCouponPleaseEnterCode'))
        return false
      }
      try {
        const res = await validatePosCoupons({
          subtotal,
          manualDiscountAmt: cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt,
          collabDiscountAmt,
          tierDiscountAmt,
          cartLines: buildCouponCartLines(),
          applied: appliedCoupons,
          candidate: {
            code,
            quantity: params.quantity ?? couponQuantity,
            ...(params.memberIssueId ? { memberIssueId: params.memberIssueId } : {}),
          },
          memberId: params.memberId,
        })
        if (!res.valid || !res.appliedCoupons?.length) {
          setCouponMessage(
            localizeApiMessage(res.message, t, t('posCouponInvalid'), lang)
          )
          return false
        }
        if (res.resolvedMemberId && !selectedMemberId) {
          await linkMemberById(res.resolvedMemberId)
        }
        setAppliedCoupons(res.appliedCoupons)
        setCouponCode('')
        setCouponQuantityInput('1')
        setCouponMessage(
          params.successNote || i18nTr(t, 'posCouponAppliedSuccess', { code: code.toUpperCase() })
        )
        void appAlert(i18nTr(t, 'posCouponUseSuccessPopup', { code: code.toUpperCase() }))
        return true
      } catch (e) {
        console.error('validatePosCoupons:', e)
        setCouponMessage(t('posCouponValidateError'))
        return false
      }
    },
    [
      appliedCoupons,
      buildCouponCartLines,
      cancelledLineAmt,
      collabDiscountAmt,
      tierDiscountAmt,
      couponQuantity,
      manualDiscountAmt,
      serviceDiscountAmt,
      subtotal,
      selectedMemberId,
      linkMemberById,
      t,
      lang,
    ]
  )

  const applyCouponFromQrPayload = useCallback(
    async (raw: string): Promise<boolean> => {
      const normalizedRaw = normalizeCouponScanDelimiters(String(raw ?? '').trim())
      const parsed = parseLooseMemberCouponScanInput(normalizedRaw)
      if (!parsed) {
        setCouponMessage(t('posCouponInvalid'))
        return false
      }

      let memberId: number | undefined
      let successNote: string | undefined

      if (parsed.memberNo) {
        const linkedMember = await linkMemberByMemberNo(parsed.memberNo, { beep: false })
        if (!linkedMember) {
          setCouponMessage(t('posCouponQrMemberNotFound') || 'QR의 회원번호를 찾을 수 없습니다.')
          return false
        }
        memberId = linkedMember.id
        successNote = i18nTr(t, 'posCouponQrMemberLinked', { name: linkedMember.name })
      } else if (selectedMemberId) {
        memberId = Number(selectedMemberId)
      } else if (!parsed.issueId) {
        setCouponMessage(t('posCouponQrMemberNotFound') || 'QR의 회원번호를 찾을 수 없습니다.')
        return false
      }

      return applyCouponWithParams({
        code: parsed.couponCode,
        memberId,
        memberIssueId: parsed.issueId,
        successNote,
      })
    },
    [applyCouponWithParams, linkMemberByMemberNo, selectedMemberId, t]
  )

  const runCouponScanPayload = useCallback(
    async (raw: string) => {
      const ok = await applyCouponFromQrPayload(raw)
      finishCouponScanInput(ok ? 'success' : 'error')
      return ok
    },
    [applyCouponFromQrPayload, finishCouponScanInput]
  )

  const applyCouponCode = async (rawOverride?: string) => {
    const pendingQrRaw = pendingMemberCouponQrRawRef.current
    if (pendingQrRaw) {
      const ok = await runCouponScanPayload(pendingQrRaw)
      if (ok) pendingMemberCouponQrRawRef.current = null
      return
    }

    const raw = normalizeCouponScanDelimiters(String(rawOverride ?? couponCode).trim())
    if (!raw) {
      setCouponMessage(t('posCouponPleaseEnterCode'))
      return
    }

    const memberOnly = parseMemberPosScanInput(raw)
    if (memberOnly) {
      const linked = await linkMemberByMemberNo(memberOnly.memberNo, { beep: false })
      if (linked) {
        setCouponCode('')
        setCouponMessage(i18nTr(t, 'posCouponQrMemberLinked', { name: linked.name }))
        finishCouponScanInput('success')
      } else {
        setCouponMessage(t('posCouponQrMemberNotFound') || 'QR의 회원번호를 찾을 수 없습니다.')
        finishCouponScanInput('error')
      }
      return
    }

    const loose = parseLooseMemberCouponScanInput(raw)
    if (isMemberCouponQrPayload(raw) || loose) {
      await runCouponScanPayload(raw)
      return
    }
    const ok = await applyCouponWithParams({
      code: raw,
      memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
    })
    if (ok) finishCouponScanInput('success')
    else finishCouponScanInput('error')
  }

  const sanitizeCouponCodeInput = (raw: string) =>
    normalizeCouponScanDelimiters(String(raw ?? '').replace(/[^\x20-\x7E\uFF5E\u223C\u02DC\u2053]/g, ''))

  const handleCouponCodeInput = (next: string) => {
    const sanitized = sanitizeCouponCodeInput(next)
    const parsed = parseLooseMemberCouponScanInput(sanitized)
    if (parsed) {
      pendingMemberCouponQrRawRef.current = sanitized
      setCouponCode(parsed.couponCode)
      return
    }
    pendingMemberCouponQrRawRef.current = null
    setCouponCode(sanitized)
  }

  useEffect(() => {
    if (!showPaymentModal || couponQrScannerOpen) return

    let buffer = ''
    let lastKeyAt = 0
    let idleSubmitTimer: number | null = null

    const resetBuffer = () => {
      buffer = ''
      lastKeyAt = 0
      couponUsbScanBufferRef.current = { chars: '', lastAt: 0 }
    }

    const clearIdleSubmit = () => {
      if (idleSubmitTimer != null) {
        window.clearTimeout(idleSubmitTimer)
        idleSubmitTimer = null
      }
    }

    const submitCouponScan = (raw: string) => {
      const normalized = normalizeCouponScanDelimiters(raw.trim())
      if (!normalized || !isMemberCouponScanPayload(normalized)) return
      clearIdleSubmit()
      resetBuffer()
      setCouponCode('')
      pendingMemberCouponQrRawRef.current = null
      couponScanAutoSubmitRef.current = normalized
      void runCouponScanPayload(normalized)
    }

    const scheduleIdleSubmit = () => {
      clearIdleSubmit()
      idleSubmitTimer = window.setTimeout(() => {
        idleSubmitTimer = null
        const raw = normalizeCouponScanDelimiters(buffer.trim())
        if (!raw || !isMemberCouponScanPayload(raw)) return
        submitCouponScan(raw)
      }, POS_SCAN_IDLE_SUBMIT_MS)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const target = e.target
      const couponInput =
        target instanceof HTMLInputElement && target.dataset.posCouponScan === '1'

      if (
        !couponInput &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable))
      ) {
        return
      }

      if (e.key === 'Enter') {
        const raw = normalizeCouponScanDelimiters(buffer.trim())
        const hadScanBuffer = buffer.length > 0
        clearIdleSubmit()
        resetBuffer()
        if (hadScanBuffer && raw) {
          e.preventDefault()
          e.stopPropagation()
          submitCouponScan(raw)
        }
        return
      }

      if (e.key.length !== 1) return
      const now = Date.now()
      const gap = lastKeyAt > 0 ? now - lastKeyAt : 999

      if (couponInput) {
        if (lastKeyAt > 0 && gap > 120) {
          buffer = e.key
        } else {
          buffer += e.key
        }
        lastKeyAt = now
        couponUsbScanBufferRef.current = { chars: buffer, lastAt: now }

        const normalized = normalizeCouponScanDelimiters(buffer)
        const inScannerBurst = buffer.length >= 2 && gap <= 120
        if (inScannerBurst || isMemberCouponScanPayload(buffer)) {
          e.preventDefault()
          e.stopPropagation()
          const parsed = parseLooseMemberCouponScanInput(normalized)
          if (parsed) {
            pendingMemberCouponQrRawRef.current = normalized
            setCouponCode(parsed.couponCode)
          } else {
            pendingMemberCouponQrRawRef.current = null
            setCouponCode(normalized)
          }
          scheduleIdleSubmit()
        }

        if (!isMemberCouponScanPayload(buffer) && buffer.length > 128) resetBuffer()
        return
      }

      if (lastKeyAt > 0 && gap > 120) resetBuffer()

      lastKeyAt = now
      buffer += e.key
      couponUsbScanBufferRef.current = { chars: buffer, lastAt: now }

      const normalizedGlobal = normalizeCouponScanDelimiters(buffer)
      if (isMemberCouponScanPayload(normalizedGlobal)) {
        e.preventDefault()
        scheduleIdleSubmit()
      }

      if (!isMemberCouponScanPayload(buffer) && buffer.length > 128) resetBuffer()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      clearIdleSubmit()
      resetBuffer()
    }
  }, [couponQrScannerOpen, runCouponScanPayload, showPaymentModal])

  /** USB 스캐너(키보드 웨지): 회원·쿠폰 입력칸이 화면별로 분리되어 있으므로 해당 화면 진입 시 포커스 */
  useEffect(() => {
    if (showPaymentModal || couponQrScannerOpen) return
    const id = window.setTimeout(() => {
      if (isRadixOverlayOpen()) return
      memberScanInputRef.current?.focus()
    }, 80)
    return () => window.clearTimeout(id)
  }, [couponQrScannerOpen, showPaymentModal])

  useEffect(() => {
    if (!showPaymentModal || couponQrScannerOpen) return
    const id = window.setTimeout(() => {
      if (isActivelyEditingPaymentAmount()) return
      if (isRadixOverlayOpen()) return
      if (!selectedMemberId) {
        paymentMemberScanInputRef.current?.focus()
      } else {
        couponScanInputRef.current?.focus()
      }
    }, 120)
    return () => window.clearTimeout(id)
  }, [couponQrScannerOpen, isActivelyEditingPaymentAmount, selectedMemberId, showPaymentModal])

  useEffect(() => {
    if (showPaymentModal || couponQrScannerOpen) return

    let buffer = ''
    let lastKeyAt = 0

    const resetBuffer = () => {
      buffer = ''
      lastKeyAt = 0
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (e.key === 'Enter') {
        const raw = buffer.trim()
        resetBuffer()
        if (raw && isMemberPosScanPayload(raw) && !isMemberCouponScanPayload(raw)) {
          e.preventDefault()
          void handleMemberSearch(raw, { fromScan: true })
        }
        return
      }

      if (e.key.length !== 1) return
      const now = Date.now()
      if (lastKeyAt > 0 && now - lastKeyAt > 120) resetBuffer()
      lastKeyAt = now
      buffer += e.key
      const raw = buffer.trim()
      if (isMemberPosScanPayload(raw) && !isMemberCouponScanPayload(raw)) {
        resetBuffer()
        e.preventDefault()
        void handleMemberSearch(raw, { fromScan: true })
        return
      }
      if (!isMemberPosScanPayload(buffer) && buffer.length > 48) resetBuffer()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      resetBuffer()
    }
  }, [couponQrScannerOpen, handleMemberSearch, showPaymentModal])

  useEffect(() => {
    if (showPaymentModal || couponQrScannerOpen) return
    const raw = normalizeCouponScanDelimiters(memberKeyword.trim())
    if (!raw || memberScanAutoSubmitRef.current === raw) return
    const couponMember = isMemberCouponScanPayload(raw)
      ? parseLooseMemberCouponScanInput(raw)?.memberNo
      : null
    const memberParsed = parseMemberPosScanInput(raw)
    if (!couponMember && !memberParsed) return
    memberScanAutoSubmitRef.current = raw
    void handleMemberSearch(raw, { fromScan: true })
  }, [couponQrScannerOpen, handleMemberSearch, memberKeyword, showPaymentModal])

  useEffect(() => {
    if (!showPaymentModal || couponQrScannerOpen) return
    const raw = normalizeCouponScanDelimiters(memberKeyword.trim())
    if (!raw || !isMemberCouponQrPayload(raw)) return

    const timer = window.setTimeout(() => {
      const latest = normalizeCouponScanDelimiters(memberKeyword.trim())
      if (!latest || !isMemberCouponScanPayload(latest)) return
      if (memberFieldCouponAutoRef.current === latest) return
      memberFieldCouponAutoRef.current = latest
      setMemberKeyword('')
      void runCouponScanPayload(latest)
    }, POS_SCAN_IDLE_SUBMIT_MS)

    return () => window.clearTimeout(timer)
  }, [couponQrScannerOpen, memberKeyword, runCouponScanPayload, showPaymentModal])

  useEffect(() => {
    const bumpActivity = () => {
      lastPosActivityRef.current = Date.now()
    }
    window.addEventListener('pointerdown', bumpActivity, true)
    window.addEventListener('keydown', bumpActivity, true)
    return () => {
      window.removeEventListener('pointerdown', bumpActivity, true)
      window.removeEventListener('keydown', bumpActivity, true)
    }
  }, [])

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (couponQrScannerOpen) return
      if (guestDirectOpen || editingNoteItemId || isActivelyEditingPaymentAmount()) return
      if (Date.now() - lastPosActivityRef.current < POS_SCAN_IDLE_REFOCUS_MS) return
      // 열린 Select/Popover(협업 할인·인원 선택 등)의 포커스를 뺏어 닫지 않도록
      if (isRadixOverlayOpen()) return
      const active = document.activeElement
      if (active === memberScanInputRef.current || active === couponScanInputRef.current) return
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return
      }
      if (showPaymentModal) couponScanInputRef.current?.focus()
      else memberScanInputRef.current?.focus()
      lastPosActivityRef.current = Date.now()
    }, 4000)
    return () => window.clearInterval(tick)
  }, [couponQrScannerOpen, editingNoteItemId, guestDirectOpen, isActivelyEditingPaymentAmount, showPaymentModal])

  const removeAppliedCoupon = (index: number) => {
    setAppliedCoupons((prev) => prev.filter((_, i) => i !== index))
    setCouponMessage('')
  }

  useEffect(() => {
    if (!appliedCoupons.length) return
    let cancelled = false
    void validatePosCoupons({
      subtotal,
      manualDiscountAmt: cancelledLineAmt + serviceDiscountAmt + manualDiscountAmt,
      collabDiscountAmt,
      tierDiscountAmt,
      cartLines: buildCouponCartLines(),
      applied: appliedCoupons,
      memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
    }).then((res) => {
      if (cancelled || !res.appliedCoupons) return
      setAppliedCoupons(res.appliedCoupons)
    })
    return () => {
      cancelled = true
    }
  }, [
    subtotal,
    cancelledLineAmt,
    serviceDiscountAmt,
    manualDiscountAmt,
    collabDiscountAmt,
    tierDiscountAmt,
    buildCouponCartLines,
    cartItems.length,
    selectedMemberId,
  ])

  const openDineInPaymentFromOrder = (payload: {
    tableName: string
    orderNo?: string
    existingOrderId?: number | null
    items: {
      id: string
      name: string
      price: number
      quantity: number
      note?: string
      menuId?: string
      menuId1?: string
      promoId?: string
      promoCode?: string
      promoItems?: CartItem['promoItems']
    }[]
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
  }) => {
    const existingId = normalizeExistingPosOrderId(payload.existingOrderId)
    checkoutExistingPosOrderIdRef.current = existingId
    setIsExistingOrderCheckout(existingId != null)
    const normalized = payload.items.map((i, idx) => {
      const menuId = String(i.menuId ?? i.menuId1 ?? '').trim()
      const promoId = String(i.promoId ?? '').trim()
      const promoCode = String(i.promoCode ?? '').trim()
      return {
        id: `cart-existing-${idx}-${i.id}`,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        ...(menuId ? { menuId } : {}),
        ...(i.note?.trim() ? { note: i.note.trim() } : {}),
        ...(promoId
          ? {
              promoId,
              ...(promoCode ? { promoCode } : {}),
              ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
            }
          : {}),
      }
    })
    resetCheckoutDiscountUiState({
      setDiscountType,
      setDiscountValueInput,
      setDiscountReason,
      setAppliedCollabId,
      setCouponCode,
      setAppliedCoupons,
      setCouponQuantityInput,
      setCouponMessage,
      setPointUsed,
    })
    const receiptDiscountTotal = seedCheckoutDiscountFromExistingOrder(
      payload.orderDiscount,
      normalized,
      pricingAdjustments,
      { setDiscountType, setDiscountValueInput, setDiscountReason }
    )
    seedCheckoutMemberFromExistingOrder(payload.orderMember, {
      setSelectedMemberId,
      setMemberMap,
      setMemberOptions,
      setPointUsed,
    })
    setPaymentTableNameOverride(payload.tableName)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal,
      receiptTableName: payload.tableName,
      receiptOrderNo: payload.orderNo,
    })
  }

  const openTakeoutPaymentFromOrder = (payload: {
    orderLabel: string
    items: {
      id: string
      name: string
      price: number
      quantity: number
      note?: string
      menuId?: string
      menuId1?: string
      promoId?: string
      promoCode?: string
      promoItems?: CartItem['promoItems']
    }[]
    existingOrderId?: number | null
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
  }) => {
    const existingId = normalizeExistingPosOrderId(payload.existingOrderId)
    checkoutExistingPosOrderIdRef.current = existingId
    setIsExistingOrderCheckout(existingId != null)
    const normalized = payload.items.map((i, idx) => {
      const menuId = String(i.menuId ?? i.menuId1 ?? '').trim()
      const promoId = String(i.promoId ?? '').trim()
      const promoCode = String(i.promoCode ?? '').trim()
      return {
        id: `cart-existing-${idx}-${i.id}`,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        ...(menuId ? { menuId } : {}),
        ...(i.note?.trim() ? { note: i.note.trim() } : {}),
        ...(promoId
          ? {
              promoId,
              ...(promoCode ? { promoCode } : {}),
              ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
            }
          : {}),
      }
    })
    resetCheckoutDiscountUiState({
      setDiscountType,
      setDiscountValueInput,
      setDiscountReason,
      setAppliedCollabId,
      setCouponCode,
      setAppliedCoupons,
      setCouponQuantityInput,
      setCouponMessage,
      setPointUsed,
    })
    const receiptDiscountTotal = seedCheckoutDiscountFromExistingOrder(
      payload.orderDiscount,
      normalized,
      pricingAdjustments,
      { setDiscountType, setDiscountValueInput, setDiscountReason }
    )
    seedCheckoutMemberFromExistingOrder(payload.orderMember, {
      setSelectedMemberId,
      setMemberMap,
      setMemberOptions,
      setPointUsed,
    })
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal,
    })
  }

  const openDeliveryPaymentFromOrder = async (payload: {
    orderLabel: string
    items: {
      id: string
      name: string
      price: number
      quantity: number
      note?: string
      menuId?: string
      menuId1?: string
      promoId?: string
      promoCode?: string
      promoItems?: CartItem['promoItems']
    }[]
    existingOrderId?: number | null
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
  }) => {
    const existingId = normalizeExistingPosOrderId(payload.existingOrderId)
    checkoutExistingPosOrderIdRef.current = existingId
    setIsExistingOrderCheckout(existingId != null)
    const normalized = payload.items.map((i, idx) => {
      const menuId = String(i.menuId ?? i.menuId1 ?? '').trim()
      const promoId = String(i.promoId ?? '').trim()
      const promoCode = String(i.promoCode ?? '').trim()
      return {
        id: `cart-existing-${idx}-${i.id}`,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        ...(menuId ? { menuId } : {}),
        ...(i.note?.trim() ? { note: i.note.trim() } : {}),
        ...(promoId
          ? {
              promoId,
              ...(promoCode ? { promoCode } : {}),
              ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
            }
          : {}),
      }
    })
    resetCheckoutDiscountUiState({
      setDiscountType,
      setDiscountValueInput,
      setDiscountReason,
      setAppliedCollabId,
      setCouponCode,
      setAppliedCoupons,
      setCouponQuantityInput,
      setCouponMessage,
      setPointUsed,
    })
    const receiptDiscountTotal = seedCheckoutDiscountFromExistingOrder(
      payload.orderDiscount,
      normalized,
      pricingAdjustments,
      { setDiscountType, setDiscountValueInput, setDiscountReason }
    )
    seedCheckoutMemberFromExistingOrder(payload.orderMember, {
      setSelectedMemberId,
      setMemberMap,
      setMemberOptions,
      setPointUsed,
    })
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    void openPaymentModalWithAmount(amount, {
      receiptLines: normalized,
      receiptSubtotal: amount,
      receiptDiscountTotal,
    })
  }

  /** 배달 기존 주문 「ชำระที่ร้าน」: 플랫폼 정산 전제 — 결제 수단 없이 할인만 조정 후 완료 */
  const completeDeliveryPayInStoreFromModal = async () => {
    const existingId = normalizeExistingPosOrderId(checkoutExistingPosOrderIdRef.current)
    if (!onDeliveryOrderComplete || existingId == null) return
    if (total <= 0) return
    const payChannel = resolveDeliveryPaymentChannelForSave({
      ...cartPanelDeliveryChannelContext({
        deliveryAppProp,
        deliveryOrderNoProp,
        paymentTableNameOverride,
        customerMemo,
      }),
      paymentDeliveryApp: total,
    })
    const ok =
      (await onDeliveryOrderComplete(
      {
        items: cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx)),
        orderLabel: (paymentTableNameOverride ?? '').trim() || '',
        memo: buildOrderMemo(customerMemo),
        discountAmt: discount,
        discountReason: paymentDiscountReason,
        ...tierOrderFields,
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
        couponCode: couponPayloadFields.couponCode,
        couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
        appliedCoupons: couponPayloadFields.appliedCoupons,
        pointUsed: pointUsedNum || undefined,
      },
      existingId
    )) !== false
    if (!ok) return
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
    setAppliedCoupons([])
    setCouponQuantityInput('1')
    setPointUsed('')
    setCouponMessage('')
    setDiscountValueInput('')
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

  const manualDiscountCard = (
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
            {tr('posTierDiscountExpected', '등급 할인 예상')}: {formatBahtNum(tierDiscountAmt)} ฿ ·{' '}
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
                setDiscountValueInput(String(pct))
                bumpDiscountPaymentSync()
              }}
            >
              {pct}%
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_minmax(5.5rem,8rem)_1fr]">
          <Button
            type="button"
            size="default"
            variant="outline"
            className="h-12 px-3 text-sm font-semibold rounded-xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            onClick={() => {
              setDiscountType('percent')
              setDiscountValueInput('')
              bumpDiscountPaymentSync()
            }}
          >
            {tr('reset', '초기화')}
          </Button>
          <Select
            value={discountType}
            onValueChange={(v) => {
              setDiscountType(v as 'percent' | 'fixed')
              bumpDiscountPaymentSync()
            }}
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
            type="text"
            inputMode={discountType === 'percent' ? 'numeric' : 'decimal'}
            autoComplete="off"
            placeholder={
              discountType === 'percent'
                ? (t('posDiscount') || '할인') + ' %'
                : (t('posDiscount') || '할인') + ' ฿'
            }
            value={discountValueInput}
            {...bindPaymentAmountInputFocus({ syncPaymentOnBlur: true })}
            onChange={(e) =>
              discountType === 'percent'
                ? handlePaymentIntegerInputChange(e, setDiscountValueInput, 3)
                : handlePaymentBahtInputChange(e, setDiscountValueInput)
            }
            className="h-11 min-w-[5.5rem] text-right text-sm font-semibold tabular-nums rounded-xl px-2.5"
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
  )

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
                {normalizeExistingPosOrderId(pendingOrderId) != null && (
                  <Badge
                    variant="secondary"
                    className="h-7 max-w-[9rem] shrink-0 truncate border border-amber-500/40 bg-amber-100/90 px-2 text-[11px] font-semibold text-amber-950 dark:bg-amber-950/50 dark:text-amber-50"
                    title={
                      (t('posTakeoutAddOrderModeBadge') || '{{label}} 추가 주문 중').replace(
                        /\{\{label\}\}/g,
                        takeoutLabelProp?.trim() || (t('posOrderTypeTakeout') || '포장')
                      )
                    }
                  >
                    {(t('posTakeoutAddOrderModeBadge') || '{{label}} 추가 주문 중').replace(
                      /\{\{label\}\}/g,
                      takeoutLabelProp?.trim() || (t('posOrderTypeTakeout') || '포장')
                    )}
                  </Badge>
                )}
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
              ref={memberScanInputRef}
              lang="en"
              data-pos-member-scan="1"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              placeholder={t('posMemberSearchPh') || '회원번호/이름/번호'}
              value={memberKeyword}
              onChange={(e) => handleMemberKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleMemberSearch(e.currentTarget.value)
                }
              }}
              onFocus={scrollIntoViewOnFocus}
              className={cn(
                'h-8 flex-1 w-0 min-w-0 max-w-[9rem] [ime-mode:disabled]',
                posScanFieldFlashClass(memberScanFlash)
              )}
              style={{ imeMode: 'disabled' }}
            />
            <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={() => void handleMemberSearch()} disabled={membersLoading}>
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
                  {takeoutLabelProp?.trim()
                    ? translateTakeoutOrderDisplayLabel(takeoutLabelProp.trim(), t)
                    : (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', '1')}
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
          {selectedMemberId && tierDiscountAmt > 0 ? (
            <p className="text-[11px] font-medium text-violet-800 dark:text-violet-200">
              {tr('posTierDiscountExpected', '등급 할인 예상')}: -{formatBahtNum(tierDiscountAmt)} ฿ (
              {normalizeMemberTierCodeForDiscount(memberMap[selectedMemberId]?.tierCode || 'BRONZE')}{' '}
              {(selectedMemberTierDiscountRate * 100).toFixed(1)}%)
            </p>
          ) : null}
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
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  min={1}
                  max={99}
                  className="tabular-nums"
                  value={guestDirectValue}
                  onChange={(e) => setGuestDirectValue(formatIntegerInputDisplay(e.target.value, 2))}
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
                const submitItems = cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx))
                onOrderSubmit?.({
                  items: submitItems,
                  tableName: resolveDineInTableNameForStorage(
                    selectedTable,
                    '',
                    dineInMultiFloorLayout
                  ),
                  memo: buildOrderMemo(customerMemo),
                  discountAmt: discount,
                  discountReason: paymentDiscountReason,
                  ...tierOrderFields,
                  serviceAmt: serviceDiscountAmt,
                  serviceReason: paymentServiceReason || undefined,
                  memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
                  memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
                  couponCode: couponPayloadFields.couponCode,
                  couponDiscountAmt: couponPayloadFields.couponDiscountAmt,
                  appliedCoupons: couponPayloadFields.appliedCoupons,
                  pointUsed: pointUsedNum || undefined,
                  guestCount,
                  existingOrderId: normalizeExistingPosOrderId(selectedTable.order?.id) ?? undefined,
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
        if (!open && (couponQrScannerOpen || isCouponQrScannerOverlayActive())) return
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
          // 터치 POS·가상 키보드 탭이 outside로 잡혀 금액 입력이 한 글자마다 끊기는 문제 방지
          e.preventDefault()
        }}
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
        onFocusOutside={(e) => {
          e.preventDefault()
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
              {manualDiscountCard}
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
              {manualDiscountCard}
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
                onClick={() => void completeDeliveryPayInStoreFromModal()}
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

            <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-50/80 via-card to-card p-3 shadow-sm dark:from-amber-950/20 dark:via-card dark:to-card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex shrink-0 items-center gap-2 sm:min-w-[7.5rem]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    <Users className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold leading-tight">
                    {t('posPaymentSectionMember') || t('posMember') || '회원 검색'}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Input
                    ref={paymentMemberScanInputRef}
                    lang="en"
                    data-pos-member-scan="1"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    placeholder={t('posMemberSearchPh') || '회원번호/이름/번호'}
                    value={memberKeyword}
                    onChange={(e) => handleMemberKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // 결제 화면에서 쿠폰 QR이 회원란에 잘못 스캔되는 경우가 잦다.
                        // 쿠폰 QR이면 회원 검색을 막고, 아래 effect가 쿠폰 적용으로 처리한다(회원 연결도 함께).
                        const scanned = normalizeCouponScanDelimiters(e.currentTarget.value.trim())
                        if (isMemberCouponQrPayload(scanned)) return
                        void handleMemberSearch(e.currentTarget.value)
                      }
                    }}
                    className={cn(
                      'h-10 min-w-0 flex-1 text-sm rounded-xl [ime-mode:disabled]',
                      posScanFieldFlashClass(memberScanFlash)
                    )}
                    style={{ imeMode: 'disabled' }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 shrink-0 rounded-xl px-4"
                    onClick={() => void handleMemberSearch()}
                    disabled={membersLoading}
                  >
                    {membersLoading ? '...' : t('posSearch') || '검색'}
                  </Button>
                </div>
              </div>
              {(selectedMemberId || memberOptions.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {selectedMemberId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg px-2.5 text-xs"
                      onClick={() => setSelectedMemberId('')}
                    >
                      {t('posMemberNone') || '비회원'}
                    </Button>
                  )}
                  {memberOptions.map((m) => (
                    <Button
                      key={m.value}
                      type="button"
                      size="sm"
                      variant={selectedMemberId === m.value ? 'default' : 'outline'}
                      className="h-8 max-w-full rounded-lg px-2.5 text-xs"
                      onClick={() => setSelectedMemberId(m.value)}
                    >
                      <span className="truncate">{m.label}</span>
                    </Button>
                  ))}
                </div>
              )}
              {selectedMemberId && selectedMemberDetail ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedMemberDetail.name}
                  {selectedMemberDetail.memberNo ? ` · ${selectedMemberDetail.memberNo}` : ''}
                  {selectedMemberDetail.phone ? ` · ${selectedMemberDetail.phone}` : ''}
                </p>
              ) : null}
              {selectedMemberId && tierDiscountAmt > 0 ? (
                <p className="mt-1 text-[11px] font-medium text-violet-800 dark:text-violet-200">
                  {tr('posTierDiscountExpected', '등급 할인 예상')}: -{formatBahtNum(tierDiscountAmt)} ฿ (
                  {normalizeMemberTierCodeForDiscount(memberMap[selectedMemberId]?.tierCode || 'BRONZE')}{' '}
                  {(selectedMemberTierDiscountRate * 100).toFixed(1)}%)
                </p>
              ) : null}
              {memberSearchEmpty && (
                <p className="mt-2 text-xs text-amber-600">
                  {t('posMemberSearchEmpty') ||
                    '검색 결과가 없습니다. ERP 회원관리에서 회원을 먼저 등록해 주세요.'}
                </p>
              )}
            </div>

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
                  onValueChange={(v) => {
                    setAppliedCollabId(v === '__none__' ? null : v)
                    setCollabQuantity(1)
                  }}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('posCollabNoneOption')}</SelectItem>
                    {collabOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.campaignNo ? `[${c.campaignNo}] ` : '') + c.topic}
                        {c.collabDetail.posDiscountType === 'amount'
                          ? ` (${formatBahtNum(c.collabDetail.posDiscountValue)} ฿)`
                          : c.collabDetail.posDiscountType === 'percent'
                            ? ` (${c.collabDetail.posDiscountValue}%)`
                            : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {appliedCollab && collabSupportsQuantityEntry(appliedCollab.collabDetail) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{tr('posCollabQuantity', '적용 장수')}</span>
                    <PosCollabQuantityControl
                      value={collabQuantity}
                      max={Math.max(1, appliedCollab.collabDetail.posMaxPerOrder ?? 10)}
                      onChange={setCollabQuantity}
                      size="md"
                    />
                    <span className="text-xs text-muted-foreground">
                      {tr('posCollabMaxPerOrder', '최대')} {appliedCollab.collabDetail.posMaxPerOrder ?? 10}
                      {tr('posMenuLineUnit', '건')}
                    </span>
                  </div>
                ) : null}
                {appliedCollab && collabDiscountAmt > 0 ? (
                  <p className="mt-2 text-xs font-medium text-violet-800 dark:text-violet-200">
                    {tr('posCollabDiscountExpected', '협업 할인 예상')}: -{formatBahtNum(collabDiscountAmt)} ฿
                  </p>
                ) : null}
                {!posMenus?.length ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{t('posCollabMenusNotLoaded')}</p>
                ) : null}
                {appliedCollabId && collabDiscountAmt <= 0 && posMenus?.length ? (
                  <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">{t('posCollabNoMatchingLines')}</p>
                ) : null}
              </div>

              {/* 직접 할인 */}
              {manualDiscountCard}

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
                      ref={couponScanInputRef}
                      lang="en"
                      data-pos-coupon-scan="1"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                      placeholder={t('posCouponCodePh')}
                      value={couponCode}
                      onChange={(e) => handleCouponCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const val = normalizeCouponScanDelimiters(e.currentTarget.value.trim())
                          if (!val) return
                          if (isMemberCouponScanPayload(val)) {
                            pendingMemberCouponQrRawRef.current = null
                            setCouponCode('')
                            void runCouponScanPayload(val)
                            return
                          }
                          void applyCouponCode(val)
                        }
                      }}
                      className={cn(
                        'h-10 min-w-0 flex-1 text-sm rounded-xl sm:max-w-xs [ime-mode:disabled]',
                        posScanFieldFlashClass(couponScanFlash)
                      )}
                      style={{ imeMode: 'disabled' }}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={couponQuantityInput}
                      onChange={(e) => setCouponQuantityInput(formatIntegerInputDisplay(e.target.value, 2))}
                      onBlur={() => {
                        const n = Math.max(1, Math.min(99, parseIntegerInput(couponQuantityInput, 1)))
                        setCouponQuantityInput(String(n))
                      }}
                      className="h-10 w-16 shrink-0 text-sm rounded-xl"
                      title={tr('posCouponQuantity', '수량')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0 rounded-xl px-3"
                      onClick={() => setCouponQrScannerOpen(true)}
                      title={t('posCouponScanQr') || 'QR 스캔'}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-10 shrink-0 rounded-xl px-4"
                      onClick={() => void applyCouponCode()}
                    >
                      {tr('posCouponAdd', '추가')}
                    </Button>
                  </div>
                </div>
                {appliedCoupons.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {appliedCoupons.map((row, idx) => (
                      <div
                        key={`${row.code}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-background/80 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.name || row.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.code}
                            {(row.quantity ?? 1) > 1 ? ` × ${row.quantity}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            -{formatBahtNum(row.discountAmt)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-lg p-0"
                            onClick={() => removeAppliedCoupon(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {tr('posCouponTotal', '쿠폰 합계')}: -{formatBahtNum(couponDiscountTotal)}
                    </p>
                  </div>
                )}
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
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pointUsed}
                    {...bindPaymentAmountInputFocus()}
                    onChange={(e) => handlePaymentIntegerInputChange(e, setPointUsed)}
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
                      if (activeDutchSplitFlow) {
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
                { key: 'qr', value: payPromptPay, set: setPayPromptPay, label: tr('posPaymentQrCode', 'QR Code'), icon: QrCode },
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
                            activeDutchSplitFlow
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
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    {...bindPaymentAmountInputFocus()}
                    onChange={(e) => handlePaymentBahtInputChange(e, set)}
                    className="h-12 flex-1 rounded-xl border-border/80 text-right text-lg font-semibold tabular-nums tracking-tight"
                  />
                  <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground">฿</span>
                    </div>
                  </div>
                  {key === 'qr' && (
                    <div className="mt-3 rounded-xl border border-sky-200/70 bg-sky-50/60 p-2 dark:border-sky-700/50 dark:bg-sky-950/25">
                      <p className="mb-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
                        {tr('posQrTypeLabel', 'QR 타입')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={payQrType === 'THAI_QR' ? 'default' : 'outline'}
                          className="h-9 rounded-lg text-xs"
                          onClick={() => setPayQrType('THAI_QR')}
                        >
                          {tr('posQrTypeThai', 'Thai QR')}
                        </Button>
                        <Button
                          type="button"
                          variant={payQrType === 'CREDIT_CARD' ? 'default' : 'outline'}
                          className="h-9 rounded-lg text-xs"
                          onClick={() => setPayQrType('CREDIT_CARD')}
                        >
                          {tr('posQrTypeCredit', 'Credit Card QR')}
                        </Button>
                      </div>
                      <p className="mt-2 text-[10px] leading-snug text-sky-700/90 dark:text-sky-300/90">
                        {tr(
                          'posKbankCreditCardQrHint',
                          'Requires KBank merchant registration. Stores without Credit Card QR should use Thai QR only.'
                        )}
                      </p>
                    </div>
                  )}
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
                              ref={cashTenderedInputRef}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={cashTendered}
                              {...bindPaymentAmountInputFocus()}
                              onChange={(e) => handlePaymentBahtInputChange(e, setCashTendered)}
                              className="h-10 rounded-lg border-sky-300/70 bg-sky-50/60 text-right tabular-nums text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-100"
                              placeholder="0"
                            />
                            <span className="w-4 shrink-0 text-sm font-semibold text-sky-800 dark:text-sky-300">฿</span>
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-violet-800 dark:text-violet-300">
                            {activeDutchSplitFlow
                              ? tr('posCashRequiredAmountCurrentPerson', '필요 현금(현재 인원)')
                              : tr('posCashRequiredAmount', '필요 현금')}
                          </Label>
                          <div className="h-10 rounded-lg border border-violet-300/60 bg-violet-50/70 px-3 text-right text-base font-bold leading-10 tabular-nums text-violet-800 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200">
                            {activeDutchSplitFlow
                              ? formatBahtWhole(cashRequiredForTendered)
                              : `${formatBahtNum(cashRequiredForTendered)} ฿`}
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px] text-emerald-800 dark:text-emerald-300">
                            {tr('posCashChangeAmount', '거슬러줄 금액')}
                          </Label>
                          <div className="h-10 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 text-right text-xl font-extrabold leading-10 tabular-nums text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300">
                            {activeDutchSplitFlow
                              ? formatBahtWhole(cashChangeAmountForTendered)
                              : `${formatBahtNum(cashChangeAmountForTendered)} ฿`}
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
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => addCashTenderedAmount(amount)}
                          >
                            {amount}฿
                          </Button>
                        ))}
                      </div>
                      <div className="mt-2 grid gap-1 text-xs">
                        {cashShortAmountForTendered > 0.001 && (
                          <p className="font-medium text-amber-700 dark:text-amber-400">
                            {tr('posCashShortAmount', '추가로 받아야 할 금액')}:{' '}
                            {activeDutchSplitFlow
                              ? formatBahtWhole(cashShortAmountForTendered)
                              : `${formatBahtNum(cashShortAmountForTendered)} ฿`}
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
                            activeDutchSplitFlow ? addDutchAmountOnly('delivery_app', { replaceCurrentDraft: true }) : moveAllAmountTo('delivery_app')
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
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={payDeliveryApp}
                          {...bindPaymentAmountInputFocus()}
                          onChange={(e) => handlePaymentBahtInputChange(e, setPayDeliveryApp)}
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
                                      activeDutchSplitFlow
                                        ? addDutchAmountToAdminLine(item.id)
                                        : applyFullAmountToSingleAdminLine(item.id)
                                    }
                                  >
                                    {item.name}
                                  </button>
                                </div>
                                {activeDutchSplitFlow && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 shrink-0 px-2 text-xs"
                                    onClick={() => addDutchAmountToAdminLine(item.id)}
                                  >
                                    +{formatBahtWhole(displayedSplitTargetAmount)}
                                  </Button>
                                )}
                              </div>
                              <div className="flex items-center gap-2 sm:max-w-[12rem]">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  value={payAdminLineAmounts[item.id] ?? '0'}
                                  {...bindPaymentAmountInputFocus()}
                                  onChange={(e) =>
                                    handlePaymentBahtInputChange(e, (formatted) =>
                                      setPayAdminLineAmounts((prev) => ({
                                        ...prev,
                                        [item.id]: formatted,
                                      }))
                                    )
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
                        { value: payUnionPay, set: setPayUnionPay, labelKey: 'posPaymentUnionPay', moveKey: 'unionpay' as const },
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
                                  activeDutchSplitFlow ? addDutchAmountOnly(moveKey, { replaceCurrentDraft: true }) : moveAllAmountTo(moveKey)
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
                                +{formatBahtWhole(displayedSplitTargetAmount)}
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:max-w-[12rem]">
                            <Input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={value}
                              {...bindPaymentAmountInputFocus()}
                              onChange={(e) => handlePaymentBahtInputChange(e, set)}
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

            <CartPanelTaxInvoiceSection
              showTaxInvoiceDetails={showTaxInvoiceDetails}
              onShowTaxInvoiceDetailsChange={setShowTaxInvoiceDetails}
              needTaxInvoice={needTaxInvoice}
              onNeedTaxInvoiceChange={(next) => {
                setNeedTaxInvoice(next)
                if (next) setShowTaxInvoiceDetails(true)
              }}
              invoiceCustomerType={invoiceCustomerType}
              onInvoiceCustomerTypeChange={setInvoiceCustomerType}
              taxSearchField={taxSearchField}
              onTaxSearchFieldChange={setTaxSearchField}
              taxSearchKeyword={taxSearchKeyword}
              onTaxSearchKeywordChange={setTaxSearchKeyword}
              onTaxProfileSearch={() => void handleTaxProfileSearch()}
              taxSearchMessage={taxSearchMessage}
              isMemberOrder={isMemberOrder}
              taxMemberNo={taxMemberNo}
              onTaxMemberNoChange={setTaxMemberNo}
              taxName={taxName}
              onTaxNameChange={setTaxName}
              taxId={taxId}
              onTaxIdChange={setTaxId}
              taxBranchNo={taxBranchNo}
              onTaxBranchNoChange={setTaxBranchNo}
              taxBranchRequired={taxBranchRequired}
              taxPhone={taxPhone}
              onTaxPhoneChange={setTaxPhone}
              taxEmail={taxEmail}
              onTaxEmailChange={setTaxEmail}
              taxAddress={taxAddress}
              onTaxAddressChange={setTaxAddress}
              taxInvoiceInvalid={taxInvoiceInvalid}
              taxInvoiceValidationErrors={taxInvoiceValidationErrors}
              t={t}
            />

            {/* Dutch Pay - 가로 compact, 터치 44px */}
            <Collapsible
              open={showSplit}
              onOpenChange={(open) => {
                setShowSplit(open)
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
                <CollapsibleContent className="flex w-full flex-col gap-2 pt-3">
                  <div
                    className="flex w-full flex-nowrap items-center gap-2"
                    data-tour="pos-tour-dutch-mode-row"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'amount' ? 'default' : 'outline'}
                      className="h-9 shrink-0"
                      data-tour="pos-tour-dutch-mode-amount"
                      onClick={() => {
                        setSplitMode('amount')
                      }}
                    >
                      {tr('posDutchSplitModeAmount', '금액 기준')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={splitMode === 'menu' ? 'default' : 'outline'}
                      className="h-9 shrink-0"
                      data-tour="pos-tour-dutch-mode-menu"
                      onClick={() => {
                        setSplitMode('menu')
                      }}
                    >
                      {tr('posDutchSplitModeMenu', '메뉴 기준')}
                    </Button>
                    </div>
                    <div
                      className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border-2 border-violet-500/35 bg-violet-100/70 px-2.5 py-1 shadow-sm dark:border-violet-500/30 dark:bg-violet-950/50"
                      data-tour="pos-tour-dutch-split-count-row"
                    >
                      <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                        {tr('posSplitPeople', '인원')}
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={splitCountDraft ?? String(splitCount)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
                          setSplitCountDraft(raw)
                          if (raw !== '') {
                            setSplitCount(Math.max(1, Math.min(99, parseInt(raw, 10))))
                          }
                        }}
                        onBlur={() => {
                          const raw = splitCountDraft ?? String(splitCount)
                          const n =
                            raw === '' ? 1 : Math.max(1, Math.min(99, parseInt(raw, 10) || 1))
                          setSplitCount(n)
                          setSplitCountDraft(null)
                        }}
                        className="h-9 w-14 rounded-lg border-violet-400/50 bg-background text-center text-base font-bold tabular-nums shrink-0 dark:border-violet-600/50"
                        data-tour="pos-tour-dutch-split-count"
                      />
                    </div>
                  </div>
                  <div
                    className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto rounded-xl border border-violet-400/20 bg-violet-50/30 px-2 py-2 dark:bg-violet-950/15"
                    data-tour="pos-tour-dutch-progress-row"
                  >
                    <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/5 px-2 py-2 min-h-11">
                      <span className="text-xs text-muted-foreground">
                        {splitMode === 'menu'
                          ? tr('posCurrentPersonAmount', '현재 인원 금액')
                          : tr('posPerPersonAmount', '1인 금액')}
                      </span>
                      <span className="text-base font-bold tabular-nums">
                        {formatBahtWhole(displayedSplitTargetAmount)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary/5 px-2 py-2 min-h-11 text-sm">
                      <span className="text-muted-foreground">{tr('posProgress', '진행')}</span>
                      <span className="font-bold tabular-nums">
                        {splitSettledPersonCount}/{Math.max(1, splitCount)}
                        {tr('posPeopleUnit', '명')}
                      </span>
                    </div>
                    <div className="ml-auto flex min-w-0 shrink-0 flex-col items-end justify-center whitespace-nowrap rounded-lg border-2 border-primary/40 bg-primary/10 px-3 py-1.5">
                      <span className="text-[10px] font-medium text-primary/80">
                        {tr('posPaymentRemaining', '남은 금액')}
                        {showSplit
                          ? ` · ${tr('posSplitGuestLabel', '{n}명').replace(
                              '{n}',
                              String(
                                (splitMode === 'menu'
                                  ? menuSplitTargetPersonIndex
                                  : amountSplitTargetPersonIndex) + 1
                              )
                            )}`
                          : ''}
                      </span>
                      <span className="text-xl font-bold tabular-nums leading-none text-primary">
                        {formatBahtWhole(displayedSplitTargetRemaining)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {tr('posSplitPaidTotalProgress', '결제 입력')}{' '}
                        {formatBahtWhole(showSplit ? displayPaymentSum : paymentSum)}/
                        {formatBahtWhole(total)}
                      </span>
                    </div>
                  </div>
                  {splitMode === 'amount' && (
                    <div
                      className="w-full space-y-2 rounded-xl border border-violet-400/25 bg-violet-50/40 p-2.5 dark:bg-violet-900/10"
                      data-tour="pos-tour-dutch-amount-panel"
                    >
                      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto text-[10px]">
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                          {tr('posAmountSplitStepPerson', '① 손님')}
                        </span>
                        <span className="shrink-0 rounded bg-violet-100/70 px-1.5 py-0.5 font-semibold text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
                          {tr('posAmountSplitStepAmount', '② 금액')}
                        </span>
                        <span className="shrink-0 rounded bg-violet-100/50 px-1.5 py-0.5 font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                          {tr('posAmountSplitStepPay', '③ 일부 결제')}
                        </span>
                      </div>
                      <div
                        className="rounded-xl border-2 border-violet-500/45 bg-gradient-to-b from-violet-100/95 to-background p-2.5 shadow-md ring-2 ring-violet-500/15 dark:from-violet-950/55 dark:to-card"
                        data-tour="pos-tour-dutch-guest-pick"
                      >
                        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 border-b border-violet-400/25 pb-2">
                          <span className="text-sm font-bold tracking-tight text-violet-900 dark:text-violet-50">
                            {tr('posDutchGuestPickSection', '손님 선택')}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {tr('posAmountSplitActivePerson', '결제 대상')}{' '}
                            {tr('posSplitGuestLabel', '{n}명').replace(
                              '{n}',
                              String(amountSplitTargetPersonIndex + 1)
                            )}{' '}
                            ·{' '}
                            {tr('posAmountSplitPersonsPaidProgress', '인원 결제 완료 {done}/{total}')
                              .replace('{done}', String(amountSplitPaidPersonCount))
                              .replace('{total}', String(Math.max(1, splitCount)))}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {amountSplitPersonStatuses.map((person) => {
                          const { idx, due, paid, isPaid, isPayTarget } = person
                          return (
                            <div
                              key={`amount-split-person-${idx}`}
                              className={cn(
                                'min-w-0 overflow-hidden rounded-xl border-2 px-2.5 py-2 text-xs transition-shadow',
                                isPaid
                                  ? 'border-emerald-500/60 bg-emerald-50/80 shadow-sm dark:bg-emerald-950/35'
                                  : isPayTarget
                                    ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/35'
                                    : 'border-border/80 bg-card'
                              )}
                            >
                              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                                <span className="text-sm font-bold whitespace-nowrap">
                                  {tr('posSplitGuestLabel', '{n}명').replace('{n}', String(idx + 1))}
                                </span>
                                {isPaid && (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    {tr('posMenuPersonPaidBadge', '결제 완료')}
                                  </span>
                                )}
                                {isPayTarget && !isPaid && (
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                                    {tr('posAmountSplitActivePerson', '결제 대상')}
                                  </span>
                                )}
                              </div>
                              {renderSplitGuestAmountRows(due, paid, 'posSplitCardShare', '분담', isPaid)}
                              <Button
                                type="button"
                                size="sm"
                                variant={isPayTarget ? 'default' : 'outline'}
                                className="mt-1.5 h-9 w-full text-xs font-semibold"
                              onClick={() => selectAmountSplitTargetPerson(idx)}
                              disabled={isPaid}
                            >
                              {isPaid
                                ? tr('posMenuPersonPaidBadge', '결제 완료')
                                : tr('posSelectPayTarget', '결제하기')}
                            </Button>
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    </div>
                  )}
                  {splitMode === 'menu' && (
                    <div
                      ref={dutchMenuPanelRef}
                      className="w-full space-y-2 rounded-xl border border-violet-400/25 bg-violet-50/40 p-2.5 dark:bg-violet-900/10"
                      data-tour="pos-tour-dutch-menu-panel"
                    >
                      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto text-[10px]">
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                          {tr('posMenuSplitStepMenu', '① 메뉴')}
                        </span>
                        <span className="shrink-0 rounded bg-violet-100/70 px-1.5 py-0.5 font-semibold text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
                          {tr('posMenuSplitStepPerson', '② 손님')}
                        </span>
                        <span className="shrink-0 rounded bg-violet-100/50 px-1.5 py-0.5 font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                          {tr('posMenuSplitStepPay', '③ 일부 결제')}
                        </span>
                        {menuSplitPendingQtyTotal > 0.009 && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            {tr('posMenuSplitPickingQty', '선택 중')}: {formatPosQtyCompact(menuSplitPendingQtyTotal)}
                          </span>
                        )}
                        <span className="shrink-0 text-muted-foreground">
                          {tr('posUnassignedQty', '미배정')}: {formatPosQtyCompact(menuSplitUnassignedQty)}
                        </span>
                      </div>
                      <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border/70 bg-card p-2">
                        {menuSplitItemStatuses.map((line) => {
                          const { item, qtyTotal, pendingQty, assigned, unassigned, holders, settled, awaitingPay, selecting } =
                            line
                          return (
                            <div
                              key={`split-item-${item.id}`}
                              className={cn(
                                'rounded-md border px-2 py-1.5',
                                settled
                                  ? 'border-emerald-500/55 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-950/30'
                                  : awaitingPay
                                    ? 'border-amber-500/45 bg-amber-50/50 dark:border-amber-500/35 dark:bg-amber-950/25'
                                    : selecting
                                      ? 'border-primary/45 bg-primary/5'
                                      : 'border-border/60 bg-card'
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p
                                      className={cn(
                                        'truncate text-xs font-medium',
                                        settled && 'text-emerald-900 dark:text-emerald-100'
                                      )}
                                    >
                                      {trMenuLine(item.name)}
                                    </p>
                                    {settled && (
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                                        {tr('posMenuItemSettledBadge', '결제 완료')}
                                      </span>
                                    )}
                                    {!settled && awaitingPay && (
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                        <Clock3 className="h-3 w-3 shrink-0" />
                                        {tr('posMenuItemAwaitingPayBadge', '결제 대기')}
                                      </span>
                                    )}
                                    {!settled && selecting && (
                                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                                        {tr('posMenuItemSelectingBadge', '선택 중')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {tr('qty', '수량')}: {formatPosQtyCompact(qtyTotal)}
                                    {assigned > 0.009 ? (
                                      <>
                                        {' '}
                                        · {tr('posAssignedQty', '배정')}: {formatPosQtyCompact(assigned)}
                                      </>
                                    ) : null}
                                    {unassigned > 0.009 ? (
                                      <>
                                        {' '}
                                        · {tr('posUnassignedShort', '미배정')}: {formatPosQtyCompact(unassigned)}
                                      </>
                                    ) : null}
                                  </p>
                                  {holders.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {holders.map((h) => {
                                        const holderPaid =
                                          Math.max(0, Number(menuSplitDueByPerson[h.idx] || 0)) > 0.009 &&
                                          Math.max(0, Number(menuSplitRemainingByPerson[h.idx] || 0)) <= 0.009
                                        return (
                                          <button
                                            key={`holder-${item.id}-${h.idx}`}
                                            type="button"
                                            disabled={holderPaid}
                                            onClick={() => selectMenuSplitTargetPerson(h.idx)}
                                            className={cn(
                                              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors',
                                              holderPaid
                                                ? 'cursor-default bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100'
                                                : 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60',
                                              !holderPaid &&
                                                h.idx === menuSplitTargetPersonIndex &&
                                                menuSplitPendingQtyTotal <= 0.009 &&
                                                'ring-2 ring-primary ring-offset-1'
                                            )}
                                          >
                                            {holderPaid ? (
                                              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                            ) : null}
                                            {tr('posMenuAssignedToPerson', '{n}명')
                                              .replace('{n}', String(h.idx + 1))}{' '}
                                            ×{formatPosQtyCompact(h.qty)}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                                {!settled && awaitingPay && unassigned <= 0.009 ? (
                                  <p className="max-w-[7rem] shrink-0 text-right text-[10px] font-medium leading-tight text-muted-foreground">
                                    {tr('posMenuItemTapGuestToPay', '아래 손님에서 결제')}
                                  </p>
                                ) : !settled ? (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-7 p-0"
                                      onClick={() => adjustMenuSplitPendingQty(item.id, -1)}
                                      disabled={pendingQty <= 0}
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                    <span
                                      className={cn(
                                        'w-8 text-center text-xs font-semibold tabular-nums',
                                        pendingQty > 0 ? 'text-primary' : ''
                                      )}
                                    >
                                      {formatPosQtyCompact(pendingQty)}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-7 p-0"
                                      onClick={() => adjustMenuSplitPendingQty(item.id, 1)}
                                      disabled={unassigned <= 0}
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div
                        className="rounded-xl border-2 border-violet-500/45 bg-gradient-to-b from-violet-100/95 to-background p-2.5 shadow-md ring-2 ring-violet-500/15 dark:from-violet-950/55 dark:to-card"
                        data-tour="pos-tour-dutch-guest-pick"
                      >
                        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 border-b border-violet-400/25 pb-2">
                          <span className="text-sm font-bold tracking-tight text-violet-900 dark:text-violet-50">
                            {tr('posDutchGuestPickSection', '손님 선택')}
                          </span>
                          <span className="min-w-0 max-w-[58%] truncate text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {menuSplitPendingQtyTotal > 0.009
                              ? `${tr('posMenuSplitPickingQty', '선택 중')} · ${formatBahtWhole(menuSplitPendingAmount)}`
                              : `${tr('posMenuSplitActivePerson', '결제 대상')} · ${tr('posSplitGuestLabel', '{n}명').replace(
                                  '{n}',
                                  String(menuSplitTargetPersonIndex + 1)
                                )}`}
                            {cartItems.length > 0
                              ? ` · ${tr('posMenuSplitItemsPaidProgress', '메뉴 {done}/{total}')
                                  .replace('{done}', String(menuSplitSettledItemCount))
                                  .replace('{total}', String(cartItems.length))}`
                              : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {Array.from({ length: Math.max(1, splitCount) }).map((_, idx) => {
                          const menuDue = Math.max(0, Number(menuSplitDueByPerson[idx] || 0))
                          const menuRemaining = Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
                          const isMenuPaid = menuDue > 0.009 && menuRemaining <= 0.009
                          const isMenuPayTarget =
                            menuSplitPendingQtyTotal <= 0.009 &&
                            idx === menuSplitTargetPersonIndex &&
                            menuRemaining > 0.009
                          const canAssignPending = menuSplitPendingQtyTotal > 0.009
                          const canSelectForPay =
                            !canAssignPending && menuDue > 0.009 && menuRemaining > 0.009
                          return (
                          <div
                            key={`split-person-${idx}`}
                            className={cn(
                              'min-w-0 overflow-hidden rounded-xl border-2 px-2.5 py-2 text-xs transition-shadow',
                              isMenuPaid
                                ? 'border-emerald-500/60 bg-emerald-50/80 shadow-sm dark:bg-emerald-950/35'
                                : isMenuPayTarget
                                  ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/35'
                                  : 'border-border/80 bg-card'
                            )}
                          >
                            <div className="mb-1.5 flex flex-wrap items-center gap-1">
                              <span className="text-sm font-bold whitespace-nowrap">
                                {tr('posSplitGuestLabel', '{n}명').replace('{n}', String(idx + 1))}
                              </span>
                              {isMenuPaid && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                  {tr('posMenuPersonPaidBadge', '결제 완료')}
                                </span>
                              )}
                              {isMenuPayTarget && !isMenuPaid && menuDue > 0.009 && (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                                  {tr('posAmountSplitActivePerson', '결제 대상')}
                                </span>
                              )}
                            </div>
                            {renderSplitGuestAmountRows(
                              Math.max(0, Number(menuSplitDueByPerson[idx] || 0)),
                              menuSplitPaidByPerson[idx] || 0,
                              'posSplitCardAssign',
                              '배정',
                              isMenuPaid
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                canAssignPending || isMenuPayTarget ? 'default' : 'outline'
                              }
                              className="mt-1.5 h-9 w-full text-xs font-semibold"
                              onClick={() =>
                                canAssignPending
                                  ? commitMenuPendingToPerson(idx)
                                  : selectMenuSplitTargetPerson(idx)
                              }
                              disabled={isMenuPaid || (!canAssignPending && !canSelectForPay)}
                            >
                              {canAssignPending
                                ? tr('posSelectAssignTarget', '선택 후 결제')
                                : tr('posSelectPayTarget', '결제하기')}
                            </Button>
                          </div>
                          )
                        })}
                        </div>
                      </div>
                    </div>
                  )}
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
                  {formatBahtNum(paymentEnteredSum)} ฿{' '}
                  <span className="text-muted-foreground font-medium">/</span>{' '}
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
                    style={{ width: `${Math.min(100, (displayPaymentSum / total) * 100)}%` }}
                  />
                </div>
              )}
              {!paymentSumMatch && total > 0 && (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  {tr('posPaymentRemaining', '남은 금액')}:{' '}
                  {`${formatBahtNum(Math.max(0, total - paymentEnteredSum))} ฿`}
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
                  !splitReadyForComplete || taxInvoiceInvalid
                    ? 'bg-muted text-muted-foreground hover:bg-muted'
                    : 'shadow-md'
                )}
                disabled={!splitReadyForComplete || taxInvoiceInvalid || posBackendActionInFlight || paymentSubmitInFlight}
                onClick={() => void handlePaymentComplete()}
                data-tour="pos-tour-payment-confirm"
              >
                {paymentSubmitInFlight
                  ? t('posPaymentProcessing') || '처리 중…'
                  : t('posPayConfirm') || '결제 완료'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    {!onPostPaymentCashChange && (
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
            <Button
              type="button"
              className="h-12 w-full rounded-xl font-bold sm:max-w-xs"
              onClick={() => setPostPaymentCashChange(null)}
            >
              {t('posConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}

    <PosCouponQrScannerDialog
      open={couponQrScannerOpen}
      onOpenChange={setCouponQrScannerOpen}
      onScan={(raw) => {
        couponQrScannerClosingRef.current = true
        void runCouponScanPayload(raw).finally(() => {
          window.setTimeout(() => {
            couponQrScannerClosingRef.current = false
          }, 400)
        })
      }}
    />
    </>
  )
})
