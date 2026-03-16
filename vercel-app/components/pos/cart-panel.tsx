'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { ShoppingCart, Trash2, Tag, Minus, Plus, ChevronDown, ChevronUp, CreditCard, Banknote, QrCode, Wallet, Users, Receipt, Building2, User, Check, X } from 'lucide-react'
import type { Store, Table, OrderItem } from '@/lib/pos-types'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { getMembers, validatePosCoupon } from '@/lib/api-client'

export type CartOrderType = 'dine-in' | 'delivery' | 'takeout'
export type CartDeliveryApp = 'grab' | 'lineman' | 'shopee' | (string & {})
type PaymentMethodTab = 'cash' | 'card' | 'qr' | 'other'
type TaxSearchField = 'memberNo' | 'phone' | 'name'
type TaxInvoiceProfile = {
  type: 'individual' | 'corporate'
  name: string
  taxId: string
  branchCode: string
  phone: string
  email: string
  address: string
}

export interface CartPanelHandle {
  addItem: (item: { id: string; name: string; price: number }) => void
  clearCart: () => void
  openDineInPaymentFromOrder: (payload: {
    tableName: string
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => void
  openTakeoutPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => void
  openDeliveryPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number }[]
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
  /** 홀 주문 전송 (주방 전달) - 부모에서 savePosOrder 호출 후 pendingOrderId 전달 */
  onOrderSubmit?: (payload: {
    items: { id: string; name: string; price: number; quantity: number }[]
    tableName: string
    memo?: string
    discountAmt: number
    discountReason: string
    memberId?: number
    memberNo?: string
    couponCode?: string
    couponDiscountAmt?: number
    pointUsed?: number
  }) => void
  /** 포장 주문 결제 완료 시 (기존 주문에 결제 반영, 테이블과 동일 결제 모달) */
  onDeliveryOrderComplete?: (payload: {
    items: { id: string; name: string; price: number; quantity: number }[]
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
    items: { id: string; name: string; price: number; quantity: number }[]
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
    items: { id: string; name: string; price: number; quantity: number }[]
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
  }, existingOrderId?: number) => void
  /** 배달/포장 주문 결제 완료 시 */
  onNonDineOrderComplete?: (payload: {
    orderType: 'delivery' | 'takeout'
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number }[]
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
}

interface CartItem extends OrderItem {
  note?: string
}

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
  onOrderSubmit,
  onTakeoutOrderComplete,
  onDeliveryOrderComplete,
  onDineInOrderComplete,
  onNonDineOrderComplete,
  pendingOrderId,
}, ref) {
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const [orderTypeInternal, setOrderTypeInternal] = useState<CartOrderType>('dine-in')
  const orderType = lockOrderType && orderTypeProp != null ? orderTypeProp : orderTypeInternal
  const canSubmit =
    !lockOrderType ||
    (orderType === 'dine-in' ? !!selectedTable : orderType === 'delivery' ? !!deliveryAppProp : true)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
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
  const [paymentTableNameOverride, setPaymentTableNameOverride] = useState<string | null>(null)
  const [isPrepaid, setIsPrepaid] = useState(false)
  const prevSelectedTableIdRef = useRef<string | null>(selectedTable?.id ?? null)

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
  const total = Math.max(0, subtotal - discount - pointUsedNum)
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

  const applyTaxProfile = (memberNo: string, profile: TaxInvoiceProfile) => {
    setTaxMemberNo(memberNo)
    setInvoiceCustomerType(profile.type === 'corporate' ? 'company' : 'person')
    setTaxName(profile.name || '')
    setTaxId(profile.taxId || '')
    setTaxBranchNo(profile.branchCode || '')
    setTaxPhone(profile.phone || '')
    setTaxEmail(profile.email || '')
    setTaxAddress(profile.address || '')
  }

  const handleTaxProfileSearch = () => {
    const keyword = taxSearchKeyword.trim()
    if (!keyword) {
      setTaxSearchMessage('검색어를 입력해 주세요.')
      return
    }
    const entries = Object.entries(taxMemberRegistry)
    let found: [string, TaxInvoiceProfile] | undefined
    if (taxSearchField === 'memberNo') {
      found = entries.find(([memberNo]) => memberNo === keyword)
    } else if (taxSearchField === 'phone') {
      const k = keyword.replace(/\D/g, '')
      found = entries.find(([, profile]) => String(profile.phone || '').replace(/\D/g, '').includes(k))
    } else {
      const k = keyword.toLowerCase()
      found = entries.find(([, profile]) => String(profile.name || '').toLowerCase().includes(k))
    }
    if (!found) {
      setTaxSearchMessage('일치하는 회원 데이터가 없습니다.')
      return
    }
    applyTaxProfile(found[0], found[1])
    setTaxSearchMessage(`회원번호 ${found[0]} 데이터를 불러왔습니다.`)
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
    const newTotal = Math.max(0, st - dc - pointUsedNum)
    resetPaymentInputs()
    setPayCash(String(newTotal))
  }, [showPaymentModal, total, discountValue, discountType, pointUsed, showSplit])

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
      items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
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
    if (needTaxInvoice && taxMemberNo.trim()) {
      setTaxMemberRegistry((prev) => ({
        ...prev,
        [taxMemberNo.trim()]: {
          type: invoiceCustomerType === 'company' ? 'corporate' : 'individual',
          name: normalizedTaxName,
          taxId: normalizedTaxId,
          branchCode: effectiveTaxBranchNo,
          phone: normalizedTaxPhone,
          email: normalizedTaxEmail,
          address: normalizedTaxAddress,
        },
      }))
    }
    if (orderType === 'dine-in' && dineInTableName && onDineInOrderComplete) {
      onDineInOrderComplete(
        {
          items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
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
        },
        pendingOrderId ?? undefined
      )
    } else if (orderType === 'delivery' && pendingOrderId != null && paymentTableNameOverride && onDeliveryOrderComplete) {
      onDeliveryOrderComplete(
        {
          items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
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
          items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
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

  const addItem = (item: { id: string; name: string; price: number }) => {
    const lineId = `cart-${Date.now()}-${item.id}`
    setCartItems(prev => {
      const existing = prev.find(p => p.name === item.name && p.price === item.price)
      if (existing) {
        return prev.map(p => p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p)
      }
      return [...prev, { ...item, id: lineId, quantity: 1 }]
    })
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
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
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
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
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
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.orderLabel)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    openPaymentModalWithAmount(amount)
  }

  useImperativeHandle(ref, () => ({ addItem, clearCart: handleClearCart, openDineInPaymentFromOrder, openTakeoutPaymentFromOrder, openDeliveryPaymentFromOrder }), [])

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

    // 테이블을 다른 것으로 바꿨을 때만 장바구니/입력값 초기화
    if (prevTableId && nextTableId && prevTableId !== nextTableId) {
      handleClearCart()
    }

    prevSelectedTableIdRef.current = nextTableId
  }, [orderType, selectedTable?.id])

  return (
    <>
    <Card className="h-full flex flex-col min-w-0 overflow-hidden">
      <CardHeader className="py-2.5 px-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
            <ShoppingCart className="w-4 h-4" />
            {t('posCart')}
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

      <CardContent className="flex-1 flex flex-col py-2 gap-1.5 min-h-0 overflow-hidden px-0">
        {/* 주문 타입 */}
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
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={t('posMemberSearchPh') || '회원번호/이름/번호'}
              value={memberKeyword}
              onChange={(e) => setMemberKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleMemberSearch())}
              className="h-8 flex-1 min-w-[8rem] max-w-[12rem]"
            />
            <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={handleMemberSearch} disabled={membersLoading}>
              {membersLoading ? '...' : (t('posSearch') || '검색')}
            </Button>
            {orderType === 'dine-in' && (
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posGuestCount') || '손님'}</Label>
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
                {selectedTable?.name || t('posSelectTableNone')}
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

        {/* Cart Items - 메뉴 리스트 영역 최대 확보 (좌우 여백 없이 끝까지 사용) */}
        <ScrollArea className="flex-1 min-h-0 min-w-0 w-full overflow-x-hidden [&>[data-radix-scroll-area-viewport]]:max-w-full">
          {cartItems.length === 0 ? (
            <div className="h-full min-h-[120px] flex items-center justify-center text-muted-foreground text-sm px-3">
              {t('posCartEmpty')}
            </div>
          ) : (
            <TooltipProvider delayDuration={0}>
              <div className="space-y-1.5 w-full max-w-full min-w-0 overflow-hidden">
                {cartItems.map(item => {
                  const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                  const mainName = optMatch ? optMatch[1].trim() : item.name
                  const optionPart = optMatch ? optMatch[2].trim() : null
                  return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] gap-2 items-start py-1.5 px-2 bg-secondary/50 w-full min-w-0 max-w-full"
                  >
                    <div className="min-w-0 overflow-hidden">
                      <Tooltip
                        open={menuNameTooltipOpen === item.id}
                        onOpenChange={(open) => setMenuNameTooltipOpen(open ? item.id : null)}
                      >
                        <TooltipTrigger asChild>
                          <p
                            className="text-sm font-medium truncate cursor-default touch-manipulation select-none"
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
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                        {optionPart && <span className="truncate">{optionPart}</span>}
                        <span className="tabular-nums shrink-0">{item.price.toLocaleString()} ฿</span>
                      </p>
                    </div>
                  <div className="flex items-center gap-0.5 w-[5.5rem] shrink-0 justify-end">
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
                  )
                })}
              </div>
            </TooltipProvider>
          )}
        </ScrollArea>

        {/* Options - 쿠폰/할인은 결제 페이지에서 입력 */}
        <div className="space-y-2 pt-3 border-t shrink-0 px-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">{t('posCustomerMemo')}</Label>
            <Input
              placeholder={t('posCustomerMemoPh')}
              value={customerMemo}
              onChange={e => setCustomerMemo(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Totals - 여백 유지 */}
        <div className="space-y-1.5 pt-3 border-t px-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('posSubtotal')}</span>
            <span>{subtotal.toLocaleString()} ฿</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>{t('posDiscount')}</span>
              <span>-{discount.toLocaleString()} ฿</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>{t('posInputTotal')}</span>
            <span>{total.toLocaleString()} ฿</span>
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
                  items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
                  tableName: selectedTable.name,
                  memo: buildOrderMemo(customerMemo),
                  discountAmt: discount,
                  discountReason: discountReason,
                  memberId: selectedMemberId ? Number(selectedMemberId) : undefined,
                  memberNo: memberMap[selectedMemberId]?.memberNo || undefined,
                  couponCode: couponAppliedCode || undefined,
                  couponDiscountAmt: couponAppliedAmt || undefined,
                  pointUsed: pointUsedNum || undefined,
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
                <span className="tabular-nums">{subtotal.toLocaleString()} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{discount.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posInputTotal') || '결제 금액'}</span>
                <span className="tabular-nums">{total.toLocaleString()} ฿</span>
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
                <span className="tabular-nums">{subtotal.toLocaleString()} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{discount.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posPaymentTotalLabel') || '결제 금액'}</span>
                <span className="tabular-nums">{total.toLocaleString()} ฿</span>
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
                            +{dutchUnitAmount.toLocaleString()} ฿
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
                    <Label className="text-sm font-medium">Tax Invoice</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant={needTaxInvoice ? 'default' : 'outline'}
                      className="h-8"
                      onClick={() => setNeedTaxInvoice((v) => !v)}
                    >
                      {needTaxInvoice ? (t('posConfirm') || '사용') : (t('posOrderButton') || '사용 안함')}
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
                      개인
                    </Button>
                    <Button
                      type="button"
                      size="default"
                      variant={invoiceCustomerType === 'company' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      onClick={() => setInvoiceCustomerType('company')}
                    >
                      <Building2 className="h-4 w-4 mr-1.5" />
                      법인
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
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={taxSearchField === 'memberNo' ? (t('posMemberNoInputPh') || '회원번호 입력') : taxSearchField === 'phone' ? (t('posPhoneInputPh') || '전화번호 입력') : (t('posNameInputPh') || '이름 입력')}
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
                        회원 선택됨: 등록 정보 자동 반영
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
                    <Input className="h-12 rounded-xl" placeholder="수취인명 / 회사명*" value={taxName} onChange={(e) => setTaxName(e.target.value)} />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder="Tax ID 13자리*"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                      inputMode="numeric"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder={`지점번호 5자리${taxBranchRequired ? '*' : ' (개인: 00000)'}`}
                      value={taxBranchNo}
                      onChange={(e) => setTaxBranchNo(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      inputMode="numeric"
                    />
                    <Input
                      className="h-12 rounded-xl"
                      placeholder="전화번호 9~10자리*"
                      value={taxPhone}
                      onChange={(e) => setTaxPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      inputMode="numeric"
                    />
                    <Input className="h-12 rounded-xl" placeholder="이메일 (선택)" value={taxEmail} onChange={(e) => setTaxEmail(e.target.value)} />
                    <Input className="h-12 rounded-xl" placeholder="주소" value={taxAddress} onChange={(e) => setTaxAddress(e.target.value)} />
                  </div>
                  {taxInvoiceInvalid && (
                    <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 space-y-0.5">
                      <p>Tax Invoice 필수/형식 확인이 필요합니다.</p>
                      {taxInvoiceValidationErrors.includes('name') && <p>- 이름/회사명을 입력해 주세요.</p>}
                      {taxInvoiceValidationErrors.includes('taxId') && <p>- Tax ID는 숫자 13자리여야 합니다.</p>}
                      {taxInvoiceValidationErrors.includes('branch') && <p>- 지점번호는 숫자 5자리여야 합니다.</p>}
                      {taxInvoiceValidationErrors.includes('phone') && <p>- 전화번호는 숫자 9~10자리여야 합니다.</p>}
                      {taxInvoiceValidationErrors.includes('address') && <p>- 주소를 입력해 주세요.</p>}
                      {taxInvoiceValidationErrors.includes('email') && <p>- 이메일 형식이 올바르지 않습니다.</p>}
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
                    onClick={() => {
                      if (!showSplit) {
                        resetPaymentInputs()
                        setSplitPaidSteps(0)
                      }
                    }}
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
                    <span className="font-semibold tabular-nums">{dutchUnitAmount.toLocaleString()}฿</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 min-h-11 px-2 rounded-lg bg-primary/5 text-sm">
                    <span>{tr('posProgress', '진행')} <span className="font-semibold tabular-nums">{splitPaidSteps}/{Math.max(1, splitCount)}{tr('posPeopleUnit', '명')}</span></span>
                    <span className="font-semibold tabular-nums text-muted-foreground">{paymentSum.toLocaleString()}/{total.toLocaleString()}฿</span>
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
              <span className="tabular-nums font-medium">{paymentSum.toLocaleString()} ฿</span>
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
