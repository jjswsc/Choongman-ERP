'use client'

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  type Dispatch,
  type SetStateAction,
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
import { ShoppingCart, Trash2, Tag, Minus, Plus, ChevronDown, ChevronUp, CreditCard, Banknote, QrCode, Wallet, Users, Receipt, Building2, User, Check, X, Pencil } from 'lucide-react'
import type { Store, Table, OrderItem } from '@/lib/pos-types'
import { cn, formatBahtNum } from '@/lib/utils'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/auth-context'
import {
  getMembers,
  getPosTaxInvoiceRecipients,
  upsertPosTaxInvoiceRecipient,
  validatePosCoupon,
  type PosTaxInvoiceRecipientRow,
} from '@/lib/api-client'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { getPosCartSessionKey } from '@/lib/pos-cart-session'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'

export type CartOrderType = 'dine-in' | 'delivery' | 'takeout'
export type CartDeliveryApp = 'grab' | 'lineman' | 'shopee' | (string & {})
type PaymentMethodTab = 'cash' | 'card' | 'qr' | 'other'
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
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

export interface CartPanelHandle {
  addItem: (item: CartPanelAddItemPayload) => void
  clearCart: () => void
  openDineInPaymentFromOrder: (payload: {
    tableName: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => void
  openTakeoutPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => void
  openDeliveryPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => void
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
  /** 홀 주문 전송 (주방 전달) - 부모에서 savePosOrder 호출 후 pendingOrderId 전달 */
  onOrderSubmit?: (payload: {
    items: {
      id: string
      name: string
      price: number
      quantity: number
      note?: string
      orderType?: string
      deliveryAppCode?: string
      promoId?: string
      promoCode?: string
      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
    }[]
    tableName: string
    memo?: string
    discountAmt: number
    discountReason: string
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
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
    orderLabel: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    payment?: Record<string, number>
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }, existingOrderId?: number) => void
  /** 포장 주문 결제 완료 시 (기존 주문에 결제 반영, 테이블과 동일 결제 모달) */
  onTakeoutOrderComplete?: (payload: {
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
    orderLabel: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    payment?: Record<string, number>
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }, existingOrderId?: number) => void
  /** 홀 주문 결제 완료 시. existingOrderId 있으면 해당 주문에 결제만 반영(updatePosOrder) */
  onDineInOrderComplete?: (payload: {
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
    tableName: string
    memo?: string
    discountAmt?: number
    discountReason?: string
    payment?: Record<string, number>
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
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
    memo?: string
    discountAmt?: number
    discountReason?: string
    payment?: Record<string, number>
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
}

type CartItem = OrderItem

const CART_ITEMS_CACHE = new Map<string, CartItem[]>()
const cloneCartItems = (items: CartItem[]): CartItem[] =>
  items.map((i) => ({
    ...i,
    promoItems: i.promoItems ? i.promoItems.map((p) => ({ ...p })) : undefined,
  }))

export const CartPanel = forwardRef<CartPanelHandle, CartPanelProps>(function CartPanel({
  stores,
  currentStoreId,
  selectedTable,
  onStoreChange,
  t: tProp,
  lockOrderType,
  orderType: orderTypeProp,
  deliveryApp: deliveryAppProp,
  deliveryAppName: deliveryAppNameProp,
  deliveryOrderNo: deliveryOrderNoProp,
  takeoutLabel: takeoutLabelProp,
  cartSessionTableId: cartSessionTableIdProp,
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
}, ref) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const scrollIntoViewOnFocus = useScrollIntoViewOnFocus()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  const mapCartItemToOrderPayload = (i: CartItem) => {
    const orderTypeNorm = orderType === 'dine-in' ? 'dine_in' : orderType
    const lineNote = String(i.note ?? '').trim()
    return {
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      orderType: orderTypeNorm,
      ...(lineNote ? { note: lineNote } : {}),
      ...(orderType === 'delivery' && deliveryAppProp ? { deliveryAppCode: String(deliveryAppProp) } : {}),
      ...(i.promoId && i.promoItems
        ? { promoId: i.promoId, promoCode: i.promoCode, promoItems: i.promoItems }
        : {}),
    }
  }

  const [orderTypeInternal, setOrderTypeInternal] = useState<CartOrderType>('dine-in')
  const orderType = lockOrderType && orderTypeProp != null ? orderTypeProp : orderTypeInternal
  const canSubmit =
    !lockOrderType ||
    (orderType === 'dine-in' ? !!selectedTable : orderType === 'delivery' ? !!deliveryAppProp : true)
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
  const [recentMemberIds, setRecentMemberIds] = useState<string[]>([])
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
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [activePaymentTab, setActivePaymentTab] = useState<PaymentMethodTab>('cash')
  const [payCash, setPayCash] = useState('')
  const [payCard, setPayCard] = useState('')
  const [payTrueMoney, setPayTrueMoney] = useState('')
  const [payWeChat, setPayWeChat] = useState('')
  const [payAlipay, setPayAlipay] = useState('')
  const [payPromptPay, setPayPromptPay] = useState('')
  const [payLinePay, setPayLinePay] = useState('')
  const [payShopeePay, setPayShopeePay] = useState('')
  const [payOther, setPayOther] = useState('')
  const [showOtherPayments, setShowOtherPayments] = useState(false)
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
  const [menuNameTooltipOpen, setMenuNameTooltipOpen] = useState<string | null>(null)
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null)
  const [editingCustomerMemo, setEditingCustomerMemo] = useState(false)
  const [paymentTableNameOverride, setPaymentTableNameOverride] = useState<string | null>(null)
  const [isPrepaid, setIsPrepaid] = useState(false)
  const prevSelectedTableIdRef = useRef<string | null>(selectedTable?.id ?? null)
  const instanceIdRef = useRef(`cart-${Math.random().toString(36).slice(2, 10)}`)
  const cartItemsRef = useRef<CartItem[]>(cartItems)
  cartItemsRef.current = cartItems

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
  const discount = discountType === 'percent'
    ? Math.floor((subtotal * discountValue) / 100)
    : discountValue
  const pointUsedNum = Math.max(0, Math.trunc(Number(pointUsed || 0)))
  const pricing = computePosPricing({
    subtotal,
    discountAmt: discount + pointUsedNum,
    cardPaymentAmount: parseFloat(payCard) || 0,
    adjustments: pricingAdjustments,
  })
  const total = pricing.finalTotal
  const dutchUnitAmount = Math.max(0, Math.round((total / Math.max(1, splitCount)) * 100) / 100)
  const dutchRemainingPeople = Math.max(0, splitCount - splitPaidSteps)

  const confirmGuestDirect = () => {
    const v = parseInt(guestDirectValue, 10)
    if (!Number.isNaN(v)) setGuestCount(Math.max(1, Math.min(99, v)))
    setGuestDirectOpen(false)
  }

  const openPaymentModalWithAmount = (amount: number) => {
    if (amount <= 0) return
    setPayCash(String(amount))
    setPayCard('0')
    setPayTrueMoney('0')
    setPayWeChat('0')
    setPayAlipay('0')
    setPayPromptPay('0')
    setPayLinePay('0')
    setPayShopeePay('0')
    setPayOther('0')
    setShowPaymentModal(true)
  }
  const openPaymentModal = () => openPaymentModalWithAmount(total)

  const paymentSum =
    (parseFloat(payCash) || 0) +
    (parseFloat(payCard) || 0) +
    (parseFloat(payTrueMoney) || 0) +
    (parseFloat(payWeChat) || 0) +
    (parseFloat(payAlipay) || 0) +
    (parseFloat(payPromptPay) || 0) +
    (parseFloat(payLinePay) || 0) +
    (parseFloat(payShopeePay) || 0) +
    (parseFloat(payOther) || 0)
  const paymentSumMatch = Math.abs(paymentSum - total) < 0.01
  const DISCOUNT_PRESETS = [10, 15, 20, 50]
  const paymentTabs: { id: PaymentMethodTab; label: string; icon: typeof Banknote }[] = [
    { id: 'cash', label: t('posPaymentCash') || '현금', icon: Banknote },
    { id: 'card', label: t('posPaymentCard') || '카드', icon: CreditCard },
    { id: 'qr', label: tr('posPaymentQrCode', 'QR Code'), icon: QrCode },
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
    setPayCard('0')
    setPayPromptPay('0')
    setPayTrueMoney('0')
    setPayWeChat('0')
    setPayAlipay('0')
    setPayLinePay('0')
    setPayShopeePay('0')
    setPayOther('0')
  }

  const moveAllAmountTo = (target: 'cash' | 'card' | 'qr' | 'other' | 'truemoney' | 'wechat' | 'alipay' | 'linepay' | 'shopeepay') => {
    const st = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const dc = discountType === 'percent' ? Math.floor((st * discountValue) / 100) : discountValue
    const amount = Math.max(0, st - dc - pointUsedNum)
    resetPaymentInputs()
    if (target === 'cash') setPayCash(String(amount))
    if (target === 'card') setPayCard(String(amount))
    if (target === 'qr') setPayPromptPay(String(amount))
    if (target === 'other') setPayOther(String(amount))
    if (target === 'truemoney') setPayTrueMoney(String(amount))
    if (target === 'wechat') setPayWeChat(String(amount))
    if (target === 'alipay') setPayAlipay(String(amount))
    if (target === 'linepay') setPayLinePay(String(amount))
    if (target === 'shopeepay') setPayShopeePay(String(amount))
  }

  type MoveTarget = 'cash' | 'card' | 'qr' | 'other' | 'truemoney' | 'wechat' | 'alipay' | 'linepay' | 'shopeepay'

  /** 탭/라벨 클릭 시: 1인 금액만 해당 수단에 추가 (진행은 분할 결제 버튼에서만 증가) */
  const addDutchAmountOnly = (target: MoveTarget) => {
    const count = Math.max(1, Number(splitCount) || 1)
    const perPerson = dutchUnitAmount
    const currentSum =
      (parseFloat(payCash) || 0) +
      (parseFloat(payCard) || 0) +
      (parseFloat(payPromptPay) || 0) +
      (parseFloat(payTrueMoney) || 0) +
      (parseFloat(payWeChat) || 0) +
      (parseFloat(payAlipay) || 0) +
      (parseFloat(payLinePay) || 0) +
      (parseFloat(payShopeePay) || 0) +
      (parseFloat(payOther) || 0)
    const remain = Math.max(0, total - currentSum)
    const addAmount = splitPaidSteps >= count - 1 ? remain : Math.min(perPerson, remain)
    if (addAmount <= 0) return
    if (target === 'cash') setPayCash((p) => String((parseFloat(p || '0') || 0) + addAmount))
    if (target === 'card') setPayCard((p) => String((parseFloat(p || '0') || 0) + addAmount))
    if (target === 'qr') setPayPromptPay((p) => String((parseFloat(p || '0') || 0) + addAmount))
    if (target === 'other') {
      setShowOtherPayments(true)
      setPayOther((p) => String((parseFloat(p || '0') || 0) + addAmount))
    }
    if (target === 'truemoney') { setShowOtherPayments(true); setPayTrueMoney((p) => String((parseFloat(p || '0') || 0) + addAmount)) }
    if (target === 'wechat') { setShowOtherPayments(true); setPayWeChat((p) => String((parseFloat(p || '0') || 0) + addAmount)) }
    if (target === 'alipay') { setShowOtherPayments(true); setPayAlipay((p) => String((parseFloat(p || '0') || 0) + addAmount)) }
    if (target === 'linepay') { setShowOtherPayments(true); setPayLinePay((p) => String((parseFloat(p || '0') || 0) + addAmount)) }
    if (target === 'shopeepay') { setShowOtherPayments(true); setPayShopeePay((p) => String((parseFloat(p || '0') || 0) + addAmount)) }
  }

  /** 분할 결제 클릭 시: 진행만 누적 (금액은 탭 클릭으로 이미 입력됨) */
  const confirmSplitStep = () => {
    const count = Math.max(1, Number(splitCount) || 1)
    if (splitPaidSteps >= count) return
    setSplitPaidSteps((prev) => Math.min(count, prev + 1))
  }

  useEffect(() => {
    if (!showPaymentModal) return
    setSplitPaidSteps(0)
  }, [showPaymentModal, splitCount, total])

  /** 모달을 닫을 때 더치페이 상태 초기화 (다음 결제 시 전액 자동 입력과 충돌 방지) */
  useEffect(() => {
    if (!showPaymentModal) {
      setShowSplit(false)
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
  }, [showPaymentModal, showSplit, splitCount])

  useEffect(() => {
    if (activePaymentTab !== 'other') {
      setShowOtherPayments(false)
    }
  }, [activePaymentTab])

  // 할인/포인트 변경 시 결제 입력 금액 즉시 반영 (더치페이 모드에서는 건너뜀)
  useEffect(() => {
    if (!showPaymentModal || total <= 0 || showSplit) return
    const st = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const dc = discountType === 'percent' ? Math.floor((st * discountValue) / 100) : discountValue
    const newTotal = computePosPricing({
      subtotal: st,
      discountAmt: dc + pointUsedNum,
      adjustments: pricingAdjustments,
    }).finalTotal
    resetPaymentInputs()
    setPayCash(String(newTotal))
  }, [showPaymentModal, total, discountValue, discountType, pointUsedNum, showSplit, cartItems, pricingAdjustments])

  const buildOrderMemo = (baseMemo: string) => {
    if (!needTaxInvoice) return baseMemo
    const lines = [
      '[TAX_INVOICE]',
      `memberNo=${taxMemberNo.trim()}`,
      `customerType=${invoiceCustomerType}`,
      `name=${normalizedTaxName}`,
      `taxId=${normalizedTaxId}`,
      `branchNo=${effectiveTaxBranchNo}`,
      `phone=${normalizedTaxPhone}`,
      `email=${normalizedTaxEmail}`,
      `address=${normalizedTaxAddress}`,
      `member=${isMemberOrder ? 'Y' : 'N'}`,
    ]
    const taxMemo = lines.join(' | ')
    return baseMemo.trim() ? `${baseMemo.trim()}\n${taxMemo}` : taxMemo
  }

  const submitNonDineOrder = (withPayment: boolean) => {
    if (orderType === 'dine-in') return
    if (!onNonDineOrderComplete) return
    const paymentOtherSum =
      (parseFloat(payTrueMoney) || 0) +
      (parseFloat(payWeChat) || 0) +
      (parseFloat(payAlipay) || 0) +
      (parseFloat(payLinePay) || 0) +
      (parseFloat(payShopeePay) || 0) +
      (parseFloat(payOther) || 0)
    const deliveryLabel = [deliveryAppLabel, deliveryOrderNoProp?.trim() ? `#${deliveryOrderNoProp.trim()}` : '']
      .filter(Boolean)
      .join(' ')
    const selectedMemberNo = memberMap[selectedMemberId]?.memberNo || ''
    onNonDineOrderComplete({
      orderType,
      orderLabel: orderType === 'delivery'
        ? (deliveryLabel || t('posOrderTypeDelivery') || '배달')
        : (takeoutLabelProp?.trim() || (t('posOrderTypeTakeout') || '포장')),
      items: cartItems.map(mapCartItemToOrderPayload),
      memo: buildOrderMemo(customerMemo),
      discountAmt: discount,
      discountReason: discountReason,
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
          }
        : {
            paymentCash: 0,
            paymentCard: 0,
            paymentQr: 0,
            paymentOther: 0,
          },
    })
  }

  const handlePaymentComplete = () => {
    const dineInTableName = selectedTable?.name || paymentTableNameOverride
    const paymentOtherSum =
      (parseFloat(payTrueMoney) || 0) +
      (parseFloat(payWeChat) || 0) +
      (parseFloat(payAlipay) || 0) +
      (parseFloat(payLinePay) || 0) +
      (parseFloat(payShopeePay) || 0) +
      (parseFloat(payOther) || 0)
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
    if (orderType === 'dine-in' && dineInTableName && onDineInOrderComplete) {
      onDineInOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          tableName: dineInTableName,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: discountReason,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
          },
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
    } else if (orderType === 'delivery' && pendingOrderId != null && paymentTableNameOverride && onDeliveryOrderComplete) {
      onDeliveryOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: discountReason,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
          },
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponAppliedCode || undefined,
          couponDiscountAmt: couponAppliedAmt || undefined,
          pointUsed: pointUsedNum || undefined,
        },
        pendingOrderId
      )
    } else if (orderType === 'takeout' && pendingOrderId != null && paymentTableNameOverride && onTakeoutOrderComplete) {
      onTakeoutOrderComplete(
        {
          items: cartItems.map(mapCartItemToOrderPayload),
          orderLabel: paymentTableNameOverride,
          memo: buildOrderMemo(customerMemo),
          discountAmt: discount,
          discountReason: discountReason,
          payment: {
            paymentCash: parseFloat(payCash) || 0,
            paymentCard: parseFloat(payCard) || 0,
            paymentQr: parseFloat(payPromptPay) || 0,
            paymentOther: paymentOtherSum,
          },
          memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
          memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
          couponCode: couponAppliedCode || undefined,
          couponDiscountAmt: couponAppliedAmt || undefined,
          pointUsed: pointUsedNum || undefined,
        },
        pendingOrderId
      )
    } else if (orderType !== 'dine-in' && onNonDineOrderComplete) {
      submitNonDineOrder(true)
    }
    setShowPaymentModal(false)
    handleClearCart()
  }

  const addItem = (item: CartPanelAddItemPayload) => {
    setCartItems((prev) => mergeCartPanelAddItem(prev, item))
  }

  const applyCouponCode = async () => {
    const code = couponCode.trim()
    if (!code) {
      setCouponMessage('쿠폰 코드를 입력해 주세요.')
      return
    }
    try {
      const res = await validatePosCoupon({ code, subtotal })
      if (!res.valid) {
        setCouponAppliedCode('')
        setCouponAppliedAmt(0)
        setCouponMessage(res.message || '유효하지 않은 쿠폰입니다.')
        return
      }
      const amount = Math.max(0, Number(res.discountAmt || 0))
      setDiscountType('fixed')
      setDiscountValue(amount)
      setDiscountReason(String(res.discountReason || `쿠폰: ${code.toUpperCase()}`))
      setCouponAppliedCode(code.toUpperCase())
      setCouponAppliedAmt(amount)
      setCouponMessage(`${code.toUpperCase()} 쿠폰이 적용되었습니다.`)
    } catch (e) {
      console.error('validatePosCoupon:', e)
      setCouponMessage('쿠폰 검증 중 오류가 발생했습니다.')
    }
  }

  const openDineInPaymentFromOrder = (payload: {
    tableName: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.tableName)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    openPaymentModalWithAmount(amount)
  }

  const openTakeoutPaymentFromOrder = (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    openPaymentModalWithAmount(amount)
  }

  const openDeliveryPaymentFromOrder = (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    openPaymentModalWithAmount(amount)
  }

  const handleClearCart = () => {
    setCartItems([])
    setGuestCount(0)
    setCustomerMemo('')
    setCouponCode('')
    setCouponAppliedCode('')
    setCouponAppliedAmt(0)
    setPointUsed('0')
    setCouponMessage('')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(null)
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

  return (
    <>
    <Card className="h-full flex flex-col min-w-0 overflow-hidden">
      <CardHeader className="py-2.5 px-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
            <ShoppingCart className="w-4 h-4" />
            {t('posCart')}
            {cartItems.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {cartItems.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
            {orderType && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ring-1 ring-black/10 dark:ring-white/20',
                  orderType === 'dine-in' && 'bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-50',
                  orderType === 'delivery' && 'bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-50',
                  orderType === 'takeout' && 'bg-amber-500 text-white dark:bg-amber-600 dark:text-amber-50'
                )}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    orderType === 'dine-in' && 'bg-blue-200 dark:bg-blue-300',
                    orderType === 'delivery' && 'bg-emerald-200 dark:bg-emerald-300',
                    orderType === 'takeout' && 'bg-amber-200 dark:bg-amber-300'
                  )}
                />
                {orderType === 'dine-in' ? t('posOrderTypeDineIn') : orderType === 'delivery' ? t('posOrderTypeDelivery') : t('posOrderTypeTakeout')}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleClearCart}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            {t('posClearCart')}
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
                  const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                  const mainName = optMatch ? optMatch[1].trim() : item.name
                  const optionPart = optMatch ? optMatch[2].trim() : null
                  const isBanban = optionPart?.includes(' / ')
                  const [flavor1, flavor2] = isBanban && optionPart ? optionPart.split(/\s*\/\s*/).map((s) => s.trim()) : [null, null]
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
                              title={item.name}
                              onClick={() => setMenuNameTooltipOpen((prev) => (prev === item.id ? null : item.id))}
                            >
                              {mainName}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[min(20rem,85vw)] text-left whitespace-normal">
                            {item.name}
                          </TooltipContent>
                        </Tooltip>
                        {isBanban && flavor1 && flavor2 ? (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            <span>① {flavor1}</span>
                            <span className="mx-1">·</span>
                            <span>② {flavor2}</span>
                          </p>
                        ) : optionPart ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-w-0 break-words" title={optionPart}>
                            {optionPart}
                          </p>
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
        <div className="space-y-1.5 shrink-0 px-3">
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
              <div className="flex items-center gap-1.5 shrink-0">
                <Label className="text-sm whitespace-nowrap">{t('posGuestCount') || '손님'}</Label>
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
                  <SelectTrigger className="w-14 h-8 [&>span]:flex [&>span]:items-center [&>span]:justify-center">
                    <span className="tabular-nums">{guestCount}</span>
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

          {/* 2행: 테이블(테이블현황) / 배달앱+주문번호(배달) / 포장(포장) */}
          {orderType === 'dine-in' && (
            <div className="flex items-center gap-2">
              <Label className="text-sm w-12 flex-shrink-0">{t('posTableLabel')}</Label>
              <Badge variant="secondary" className="h-7 px-3">
                {selectedTable?.name
                  ? translateReceiptTableDisplayName(selectedTable.name, t)
                  : t('posSelectTableNone')}
              </Badge>
            </div>
          )}
          {orderType === 'delivery' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posDeliveryApp')}</Label>
                <Badge variant="secondary" className="h-7 px-3">
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

          {/* 회원 검색 결과 & 비회원 버튼 */}
          <div className="flex flex-wrap gap-1 min-h-[26px] items-center">
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
                      <DialogTitle>{t('posGuestCount') || '손님'} · {t('posGuestDirectInput') || '직접 입력'}</DialogTitle>
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
        <div className="space-y-2 pt-3 border-t shrink-0 px-3" aria-label={t('posCustomerMemo') || '손님 메모'}>
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

        {/* Totals - 여백 유지 */}
        <div className="space-y-1.5 pt-3 border-t px-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('posSubtotal')}</span>
            <span>{formatBahtNum(subtotal)} ฿</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>{t('posDiscount')}</span>
              <span>-{formatBahtNum(discount)} ฿</span>
            </div>
          )}
          {pricing.vatFeeAmt > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('posVatLabel') || '부가세'} ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
              <span>{pricing.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.vatFeeAmt)} ฿</span>
            </div>
          )}
          {pricing.serviceFeeAmt > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('posServiceFee') || '서비스비'} ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
              <span>{pricing.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.serviceFeeAmt)} ฿</span>
            </div>
          )}
          {pricing.cardFeeAmt > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('posCardFee') || '카드비'} ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
              <span>{pricing.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.cardFeeAmt)} ฿</span>
            </div>
          )}
          {pricing.otherFeeAmt > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('posOtherFee') || '기타'} ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
              <span>{pricing.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.otherFeeAmt)} ฿</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>{t('posInputTotal')}</span>
            <span>{formatBahtNum(total)} ฿</span>
          </div>
        </div>

        <div className="px-3 flex gap-2">
          {orderType === 'dine-in' && selectedTable && (
            <Button
              className="w-full h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700"
              disabled={total <= 0 || cartItems.length === 0 || guestCount <= 0}
              onClick={() => {
                if (total <= 0 || !selectedTable || cartItems.length === 0 || guestCount <= 0) return
                onOrderSubmit?.({
                  items: cartItems.map(mapCartItemToOrderPayload),
                  tableName: selectedTable.name,
                  memo: buildOrderMemo(customerMemo),
                  discountAmt: discount,
                  discountReason: discountReason,
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
                disabled={total <= 0 || !canSubmit || cartItems.length === 0}
                onClick={() => {
                  submitNonDineOrder(false)
                  handleClearCart()
                }}
              >
                {t('posOrderButton') || '주문'}
              </Button>
              <Button
                className="h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
                disabled={total <= 0 || !canSubmit}
                onClick={openPaymentModal}
              >
                {t('posPayButton')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
      <DialogContent className="w-[95vw] max-w-lg sm:max-w-xl max-h-[95vh] overflow-y-auto overflow-x-hidden rounded-2xl p-0">
        <DialogHeader className="sticky top-0 z-10 bg-card border-b px-5 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{t('posSplitPayment') || '결제 수단 입력'}</DialogTitle>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => setShowPaymentModal(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>
        {orderType === 'delivery' ? (
          <div className="space-y-4 p-5">
            <div className="rounded-xl border bg-muted/30 px-4 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('posSubtotal')}</span>
                <span className="tabular-nums">{formatBahtNum(subtotal)} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{formatBahtNum(discount)} ฿</span>
                </div>
              )}
              {pricing.vatFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posVatLabel') || '부가세'} ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.vatFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.serviceFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posServiceFee') || '서비스비'} ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.serviceFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.cardFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posCardFee') || '카드비'} ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.cardFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.otherFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posOtherFee') || '기타'} ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.otherFeeAmt)} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posInputTotal') || '결제 금액'}</span>
                <span className="tabular-nums">{formatBahtNum(total)} ฿</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('posDeliveryPaymentNote') || '배달 주문은 플랫폼에서 결제 완료되며, 익일 통장으로 정산됩니다.'}
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  submitNonDineOrder(false)
                  setShowPaymentModal(false)
                  handleClearCart()
                }}
              >
                {t('posConfirm') || '확인'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {/* 결제 금액 요약: 소계 / 쿠폰·할인 / 결제 금액 */}
            <div className="rounded-xl border bg-muted/30 px-4 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('posSubtotal')}</span>
                <span className="tabular-nums">{formatBahtNum(subtotal)} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{formatBahtNum(discount)} ฿</span>
                </div>
              )}
              {pricing.vatFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posVatLabel') || '부가세'} ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.vatFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.serviceFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posServiceFee') || '서비스비'} ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.serviceFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.cardFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posCardFee') || '카드비'} ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.cardFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.otherFeeAmt > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posOtherFee') || '기타'} ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})</span>
                  <span className="tabular-nums">{pricing.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.otherFeeAmt)} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posPaymentTotalLabel') || '결제 금액'}</span>
                <span className="tabular-nums">{formatBahtNum(total)} ฿</span>
              </div>
            </div>

            {/* 쿠폰 · 할인 */}
            <div className="space-y-3 border rounded-xl p-4 bg-card">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">{t('posDiscount')}</Label>
                <div className="grid gap-2">
                  <div className="grid gap-2 lg:grid-cols-[1fr_auto] items-center">
                    <div className="flex gap-2 flex-nowrap overflow-x-auto">
                    {DISCOUNT_PRESETS.map((pct) => (
                      <Button
                        key={pct}
                        type="button"
                        size="default"
                        variant={discountType === 'percent' && discountValue === pct ? 'default' : 'outline'}
                        className="h-10 px-3 min-w-[3.75rem] text-sm font-semibold touch-manipulation"
                        onClick={() => {
                          setDiscountType('percent')
                          setDiscountValue(pct)
                        }}
                      >
                        {pct}%
                      </Button>
                    ))}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Input
                        placeholder={t('posCouponCodePh')}
                        value={couponCode}
                        onChange={e => setCouponCode(e.target.value)}
                        className="h-10 w-28 sm:w-36 text-sm rounded-xl"
                      />
                      <Button variant="secondary" size="sm" className="h-10 px-3 shrink-0 rounded-xl" onClick={applyCouponCode}>
                        {t('posCouponApply')}
                      </Button>
                    </div>
                  </div>
                  {!!couponMessage && (
                    <p className="text-xs text-muted-foreground">{couponMessage}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_7rem_1fr] gap-2">
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
                      placeholder={discountType === 'percent' ? (t('posDiscount') || '할인') + ' %' : (t('posDiscount') || '할인') + ' ฿'}
                      value={discountValue}
                      onChange={e => setDiscountValue(Math.max(0, Number(e.target.value || 0)))}
                      className="h-11 text-sm rounded-xl px-2.5"
                    />
                  <Input
                    placeholder={t('posDiscountReasonPh')}
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    className="h-12 text-base rounded-xl"
                  />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">포인트 사용</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={pointUsed}
                      onChange={(e) => setPointUsed(String(Math.max(0, Math.trunc(Number(e.target.value || 0)))))}
                      className="h-10 text-sm rounded-xl max-w-[10rem]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 결제 수단 탭 */}
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-secondary p-2">
              {paymentTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Button
                    key={tab.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-16 flex-col gap-1 rounded-xl',
                      activePaymentTab === tab.id
                        ? 'bg-card text-card-foreground shadow-sm'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => {
                      setActivePaymentTab(tab.id)
                      if (showSplit) {
                        addDutchAmountOnly(tab.id)
                        if (tab.id === 'other') setShowOtherPayments(true)
                      } else {
                        if (tab.id === 'cash') moveAllAmountTo('cash')
                        if (tab.id === 'card') moveAllAmountTo('card')
                        if (tab.id === 'qr') moveAllAmountTo('qr')
                        if (tab.id === 'other') {
                          setShowOtherPayments(true)
                          moveAllAmountTo('other')
                        }
                      }
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm">{tab.label}</span>
                  </Button>
                )
              })}
            </div>

            {/* 결제 수단 */}
            <div className="grid gap-2">
              {[
                { key: 'cash', value: payCash, set: setPayCash, label: t('posPaymentCash') || '현금' },
                { key: 'card', value: payCard, set: setPayCard, label: t('posPaymentCard') || '카드' },
                { key: 'qr', value: payPromptPay, set: setPayPromptPay, label: `${t('posPaymentQr') || 'QR'} 코드` },
              ]
                .filter(({ key }) => activePaymentTab === 'other' ? false : key === activePaymentTab)
                .map(({ key, value, set, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="w-24 text-sm shrink-0 text-left hover:underline"
                    onClick={() => showSplit ? addDutchAmountOnly(key as MoveTarget) : moveAllAmountTo(key as 'cash' | 'card' | 'qr')}
                  >
                    {label}
                  </button>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="h-12 text-right text-lg flex-1 rounded-xl"
                  />
                  <span className="text-xs text-muted-foreground w-6">฿</span>
                </div>
              ))}

              {activePaymentTab === 'other' && (
                <Collapsible open={showSplit ? true : showOtherPayments} onOpenChange={(v) => { if (!showSplit) setShowOtherPayments(v) }}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between h-9 px-2 text-sm font-medium" type="button">
                      <span>{t('posPaymentOther') || '기타'}</span>
                      {showSplit ? <ChevronUp className="w-4 h-4" /> : (showOtherPayments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-2 pt-1 pl-2 border-l-2 border-muted">
                    {[
                      { value: payTrueMoney, set: setPayTrueMoney, labelKey: 'posPaymentTrueMoney', moveKey: 'truemoney' as const },
                      { value: payWeChat, set: setPayWeChat, labelKey: 'posPaymentWeChat', moveKey: 'wechat' as const },
                      { value: payAlipay, set: setPayAlipay, labelKey: 'posPaymentAlipay', moveKey: 'alipay' as const },
                      { value: payLinePay, set: setPayLinePay, labelKey: 'posPaymentLinePay', moveKey: 'linepay' as const },
                      { value: payShopeePay, set: setPayShopeePay, labelKey: 'posPaymentShopeePay', moveKey: 'shopeepay' as const },
                      { value: payOther, set: setPayOther, labelKey: 'posPaymentOtherEtc', moveKey: 'other' as const },
                    ].map(({ value, set, labelKey, moveKey }) => (
                      <div key={labelKey} className="flex items-center gap-2 rounded-xl border p-3 bg-card">
                        <button
                          type="button"
                          className="w-20 text-xs shrink-0 text-left hover:underline"
                          onClick={() => showSplit ? addDutchAmountOnly(moveKey) : moveAllAmountTo(moveKey)}
                        >
                          {t(labelKey)}
                        </button>
                        {showSplit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 px-2 text-xs"
                            onClick={() => addDutchAmountOnly(moveKey)}
                          >
                            +{formatBahtNum(dutchUnitAmount)} ฿
                          </Button>
                        )}
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={value}
                          onChange={e => set(e.target.value)}
                          className="h-12 text-right flex-1 text-lg rounded-xl"
                        />
                        <span className="text-xs text-muted-foreground w-5">฿</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {/* Tax Invoice */}
            <Collapsible open={showTaxInvoiceDetails} onOpenChange={setShowTaxInvoiceDetails}>
              <div className="space-y-2 border rounded-xl p-3 bg-card min-h-[72px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    <Label className="text-sm font-medium">{t('posReceiptTaxInvoice')}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant={needTaxInvoice ? 'default' : 'outline'}
                      className="h-8"
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
                    <div className="grid gap-2 pt-1">
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
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={taxBranchRequired ? t('posTaxBranchFiveCompany') : t('posTaxBranchFivePerson')}
                      value={taxBranchNo}
                      onChange={(e) => setTaxBranchNo(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      inputMode="numeric"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={t('posTaxPhonePlaceholder')}
                      value={taxPhone}
                      onChange={(e) => setTaxPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      inputMode="numeric"
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
            <Collapsible open={showSplit} onOpenChange={setShowSplit}>
              <div className="border rounded-xl p-2 bg-card w-fit">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 justify-between rounded-lg px-3 shrink-0"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary shrink-0" />
                      <span>{tr('posDutchPayTitle', '더치페이 (분할결제)')}</span>
                    </span>
                    {showSplit ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-muted-foreground">{tr('posSplitPeople', '인원')}</span>
                    <Input
                      type="number"
                      min={1}
                      value={splitCount}
                      onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value || 1)))}
                      className="h-11 w-14 rounded-lg text-center text-base shrink-0"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 min-h-11 px-2 rounded-lg bg-primary/5">
                    <span className="text-sm">{tr('posPerPersonAmount', '1인 금액')}</span>
                    <span className="font-semibold tabular-nums">{formatBahtNum(dutchUnitAmount)}฿</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 min-h-11 px-2 rounded-lg bg-primary/5 text-sm">
                    <span>{tr('posProgress', '진행')} <span className="font-semibold tabular-nums">{splitPaidSteps}/{Math.max(1, splitCount)}{tr('posPeopleUnit', '명')}</span></span>
                    <span className="font-semibold tabular-nums text-muted-foreground">{formatBahtNum(paymentSum)}/{formatBahtNum(total)}฿</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 px-4 font-semibold rounded-lg shrink-0"
                    disabled={dutchRemainingPeople <= 0}
                    onClick={confirmSplitStep}
                  >
                    {tr('posSplitPayButton', '분할 결제')} +1
                  </Button>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {orderType === 'dine-in' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrepaid}
                  onChange={(e) => setIsPrepaid(e.target.checked)}
                  className="rounded border-input h-4 w-4"
                />
                <span>{tr('posPrepaidKeepTable', '선불 (결제 후 테이블 유지)')}</span>
              </label>
            )}
            <div className={cn(
              'rounded-lg px-3 py-2 text-sm flex justify-between',
              paymentSumMatch ? 'bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
            )}>
              <span>{t('posPaymentSum') || '입력 합계'}</span>
              <span className="tabular-nums font-medium">{formatBahtNum(paymentSum)} ฿</span>
            </div>
            {!paymentSumMatch && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('posPaymentSumMismatch') || '결제 합계가 주문 금액과 일치해야 합니다.'}</p>
            )}
            <DialogFooter className="sticky bottom-0 border-t bg-card px-5 py-4 mt-3">
              <Button
                variant="secondary"
                className="h-14 px-8 rounded-xl"
                onClick={() => setShowPaymentModal(false)}
              >
                {t('posCancel') || '취소'}
              </Button>
              <Button
                className={cn(
                  'h-14 px-10 rounded-xl font-bold',
                  !paymentSumMatch || taxInvoiceInvalid || (showSplit && splitPaidSteps < Math.max(1, splitCount))
                    ? 'bg-muted text-muted-foreground hover:bg-muted'
                    : ''
                )}
                disabled={!paymentSumMatch || taxInvoiceInvalid || (showSplit && splitPaidSteps < Math.max(1, splitCount))}
                onClick={handlePaymentComplete}
              >
                {t('posPayConfirm') || '결제 완료'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
})
