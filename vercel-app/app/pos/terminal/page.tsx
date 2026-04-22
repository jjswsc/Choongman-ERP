'use client'
import { appAlert } from "@/lib/app-message"

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { TableFloorView } from '@/components/pos/table-floor-view'
import { TableOrderPanel } from '@/components/pos/table-order-panel'
import { DeliveryOrderPanel } from '@/components/pos/delivery-order-panel'
import { TakeoutOrderPanel } from '@/components/pos/takeout-order-panel'
import { OrderBarList, type OrderBarItem } from '@/components/pos/order-bar-list'
import { PosTerminalMenuScreen } from '@/components/pos/pos-terminal-menu-screen'
import {
  CartPanel,
  type CartPanelHandle,
  type CartPanelAddItemPayload,
  type CartPanelPaymentPayload,
  type CartPanelBeforePaymentReceiptPayload,
} from '@/components/pos/cart-panel'
import { LiveMenuSearchDialog } from '@/components/pos/live-menu-search-dialog'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { LayoutGrid, Bike, Package, Search } from 'lucide-react'
import {
  getMembers,
  getPosMenus,
  getPosOrders,
  getPosPrinterSettings,
  getPosTodaySales,
  getPosDeliveryApps,
  executeLinkposPayment,
  updatePosOrder,
  updatePosOrderStatus,
  type PosMenu,
  type PosDeliveryApp,
  type LinkposPaymentSummary,
  type PosOrder,
  type PosPrinterSettings,
} from '@/lib/api-client'
import { mergeQueuedSavePosOrderByLocalOrderNo, savePosOrderWithOffline } from '@/lib/offline'
import { consumeSuppressMainPosAutoPrintForQueuedSync } from '@/lib/offline/pos-queued-sync-print-suppress'
import { usePosMenusCatalogLiveRefresh } from '@/lib/offline/use-pos-menus-catalog-live-refresh'
import { cartLinesToPosOrderItems } from '@/lib/pos-order-item-map'
import { resolveDineInCloseStatus } from '@/lib/pos-dine-in-order-domain'
import { isPosTableOrderEnabledStore } from '@/lib/pos-table-order-access'
import { OfflineBanner } from '@/components/offline-banner'
import { PosReceiptModal, type ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { DeliveryEditOrderNoDialog } from '@/components/pos/delivery-edit-order-no-dialog'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import type { Order, OrderItem } from '@/lib/pos-types'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'
import { buildPosTaxInvoiceThermalHtml, parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { formatBahtNum, escapeHtml, cn } from '@/lib/utils'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import { formatPosReceiptOrderNoDisplay } from '@/lib/pos-delivery-platform'
import { filterKitchenCartLinesForDineInAdd } from '@/lib/pos-kitchen-dine-in-delta'
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from '@/lib/pos-kitchen-slip-routing'
import {
  printPosHtmlDocument,
  POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import {
  isPosOrderPaidLikeStatus,
  posOrderPaymentSum,
  posOrderRowPaymentSum,
  receiptModalDataFromPosOrderForPayment,
} from '@/lib/pos-payment-receipt-from-order'
import { subscribePosOrdersInsert, subscribePosOrdersUpdate } from '@/lib/supabase-client'
import { openPosCashDrawer } from '@/lib/pos-cash-drawer'
import {
  publishPosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from '@/lib/pos-customer-display-state'

function buildCustomerDisplayPaymentLines(
  draft: CartPanelPaymentPayload | null,
  t: (k: string) => string
): { label: string; amount: number }[] {
  if (!draft) return []
  const lines: { label: string; amount: number }[] = []
  if (draft.paymentCash > 0) lines.push({ label: t('posPaymentCash') || '현금', amount: draft.paymentCash })
  if (draft.paymentCard > 0) lines.push({ label: t('posPaymentCard') || '카드', amount: draft.paymentCard })
  if (draft.paymentQr > 0) lines.push({ label: t('posPaymentQrCode') || 'QR', amount: draft.paymentQr })
  if (draft.paymentOther > 0) lines.push({ label: t('posPaymentOther') || '기타', amount: draft.paymentOther })
  if ((draft.paymentDeliveryApp || 0) > 0) {
    const ch = draft.deliveryPaymentChannel ? String(draft.deliveryPaymentChannel) : ''
    lines.push({
      label: ch
        ? `${t('posPaymentDeliveryApp') || '배달앱'} (${ch})`
        : t('posPaymentDeliveryApp') || '배달앱',
      amount: draft.paymentDeliveryApp || 0,
    })
  }
  return lines
}

/** Supabase Realtime INSERT 페이로드의 id는 number가 아닐 수 있음(bigint 등 → 문자열) */
function coercePosOrderIdFromRealtime(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.trunc(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10)
    return n > 0 ? n : null
  }
  return null
}

/** 배달앱 코드 (API에서 동적 로드 가능) */
export type DeliveryApp = string
type TakeoutMode = 'slot' | 'member'
type PendingPayRequest = {
  tableName: string
  items: { id: string; name: string; price: number; quantity: number; note?: string }[]
  /** 기존 주문 결제 시 영수증용 */
  orderNo?: string
} | null

/** 테이블 현황 + 배달/포장 주문 + 장바구니. 테이블 선택 시 메뉴로 주문 추가. */
const FLOOR_PREF_KEY = 'pos-terminal-floor:'

export default function PosTerminalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type') ?? 'dine_in'
  const orderType = useMemo(() => {
    if (typeParam === 'takeout') return 'takeout' as const
    if (typeParam === 'delivery') return 'delivery' as const
    return 'dine-in' as const
  }, [typeParam])

  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const cartRef = useRef<CartPanelHandle>(null)
  const [terminalCartLines, setTerminalCartLines] = useState<OrderItem[]>([])
  const bindCartImperative = useCallback((api: CartPanelHandle | null) => {
    cartRef.current = api
  }, [])

  const clearCartFromTerminal = useCallback(() => {
    setTerminalCartLines([])
    cartRef.current?.clearCart()
  }, [])
  const {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    setCurrentStoreId,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    refetchStores,
    clearTableOrder,
    loadingTables,
  } = usePosStore()

  /** 오프라인 큐 적재 시 별도 확인 팝업 없음 — 상단 OfflineBanner가 대기 건수·동기화를 안내 */
  const notifyQueuedSave = useCallback(async (_orderNo?: string, _queued?: boolean) => {}, [])

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  const [activeFloor, setActiveFloor] = useState<1 | 2 | 3>(1)
  const [deliveryApp, setDeliveryApp] = useState<DeliveryApp | null>(null)
  const [deliveryOrderNo, setDeliveryOrderNo] = useState('')
  const [takeoutMode, setTakeoutMode] = useState<TakeoutMode>('slot')
  const [takeoutSlot, setTakeoutSlot] = useState('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [takeoutMemberNames, setTakeoutMemberNames] = useState<string[]>([])
  const [selectedDeliveryTargetId, setSelectedDeliveryTargetId] = useState<string | null>(null)
  const [selectedDeliveryTargetLabel, setSelectedDeliveryTargetLabel] = useState<string>('')
  const [selectedTakeoutTargetId, setSelectedTakeoutTargetId] = useState<string | null>(null)
  const [selectedTakeoutTargetLabel, setSelectedTakeoutTargetLabel] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'takeout'>(
    orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
  )
  const [pendingDineInOrderId, setPendingDineInOrderId] = useState<number | null>(null)
  const [pendingPayRequest, setPendingPayRequest] = useState<PendingPayRequest>(null)
  const [pendingTakeoutOrderId, setPendingTakeoutOrderId] = useState<number | null>(null)
  const [pendingTakeoutPayRequest, setPendingTakeoutPayRequest] = useState<PendingPayRequest>(null)
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<number | null>(null)
  const [pendingDeliveryPayRequest, setPendingDeliveryPayRequest] = useState<PendingPayRequest>(null)
  const [liveSearchOpen, setLiveSearchOpen] = useState(false)
  const [deliveryEditOrderNoOpen, setDeliveryEditOrderNoOpen] = useState(false)
  const [deliveryEditOrderNoValue, setDeliveryEditOrderNoValue] = useState('')
  const [deliveryListMode, setDeliveryListMode] = useState<'in_progress' | 'completed' | 'all'>('in_progress')
  const [takeoutListMode, setTakeoutListMode] = useState<'in_progress' | 'completed' | 'all'>('in_progress')
  const [tableListMode, setTableListMode] = useState<'in_progress' | 'completed' | 'all'>('all')
  const [deliveryAppsFromApi, setDeliveryAppsFromApi] = useState<PosDeliveryApp[]>([])
  const [menus, setMenus] = useState<PosMenu[]>([])
  const [receiptData, setReceiptData] = useState<ReceiptModalData | null>(null)
  const [autoPrintReceiptOnOrder, setAutoPrintReceiptOnOrder] = useState(false)
  const [autoPrintReceiptOnAddOrder, setAutoPrintReceiptOnAddOrder] = useState(false)
  const [autoPrintReceiptOnPayment, setAutoPrintReceiptOnPayment] = useState(false)
  const [autoPrintKitchenSlipOnOrder, setAutoPrintKitchenSlipOnOrder] = useState(false)
  const [autoPrintFinalOrderBeforePayment, setAutoPrintFinalOrderBeforePayment] = useState(false)
  const [receiptBizName, setReceiptBizName] = useState('')
  const [receiptBizTaxId, setReceiptBizTaxId] = useState('')
  const [receiptBizAbn, setReceiptBizAbn] = useState('')
  const [receiptBizOwner, setReceiptBizOwner] = useState('')
  const [receiptBizAddress, setReceiptBizAddress] = useState('')
  const [receiptBizPhone, setReceiptBizPhone] = useState('')
  const [receiptDesignStyle, setReceiptDesignStyle] = useState<'badge' | 'simple'>('badge')
  const [receiptLogoSize, setReceiptLogoSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [receiptShowTitle, setReceiptShowTitle] = useState(true)
  const [receiptShowPaidStamp, setReceiptShowPaidStamp] = useState(true)
  const [receiptShowThankYou, setReceiptShowThankYou] = useState(true)
  const [receiptShowCustomerCopy, setReceiptShowCustomerCopy] = useState(true)
  const [receiptFooterPrimaryText, setReceiptFooterPrimaryText] = useState('')
  const [receiptFooterSecondaryText, setReceiptFooterSecondaryText] = useState('')
  const [receiptLogoImageUrl, setReceiptLogoImageUrl] = useState('')
  const [receiptStampImageUrl, setReceiptStampImageUrl] = useState('')
  const [receiptShowStamp, setReceiptShowStamp] = useState(true)
  const [receiptStampOnlyTaxInvoice, setReceiptStampOnlyTaxInvoice] = useState(true)
  const [receiptMembershipQrImageUrl, setReceiptMembershipQrImageUrl] = useState('')
  const [receiptMembershipQrLinkUrl, setReceiptMembershipQrLinkUrl] = useState('')
  const [receiptMembershipQrText, setReceiptMembershipQrText] = useState('')
  const [receiptShowMembershipQr, setReceiptShowMembershipQr] = useState(false)
  const [signatureLine, setSignatureLine] = useState(false)
  const [receiptBarcode, setReceiptBarcode] = useState(false)
  const [itemBarcode, setItemBarcode] = useState(false)
  const [cardAutoOpen, setCardAutoOpen] = useState(false)
  const [checkAutoOpen, setCheckAutoOpen] = useState(false)
  const [drawerOpenOption, setDrawerOpenOption] = useState<'password_and_reason' | 'reason_only' | 'force'>('reason_only')
  const [receiptPrintLang, setReceiptPrintLang] = useState<string>('')
  const validPrintLangs = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']
  const printLang = receiptPrintLang && validPrintLangs.includes(receiptPrintLang) ? receiptPrintLang : lang
  const tPrint = useT(printLang)
  const [vatRate, setVatRate] = useState(7)
  const [vatMode, setVatMode] = useState<'included' | 'separate'>('included')
  const [serviceRate, setServiceRate] = useState(0)
  const [serviceMode, setServiceMode] = useState<'included' | 'separate'>('separate')
  const [cardRate, setCardRate] = useState(0)
  const [cardMode, setCardMode] = useState<'included' | 'separate'>('separate')
  const [cardBaseMode, setCardBaseMode] = useState<'card_only' | 'card_plus_vat' | 'card_plus_vat_service'>('card_only')
  const [otherRate, setOtherRate] = useState(0)
  const [otherMode, setOtherMode] = useState<'included' | 'separate'>('separate')
  const [dualMonitorEnabled, setDualMonitorEnabled] = useState(false)
  const [customerDisplayAutoOpen, setCustomerDisplayAutoOpen] = useState(true)
  const [customerDisplayMonitorPreference, setCustomerDisplayMonitorPreference] = useState<'secondary-first' | 'primary-only'>('secondary-first')
  const [customerDisplayDefaultState, setCustomerDisplayDefaultState] = useState<'idle' | 'qr'>('idle')
  const [customerDisplayIdleMessage, setCustomerDisplayIdleMessage] = useState('')
  const [customerDisplayPaymentMessage, setCustomerDisplayPaymentMessage] = useState('')
  const [customerDisplayQrPayload, setCustomerDisplayQrPayload] = useState('')
  const [customerDisplayShowOrderSummary, setCustomerDisplayShowOrderSummary] = useState(true)
  const [customerDisplayShowOrderTotal, setCustomerDisplayShowOrderTotal] = useState(true)
  const [customerDisplayIdleMediaType, setCustomerDisplayIdleMediaType] = useState<'none' | 'image' | 'video'>('none')
  const [customerDisplayIdleMediaUrl, setCustomerDisplayIdleMediaUrl] = useState('')
  const [customerDisplayPaymentDraft, setCustomerDisplayPaymentDraft] = useState<CartPanelPaymentPayload | null>(null)
  /** 결제 완료 직후 고객 모니터에 설정된 QR을 잠시 표시(ms 기준 타임스탬프) */
  const [postPaymentQrUntil, setPostPaymentQrUntil] = useState(0)
  /** 기존 주문 결제 시 영수증 orderNo (pendingPayRequest/pendingTakeoutPayRequest에 있던 값) */
  const [pendingReceiptOrderNo, setPendingReceiptOrderNo] = useState<string | null>(null)
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
  } | null>(null)
  const [cookingRules, setCookingRules] = useState<{
    freshMaxMin: number
    warningMaxMin: number
    mode: 'elapsed' | 'recipe_diff'
    recipeWarnDiff: number
    recipeUrgentDiff: number
    delayBadgeEnabled: boolean
    delaySoundEnabled: boolean
    delayAlertOverMin: number
  }>({
    freshMaxMin: 10,
    warningMaxMin: 15,
    mode: 'elapsed',
    recipeWarnDiff: 0,
    recipeUrgentDiff: 5,
    delayBadgeEnabled: true,
    delaySoundEnabled: false,
    delayAlertOverMin: 0,
  })
  const [menuTargets, setMenuTargets] = useState<{ byId: Map<string, number>; byName: Map<string, number> }>({
    byId: new Map(),
    byName: new Map(),
  })
  const applyPosMenusList = useCallback((list: unknown) => {
    const arr = Array.isArray(list) ? (list as PosMenu[]) : []
    setMenus(arr)
    const byId = new Map<string, number>()
    const byName = new Map<string, number>()
    arr.forEach((m: PosMenu) => {
      const min = Number(m.cookingTimeMin ?? 0)
      if (!Number.isFinite(min) || min <= 0) return
      const id = String(m.id || '').trim()
      const name = String(m.name || '').trim()
      if (id) byId.set(id, min)
      if (name) byName.set(name, min)
    })
    setMenuTargets({ byId, byName })
  }, [])
  usePosMenusCatalogLiveRefresh(applyPosMenusList)
  const drawerOpenWarnedRef = useRef(false)
  const posPrinterSettingsRef = useRef<PosPrinterSettings | null>(null)

  useEffect(() => {
    if (orderType !== 'dine-in') return
    if (!currentStoreId) return
    if (isPosTableOrderEnabledStore(currentStoreId)) return
    router.replace('/pos/order?type=dine_in')
  }, [orderType, currentStoreId, router])

  useEffect(() => {
    if (orderType !== 'delivery') setDeliveryApp(null)
  }, [orderType])

  useEffect(() => {
    getPosDeliveryApps({ storeCode: currentStoreId || undefined })
      .then((list) => setDeliveryAppsFromApi(Array.isArray(list) ? list : []))
      .catch(() => setDeliveryAppsFromApi([]))
  }, [currentStoreId])

  useEffect(() => {
    getMembers({ limit: 300 })
      .then((list) => {
        const names = Array.from(
          new Set(
            list
              .filter((m) => m.status !== 'inactive')
              .map((m) => String(m.name || '').trim())
              .filter(Boolean)
          )
        ).slice(0, 300)
        setTakeoutMemberNames(names)
      })
      .catch(() => setTakeoutMemberNames([]))
  }, [])

  useEffect(() => {
    const storeCode = auth?.store
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(s => setTodaySales({ completedCount: s.completedCount, completedTotal: s.completedTotal }))
      .catch(() => setTodaySales(null))
  }, [auth?.store])

  useEffect(() => {
    if (!currentStoreId) return
    getPosPrinterSettings({ storeCode: currentStoreId })
      .then((s) => {
        posPrinterSettingsRef.current = s
        const fresh = Math.max(1, Number(s.cookingFreshMaxMin ?? 10))
        const warning = Math.max(fresh + 1, Number(s.cookingWarningMaxMin ?? 15))
        const warnDiff = Math.max(0, Number(s.cookingRecipeWarningDiffMin ?? 0))
        const urgentDiff = Math.max(warnDiff + 1, Number(s.cookingRecipeUrgentDiffMin ?? 5))
        setCookingRules({
          freshMaxMin: fresh,
          warningMaxMin: warning,
          mode: s.cookingRuleMode === 'recipe_diff' ? 'recipe_diff' : 'elapsed',
          recipeWarnDiff: warnDiff,
          recipeUrgentDiff: urgentDiff,
          delayBadgeEnabled: s.cookingDelayBadgeEnabled !== false,
          delaySoundEnabled: Boolean(s.cookingDelaySoundEnabled),
          delayAlertOverMin: Math.max(0, Number(s.cookingDelayAlertOverMin ?? 0)),
        })
        setAutoPrintReceiptOnOrder(Boolean(s.autoPrintReceiptOnOrder))
        setAutoPrintReceiptOnAddOrder(Boolean(s.autoPrintReceiptOnAddOrder))
        setAutoPrintReceiptOnPayment(Boolean(s.autoPrintReceiptOnPayment ?? s.autoPrintReceiptOnOrder))
        setAutoPrintKitchenSlipOnOrder(Boolean(s.autoPrintKitchenSlipOnOrder))
        setAutoPrintFinalOrderBeforePayment(Boolean(s.autoPrintFinalOrderBeforePayment))
        setReceiptBizName(String(s.receiptBizName || ''))
        setReceiptBizTaxId(String(s.receiptBizTaxId || ''))
        setReceiptBizAbn(String(s.receiptBizAbn || ''))
        setReceiptBizOwner(String(s.receiptBizOwner || ''))
        setReceiptBizAddress(String(s.receiptBizAddress || ''))
        setReceiptBizPhone(String(s.receiptBizPhone || ''))
        setReceiptDesignStyle(s.receiptDesignStyle === 'simple' ? 'simple' : 'badge')
        setReceiptLogoSize(
          s.receiptLogoSize === 'sm'
            ? 'sm'
            : s.receiptLogoSize === 'lg'
              ? 'lg'
              : 'md'
        )
        setReceiptShowTitle(s.receiptShowTitle !== false)
        setReceiptShowPaidStamp(s.receiptShowPaidStamp !== false)
        setReceiptShowThankYou(s.receiptShowThankYou !== false)
        setReceiptShowCustomerCopy(s.receiptShowCustomerCopy !== false)
        setReceiptFooterPrimaryText(String(s.receiptFooterPrimaryText || '').trim())
        setReceiptFooterSecondaryText(String(s.receiptFooterSecondaryText || '').trim())
        setReceiptLogoImageUrl(String(s.receiptLogoImageUrl || '').trim())
        setReceiptStampImageUrl(String(s.receiptStampImageUrl || '').trim())
        setReceiptShowStamp(s.receiptShowStamp !== false)
        setReceiptStampOnlyTaxInvoice(s.receiptStampOnlyTaxInvoice !== false)
        setReceiptMembershipQrImageUrl(String(s.receiptMembershipQrImageUrl || '').trim())
        setReceiptMembershipQrLinkUrl(String(s.receiptMembershipQrLinkUrl || '').trim())
        setReceiptMembershipQrText(String(s.receiptMembershipQrText || '').trim())
        setReceiptShowMembershipQr(Boolean(s.receiptShowMembershipQr))
        setSignatureLine(Boolean(s.signatureLine))
        setReceiptBarcode(Boolean(s.receiptBarcode))
        setItemBarcode(Boolean(s.itemBarcode))
        setCardAutoOpen(Boolean(s.cardAutoOpen))
        setCheckAutoOpen(Boolean(s.checkAutoOpen))
        setDrawerOpenOption(
          s.drawerOpenOption === 'password_and_reason'
            ? 'password_and_reason'
            : s.drawerOpenOption === 'force'
              ? 'force'
              : 'reason_only'
        )
        setReceiptPrintLang(String(s.receiptPrintLang ?? '').trim())
        setVatRate(Math.max(0, Number(s.vatRate ?? 7)))
        setVatMode(s.vatMode === 'separate' ? 'separate' : 'included')
        setServiceRate(Math.max(0, Number(s.serviceRate ?? 0)))
        setServiceMode(s.serviceMode === 'included' ? 'included' : 'separate')
        setCardRate(Math.max(0, Number(s.cardRate ?? 0)))
        setCardMode(s.cardMode === 'included' ? 'included' : 'separate')
        setCardBaseMode(
          s.cardBaseMode === 'card_plus_vat'
            ? 'card_plus_vat'
            : s.cardBaseMode === 'card_plus_vat_service'
              ? 'card_plus_vat_service'
              : 'card_only'
        )
        setOtherRate(Math.max(0, Number(s.otherRate ?? 0)))
        setOtherMode(s.otherMode === 'included' ? 'included' : 'separate')
        setDualMonitorEnabled(Boolean(s.dualMonitorEnabled))
        setCustomerDisplayAutoOpen(s.customerDisplayAutoOpen !== false)
        setCustomerDisplayMonitorPreference(
          s.customerDisplayMonitorPreference === 'primary-only' ? 'primary-only' : 'secondary-first'
        )
        setCustomerDisplayDefaultState(s.customerDisplayDefaultState === 'qr' ? 'qr' : 'idle')
        setCustomerDisplayIdleMessage(String(s.customerDisplayIdleMessage ?? '').trim())
        setCustomerDisplayPaymentMessage(String(s.customerDisplayPaymentMessage ?? '').trim())
        setCustomerDisplayQrPayload(String(s.customerDisplayQrPayload ?? '').trim())
        setCustomerDisplayShowOrderSummary(s.customerDisplayShowOrderSummary !== false)
        setCustomerDisplayShowOrderTotal(s.customerDisplayShowOrderTotal !== false)
        const imt = String(s.customerDisplayIdleMediaType || 'none').toLowerCase()
        setCustomerDisplayIdleMediaType(imt === 'image' ? 'image' : imt === 'video' ? 'video' : 'none')
        setCustomerDisplayIdleMediaUrl(String(s.customerDisplayIdleMediaUrl ?? '').trim())
      })
      .catch(() => {
        posPrinterSettingsRef.current = null
        setCookingRules({
          freshMaxMin: 10,
          warningMaxMin: 15,
          mode: 'elapsed',
          recipeWarnDiff: 0,
          recipeUrgentDiff: 5,
          delayBadgeEnabled: true,
          delaySoundEnabled: false,
          delayAlertOverMin: 0,
        })
        setAutoPrintReceiptOnOrder(false)
        setAutoPrintReceiptOnAddOrder(false)
        setAutoPrintReceiptOnPayment(false)
        setAutoPrintKitchenSlipOnOrder(false)
        setAutoPrintFinalOrderBeforePayment(false)
        setReceiptBizName('')
        setReceiptBizTaxId('')
        setReceiptBizAbn('')
        setReceiptBizOwner('')
        setReceiptBizAddress('')
        setReceiptBizPhone('')
        setReceiptDesignStyle('badge')
        setReceiptLogoSize('md')
        setReceiptShowTitle(true)
        setReceiptShowPaidStamp(true)
        setReceiptShowThankYou(true)
        setReceiptShowCustomerCopy(true)
        setReceiptFooterPrimaryText('')
        setReceiptFooterSecondaryText('')
        setReceiptLogoImageUrl('')
        setReceiptStampImageUrl('')
        setReceiptShowStamp(true)
        setReceiptStampOnlyTaxInvoice(true)
        setReceiptMembershipQrImageUrl('')
        setReceiptMembershipQrLinkUrl('')
        setReceiptMembershipQrText('')
        setReceiptShowMembershipQr(false)
        setSignatureLine(false)
        setReceiptBarcode(false)
        setItemBarcode(false)
        setCardAutoOpen(false)
        setCheckAutoOpen(false)
        setDrawerOpenOption('reason_only')
        setReceiptPrintLang('')
        setVatRate(7)
        setVatMode('included')
        setServiceRate(0)
        setServiceMode('separate')
        setCardRate(0)
        setCardMode('separate')
        setCardBaseMode('card_only')
        setOtherRate(0)
        setOtherMode('separate')
        setDualMonitorEnabled(false)
        setCustomerDisplayAutoOpen(true)
        setCustomerDisplayMonitorPreference('secondary-first')
        setCustomerDisplayDefaultState('idle')
        setCustomerDisplayIdleMessage('')
        setCustomerDisplayPaymentMessage('')
        setCustomerDisplayQrPayload('')
        setCustomerDisplayShowOrderSummary(true)
        setCustomerDisplayShowOrderTotal(true)
        setCustomerDisplayIdleMediaType('none')
        setCustomerDisplayIdleMediaUrl('')
      })
    getPosMenus()
      .then(applyPosMenusList)
      .catch(() => {
        setMenus([])
        setMenuTargets({ byId: new Map(), byName: new Map() })
      })
  }, [currentStoreId, applyPosMenusList])

  useEffect(() => {
    if (!pendingPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDineInPaymentFromOrder(pendingPayRequest)
    setPendingPayRequest(null)
  }, [pendingPayRequest])

  useEffect(() => {
    if (!pendingTakeoutPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openTakeoutPaymentFromOrder({
      orderLabel: pendingTakeoutPayRequest.tableName,
      items: pendingTakeoutPayRequest.items,
    })
    setPendingTakeoutPayRequest(null)
  }, [pendingTakeoutPayRequest])

  useEffect(() => {
    if (!pendingDeliveryPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDeliveryPaymentFromOrder({
      orderLabel: pendingDeliveryPayRequest.tableName,
      items: pendingDeliveryPayRequest.items,
    })
    setPendingDeliveryPayRequest(null)
  }, [pendingDeliveryPayRequest])

  useEffect(() => {
    if (!currentStoreId) return
    try {
      const raw = window.localStorage.getItem(`${FLOOR_PREF_KEY}${currentStoreId}`)
      const floor = Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
      setActiveFloor(floor)
    } catch {
      setActiveFloor(1)
    }
  }, [currentStoreId])

  useEffect(() => {
    if (!currentStoreId) return
    try {
      window.localStorage.setItem(`${FLOOR_PREF_KEY}${currentStoreId}`, String(activeFloor))
    } catch {
      // ignore localStorage errors
    }
  }, [currentStoreId, activeFloor])

  const todayCompleted = todaySales?.completedCount ?? 0
  const totalSales = todaySales?.completedTotal ?? 0
  const getTableFloor = (tableId: string | null | undefined): 1 | 2 | 3 => {
    if (!tableId) return 1
    const raw = currentLayout.find((tbl) => tbl.id === tableId)?.floor
    return Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
  }
  const selectedTable = currentStore?.tables.find(tbl => tbl.id === selectedTableId)
  const servingTable = currentStore?.tables.find(tbl => tbl.id === servingTableId)
  const selectedDeliveryOrderId = selectedDeliveryTargetId?.startsWith('delivery-order-')
    ? selectedDeliveryTargetId.replace('delivery-order-', '')
    : null
  const selectedDeliveryOrder = selectedDeliveryOrderId
    ? [...deliveryOrders, ...packagedDeliveryOrders, ...completedDeliveryOrders].find((o) => String(o.id) === selectedDeliveryOrderId)
    : null
  const selectedTakeoutOrderId = selectedTakeoutTargetId?.startsWith('takeout-order-')
    ? selectedTakeoutTargetId.replace('takeout-order-', '')
    : null
  const selectedTakeoutOrder = selectedTakeoutOrderId
    ? [...takeoutOrders, ...packagedTakeoutOrders, ...completedTakeoutOrders].find((o) => String(o.id) === selectedTakeoutOrderId)
    : null
  const hasPendingPaymentFlow =
    Boolean(pendingPayRequest) ||
    Boolean(pendingTakeoutPayRequest) ||
    Boolean(pendingDeliveryPayRequest) ||
    Boolean(pendingDineInOrderId) ||
    Boolean(pendingTakeoutOrderId) ||
    Boolean(pendingDeliveryOrderId)
  const customerDisplayOrderItems = useMemo(
    () =>
      terminalCartLines.map((line) => {
        const qty = Math.max(1, Number((line as unknown as { quantity?: number; qty?: number }).quantity ?? (line as unknown as { qty?: number }).qty ?? 1))
        const price = Math.max(0, Number((line as unknown as { price?: number }).price ?? 0))
        return {
          name: String((line as unknown as { name?: string }).name || ''),
          qty,
          amount: qty * price,
        }
      }),
    [terminalCartLines]
  )
  const customerDisplayOrderTotal = useMemo(
    () => customerDisplayOrderItems.reduce((sum, it) => sum + it.amount, 0),
    [customerDisplayOrderItems]
  )
  const pricingAdjustments = useMemo<PosPricingAdjustments>(() => ({
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
    cardRate,
    cardMode,
    cardBaseMode,
    otherRate,
    otherMode,
  }), [vatRate, vatMode, serviceRate, serviceMode, cardRate, cardMode, cardBaseMode, otherRate, otherMode])

  const customerDisplayBreakdown = useMemo(() => {
    const subtotal = customerDisplayOrderTotal
    const discountAmt = 0
    const pricing = computePosPricing({
      subtotal,
      discountAmt,
      cardPaymentAmount: 0,
      adjustments: pricingAdjustments,
    })
    return {
      subtotal,
      discountAmt,
      vatFeeAmt: pricing.vatFeeAmt,
      vatRate: pricingAdjustments.vatRate,
      vatMode: pricingAdjustments.vatMode,
      serviceFeeAmt: pricing.serviceFeeAmt,
      serviceRate: pricingAdjustments.serviceRate,
      serviceMode: pricingAdjustments.serviceMode,
      cardFeeAmt: pricing.cardFeeAmt,
      cardRate: pricingAdjustments.cardRate,
      cardMode: pricingAdjustments.cardMode,
      otherFeeAmt: pricing.otherFeeAmt,
      otherRate: pricingAdjustments.otherRate,
      otherMode: pricingAdjustments.otherMode,
      total: pricing.finalTotal,
    }
  }, [customerDisplayOrderTotal, pricingAdjustments])
  const showSidePanel = activeTab !== 'tables' || Boolean(servingTable?.order) || Boolean(selectedTableId) || hasPendingPaymentFlow
  /** 1023px 이하(세로 태블릿/모바일)에서만 하단 카트로 전환 */
  const isNarrowViewport = useMediaQuery('(max-width: 920px)')
  const scrollIntoViewOnFocus = useScrollIntoViewOnFocus()
  const [isMainPosDevice, setIsMainPosDevice] = usePosMainDevice(currentStoreId || null)
  const seenOrderIdsRef = useRef<Set<number>>(new Set())
  /** 결제 영수증 자동 인쇄 중복 방지(메인: 로컬 결제 + Realtime UPDATE/INSERT) */
  const printedPaymentReceiptIdsRef = useRef<Set<number>>(new Set())
  /** 첫 폴링에서 당일 기결제 건을 시드해 페이지 로드 시 영수증 대량 재인쇄 방지 */
  const paymentReceiptScanSeededRef = useRef(false)
  useEffect(() => {
    printedPaymentReceiptIdsRef.current = new Set()
    paymentReceiptScanSeededRef.current = false
  }, [currentStoreId])

  const schedulePostPaymentCustomerQr = useCallback(() => {
    if (!dualMonitorEnabled) return
    const q = String(customerDisplayQrPayload || '').trim()
    if (!q) return
    const until = Date.now() + 16000
    setPostPaymentQrUntil(until)
    window.setTimeout(() => {
      setPostPaymentQrUntil((prev) => (prev === until ? 0 : prev))
    }, 16000)
  }, [dualMonitorEnabled, customerDisplayQrPayload])

  useEffect(() => {
    if (!currentStoreId) return
    const shell = window.cmPosShell
    if (typeof shell?.configureCustomerDisplay !== 'function') return
    void shell.configureCustomerDisplay({
      enabled: dualMonitorEnabled,
      autoOpen: customerDisplayAutoOpen,
      monitorPreference: customerDisplayMonitorPreference,
      storeCode: currentStoreId,
    })
  }, [currentStoreId, dualMonitorEnabled, customerDisplayAutoOpen, customerDisplayMonitorPreference])

  useEffect(() => {
    if (!currentStoreId || !dualMonitorEnabled) return
    const brand = receiptLogoImageUrl.trim() || undefined
    const base: PosCustomerDisplayPayload = {
      storeCode: currentStoreId,
      kind: 'idle',
      updatedAt: new Date().toISOString(),
      showOrderSummary: customerDisplayShowOrderSummary,
      showOrderTotal: customerDisplayShowOrderTotal,
      idleMediaType: customerDisplayIdleMediaType,
      idleMediaUrl:
        customerDisplayIdleMediaType !== 'none' && customerDisplayIdleMediaUrl.trim()
          ? customerDisplayIdleMediaUrl.trim()
          : undefined,
      brandLogoUrl: brand,
    }
    const now = Date.now()
    const showPostPayQr = postPaymentQrUntil > now && String(customerDisplayQrPayload || '').trim().length > 0

    const payload: PosCustomerDisplayPayload = showPostPayQr
      ? {
          ...base,
          kind: 'qr',
          title: t('posCustomerThankYou') || '감사합니다',
          message: t('posCustomerPostPaymentQrHint') || '아래 QR을 이용해 주세요.',
          qrPayload: customerDisplayQrPayload,
        }
      : hasPendingPaymentFlow
        ? {
            ...base,
            kind: 'payment',
            title: t('posCustomerPayment') || '결제 진행 중',
            message: customerDisplayPaymentMessage || undefined,
            items: customerDisplayOrderItems,
            totalAmount: customerDisplayBreakdown.total,
            breakdown: customerDisplayBreakdown,
            paymentLines: buildCustomerDisplayPaymentLines(customerDisplayPaymentDraft, t),
          }
        : customerDisplayOrderItems.length > 0
          ? {
              ...base,
              kind: 'ordering',
              title: t('posCustomerOrdering') || '주문 확인',
              items: customerDisplayOrderItems,
              totalAmount: customerDisplayOrderTotal,
            }
          : customerDisplayDefaultState === 'qr'
            ? {
                ...base,
                kind: 'qr',
                title: t('posCustomerQrTitle') || 'QR 코드',
                qrPayload: customerDisplayQrPayload,
              }
            : {
                ...base,
                kind: 'idle',
                message: customerDisplayIdleMessage || undefined,
              }
    publishPosCustomerDisplayState(payload)
    const shell = window.cmPosShell
    if (typeof shell?.setCustomerDisplayState === 'function') {
      void shell.setCustomerDisplayState(payload)
    }
  }, [
    currentStoreId,
    dualMonitorEnabled,
    customerDisplayShowOrderSummary,
    customerDisplayShowOrderTotal,
    hasPendingPaymentFlow,
    customerDisplayPaymentMessage,
    customerDisplayOrderTotal,
    customerDisplayBreakdown,
    customerDisplayOrderItems,
    customerDisplayDefaultState,
    customerDisplayQrPayload,
    customerDisplayIdleMessage,
    customerDisplayIdleMediaType,
    customerDisplayIdleMediaUrl,
    receiptLogoImageUrl,
    postPaymentQrUntil,
    customerDisplayPaymentDraft,
    t,
  ])

  useEffect(() => {
    if (activeTab === 'tables' && !selectedTableId) {
      clearCartFromTerminal()
    }
  }, [activeTab, selectedTableId, clearCartFromTerminal])

  const hasInitializedMainPosPollRef = useRef(false)
  const lastSeenOrderIdRef = useRef<number>(0)
  const prevStoreForPollRef = useRef<string | null>(null)


  async function printReceiptNow(
    payload: {
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
      serviceFeeAmt?: number
      serviceFeeMode?: 'included' | 'separate'
      cardFeeAmt?: number
      cardFeeMode?: 'included' | 'separate'
      otherFeeAmt?: number
      otherFeeMode?: 'included' | 'separate'
    },
    /** 사용자 클릭 직후 열어둔 창을 넘기면 팝업 차단/자동 인쇄 제한을 피할 수 있음 */
    existingWindow?: Window | null,
    /** true면 사용자 제스처 직후 호출로 간주 */
    fromUserGesture?: boolean,
    /** 주문 후 인쇄: 이 콜백을 넘기면 새 창 대신 HTML만 넘겨서 같은 페이지 iframe 모달로 보여줌 (팝업 차단 무관, iframe 안에서 인쇄 버튼 클릭 시 인쇄 화면 표시) */
    onShowInModal?: (html: string) => void,
    /** true면 주문 직인쇄: 숨김 iframe에 쓰고 print() (별도 브라우저 창 없음). 결제 등은 false */
    directPrint?: boolean,
    /** directPrint 일 때만: 영수증 인쇄 정리 후 호출(연속 인쇄 합침 방지용으로 내부에서 추가 지연) */
    onAfterDirectPrint?: () => void
  ) {
    const esc = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    const timestamp = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
    const parsedMemo = parsePosOrderMemo(payload.memo)
    const tr = (key: string, fallback: string) => {
      const value = tPrint(key)
      return value && value !== key ? value : fallback
    }
    /* 주문용 영수증: 로고 없이 심플 (내부/주방 참조용) */
    const ct = (tag: string) => '\u003c/' + tag + '>'
    const tableDisplay = payload.tableName
      ? translateReceiptTableDisplayName(payload.tableName, (k) => tPrint(k))
      : ''
    const tableRow = tableDisplay
      ? '<div class="receipt-meta-row"><span class="receipt-meta-label">' + esc(tr('posTable', '테이블')) + ct('span') + '<span class="receipt-meta-value">' + esc(tableDisplay) + ct('span') + ct('div')
      : ''
    const dateRow = '<div class="receipt-meta-row"><span class="receipt-meta-label">' + esc(tr('date', 'Date')) + ct('span') + '<span class="receipt-meta-value">' + esc(timestamp) + ct('span') + ct('div')
    const itemsRows = payload.items
      .map((it, idx) => {
        const addon = Boolean((it as { isAddon?: boolean }).isAddon)
        const prevAddon = idx > 0 && Boolean((payload.items[idx - 1] as { isAddon?: boolean }).isAddon)
        const addonHead =
          addon && !prevAddon
            ? '<div class="receipt-addon-section" style="margin:10px 0 6px;padding-top:8px;border-top:1px dashed #666;font-size:11px;font-weight:700;text-align:center">' +
              esc(tr('posReceiptAddonSection', '추가 주문')) +
              ct('div')
            : ''
        const line = translatePosMenuLineForReceipt(it.name, (k) => tPrint(k))
        const lineNote = String((it as { note?: string }).note ?? '').trim()
        const noteHtml = lineNote
          ? '<div class="receipt-line-note">' + esc(tr('posLineNote', '메모')) + ': ' + esc(lineNote) + ct('div')
          : ''
        return (
          addonHead +
          '<div class="receipt-row"><span>' +
          it.qty +
          'x ' +
          esc(line) +
          ct('span') +
          '<span>' +
          formatBahtNum(it.price * it.qty) +
          ct('span') +
          ct('div') +
          noteHtml
        )
      })
      .join('')
    const memoRow = parsedMemo.plainMemo ? '<div class="memo">' + esc(tr('posCustomerMemo', '메모')) + ': ' + esc(parsedMemo.plainMemo) + ct('div') : ''
    const taxInvoiceRow = parsedMemo.taxInvoice
      ? buildPosTaxInvoiceThermalHtml({ taxInvoice: parsedMemo.taxInvoice, esc, tr })
      : ''
    const discountRow = payload.discountAmt > 0 ? '<div class="receipt-row discount"><span>' + esc(tPrint('posDiscount') || '할인') + ct('span') + '<span>-' + formatBahtNum(payload.discountAmt) + ct('span') + ct('div') : ''
    const orderNoForPrint = formatPosReceiptOrderNoDisplay({
      posOrderNo: payload.orderNo,
      tableName: payload.tableName,
      memo: payload.memo,
    })
    const printContent = '<div class="receipt-content receipt-order-simple"><div class="receipt-order-header text-center"><div class="receipt-store-name">' + esc(payload.storeCode) + ct('div') + '<div class="receipt-order-label">' + esc(tr('posOrderNo', '주문')) + ' #' + esc(orderNoForPrint) + ct('div') + ct('div') + '<div class="receipt-divider">' + ct('div') + '<div class="text-xs">' + tableRow + dateRow + ct('div') + '<div class="receipt-divider">' + ct('div') + '<div class="receipt-item-head"><span>' + esc(tr('posMenuName', '품목')) + ct('span') + '<span>' + esc(tr('amount', '금액')) + ct('span') + ct('div') + itemsRows + taxInvoiceRow + memoRow + '<div class="receipt-divider">' + ct('div') + '<div class="receipt-row"><span class="receipt-muted">' + esc(tPrint('posSubtotal') || '소계') + ct('span') + '<span>' + formatBahtNum(payload.subtotal) + ct('span') + ct('div') + discountRow + '<div class="receipt-divider">' + ct('div') + '<div class="receipt-row receipt-total"><span>' + esc(tPrint('posTotal') || '합계') + ct('span') + '<span>' + formatBahtNum(payload.total) + ct('span') + ct('div') + ct('div')
    const printButtonLabel = (tPrint('posPrint') || tPrint('btn_print') || '인쇄')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const showPrintButtonInReceipt = (existingWindow != null || fromUserGesture) && !directPrint
    const receiptHtml = buildReceiptDocumentHtml({
      title: tPrint('posReceipt') || '영수증',
      bodyContent: printContent,
      footerContent: showPrintButtonInReceipt
        ? '<button type="button" onclick="window.print();" style="padding:8px 20px;font-size:14px;cursor:pointer;border:1px solid #000;background:#fff;color:#000;">' +
            printButtonLabel +
            '</button>'
        : undefined,
    })

    if (fromUserGesture && onShowInModal) {
      onShowInModal(receiptHtml)
      return
    }

    /** 주문/결제 인쇄는 항상 숨김 iframe 사용 (새 창/탭 열지 않음) */
    printPosHtmlDocument(receiptHtml, {
      title: tPrint('posReceipt') || '영수증',
      printDelayMs: 0,
      fallbackCleanupMs: 120_000,
      printRole: 'receipt',
      printReceiptKind: 'hall_order',
      escPosCutOverride: resolveEscPosCutOverride(posPrinterSettingsRef.current, {
        printRole: 'receipt',
        printReceiptKind: 'hall_order',
      }),
      /** 자동(주문 직후) 인쇄: iframe 포커스 생략 → 인쇄창 닫힌 뒤 POS 화면 전환이 덜 튐 */
      focusIframeBeforePrint: !directPrint,
      onPrintUnavailable: () => {
        void appAlert(t('posPrintUnavailable'))
      },
      ...(directPrint && typeof onAfterDirectPrint === 'function'
        ? {
            onAfterCleanup: () => {
              window.setTimeout(onAfterDirectPrint, POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS)
            },
          }
        : {}),
    })
  }

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const channel = subscribePosOrdersInsert((payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      const rowStore = String(row.store_code ?? '').trim()
      const variants = [currentStoreId, currentStoreId.startsWith('CM ') ? currentStoreId.slice(3).trim() : `CM ${currentStoreId}`.trim(), currentStoreId.replace(/^CM\s+/i, '')].filter(Boolean)
      if (rowStore && !variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))) return
      if (consumeSuppressMainPosAutoPrintForQueuedSync(orderId)) {
        seenOrderIdsRef.current.add(orderId)
        if (orderId > lastSeenOrderIdRef.current) lastSeenOrderIdRef.current = orderId
        return
      }
      if (seenOrderIdsRef.current.has(orderId)) return
      let items: { id: string; name: string; price: number; qty: number; note?: string }[] = []
      try {
        const raw = row.items_json
        const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
        items = (Array.isArray(arr) ? arr : []).map(
          (it: { id?: string; name?: string; price?: number; qty?: number; quantity?: number; note?: string }) => {
            const note = String(it.note ?? '').trim()
            return {
              id: String(it.id ?? ''),
              name: String(it.name ?? ''),
              price: Number(it.price ?? 0),
              qty: Number(it.qty ?? it.quantity ?? 1),
              ...(note ? { note } : {}),
            }
          }
        )
      } catch {
        return
      }
      /* items_json이 Realtime에 비어 있으면 폴링이 다시 잡도록 seen에 넣지 않음 */
      if (items.length === 0) return
      seenOrderIdsRef.current.add(orderId)
      if (orderId > lastSeenOrderIdRef.current) lastSeenOrderIdRef.current = orderId
      const storeCode = String(row.store_code ?? currentStoreId)
      const orderNo = String(row.order_no ?? '')
      const orderType = String(row.order_type ?? 'dine_in')
      const tableName = String(row.table_name ?? '')
      const memo = String(row.memo ?? '')
      const subtotal = Number(row.subtotal ?? 0)
      const discountAmt = Number(row.discount_amt ?? 0)
      const total = Number(row.total ?? 0)
      const receiptPayloadRealtime = {
        orderNo,
        storeCode,
        orderType,
        tableName,
        memo,
        items,
        subtotal,
        discountAmt,
        total,
      }
      const runKitchenFromRealtimeOrderInsert = () => {
        getPosPrinterSettings({ storeCode })
          .then((settings) => {
            const orderTypeLabels: Record<string, string> = {
              dine_in: t('posOrderTypeDineIn') ?? '매장',
              takeout: t('posOrderTypeTakeout') ?? '포장',
              delivery: t('posOrderTypeDelivery') ?? '배달',
            }
            const kLabels = {
              unified: t('posKitchenOrder') || '주방 주문서',
              kitchen1: `${t('posKitchen1') || '주방 1'}`,
              kitchen2: `${t('posKitchen2') || '주방 2'}`,
              kitchen3: `${t('posKitchen3') || '주방 3'}`,
            }
            const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, kLabels))
            if (!slips.length) return
            const slipDesign = resolveKitchenSlipDesign(settings)
            const kitchenMemo = parsePosOrderMemo(memo).plainMemo
            const memoLine = kitchenMemo.trim()
              ? (t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
              : ''
            const printOne = (idx: number) => {
              if (idx >= slips.length) return
              const slip = slips[idx]
              const tablePartR = tableName
                ? ' · ' + (t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, t)
                : ''
              const html = buildKitchenSlipDocumentHtml({
                label: slip.label,
                orderNo,
                storeCode,
                orderTypeLabel: orderTypeLabels[orderType] || orderType,
                tablePart: tablePartR,
                dateStr: formatPosDateTimeMedium(new Date(), lang),
                items: slip.items.map((it) => ({
                  name: translatePosMenuLineForReceipt(it.name, t),
                  qty: it.qty,
                  note: it.note,
                })),
                memoLine: memoLine || null,
                escapeHtml,
                design: slipDesign,
                printColorAdjust: 'exact',
              })
              printPosHtmlDocument(html, {
                title: slip.label,
                printDelayMs: 0,
                focusIframeBeforePrint: false,
                printRole: 'kitchen',
                kitchenStation: slip.station,
                escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
                onPrintUnavailable: () => {
                  void appAlert(t('posPrintUnavailable'))
                },
                onAfterCleanup: () => {
                  if (idx + 1 < slips.length)
                    setTimeout(() => printOne(idx + 1), POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS)
                },
              })
            }
            setTimeout(() => printOne(0), 0)
          })
          .catch((e) => console.error('Kitchen slip print:', e))
      }
      if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
        printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true, runKitchenFromRealtimeOrderInsert)
      } else if (autoPrintReceiptOnOrder) {
        printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true)
      } else if (autoPrintKitchenSlipOnOrder) {
        setTimeout(runKitchenFromRealtimeOrderInsert, 180)
      }
      if (autoPrintReceiptOnPayment) {
        const st = String(row.status ?? '').toLowerCase()
        const paySum = posOrderRowPaymentSum(row)
        if (isPosOrderPaidLikeStatus(st) && paySum > 0 && !printedPaymentReceiptIdsRef.current.has(orderId)) {
          printedPaymentReceiptIdsRef.current.add(orderId)
          void getPosOrders({ orderId, storeCode: currentStoreId }).then((list) => {
            const order = list[0] as PosOrder | undefined
            if (!order?.items?.length) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            setReceiptData(receiptModalDataFromPosOrderForPayment(order, pricingAdjustments))
          })
        }
      }
    })
    return () => {
      if (channel) channel.unsubscribe()
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    menus,
    t,
    lang,
  ])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId || !autoPrintReceiptOnPayment) return
    const channel = subscribePosOrdersUpdate((payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      const rowStore = String(row.store_code ?? '').trim()
      const variants = [
        currentStoreId,
        currentStoreId.startsWith('CM ') ? currentStoreId.slice(3).trim() : `CM ${currentStoreId}`.trim(),
        currentStoreId.replace(/^CM\s+/i, ''),
      ].filter(Boolean)
      if (rowStore && !variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))) return
      if (!isPosOrderPaidLikeStatus(String(row.status ?? ''))) return
      if (posOrderRowPaymentSum(row) <= 0) return
      if (printedPaymentReceiptIdsRef.current.has(orderId)) return
      printedPaymentReceiptIdsRef.current.add(orderId)
      void getPosOrders({ orderId, storeCode: currentStoreId }).then((list) => {
        const order = list[0] as PosOrder | undefined
        if (!order?.items?.length) {
          printedPaymentReceiptIdsRef.current.delete(orderId)
          return
        }
        if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
          printedPaymentReceiptIdsRef.current.delete(orderId)
          return
        }
        setReceiptData(receiptModalDataFromPosOrderForPayment(order, pricingAdjustments))
      })
    })
    return () => {
      if (channel) channel.unsubscribe()
    }
  }, [isMainPosDevice, currentStoreId, autoPrintReceiptOnPayment, pricingAdjustments])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) {
      if (!isMainPosDevice) {
        hasInitializedMainPosPollRef.current = false
        lastSeenOrderIdRef.current = 0
        prevStoreForPollRef.current = null
      }
      return
    }
    if (prevStoreForPollRef.current !== currentStoreId) {
      hasInitializedMainPosPollRef.current = false
      lastSeenOrderIdRef.current = 0
      prevStoreForPollRef.current = currentStoreId
    }
    const today = getPosBusinessDateStr()
    const poll = async () => {
      try {
        const runPaymentReceiptScan = async () => {
          if (!autoPrintReceiptOnPayment) return
          try {
            const paidLikeRows = await getPosOrders({
              startStr: today,
              endStr: today,
              storeCode: currentStoreId,
              statusPaidLike: true,
              limit: 800,
              orderBy: 'id.desc',
            })
            if (!paymentReceiptScanSeededRef.current) {
              for (const order of paidLikeRows) {
                const oid = Number(order.id)
                if (!Number.isFinite(oid) || oid <= 0) continue
                if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) continue
                if (posOrderPaymentSum(order) <= 0) continue
                if (!(order.items || []).length) continue
                printedPaymentReceiptIdsRef.current.add(oid)
              }
              paymentReceiptScanSeededRef.current = true
              return
            }
            const candidates = paidLikeRows.filter((order) => {
              const oid = Number(order.id)
              if (!Number.isFinite(oid) || oid <= 0) return false
              if (printedPaymentReceiptIdsRef.current.has(oid)) return false
              if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) return false
              if (posOrderPaymentSum(order) <= 0) return false
              if (!(order.items || []).length) return false
              return true
            })
            candidates.sort((a, b) => Number(a.id) - Number(b.id))
            let staggerMs = 0
            for (const order of candidates) {
              const oid = Number(order.id)
              printedPaymentReceiptIdsRef.current.add(oid)
              const snap = order
              const adj = pricingAdjustments
              setTimeout(() => {
                setReceiptData(receiptModalDataFromPosOrderForPayment(snap, adj))
              }, staggerMs)
              staggerMs += 900
            }
          } catch {
            /* ignore payment scan errors */
          }
        }

        const sinceId = hasInitializedMainPosPollRef.current && lastSeenOrderIdRef.current > 0 ? lastSeenOrderIdRef.current : undefined
        const orders = await getPosOrders({
          startStr: today,
          endStr: today,
          storeCode: currentStoreId,
          ...(sinceId != null ? { sinceId } : {}),
        })
        if (!hasInitializedMainPosPollRef.current) {
          const maxId = orders.length ? Math.max(...orders.map((o) => o.id ?? 0)) : 0
          lastSeenOrderIdRef.current = maxId
          orders.forEach((o) => seenOrderIdsRef.current.add(o.id))
          hasInitializedMainPosPollRef.current = true
          await runPaymentReceiptScan()
          return
        }
        const newOrders = orders
        for (const order of newOrders) {
          const oid = Number(order.id)
          if (!Number.isFinite(oid) || oid <= 0) continue
          if (seenOrderIdsRef.current.has(oid)) {
            lastSeenOrderIdRef.current = Math.max(lastSeenOrderIdRef.current, oid)
            continue
          }
          if (consumeSuppressMainPosAutoPrintForQueuedSync(oid)) {
            seenOrderIdsRef.current.add(oid)
            lastSeenOrderIdRef.current = Math.max(lastSeenOrderIdRef.current, oid)
            continue
          }
          const items = (order.items || []).map(
            (it: { id?: string; name?: string; price?: number; qty?: number; quantity?: number; note?: string }) => {
              const note = String(it.note ?? '').trim()
              return {
                id: String(it.id ?? ''),
                name: String(it.name ?? ''),
                price: Number(it.price ?? 0),
                qty: Number(it.qty ?? it.quantity ?? 1),
                ...(note ? { note } : {}),
              }
            }
          )
          /* 품목이 아직 비어 있으면 seen/워터마크에 넣지 않음 → 다음 폴링에서 다시 조회 */
          if (items.length === 0) continue
          seenOrderIdsRef.current.add(oid)
          lastSeenOrderIdRef.current = Math.max(lastSeenOrderIdRef.current, oid)
          const receiptPayloadPoll = {
            orderNo: order.orderNo ?? '',
            storeCode: order.storeCode ?? currentStoreId,
            orderType: order.orderType ?? 'dine_in',
            tableName: order.tableName,
            memo: order.memo,
            items,
            subtotal: order.subtotal ?? 0,
            discountAmt: order.discountAmt ?? 0,
            total: order.total ?? 0,
          }
          const runKitchenForPolledOrder = () => {
            void (async () => {
              try {
                const settings = await getPosPrinterSettings({ storeCode: order.storeCode ?? currentStoreId })
                const orderTypeLabels: Record<string, string> = {
                  dine_in: t('posOrderTypeDineIn') ?? '매장',
                  takeout: t('posOrderTypeTakeout') ?? '포장',
                  delivery: t('posOrderTypeDelivery') ?? '배달',
                }
                const kLabels = {
                  unified: t('posKitchenOrder') || '주방 주문서',
                  kitchen1: `${t('posKitchen1') || '주방 1'}`,
                  kitchen2: `${t('posKitchen2') || '주방 2'}`,
                  kitchen3: `${t('posKitchen3') || '주방 3'}`,
                }
                const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, kLabels))
                if (!slips.length) return
                const slipDesign = resolveKitchenSlipDesign(settings)
                const kitchenMemo = parsePosOrderMemo(order.memo).plainMemo
                const memoLine = kitchenMemo.trim()
                  ? (t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                  : ''
                const printOne = (idx: number) => {
                  if (idx >= slips.length) return
                  const slip = slips[idx]
                  const tablePart = order.tableName
                    ? ' · ' + (t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, t)
                    : ''
                  const orderTypeLabel = orderTypeLabels[order.orderType ?? ''] || (order.orderType ?? '')
                  const html = buildKitchenSlipDocumentHtml({
                    label: slip.label,
                    orderNo: order.orderNo ?? '',
                    storeCode: order.storeCode ?? '',
                    orderTypeLabel,
                    tablePart,
                    dateStr: formatPosDateTimeMedium(new Date(), lang),
                    items: slip.items.map((it) => ({
                      name: translatePosMenuLineForReceipt(it.name, t),
                      qty: it.qty,
                      note: it.note,
                    })),
                    memoLine: memoLine || null,
                    escapeHtml,
                    design: slipDesign,
                    printColorAdjust: 'exact',
                  })
                  printPosHtmlDocument(html, {
                    title: slip.label,
                    printDelayMs: 0,
                    focusIframeBeforePrint: false,
                    printRole: 'kitchen',
                    kitchenStation: slip.station,
                    escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
                    onPrintUnavailable: () => {
                      void appAlert(t('posPrintUnavailable'))
                    },
                    onAfterCleanup: () => {
                      if (idx + 1 < slips.length)
                    setTimeout(() => printOne(idx + 1), POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS)
                    },
                  })
                }
                setTimeout(() => printOne(0), 0)
              } catch (e) {
                console.error('Kitchen slip print:', e)
              }
            })()
          }
          if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
            printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true, runKitchenForPolledOrder)
          } else if (autoPrintReceiptOnOrder) {
            printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true)
          } else if (autoPrintKitchenSlipOnOrder) {
            setTimeout(runKitchenForPolledOrder, 180)
          }
        }
        await runPaymentReceiptScan()
      } catch {
        // ignore poll errors
      }
    }
    poll()
    /* Realtime 미동작·지연 시에도 수 초 내 폴백 (45초는 현장에서 “안 찍힘”으로 느껴짐) */
    const id = setInterval(poll, 10000)
    return () => {
      clearInterval(id)
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    menus,
    t,
    lang,
  ])

  useEffect(() => {
    if (selectedTableId) {
      setActiveFloor(getTableFloor(selectedTableId))
    } else if (servingTableId) {
      setActiveFloor(getTableFloor(servingTableId))
    }
  }, [selectedTableId, servingTableId, currentLayout])

  useEffect(() => {
    if (selectedTableId || servingTableId) return
    const hasActiveFloorTable = currentLayout.some(
      (tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) === activeFloor
    )
    if (hasActiveFloorTable || currentLayout.length === 0) return
    const floors = Array.from(
      new Set(currentLayout.map((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as 1 | 2 | 3))
    ).sort((a, b) => a - b)
    if (floors[0] && floors[0] !== activeFloor) {
      setActiveFloor(floors[0])
    }
  }, [currentLayout, activeFloor, selectedTableId, servingTableId])

  const tryOpenDrawerForPayment = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      if (!payment || !currentStoreId) return
      const cardAmt = Math.max(0, Number(payment.paymentCard || 0))
      const checkLike =
        String(payment.deliveryPaymentChannel || '')
          .toLowerCase()
          .includes('check') ||
        String(payment.deliveryPaymentChannel || '')
          .toLowerCase()
          .includes('cheque')
      const checkAmt = checkLike
        ? Math.max(
            0,
            Number(payment.paymentOther || 0) +
              Number(payment.paymentDeliveryApp || 0) +
              Number(payment.paymentQr || 0)
          )
        : 0
      const shouldOpen = (cardAutoOpen && cardAmt > 0) || (checkAutoOpen && checkAmt > 0)
      if (!shouldOpen) return
      const reason = cardAmt > 0 ? 'auto_card_payment' : 'auto_check_payment'
      const res = await openPosCashDrawer({
        reason,
        source: 'payment_auto',
        storeCode: currentStoreId,
        userName: auth?.user || '',
        drawerOpenOption,
      })
      if (!res.success && !drawerOpenWarnedRef.current) {
        drawerOpenWarnedRef.current = true
        await appAlert(
          (t('posDrawerOpenBridgeFail') ||
            '돈통 열기를 시도했지만 로컬 브리지 연결에 실패했습니다. POS PC의 로컬 드로어 브리지 실행 상태를 확인해 주세요.')
        )
      }
    },
    [currentStoreId, auth?.user, cardAutoOpen, checkAutoOpen, drawerOpenOption, t]
  )

  const runLinkposPaymentIfNeeded = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      const cardAmount = Math.max(0, Number(payment?.paymentCard || 0))
      if (cardAmount <= 0) return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      if (!currentStoreId) {
        return { ok: false as const, message: 'store_required' }
      }
      const rawBank = String(payment?.deliveryPaymentChannel ?? '').trim()
      const bankIdMatch = rawBank.match(/bank[:=]\s*([0-9]{2,3})/i)
      const bankId = bankIdMatch?.[1] || '04'
      const ref1 = `POS${Date.now().toString().slice(-14)}`.slice(0, 20)
      const ref2 = String(auth?.user || '').trim().slice(0, 20)

      const result = await executeLinkposPayment({
        amount: cardAmount,
        bankId,
        reference1: ref1,
        reference2: ref2,
        storeCode: currentStoreId,
      })
      if (!result.success) {
        const msg =
          (t('posCardApprovalFailed') || '카드 승인에 실패했습니다.') +
          ` (${String(result.message || 'LINKPOS_ERROR')})`
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }
      return { ok: true as const, linkposPayment: result.payment as LinkposPaymentSummary | null }
    },
    [currentStoreId, auth?.user, t]
  )

  const deliveryApps = deliveryAppsFromApi
    .filter((a) => a.enabled)
    .map((a) => ({ id: a.code, name: a.name }))
  const deliveryAppsFallback = deliveryApps.length === 0 ? [
    { id: 'grab', name: 'Grab' },
    { id: 'lineman', name: 'Line Man' },
    { id: 'shopee', name: 'Shopee' },
  ] : []
  const effectiveDeliveryApps = deliveryApps.length > 0 ? deliveryApps : deliveryAppsFallback
  const cartOrderType = activeTab === 'delivery' ? 'delivery' : activeTab === 'takeout' ? 'takeout' : 'dine-in'
  const formatTakeoutSlotLabel = (slot: string) =>
    (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', slot)
  const baseTakeoutLabel = takeoutMode === 'member'
    ? (takeoutMemberName.trim() || (t('posTakeoutMemberName') || '회원 이름'))
    : formatTakeoutSlotLabel(takeoutSlot)
  const takeoutLabel = selectedTakeoutTargetLabel || baseTakeoutLabel
  const filteredTakeoutMembers = takeoutMemberName.trim()
    ? takeoutMemberNames.filter((name) => name.toLowerCase().includes(takeoutMemberName.trim().toLowerCase())).slice(0, 6)
    : takeoutMemberNames.slice(0, 6)

  const getOrderVisual = (order: {
    status?: string
    createdAt?: Date | string
    items?: { id?: string; name?: string; servedAt?: string | null }[]
  }) => {
    const items = Array.isArray(order.items) ? order.items : []
    const servedCount = items.filter((item) => Boolean(item.servedAt)).length
    const normalizedStatus = String(order.status || '').toLowerCase()
    const status: 'preparing' | 'partial_served' | 'packaged' | 'completed' =
      normalizedStatus === 'completed'
        ? 'completed'
        : normalizedStatus === 'ready'
          ? 'packaged'
          : servedCount > 0
            ? 'partial_served'
            : 'preparing'
    const getItemTarget = (item: { id?: string; name?: string }) => {
      const rawId = String(item.id || '').trim()
      const rawName = String(item.name || '').trim()
      const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
      const idKey = normalizedId.split('-')[0]
      if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
      const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
      if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
      return 0
    }
    const targetMin = status === 'preparing'
      ? Math.max(0, ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') })))
      : 0
    const createdAt = order.createdAt
      ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt))
      : undefined
    return { status, createdAt, targetMin }
  }

  const detectDeliveryApp = (text: string): PosDeliveryApp | null => {
    const raw = text.toLowerCase()
    for (const app of deliveryAppsFromApi) {
      const keywords = app.matchKeywords || []
      if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) return app
    }
    if (deliveryAppsFromApi.length === 0) {
      if (raw.includes('grab') || raw.includes('그랩')) return { id: 0, code: 'grab', name: 'Grab', matchKeywords: ['grab'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'lime', storeCode: null }
      if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return { id: 0, code: 'lineman', name: 'Line Man', matchKeywords: ['lineman'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'sky', storeCode: null }
      if (raw.includes('shopee') || raw.includes('쇼피')) return { id: 0, code: 'shopee', name: 'Shopee', matchKeywords: ['shopee'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'amber', storeCode: null }
    }
    return null
  }

  const detectDeliveryOrderNo = (text: string): string => {
    const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/)
    if (hashMatch?.[1]) return hashMatch[1]
    const bracketMatch = text.match(/\(([^)]+)\)/)
    if (bracketMatch?.[1]) return bracketMatch[1].trim()
    return ''
  }

  const deliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...deliveryOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const visual = getOrderVisual(order)
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel: t('posOrderStatusPreparing') || '진행 중',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const packagedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedDeliveryOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [packagedDeliveryOrders, t, deliveryAppsFromApi])

  const completedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...completedDeliveryOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: formatPosOrderNoForPrint(order.orderNo || ''),
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [completedDeliveryOrders, t, deliveryAppsFromApi])

  const allDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...deliveryOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedDeliveryOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedDeliveryOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    const filtered = merged
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const listType = (order as Tagged)._listType
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel:
          listType === 'completed'
            ? formatPosOrderNoForPrint(order.orderNo || '')
            : listType === 'packaged'
              ? t('posDeliveryPackagingComplete') || '포장 완료'
              : t('posOrderStatusPreparing') || '진행 중',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, packagedDeliveryOrders, completedDeliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const inProgressOrPackagedDeliveryBarItems = useMemo(() => {
    const merged = [...deliveryBarItems, ...packagedDeliveryBarItems]
    merged.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return merged
  }, [deliveryBarItems, packagedDeliveryBarItems])
  const currentDeliveryBarItems = deliveryListMode === 'all' ? allDeliveryBarItems : deliveryListMode === 'completed' ? completedDeliveryBarItems : inProgressOrPackagedDeliveryBarItems

  const takeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...takeoutOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      const visual = getOrderVisual(order)
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel: t('posOrderStatusPreparing') || '진행 중',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, menuTargets, t])

  const packagedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedTakeoutOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [packagedTakeoutOrders, t])

  const completedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...completedTakeoutOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: formatPosOrderNoForPrint(order.orderNo || ''),
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [completedTakeoutOrders, t])

  const allTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...takeoutOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedTakeoutOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedTakeoutOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    const filtered = merged
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      const listType = (order as Tagged)._listType
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel:
          listType === 'completed'
            ? formatPosOrderNoForPrint(order.orderNo || '')
            : listType === 'packaged'
              ? t('posDeliveryPackagingComplete') || '포장 완료'
              : t('posOrderStatusPreparing') || '진행 중',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, packagedTakeoutOrders, completedTakeoutOrders, menuTargets, t])

  const inProgressOrPackagedTakeoutBarItems = useMemo(() => {
    const merged = [...takeoutBarItems, ...packagedTakeoutBarItems]
    merged.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return merged
  }, [takeoutBarItems, packagedTakeoutBarItems])
  const currentTakeoutBarItems = takeoutListMode === 'all' ? allTakeoutBarItems : takeoutListMode === 'completed' ? completedTakeoutBarItems : inProgressOrPackagedTakeoutBarItems

  const handleTableSelect = (tableId: string) => {
    if (selectedTableId !== tableId) {
      clearCartFromTerminal()
    }
    const table = currentStore?.tables.find((t) => t.id === tableId)
    if (table?.order) {
      setSelectedTableId(null)
      setServingTableId(tableId)
      return
    }
    setServingTableId(null)
    setSelectedTableId(tableId)
  }
  const handleAddItemToCart = useCallback((item: CartPanelAddItemPayload) => {
    // CartPanel ref가 있으면 addItem으로 위임 (패널 내부 setCartItems = setTerminalCartLines)
    if (cartRef.current?.addItem) {
      cartRef.current.addItem(item)
    } else {
      // 패널 마운트 전/전환 중이면 state 직접 갱신
      setTerminalCartLines((prev) => mergeCartPanelAddItem(prev, item))
    }
  }, [])

  const renderTerminalCartPanel = (
    debugOwner: 'inline-mobile' | 'side-panel' | 'inline-delivery' | 'inline-takeout'
  ) => (
            <CartPanel
              debugOwner={debugOwner}
              onImperativeBridge={bindCartImperative}
              cartItems={terminalCartLines}
              setCartItems={setTerminalCartLines}
              posMenus={menus}
              stores={stores}
            currentStoreId={currentStoreId}
            selectedTable={selectedTable}
            onStoreChange={setCurrentStoreId}
            t={t}
            lockOrderType
            orderType={cartOrderType}
            onBackToTableSelection={
              activeTab === 'tables' && selectedTableId ? () => setSelectedTableId(null) : undefined
            }
            deliveryApp={deliveryApp ?? undefined}
            deliveryAppName={effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name}
            deliveryOrderNo={deliveryOrderNo}
            takeoutLabel={takeoutLabel}
            pricingAdjustments={pricingAdjustments}
            pendingOrderId={activeTab === 'tables' ? pendingDineInOrderId : activeTab === 'takeout' ? pendingTakeoutOrderId : activeTab === 'delivery' ? pendingDeliveryOrderId : null}
            onCustomerDisplayPaymentDraftChange={setCustomerDisplayPaymentDraft}
            onBeforeOpenPayment={async (payload: CartPanelBeforePaymentReceiptPayload) => {
              if (!autoPrintFinalOrderBeforePayment || !isMainPosDevice) return
              await printReceiptNow(payload, undefined, false, undefined, true)
            }}
            onDeliveryOrderComplete={async (payload, existingOrderId) => {
              try {
                if (existingOrderId != null && payload.payment != null) {
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payload.items),
                    tableName: payload.orderLabel,
                    memo: payload.memo ?? '',
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    paymentCash: payload.payment.paymentCash,
                    paymentCard: payload.payment.paymentCard,
                    paymentQr: payload.payment.paymentQr,
                    paymentOther: payload.payment.paymentOther,
                    paymentDeliveryApp: payload.payment.paymentDeliveryApp ?? 0,
                    deliveryPaymentChannel: payload.payment.deliveryPaymentChannel ?? null,
                    linkposPayment: linkpos.linkposPayment,
                    pricingAdjustments,
                  })
                  await updatePosOrderStatus({ id: existingOrderId, status: 'completed' })
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: payload.payment?.paymentCard ?? 0, adjustments: pricingAdjustments })
                if (existingOrderId != null && existingOrderId > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(existingOrderId)
                }
                await tryOpenDrawerForPayment(payload.payment)
                setReceiptData({
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: cartLinesToPosOrderItems(payload.items),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'delivery',
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                })
                setPendingReceiptOrderNo(null)
                setPendingDeliveryOrderId(null)
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
                await refetchStores()
                if (payload.payment != null) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onTakeoutOrderComplete={async (payload, existingOrderId) => {
              try {
                if (existingOrderId != null && payload.payment != null) {
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payload.items),
                    tableName: payload.orderLabel,
                    memo: payload.memo ?? '',
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    paymentCash: payload.payment.paymentCash,
                    paymentCard: payload.payment.paymentCard,
                    paymentQr: payload.payment.paymentQr,
                    paymentOther: payload.payment.paymentOther,
                    paymentDeliveryApp: payload.payment.paymentDeliveryApp ?? 0,
                    deliveryPaymentChannel: payload.payment.deliveryPaymentChannel ?? null,
                    linkposPayment: linkpos.linkposPayment,
                    pricingAdjustments,
                  })
                  await updatePosOrderStatus({ id: existingOrderId, status: 'completed' })
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: payload.payment?.paymentCard ?? 0, adjustments: pricingAdjustments })
                if (existingOrderId != null && existingOrderId > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(existingOrderId)
                }
                await tryOpenDrawerForPayment(payload.payment)
                setReceiptData({
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: cartLinesToPosOrderItems(payload.items),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'takeout',
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                })
                setPendingReceiptOrderNo(null)
                setPendingTakeoutOrderId(null)
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
                await refetchStores()
                if (payload.payment != null) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onOrderSubmit={async (payload) => {
              const existingOrder = selectedTable?.order ?? null
              const existingOrderId = Number(existingOrder?.id ?? 0)
              const isAddOrder = existingOrder != null && Number.isFinite(existingOrderId) && existingOrderId > 0
              const shouldAutoPrintReceipt = isAddOrder ? autoPrintReceiptOnAddOrder : autoPrintReceiptOnOrder
              try {
                const incomingItems = cartLinesToPosOrderItems(payload.items)
                let savedOrderNo = ''
                let savedOrderId: number | null = null
                if (isAddOrder && existingOrder) {
                  const mergedItems = [
                    ...existingOrder.items.map((it) => ({
                      id: it.id,
                      name: it.name,
                      price: it.price,
                      qty: it.quantity || 1,
                      ...(it.note?.trim() ? { note: it.note.trim() } : {}),
                      ...(it.servedAt ? { servedAt: it.servedAt } : {}),
                      ...(it.servedBy ? { servedBy: it.servedBy } : {}),
                    })),
                    ...incomingItems,
                  ]
                  const res = await updatePosOrder({
                    id: existingOrderId,
                    items: mergedItems,
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount ?? existingOrder.guestCount,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                  })
                  if (!res.success) {
                    const msg = res.message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = existingOrderId
                  savedOrderNo = existingOrder.orderNo ?? ''
                } else {
                  const res = await savePosOrderWithOffline({
                    storeCode: currentStoreId,
                    createdBy: auth?.user ?? '',
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt,
                    discountReason: payload.discountReason,
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                    items: incomingItems,
                  })
                  if (!res.success) {
                    const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = res.orderId ?? null
                  savedOrderNo = (res as { orderNo?: string }).orderNo ?? ''
                  await notifyQueuedSave(savedOrderNo, (res as { queued?: boolean }).queued)
                }
                let skipLocalAutoPrint = false
                if (savedOrderId != null) {
                  skipLocalAutoPrint = seenOrderIdsRef.current.has(savedOrderId)
                  seenOrderIdsRef.current.add(savedOrderId)
                  if (savedOrderId > lastSeenOrderIdRef.current) {
                    lastSeenOrderIdRef.current = savedOrderId
                  }
                }

                type ReceiptPrintLine = {
                  id: string
                  name: string
                  price: number
                  qty: number
                  note?: string
                  isAddon?: boolean
                }
                const mapPosItemToReceiptLine = (
                  it: (typeof incomingItems)[number],
                  addon: boolean
                ): ReceiptPrintLine => ({
                  id: String(it.id ?? ''),
                  name: String(it.name ?? ''),
                  price: Number(it.price ?? 0),
                  qty: Math.max(1, Number(it.qty ?? 1) || 1),
                  ...(String((it as { note?: string }).note ?? '').trim()
                    ? { note: String((it as { note?: string }).note).trim() }
                    : {}),
                  ...(addon ? { isAddon: true as const } : {}),
                })
                const receiptPrintItems: ReceiptPrintLine[] =
                  isAddOrder && existingOrder
                    ? [
                        ...existingOrder.items.map((it) => ({
                          id: String(it.id),
                          name: it.name,
                          price: it.price,
                          qty: Math.max(1, it.quantity || 1),
                          ...(it.note?.trim() ? { note: it.note.trim() } : {}),
                        })),
                        ...incomingItems.map((it) => mapPosItemToReceiptLine(it, true)),
                      ]
                    : incomingItems.map((it) => mapPosItemToReceiptLine(it, false))

                const mergeSubtotal = receiptPrintItems.reduce((s, i) => s + i.price * i.qty, 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({
                  subtotal: mergeSubtotal,
                  discountAmt,
                  cardPaymentAmount: 0,
                  adjustments: pricingAdjustments,
                })
                const orderNoStr = savedOrderNo
                const kitchenCartLines =
                  isAddOrder && existingOrder
                    ? filterKitchenCartLinesForDineInAdd(payload.items, existingOrder.items)
                    : payload.items
                const receiptPayloadSubmit = {
                  orderNo: savedOrderNo,
                  storeCode: currentStoreId,
                  orderType: t('posOrderTypeDineIn') || '매장',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  items: receiptPrintItems,
                  subtotal: mergeSubtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                }
                const runKitchenAfterDineInSubmit = () => {
                  if (kitchenCartLines.length === 0) return
                  const itemsForKitchen = kitchenCartLines.map((i) => ({
                    id: i.id,
                    name: i.name,
                    price: i.price,
                    qty: i.quantity || 1,
                    ...(String((i as { note?: string }).note ?? '').trim()
                      ? { note: String((i as { note?: string }).note).trim() }
                      : {}),
                  }))
                  getPosPrinterSettings({ storeCode: currentStoreId })
                    .then((settings) => {
                      const orderTypeLabels: Record<string, string> = {
                        dine_in: t('posOrderTypeDineIn') ?? '매장',
                        takeout: t('posOrderTypeTakeout') ?? '포장',
                        delivery: t('posOrderTypeDelivery') ?? '배달',
                      }
                      const kLabels = {
                        unified: t('posKitchenOrder') || '주방 주문서',
                        kitchen1: `${t('posKitchen1') || '주방 1'}`,
                        kitchen2: `${t('posKitchen2') || '주방 2'}`,
                        kitchen3: `${t('posKitchen3') || '주방 3'}`,
                      }
                      const slips = buildKitchenSlipGroups(
                        itemsForKitchen,
                        buildKitchenSlipGroupOpts(settings, menus, kLabels)
                      )
                      if (!slips.length) return
                      const slipDesign = resolveKitchenSlipDesign(settings)
                      const kitchenMemo = parsePosOrderMemo(payload.memo).plainMemo
                      const memoLine = kitchenMemo.trim()
                        ? (t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                        : ''
                      const cR = (tag: string) => '\u003c/' + tag + '>'
                      const tablePartR = payload.tableName
                        ? ' · ' + (t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(payload.tableName, t)
                        : ''
                      const addonKitchenHead =
                        isAddOrder
                          ? '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000">' +
                            escapeHtml(tPrint('posReceiptAddonSection') || '추가 주문') +
                            cR('div')
                          : ''
                      const printOne = (idx: number) => {
                        if (idx >= slips.length) return
                        const slip = slips[idx]
                        const html = buildKitchenSlipDocumentHtml({
                          label: slip.label,
                          orderNo: orderNoStr,
                          storeCode: currentStoreId,
                          orderTypeLabel: orderTypeLabels.dine_in || '매장',
                          tablePart: tablePartR,
                          dateStr: formatPosDateTimeMedium(new Date(), lang),
                          items: slip.items.map((it) => ({
                            name: translatePosMenuLineForReceipt(it.name, t),
                            qty: it.qty,
                            note: it.note,
                          })),
                          memoLine: memoLine || null,
                          escapeHtml,
                          design: slipDesign,
                          printColorAdjust: 'exact',
                          prependItemsHtml: isAddOrder && idx === 0 ? addonKitchenHead : '',
                        })
                        printPosHtmlDocument(html, {
                          title: slip.label,
                          printDelayMs: 0,
                          focusIframeBeforePrint: false,
                          printRole: 'kitchen',
                          kitchenStation: slip.station,
                          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
                          onPrintUnavailable: () => {
                            void appAlert(t('posPrintUnavailable'))
                          },
                          onAfterCleanup: () => {
                            if (idx + 1 < slips.length)
                    setTimeout(() => printOne(idx + 1), POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS)
                          },
                        })
                      }
                      setTimeout(() => printOne(0), 0)
                    })
                    .catch((e) => console.error('Kitchen slip print:', e))
                }
                if (isMainPosDevice && shouldAutoPrintReceipt && !skipLocalAutoPrint) {
                  if (autoPrintKitchenSlipOnOrder && kitchenCartLines.length > 0) {
                    void printReceiptNow(
                      receiptPayloadSubmit,
                      null,
                      false,
                      undefined,
                      true,
                      runKitchenAfterDineInSubmit
                    )
                  } else {
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true)
                  }
                } else if (
                  isMainPosDevice &&
                  autoPrintKitchenSlipOnOrder &&
                  !skipLocalAutoPrint &&
                  payload.items.length > 0 &&
                  kitchenCartLines.length > 0
                ) {
                  setTimeout(runKitchenAfterDineInSubmit, 180)
                } else if (
                  isMainPosDevice &&
                  !skipLocalAutoPrint &&
                  !(isAddOrder ? autoPrintReceiptOnAddOrder : autoPrintReceiptOnOrder) &&
                  !autoPrintKitchenSlipOnOrder
                ) {
                  /** 자동 인쇄(영수증·주방) 모두 꺼진 경우: 수동 인쇄 안내 모달(Windows 인쇄 대화상자로 이어짐) */
                  setReceiptData({
                    orderNo: orderNoStr,
                    items: receiptPrintItems,
                    subtotal: mergeSubtotal,
                    discountAmt,
                    total: pricing.finalTotal,
                    storeCode: currentStoreId,
                    orderType: t('posOrderTypeDineIn') || '매장',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountReason: payload.discountReason,
                    vatFeeAmt: pricing.vatFeeAmt,
                    vatFeeMode: pricing.vatFeeMode,
                    serviceFeeAmt: pricing.serviceFeeAmt,
                    serviceFeeMode: pricing.serviceFeeMode,
                    cardFeeAmt: pricing.cardFeeAmt,
                    cardFeeMode: pricing.cardFeeMode,
                    otherFeeAmt: pricing.otherFeeAmt,
                    otherFeeMode: pricing.otherFeeMode,
                    receiptAutoPrintContext: isAddOrder ? 'add_order' : 'order',
                  })
                }
                if (savedOrderId != null) setPendingDineInOrderId(savedOrderId)
                setServingTableId(null)
                setSelectedTableId(null)
                await refetchStores()
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              }
            }}
            onDineInOrderComplete={async (payload, existingOrderId) => {
              try {
                let orderIdToComplete: number | null = null
                let orderNo: string = ''
                const pay = payload.payment
                const linkpos = pay ? await runLinkposPaymentIfNeeded(pay) : { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
                if (!linkpos.ok) return
                const targetClose = resolveDineInCloseStatus(!!payload.isPrepaid)
                /** 서버에 행이 있을 때만 update API 사용 (오프라인 임시 음수 id 제외) */
                if (existingOrderId != null && existingOrderId > 0 && pay != null) {
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payload.items),
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    paymentCash: pay.paymentCash,
                    paymentCard: pay.paymentCard,
                    paymentQr: pay.paymentQr,
                    paymentOther: pay.paymentOther,
                    paymentDeliveryApp: pay.paymentDeliveryApp ?? 0,
                    deliveryPaymentChannel: pay.deliveryPaymentChannel ?? null,
                    linkposPayment: linkpos.linkposPayment,
                    pricingAdjustments,
                  })
                  orderIdToComplete = existingOrderId
                  orderNo = pendingReceiptOrderNo ?? ''
                } else if (pay != null) {
                  const localNoCandidate =
                    (pendingReceiptOrderNo?.startsWith('LOCAL-') ? pendingReceiptOrderNo : null) ??
                    (servingTable?.order?.orderNo?.startsWith('LOCAL-')
                      ? servingTable.order.orderNo
                      : null) ??
                    (selectedTable?.order?.orderNo?.startsWith('LOCAL-')
                      ? selectedTable.order.orderNo
                      : null)
                  let mergedLocal = false
                  if (localNoCandidate) {
                    mergedLocal = await mergeQueuedSavePosOrderByLocalOrderNo(localNoCandidate, (body) => ({
                      ...body,
                      items: cartLinesToPosOrderItems(payload.items),
                      tableName: payload.tableName,
                      memo: payload.memo,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      couponCode: payload.couponCode,
                      couponDiscountAmt: payload.couponDiscountAmt,
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      paymentCash: pay.paymentCash,
                      paymentCard: pay.paymentCard,
                      paymentQr: pay.paymentQr,
                      paymentOther: pay.paymentOther,
                      paymentDeliveryApp: pay.paymentDeliveryApp ?? 0,
                      deliveryPaymentChannel: pay.deliveryPaymentChannel ?? null,
                      linkposPayment: linkpos.linkposPayment,
                      pricingAdjustments,
                      closeStatus: targetClose,
                    }))
                  }
                  if (mergedLocal) {
                    orderNo = localNoCandidate ?? ''
                    orderIdToComplete = null
                    await notifyQueuedSave(orderNo, true)
                  } else {
                    const res = await savePosOrderWithOffline({
                      storeCode: currentStoreId,
                      createdBy: auth?.user ?? '',
                      orderType: 'dine_in',
                      tableName: payload.tableName,
                      memo: payload.memo,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      couponCode: payload.couponCode,
                      couponDiscountAmt: payload.couponDiscountAmt,
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      items: cartLinesToPosOrderItems(payload.items),
                      paymentCash: pay.paymentCash,
                      paymentCard: pay.paymentCard,
                      paymentQr: pay.paymentQr,
                      paymentOther: pay.paymentOther,
                      paymentDeliveryApp: pay.paymentDeliveryApp ?? 0,
                      deliveryPaymentChannel: pay.deliveryPaymentChannel ?? null,
                      linkposPayment: linkpos.linkposPayment,
                      pricingAdjustments,
                      closeStatus: targetClose,
                    })
                    orderIdToComplete = (res as { orderId?: number }).orderId ?? null
                    orderNo = (res as { orderNo?: string }).orderNo ?? ''
                    await notifyQueuedSave(orderNo, (res as { queued?: boolean }).queued)
                  }
                }
                if (orderIdToComplete != null) {
                  const targetStatus = payload.isPrepaid ? 'paid' : 'completed'
                  await updatePosOrderStatus({ id: orderIdToComplete, status: targetStatus })
                  /** 후불(완료)만 즉시 테이블 비움. 선불(paid)은 테이블·내역 유지 */
                  if (!payload.isPrepaid && payload.tableName) {
                    clearTableOrder(currentStoreId, payload.tableName)
                  }
                } else if (pay != null && payload.tableName && !payload.isPrepaid) {
                  /** 오프라인 등 orderId 없이 저장만 한 후불 완료 시 테이블 비움 */
                  clearTableOrder(currentStoreId, payload.tableName)
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: payload.payment?.paymentCard ?? 0, adjustments: pricingAdjustments })
                if (orderIdToComplete != null && orderIdToComplete > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(orderIdToComplete)
                }
                await tryOpenDrawerForPayment(payload.payment)
                setReceiptData({
                  orderNo,
                  items: cartLinesToPosOrderItems(payload.items),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'dine_in',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                })
                setPendingReceiptOrderNo(null)
                setPendingDineInOrderId(null)
                setServingTableId(null)
                setSelectedTableId(null)
                await refetchStores()
                if (pay) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              }
            }}
            onNonDineOrderComplete={async (payload) => {
              try {
                const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                if (!linkpos.ok) return
                const res = await savePosOrderWithOffline({
                  storeCode: currentStoreId,
                  createdBy: auth?.user ?? '',
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountAmt: payload.discountAmt ?? 0,
                  discountReason: payload.discountReason ?? '',
                  memberId: payload.memberId,
                  memberNo: payload.memberNo,
                  couponCode: payload.couponCode,
                  couponDiscountAmt: payload.couponDiscountAmt,
                  pointUsed: payload.pointUsed,
                  items: cartLinesToPosOrderItems(payload.items),
                  ...(payload.orderType === 'delivery' && deliveryApp
                    ? { deliveryAppCode: String(deliveryApp) }
                    : {}),
                  paymentCash: payload.payment?.paymentCash ?? 0,
                  paymentCard: payload.payment?.paymentCard ?? 0,
                  paymentQr: payload.payment?.paymentQr ?? 0,
                  paymentOther: payload.payment?.paymentOther ?? 0,
                  paymentDeliveryApp: payload.payment?.paymentDeliveryApp ?? 0,
                  deliveryPaymentChannel: payload.payment?.deliveryPaymentChannel ?? null,
                  linkposPayment: linkpos.linkposPayment,
                  pricingAdjustments,
                  closeStatus: 'completed',
                })
                if (!res.success) {
                  const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                  await appAlert(msg)
                  return
                }
                const orderNo = (res as { orderNo?: string }).orderNo ?? ''
                const newOrderId = (res as { orderId?: number }).orderId ?? null
                await notifyQueuedSave(orderNo, (res as { queued?: boolean }).queued)
                let suppressReceiptModalAutoPrint = !isMainPosDevice
                if (newOrderId != null && newOrderId > 0) {
                  if (seenOrderIdsRef.current.has(newOrderId)) suppressReceiptModalAutoPrint = true
                  seenOrderIdsRef.current.add(newOrderId)
                  if (newOrderId > lastSeenOrderIdRef.current) {
                    lastSeenOrderIdRef.current = newOrderId
                  }
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: payload.payment?.paymentCard ?? 0, adjustments: pricingAdjustments })
                await tryOpenDrawerForPayment(payload.payment)
                setReceiptData({
                  orderNo,
                  items: cartLinesToPosOrderItems(payload.items),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  receiptAutoPrintContext: 'order',
                  suppressReceiptModalAutoPrint,
                })
                if (payload.orderType === 'delivery') {
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                } else if (payload.orderType === 'takeout') {
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                }
                await refetchStores()
                if (payload.payment) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('savePosOrder(non-dine):', e)
              }
            }}
          />
  )
  return (
    <div className="h-full flex flex-col bg-background">
      <POSHeader
        stores={stores}
        currentStoreId={currentStoreId}
        onStoreChange={setCurrentStoreId}
        onRefresh={refetchStores}
        todayCompleted={todayCompleted}
        totalSales={totalSales}
        showBackButton
        canChangeStore={stores.length > 0}
        canAccessAdmin={false}
        isMainPosDevice={isMainPosDevice}
        onMainPosDeviceChange={setIsMainPosDevice}
      />
      <OfflineBanner onSyncComplete={refetchStores} />
      <div
        className={cn(
          'flex-1 flex min-h-0 min-w-0',
          isNarrowViewport ? 'flex-col overflow-y-auto' : 'flex-row overflow-hidden'
        )}
      >
        <div
          className={cn(
            'min-w-0 flex flex-col',
            isNarrowViewport ? 'min-h-0 shrink-0' : 'flex-1 min-h-0 overflow-hidden'
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const next = v as 'tables' | 'delivery' | 'takeout'
              if (next !== activeTab) {
                clearCartFromTerminal()
                if (next === 'tables') {
                  setSelectedTableId(null)
                  setServingTableId(null)
                } else if (next === 'delivery') {
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                } else if (next === 'takeout') {
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                }
              }
              setActiveTab(next)
            }}
            className="flex-1 min-w-0 flex flex-col min-h-0"
          >
            <div className={cn(
              "border-b border-border bg-card px-2 sm:px-4 shrink-0",
              isNarrowViewport && "sticky top-0 z-10"
            )}>
              <div className="flex h-12 min-[640px]:h-10 min-h-[44px] items-center justify-between gap-1 min-[640px]:gap-2 flex-wrap">
                <TabsList className="h-12 min-[640px]:h-10 min-h-[44px] bg-transparent shrink-0">
                  <TabsTrigger value="tables" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation">
                    <LayoutGrid className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posTableStatus')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation">
                    <Bike className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeDelivery') || '배달'}</span>
                  </TabsTrigger>
                  <TabsTrigger value="takeout" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation">
                    <Package className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeTakeout') || '포장'}</span>
                  </TabsTrigger>
                </TabsList>
                {/* 오른쪽 영역: 탭별 필터(준비중/결제완료/전체) + 실시간 메뉴 검색 — 배달/포장/테이블 동일 UI, 밑줄 정렬 */}
                <div className="flex items-center gap-1 min-[640px]:gap-2 flex-shrink-0 w-[min(100%,theme(spacing.52))] min-[640px]:w-44 justify-end self-stretch min-h-0">
                  {activeTab === 'tables' && (
                    <Select
                      value={tableListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => setTableListMode(v)}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === 'delivery' && (
                    <Select
                      value={deliveryListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => {
                        setDeliveryListMode(v)
                        setSelectedDeliveryTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === 'takeout' && (
                    <Select
                      value={takeoutListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => {
                        setTakeoutListMode(v)
                        setSelectedTakeoutTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" variant="outline" className="h-9 min-[640px]:h-8 gap-1.5 px-2 min-[640px]:px-3 touch-manipulation shrink-0 rounded-md" onClick={() => setLiveSearchOpen(true)} title={t('posLiveMenuSearch') || '실시간 메뉴 검색'}>
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden min-[500px]:inline">{t('posLiveMenuSearch') || '실시간 메뉴 검색'}</span>
                  </Button>
                </div>
              </div>
            </div>
            {activeTab === 'delivery' && (
              <div className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap">
                {effectiveDeliveryApps.map((app) => (
                  <Button
                    key={app.id}
                    variant={deliveryApp === app.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => setDeliveryApp(app.id)}
                  >
                    {app.name}
                  </Button>
                ))}
                <span className="text-sm font-medium text-muted-foreground ml-2">{t('posDeliveryOrderNo') || '주문 번호'}</span>
                <Input
                  type="text"
                  placeholder={t('posDeliveryOrderNoPh') || '배달 플랫폼 주문번호'}
                  value={deliveryOrderNo}
                  onChange={(e) => setDeliveryOrderNo(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  className="h-8 w-32 max-w-full text-sm"
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    if (!deliveryApp) return
                    setDeliveryOrderNo('')
                    setSelectedDeliveryTargetId('delivery-draft')
                    const appLabelEn = effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name ?? deliveryApp
                    setSelectedDeliveryTargetLabel(appLabelEn)
                  }}
                  disabled={!deliveryApp}
                >
                  + {t('posNewOrder') || '새 주문'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    if (selectedDeliveryOrder) {
                      const label = String(selectedDeliveryOrder.customerName || '').trim() || ''
                      const no = detectDeliveryOrderNo(label)
                      setDeliveryEditOrderNoValue(no)
                      setDeliveryEditOrderNoOpen(true)
                    }
                  }}
                  disabled={!selectedDeliveryOrder}
                >
                  {t('posEditOrderNo') || '수정'}
                </Button>
                </div>
              </div>
            )}
            {activeTab === 'takeout' && (
              <div className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap">
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((slotNo) => (
                    <Button
                      key={slotNo}
                      variant={takeoutMode === 'slot' && takeoutSlot === String(slotNo) ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setTakeoutMode('slot')
                        setTakeoutSlot(String(slotNo))
                      }}
                    >
                      {formatTakeoutSlotLabel(String(slotNo))}
                    </Button>
                  ))}
                  <span className="text-sm font-medium text-muted-foreground ml-2">{t('posTakeoutMemberName') || '회원 이름'}</span>
                  <Input
                    type="text"
                    placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                    value={takeoutMemberName}
                    onChange={(e) => {
                      const v = e.target.value
                      setTakeoutMemberName(v)
                      setTakeoutMode(v.trim() ? 'member' : 'slot')
                    }}
                    onFocus={(e) => {
                      scrollIntoViewOnFocus(e)
                      if (takeoutMemberName.trim()) setTakeoutMode('member')
                    }}
                    list="takeout-member-history"
                    className="h-8 w-32 max-w-full text-sm"
                  />
                  <datalist id="takeout-member-history">
                    {filteredTakeoutMembers.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setSelectedTakeoutTargetId('takeout-draft')
                      setSelectedTakeoutTargetLabel(baseTakeoutLabel)
                    }}
                  >
                    + {t('posNewOrder') || '새 주문'}
                  </Button>
                </div>
              </div>
            )}

            {/* 테이블 현황 탭: 테이블 선택 전 = 플로어 뷰, 선택 후 = 메뉴 화면. 장바구니는 우측(넓음)/하단(좁음) 패널에 단일로 표시 */}
            <TabsContent value="tables" className="flex-1 m-0 p-4 min-h-0 min-w-0 flex flex-col">
              {selectedTableId ? (
                <div
                  className={cn(
                    'flex-1 min-h-0 overflow-hidden',
                    !isNarrowViewport && 'min-h-[260px]'
                  )}
                >
                  <PosTerminalMenuScreen
                    mode="pos-order"
                    storeCode={currentStoreId}
                    selectedTableName={
                      selectedTable?.name
                        ? translateReceiptTableDisplayName(selectedTable.name, t)
                        : String(selectedTableId ?? '')
                    }
                    onBack={() => setSelectedTableId(null)}
                    hideTableContextBar
                    onAddItem={handleAddItemToCart}
                    orderType="dine-in"
                    touchMode={isNarrowViewport ? 'large' : 'default'}
                    containMenuHeight={isNarrowViewport}
                    className="h-full"
                  />
                </div>
              ) : (
                <>
                  {loadingTables && (
                    <div className="h-full flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm min-h-[min(420px,50vh)]">
                      {t('loading')}
                    </div>
                  )}
                  {(!loadingTables && currentLayout.length > 0) && (
                    <div className="h-full min-h-[min(420px,50vh)] min-w-0">
                      <TableFloorView
                        layout={currentLayout}
                        tableListMode={tableListMode}
                        gridCols={30}
                        gridRows={20}
                        getTableStatus={(id, name) => {
                          const tbl = currentStore?.tables.find((t) => t.id === id || t.name === name)
                          if (!tbl?.order) return null
                          const items = Array.isArray(tbl.order.items) ? tbl.order.items : []
                          const servedCount = items.filter((item) => Boolean(item.servedAt)).length
                          const status: 'preparing' | 'partial_served' | 'completed' =
                            (tbl.order.status === 'completed' || tbl.order.status === 'ready')
                              ? 'completed'
                              : servedCount > 0
                                ? 'partial_served'
                                : 'preparing'
                          const getItemTarget = (item: { id?: string; name?: string }) => {
                            const rawId = String(item.id || '').trim()
                            const rawName = String(item.name || '').trim()
                            const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
                            const idKey = normalizedId.split('-')[0]
                            if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
                            const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
                            if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
                            return 0
                          }
                          const targetMin = status === 'preparing'
                            ? Math.max(
                                0,
                                ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') }))
                              )
                            : 0
                          const createdAt = tbl.order.createdAt
                            ? (tbl.order.createdAt instanceof Date
                                ? tbl.order.createdAt.toISOString()
                                : String(tbl.order.createdAt))
                            : undefined
                          const guestCount = Math.max(0, Math.trunc(Number(tbl.order.guestCount ?? 0) || 0))
                          return { status, createdAt, targetMin, guestCount: guestCount > 0 ? guestCount : undefined }
                        }}
                        selectedTableId={selectedTableId ?? servingTableId}
                        onTableSelect={handleTableSelect}
                        activeFloor={activeFloor}
                        onFloorChange={setActiveFloor}
                        t={t}
                        className="h-full min-h-[min(420px,50vh)]"
                        freshMaxMin={cookingRules.freshMaxMin}
                        warningMaxMin={cookingRules.warningMaxMin}
                        ruleMode={cookingRules.mode}
                        recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                        recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                        delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                        delaySoundEnabled={cookingRules.delaySoundEnabled}
                        delayAlertOverMin={cookingRules.delayAlertOverMin}
                      />
                    </div>
                  )}
                  {!loadingTables && currentLayout.length === 0 && currentStore && (
                    <div className="h-full min-h-[280px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm p-4 text-center">
                      {t('posTableLayoutEmpty') || '이 매장에 테이블이 없습니다. 관리자 > POS 설정 > 테이블 구성에서 배치해 주세요.'}
                    </div>
                  )}
                  {!loadingTables && !currentStore && stores.length === 0 && (
                    <div className="h-full min-h-[min(280px,35vh)] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm">
                      {t('posTableLayoutEmpty') || '매장/테이블 배치를 관리자 페이지에서 설정해 주세요.'}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* 배달 탭: 새 주문(draft)일 때만 메뉴 화면, 기존 주문 선택 시 목록 유지 */}
            <TabsContent value="delivery" className="flex-1 m-0 p-4 min-h-0 overflow-auto min-h-[640px]">
              {selectedDeliveryTargetId === 'delivery-draft' ? (
                <PosTerminalMenuScreen
                  mode="pos-order"
                  storeCode={currentStoreId}
                  selectedTableName={selectedDeliveryTargetLabel || (t('posOrderTypeDelivery') || '배달')}
                  onBack={() => setSelectedDeliveryTargetId(null)}
                  backButtonLabel={t('posBack') || '뒤로가기'}
                  onAddItem={handleAddItemToCart}
                  orderType="delivery"
                  deliveryAppCode={deliveryApp || null}
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  containMenuHeight={isNarrowViewport}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={currentDeliveryBarItems}
                  className="min-h-[600px]"
                  t={t}
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  usePackagingLabel
                  selectedId={selectedDeliveryTargetId}
                  onSelect={(id) => {
                    const selected = currentDeliveryBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedDeliveryTargetId && selectedDeliveryTargetId !== id) {
                      clearCartFromTerminal()
                    }
                    setSelectedDeliveryTargetId(id)
                    setSelectedDeliveryTargetLabel(selected.label || (t('posOrderTypeDelivery') || '배달'))
                    const app = detectDeliveryApp([selected.label, selected.rightLabel || ''].join(' '))
                    if (app) setDeliveryApp(app.code)
                    const parsedNo = detectDeliveryOrderNo([selected.label, selected.rightLabel || ''].join(' '))
                    setDeliveryOrderNo(parsedNo)
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>

            {/* 포장 탭 (배달과 동일 높이: 8개 주문 표시) */}
            <TabsContent value="takeout" className="flex-1 m-0 p-4 min-h-0 overflow-auto min-h-[640px]">
              {selectedTakeoutTargetId === 'takeout-draft' ? (
                <PosTerminalMenuScreen
                  mode="pos-order"
                  storeCode={currentStoreId}
                  selectedTableName={`${t('posOrderTypeTakeout') || '포장'} · ${selectedTakeoutTargetLabel || takeoutLabel}`}
                  onBack={() => setSelectedTakeoutTargetId(null)}
                  backButtonLabel={t('posBack') || '뒤로가기'}
                  onAddItem={handleAddItemToCart}
                  orderType="takeout"
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  containMenuHeight={isNarrowViewport}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={currentTakeoutBarItems}
                  className="min-h-[600px]"
                  t={t}
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  usePackagingLabel
                  selectedId={selectedTakeoutTargetId}
                  onSelect={(id) => {
                    const selected = currentTakeoutBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedTakeoutTargetId && selectedTakeoutTargetId !== id) {
                      clearCartFromTerminal()
                    }
                    setSelectedTakeoutTargetId(id)
                    setSelectedTakeoutTargetLabel(selected.label)
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
        {showSidePanel && (() => {
          const panelContent = activeTab === 'delivery' && selectedDeliveryOrder ? (
            <DeliveryOrderPanel
              orderLabel={selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id)}
              deliveryApps={deliveryAppsFromApi}
              order={selectedDeliveryOrder}
              onPackaged={refetchStores}
              onCancel={refetchStores}
              onPay={() => {
                if (!selectedDeliveryOrder) return
                setPendingDeliveryOrderId(Number(selectedDeliveryOrder.id))
                setPendingReceiptOrderNo(selectedDeliveryOrder.orderNo ?? null)
                setPendingDeliveryPayRequest({
                  tableName: selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id),
                  items: selectedDeliveryOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedDeliveryOrder.orderNo,
                })
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              onClose={() => {
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              t={t}
            />
          ) : activeTab === 'tables' && servingTable?.order ? (
            <TableOrderPanel
              tableName={servingTable.name}
              order={servingTable.order}
              allTables={currentStore?.tables ?? []}
              onServed={refetchStores}
              onAddOrder={() => {
                if (!servingTableId) return
                setServingTableId(null)
                setSelectedTableId(servingTableId)
              }}
              onPay={() => {
                if (!servingTableId || !servingTable?.order) return
                setPendingDineInOrderId(Number(servingTable.order.id))
                setPendingReceiptOrderNo(servingTable.order.orderNo ?? null)
                setPendingPayRequest({
                  tableName: servingTable.name,
                  items: servingTable.order.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: servingTable.order.orderNo,
                })
                setServingTableId(null)
              }}
              onLeaveTable={async () => {
                if (!servingTable?.order || !servingTable?.name) return
                clearTableOrder(currentStoreId, servingTable.name)
                setServingTableId(null)
                await refetchStores()
              }}
              onCancel={refetchStores}
              onClose={() => setServingTableId(null)}
              t={t}
            />
          ) : activeTab === 'takeout' && selectedTakeoutOrder ? (
            <TakeoutOrderPanel
              orderLabel={selectedTakeoutTargetLabel || selectedTakeoutOrder.customerName || String(selectedTakeoutOrder.id)}
              order={selectedTakeoutOrder}
              onPackaged={refetchStores}
              onCancel={refetchStores}
              onPay={() => {
                if (!selectedTakeoutOrder) return
                setPendingTakeoutOrderId(Number(selectedTakeoutOrder.id))
                setPendingReceiptOrderNo(selectedTakeoutOrder.orderNo ?? null)
                setPendingTakeoutPayRequest({
                  tableName: selectedTakeoutTargetLabel || selectedTakeoutOrder.customerName || String(selectedTakeoutOrder.id),
                  items: selectedTakeoutOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedTakeoutOrder.orderNo,
                })
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              onClose={() => {
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              t={t}
            />
          ) : renderTerminalCartPanel('side-panel');
          return (
            <div
              className={cn(
                'flex-shrink-0 overflow-hidden flex flex-col border-border bg-card',
                isNarrowViewport
                  ? 'border-t min-h-[180px] max-h-[50vh]'
                  : 'w-72 border-l min-h-0'
              )}
            >
              {panelContent}
            </div>
          )
        })()}
      <LiveMenuSearchDialog
        open={liveSearchOpen}
        onOpenChange={setLiveSearchOpen}
        storeCode={currentStoreId}
        t={t}
      />
      <PosReceiptModal
        onOpenChange={(open) => !open && setReceiptData(null)}
        receiptData={receiptData}
        menus={menus}
        orderTypeLabels={{
          dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
          takeout: tPrint('posOrderTypeTakeout') ?? '포장',
          delivery: tPrint('posOrderTypeDelivery') ?? '배달',
        }}
        t={tPrint}
        autoPrintReceiptOnOrder={autoPrintReceiptOnOrder}
        autoPrintReceiptOnAddOrder={autoPrintReceiptOnAddOrder}
        autoPrintReceiptOnPayment={autoPrintReceiptOnPayment}
        autoPrintKitchenSlipOnOrder={autoPrintKitchenSlipOnOrder}
        receiptBizName={receiptBizName}
        receiptBizTaxId={receiptBizTaxId}
        receiptBizAbn={receiptBizAbn}
        receiptBizOwner={receiptBizOwner}
        receiptBizAddress={receiptBizAddress}
        receiptBizPhone={receiptBizPhone}
        receiptDesignStyle={receiptDesignStyle}
        receiptLogoSize={receiptLogoSize}
        receiptShowTitle={receiptShowTitle}
        receiptShowPaidStamp={receiptShowPaidStamp}
        receiptShowThankYou={receiptShowThankYou}
        receiptShowCustomerCopy={receiptShowCustomerCopy}
        receiptFooterPrimaryText={receiptFooterPrimaryText}
        receiptFooterSecondaryText={receiptFooterSecondaryText}
        receiptLogoImageUrl={receiptLogoImageUrl}
        receiptStampImageUrl={receiptStampImageUrl}
        receiptShowStamp={receiptShowStamp}
        receiptStampOnlyTaxInvoice={receiptStampOnlyTaxInvoice}
        receiptMembershipQrImageUrl={receiptMembershipQrImageUrl}
        receiptMembershipQrLinkUrl={receiptMembershipQrLinkUrl}
        receiptMembershipQrText={receiptMembershipQrText}
        receiptShowMembershipQr={receiptShowMembershipQr}
        signatureLine={signatureLine}
        receiptBarcode={
          receiptBarcode && receiptData?.receiptAutoPrintContext !== 'payment'
        }
        itemBarcode={
          itemBarcode && receiptData?.receiptAutoPrintContext !== 'payment'
        }
        printerSettingsRef={posPrinterSettingsRef}
      />
      <DeliveryEditOrderNoDialog
        open={deliveryEditOrderNoOpen}
        onOpenChange={setDeliveryEditOrderNoOpen}
        order={selectedDeliveryOrder}
        value={deliveryEditOrderNoValue}
        onValueChange={setDeliveryEditOrderNoValue}
        onSaved={async (newTableName) => {
          setSelectedDeliveryTargetLabel(newTableName)
          await refetchStores()
        }}
        t={t}
        deliveryApps={deliveryAppsFromApi}
      />
      </div>
    </div>
  )
}
