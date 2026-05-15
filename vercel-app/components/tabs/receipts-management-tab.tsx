'use client'
import { appAlert, appConfirm } from '@/lib/app-message'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, ChevronDown, Printer, PencilLine, Banknote, CreditCard, QrCode, Bike, Wallet, Copy } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import {
  getPosOrders,
  getPosMenus,
  getPosPromosWithItems,
  getPosPrinterSettings,
  getPosDeliveryApps,
  getPosTaxInvoiceRecipients,
  upsertPosTaxInvoiceRecipient,
  correctPosOrderPayment,
  updatePosOrder,
  updatePosOrderStatus,
  type PosOrder,
  type PosMenu,
  type PosPromoWithItems,
  type PosDeliveryApp,
  type PosTaxInvoiceRecipientRow,
} from '@/lib/api-client'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { useOnlineStatus, onSyncComplete } from '@/lib/offline'
import { isFranchiseeRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { cn, formatBahtNum, escapeHtml } from '@/lib/utils'
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from '@/lib/pos-kitchen-slip-routing'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import {
  parsePosOrderMemo,
  upsertPosOrderTaxInvoiceMemo,
  type PosTaxInvoiceData,
} from '@/lib/pos-tax-invoice'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { kitchenSlipPrintI18n } from '@/lib/pos-kitchen-slip-print-i18n'
import { addDaysYmd, getPosBusinessDateStr } from '@/lib/pos-business-day'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import { getPosDeliveryPlatformName } from '@/lib/pos-delivery-platform'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  receiptModalDataFromPosOrderReprint,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import {
  POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  printPosHtmlDocument,
  type PrintPosHtmlDocumentOptions,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import {
  buildKitchenPrintTrackingId,
  clearKitchenPrintFailure,
  extractOrderTokenFromKitchenPrintTrackingId,
  getKitchenPrintFailure,
  markKitchenPrintFailure,
  subscribeKitchenPrintFailureChanges,
  toKitchenPrintTrackingToken,
} from '@/lib/pos-kitchen-print-tracking'
import {
  parsePaymentOtherBreakdown,
  paymentOtherBreakdownSearchTokens,
  type PosPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'

function formatBangkokDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt)
}

function normalizePosOrderTypeKey(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

function posDeliveryCodeToLabel(code: string | undefined | null): string {
  const c = String(code ?? '').trim().toLowerCase()
  if (!c) return ''
  if (c === 'grab') return 'Grab'
  if (c === 'lineman' || c === 'line_man') return 'Line Man'
  if (c === 'shopee') return 'Shopee'
  return ''
}

/** 목록「구분」열: 매장=테이블명, 배달=배달앱 종류, 포장=라벨 */
function receiptSegmentCell(o: PosOrder): string {
  const type = normalizePosOrderTypeKey(o.orderType)
  if (type === 'dine_in') {
    return (o.tableName || '').trim() || '-'
  }
  if (type === 'takeout') {
    return (o.tableName || '').trim() || '-'
  }
  if (type === 'delivery') {
    const fromCode = posDeliveryCodeToLabel(o.deliveryAppCode)
    if (fromCode) return fromCode
    const fromKw = getPosDeliveryPlatformName(
      { tableName: o.tableName, orderNo: o.orderNo, memo: o.memo },
      undefined
    ).trim()
    if (fromKw) return fromKw
    const tn = (o.tableName || '').trim()
    if (tn) {
      const head = tn.replace(/\s+#\s*.+$/i, '').trim()
      return head || tn
    }
    return '-'
  }
  return (o.tableName || '').trim() || '-'
}

function receiptSegmentSearchHaystack(o: PosOrder): string {
  return [
    receiptSegmentCell(o),
    o.tableName,
    o.deliveryAppCode,
    posDeliveryCodeToLabel(o.deliveryAppCode),
    getPosDeliveryPlatformName({ tableName: o.tableName, orderNo: o.orderNo, memo: o.memo }, undefined),
    paymentOtherBreakdownSearchTokens(parsePaymentOtherBreakdown(o.paymentOtherBreakdown)),
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function taxInvoiceFromRecipientRow(row: PosTaxInvoiceRecipientRow): PosTaxInvoiceData {
  return {
    memberNo: String(row.member_no || '').trim(),
    customerType: row.customer_type === 'company' ? 'company' : 'person',
    name: String(row.name || '').trim(),
    taxId: String(row.tax_id || '').replace(/\D/g, '').slice(0, 13),
    branchNo: String(row.branch_no || '').replace(/\D/g, '').slice(0, 5),
    phone: String(row.phone || '').trim(),
    email: String(row.email || '').trim(),
    address: String(row.address || '').trim(),
    member: Boolean(row.member_no),
  }
}

export interface ReceiptsManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장 */
  offlineAware?: boolean
  /** true: 수정/상태변경 비활성화 (POS 매장) */
  readOnly?: boolean
}

export function ReceiptsManagementTab({ offlineAware = false, readOnly: _readOnly = false }: ReceiptsManagementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, resolveStoreKey } = useStoreList()
  const online = useOnlineStatus()
  const storeCode = auth?.store || stores[0] || ''
  const orderTypeLabels = React.useMemo<Record<string, string>>(
    () => ({
      dine_in: t('posOrderTypeDineIn') || '매장',
      takeout: t('posOrderTypeTakeout') || '포장',
      delivery: t('posOrderTypeDelivery') || '배달',
    }),
    [t]
  )
  const statusLabels = React.useMemo<Record<string, string>>(
    () => ({
      pending: t('posPending') || '대기',
      preparing: t('posOrderStatusPreparing') || '준비중',
      paid: t('posStatusPaid') || '결제완료',
      cooking: t('posStatusCooking') || '조리중',
      ready: t('posStatusReady') || '준비완료',
      completed: t('done') || '완료',
      cancelled: t('cancel') || '취소',
    }),
    [t]
  )

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [startStr, setStartStr] = React.useState(today)
  const [endStr, setEndStr] = React.useState(today)
  const [storeFilter, setStoreFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [appliedSearchTerm, setAppliedSearchTerm] = React.useState('')
  /** `__all__` = 미적용, 그 외 = 배달앱 code(소문자) */
  const [segmentDeliveryCode, setSegmentDeliveryCode] = React.useState('__all__')
  const [appliedSegmentDeliveryCode, setAppliedSegmentDeliveryCode] = React.useState('__all__')
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [payCorrectOrder, setPayCorrectOrder] = React.useState<PosOrder | null>(null)
  const [payCorrectReason, setPayCorrectReason] = React.useState('')
  const [pcCash, setPcCash] = React.useState('')
  const [pcCard, setPcCard] = React.useState('')
  const [pcQr, setPcQr] = React.useState('')
  const [pcOther, setPcOther] = React.useState('')
  const [pcDelApp, setPcDelApp] = React.useState('')
  const [pcDelChannel, setPcDelChannel] = React.useState<'grab' | 'lineman' | 'shopee' | 'dine_in'>('grab')
  const [pcActiveMethod, setPcActiveMethod] = React.useState<'cash' | 'card' | 'qr' | 'delivery_app' | 'other'>('cash')
  const [pcMoveFromMethod, setPcMoveFromMethod] = React.useState<'cash' | 'card' | 'qr' | 'delivery_app' | 'other'>('cash')
  const [pcOtherDetailKey, setPcOtherDetailKey] = React.useState('misc')
  /** 주문 합계(정정 시 결제 분할 합과 일치) */
  const [pcOrderTotal, setPcOrderTotal] = React.useState('')
  const [payCorrectSaving, setPayCorrectSaving] = React.useState(false)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [promosWithItems, setPromosWithItems] = React.useState<PosPromoWithItems[]>([])
  const [deliveryAppsCatalog, setDeliveryAppsCatalog] = React.useState<PosDeliveryApp[]>([])
  const [taxInvoiceOrder, setTaxInvoiceOrder] = React.useState<PosOrder | null>(null)
  const [taxInvoiceSaving, setTaxInvoiceSaving] = React.useState(false)
  const [taxSearchLoading, setTaxSearchLoading] = React.useState(false)
  const [taxSearchField, setTaxSearchField] = React.useState<'taxId' | 'name' | 'phone'>('taxId')
  const [taxSearchKeyword, setTaxSearchKeyword] = React.useState('')
  const [taxSearchRows, setTaxSearchRows] = React.useState<PosTaxInvoiceRecipientRow[]>([])
  const [taxSearchMessage, setTaxSearchMessage] = React.useState('')
  const [, setKitchenPrintFailureVersion] = React.useState(0)
  const [traceCopyToast, setTraceCopyToast] = React.useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const [tiCustomerType, setTiCustomerType] = React.useState<'person' | 'company'>('person')
  const [tiMemberNo, setTiMemberNo] = React.useState('')
  const [tiName, setTiName] = React.useState('')
  const [tiTaxId, setTiTaxId] = React.useState('')
  const [tiBranchNo, setTiBranchNo] = React.useState('')
  const [tiPhone, setTiPhone] = React.useState('')
  const [tiEmail, setTiEmail] = React.useState('')
  const [tiAddress, setTiAddress] = React.useState('')

  const promoCatalogById = React.useMemo(() => {
    const m = new Map<string, PosPromoWithItems>()
    for (const p of promosWithItems) {
      if (p?.id) m.set(String(p.id), p)
    }
    return m
  }, [promosWithItems])

  const posReceiptLineOptsKitchen: PosOrderReceiptLineOptions = React.useMemo(
    () => ({ promoCatalogById, menus }),
    [promoCatalogById, menus]
  )

  /** POS 홈 `selectableStoreCodes`와 동기: 본사(오피스) 좌표만 전 매장, 매장 소속 Officer 등은 소속 매장(·허용 매장)만 */
  const receiptStoreChoices = React.useMemo(() => {
    const list = stores
    const role = String(auth?.role || '')
    if (isOfficeRole(role)) {
      const st = String(auth?.store || '').trim()
      if (st && !isOfficeStore(st)) {
        const out: string[] = [st]
        for (const x of auth?.allowedStores || []) {
          const s = String(x || '').trim()
          if (s && !out.some((o) => resolveStoreKey(o) === resolveStoreKey(s))) out.push(s)
        }
        return out
      }
      if (list.length > 0) return list
      return st ? [st] : []
    }
    if (isFranchiseeRole(role) && auth?.allowedStores && auth.allowedStores.length > 0) {
      const allowed = auth.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
      if (list.length > 0) {
        const filtered = list.filter((code) =>
          allowed.some((a) => resolveStoreKey(a) === resolveStoreKey(code))
        )
        if (filtered.length > 0) return filtered
      }
      return [...allowed].sort((a, b) => a.localeCompare(b))
    }
    if (auth?.store) return [auth.store]
    return list
  }, [stores, auth?.role, auth?.store, auth?.allowedStores, resolveStoreKey])

  /** 본사(또는 JWT 매장 없음) + 본사 역할 → 영수증 API에서 매장 미지정 시 기간 전체(전 매장) */
  const isHqWideAccess = React.useMemo(() => {
    const role = String(auth?.role || '')
    if (!isOfficeRole(role)) return false
    const st = String(auth?.store || '').trim()
    return !st || isOfficeStore(st)
  }, [auth?.role, auth?.store])

  React.useEffect(() => {
    if (isHqWideAccess) return
    if (receiptStoreChoices.length <= 1) return
    if (storeFilter) return
    const st = String(auth?.store || '').trim()
    if (st && receiptStoreChoices.some((c) => resolveStoreKey(c) === resolveStoreKey(st))) {
      setStoreFilter(st)
    }
  }, [isHqWideAccess, receiptStoreChoices, storeFilter, auth?.store, resolveStoreKey])

  const payCorrectOtherDetailOptions = React.useMemo(() => {
    const base: { key: string; label: string }[] = [
      { key: 'trueMoney', label: t('posPaymentTrueMoney') || 'TrueMoney' },
      { key: 'weChat', label: t('posPaymentWeChat') || 'WeChat' },
      { key: 'alipay', label: t('posPaymentAlipay') || 'Alipay' },
      { key: 'linePay', label: t('posPaymentLinePay') || 'LINE Pay' },
      { key: 'shopeePay', label: t('posPaymentShopeePay') || 'Shopee Pay' },
      { key: 'misc', label: t('posPaymentOtherEtc') || '기타' },
    ]
    const row = payCorrectOrder
    if (!row) return base
    const br = parsePaymentOtherBreakdown(row.paymentOtherBreakdown)
    if (!br?.admin || typeof br.admin !== 'object') return base
    const adminRows = Object.keys(br.admin).map((id) => ({
      key: `admin:${String(id)}`,
      label: `Wallet (${String(id)})`,
    }))
    return [...base, ...adminRows]
  }, [payCorrectOrder, t])

  const catalogStoreKey = React.useMemo(() => {
    const nf = storeFilter ? resolveStoreKey(storeFilter) : ''
    const nu = storeCode ? resolveStoreKey(storeCode) : ''
    if (isHqWideAccess) return nf || nu || ''
    if (receiptStoreChoices.length === 1) {
      const only = receiptStoreChoices[0]
      return (only ? resolveStoreKey(only) : '') || only || nu || storeCode || ''
    }
    return nf || nu || storeCode || ''
  }, [isHqWideAccess, storeFilter, storeCode, resolveStoreKey, receiptStoreChoices])

  React.useEffect(() => {
    getPosDeliveryApps({
      storeCode: catalogStoreKey.trim() || undefined,
      includeDisabled: false,
    })
      .then((apps) => {
        const list = Array.isArray(apps) ? apps : []
        setDeliveryAppsCatalog(list.filter((a) => String(a.code ?? '').trim()))
      })
      .catch(() => setDeliveryAppsCatalog([]))
  }, [catalogStoreKey])

  const deliveryAppSelectOptions = React.useMemo((): PosDeliveryApp[] => {
    const raw = deliveryAppsCatalog
    if (raw.length > 0) {
      const by = new Map<string, PosDeliveryApp>()
      for (const a of raw) {
        const k = String(a.code ?? '').trim().toLowerCase()
        if (!k) continue
        if (!by.has(k)) by.set(k, { ...a, code: k })
      }
      return [...by.values()].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    }
    return [
      {
        id: -1,
        code: 'grab',
        name: t('posDeliveryAppGrab') || 'Grab',
        matchKeywords: [],
        displayOrder: 0,
        enabled: true,
        dineOutEnabled: true,
        accentColor: null,
        storeCode: null,
      },
      {
        id: -2,
        code: 'lineman',
        name: t('posDeliveryAppLineMan') || 'Line Man',
        matchKeywords: [],
        displayOrder: 1,
        enabled: true,
        dineOutEnabled: true,
        accentColor: null,
        storeCode: null,
      },
      {
        id: -3,
        code: 'shopee',
        name: t('posDeliveryAppShopee') || 'Shopee',
        matchKeywords: [],
        displayOrder: 2,
        enabled: true,
        dineOutEnabled: true,
        accentColor: null,
        storeCode: null,
      },
    ]
  }, [deliveryAppsCatalog, t])

  const validSegmentCodes = React.useMemo(
    () => new Set(['__all__', ...deliveryAppSelectOptions.map((a) => String(a.code).trim().toLowerCase()).filter(Boolean)]),
    [deliveryAppSelectOptions]
  )

  React.useEffect(() => {
    if (!validSegmentCodes.has(segmentDeliveryCode)) {
      setSegmentDeliveryCode('__all__')
    }
    if (!validSegmentCodes.has(appliedSegmentDeliveryCode)) {
      setAppliedSegmentDeliveryCode('__all__')
    }
  }, [validSegmentCodes, segmentDeliveryCode, appliedSegmentDeliveryCode])

  const filteredOrders = React.useMemo(() => {
    let rows = orders
    if (appliedSearchTerm.trim()) {
      const term = appliedSearchTerm.trim().toLowerCase()
      rows = rows.filter(
        (o) =>
          o.orderNo?.toLowerCase().includes(term) ||
          (o.tableName && o.tableName.toLowerCase().includes(term)) ||
          (o.memo && o.memo.toLowerCase().includes(term)) ||
          receiptSegmentSearchHaystack(o).includes(term) ||
          o.items?.some(
            (it: { name?: string }) =>
              it.name && String(it.name).toLowerCase().includes(term)
          )
      )
    }
    if (appliedSegmentDeliveryCode && appliedSegmentDeliveryCode !== '__all__') {
      const code = appliedSegmentDeliveryCode.trim().toLowerCase()
      const meta = deliveryAppSelectOptions.find((a) => String(a.code).trim().toLowerCase() === code)
      const nameLc = (meta?.name || '').trim().toLowerCase()
      const codeLabelLc = posDeliveryCodeToLabel(code).toLowerCase()
      rows = rows.filter((o) => {
        if (normalizePosOrderTypeKey(o.orderType) !== 'delivery') return false
        const dc = String(o.deliveryAppCode ?? '').trim().toLowerCase()
        if (dc === code) return true
        const hay = receiptSegmentSearchHaystack(o)
        if (nameLc && hay.includes(nameLc)) return true
        if (codeLabelLc && hay.includes(codeLabelLc)) return true
        return hay.includes(code)
      })
    }
    return rows
  }, [orders, appliedSearchTerm, appliedSegmentDeliveryCode, deliveryAppSelectOptions])

  const loadOrders = React.useCallback(() => {
    if (!startStr || !endStr) return
    setLoading(true)
    const normalizedStoreFilter = storeFilter ? resolveStoreKey(storeFilter) : ''
    const normalizedUserStore = storeCode ? resolveStoreKey(storeCode) : ''
    let store: string | undefined
    if (isHqWideAccess) {
      store = normalizedStoreFilter || undefined
    } else if (receiptStoreChoices.length === 1) {
      const only = receiptStoreChoices[0]
      store = (resolveStoreKey(only) || only || normalizedUserStore || storeCode || '').trim() || undefined
    } else {
      store = normalizedStoreFilter || normalizedUserStore || storeCode || undefined
    }
    const fetcher = offlineAware ? getPosOrdersWithCache : getPosOrders
    const params = {
      startStr,
      endStr,
      storeCode: store || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }
    fetcher(params)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [
    startStr,
    endStr,
    storeFilter,
    storeCode,
    statusFilter,
    isHqWideAccess,
    receiptStoreChoices,
    offlineAware,
    resolveStoreKey,
  ])

  /** 날짜·매장·상태 조회 + 키워드·배달앱 클라이언트 필터를 한 번에 적용 */
  const runReceiptSearch = React.useCallback(() => {
    setAppliedSearchTerm(searchTerm)
    setAppliedSegmentDeliveryCode(segmentDeliveryCode)
    loadOrders()
  }, [loadOrders, searchTerm, segmentDeliveryCode])

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  React.useEffect(() => {
    void Promise.all([getPosMenus(), getPosPromosWithItems({ includeInactive: true })])
      .then(([menuRows, promoRows]) => {
        setMenus(menuRows)
        setPromosWithItems(Array.isArray(promoRows) ? promoRows : [])
      })
      .catch(() => {
        setMenus([])
        setPromosWithItems([])
      })
  }, [])

  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadOrders()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, loadOrders])

  React.useEffect(() => {
    if (!offlineAware) return
    return onSyncComplete(() => {
      loadOrders()
    })
  }, [offlineAware, loadOrders])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = startStr === todayStr && endStr === todayStr && statusFilter === 'all'
  const todaySummary = React.useMemo(() => {
    if (!isToday || orders.length === 0) return null
    const completed = orders.filter((o) => ['completed', 'paid', 'ready'].includes(o.status))
    const pending = orders.filter((o) => ['pending', 'cooking'].includes(o.status))
    const cancelled = orders.filter((o) => o.status === 'cancelled')
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      cancelledTotal: cancelled.reduce((s, o) => s + (o.total ?? 0), 0),
    }
  }, [isToday, orders, statusFilter])

  const handlePrintCustomerReceipt = async (o: PosOrder) => {
    const store = (o.storeCode ?? '').trim()
    if (!store || !o.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode: store })
      const receiptData = receiptModalDataFromPosOrderReprint(o, { promoCatalogById, menus })
      const paidAt = o.linkposRespondedAt
        ? new Date(o.linkposRespondedAt)
        : o.createdAt
          ? new Date(o.createdAt)
          : new Date()
      const fullHtml = buildPosPaymentReceiptDocumentHtml({
        receiptData,
        menus,
        orderTypeLabels,
        t,
        lang,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        printedAt: paidAt,
        printerSettings: settings,
        forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(store),
      })
      printPosHtmlDocument(fullHtml, {
        title: t('posReceipt') || '영수증',
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        focusIframeBeforePrint: false,
        printRole: 'receipt',
        printReceiptKind: 'payment',
        escPosCutOverride: resolveEscPosCutOverride(settings, {
          printRole: 'receipt',
          printReceiptKind: 'payment',
        }),
        onPrintUnavailable: () => {
          void appAlert(t('posPrintUnavailable'))
        },
      })
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    }
  }

  const printHtmlWithPosEngine = React.useCallback(
    (
      fullHtml: string,
      title: string,
      thermal?: Pick<
        PrintPosHtmlDocumentOptions,
        | 'printRole'
        | 'printReceiptKind'
        | 'kitchenStation'
        | 'escPosCutOverride'
        | 'onShellPrintResult'
      >
    ) =>
      new Promise<void>((resolve, reject) => {
        printPosHtmlDocument(fullHtml, {
          title,
          printDelayMs: 0,
          fallbackCleanupMs: 120_000,
          ...thermal,
          onPrintUnavailable: () => reject(new Error(POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE)),
          onAfterCleanup: () => resolve(),
        })
      }),
    [t]
  )

  React.useEffect(() => {
    return subscribeKitchenPrintFailureChanges(() => {
      setKitchenPrintFailureVersion((v) => v + 1)
    })
  }, [])

  const resolveKitchenPrintOrderRef = React.useCallback((o: Pick<PosOrder, 'id' | 'orderNo'>) => {
    const orderNo = String(o.orderNo ?? '').trim()
    if (orderNo) return orderNo
    const orderId = Number(o.id ?? 0)
    return orderId > 0 ? `id:${orderId}` : 'UNKNOWN'
  }, [])

  const jumpToOrderByTraceId = React.useCallback(
    (traceId: string) => {
      const token = extractOrderTokenFromKitchenPrintTrackingId(traceId)
      if (!token) return
      const found = orders.find((o) => {
        const orderRef = resolveKitchenPrintOrderRef(o)
        return toKitchenPrintTrackingToken(orderRef) === token
      })
      if (!found) return
      setSearchTerm(String(found.orderNo || ''))
      setAppliedSearchTerm(String(found.orderNo || ''))
      setExpandedId(found.id)
      if (typeof document !== 'undefined') {
        window.setTimeout(() => {
          const el = document.getElementById(`admin-receipt-order-row-${found.id}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 120)
      }
    },
    [orders, resolveKitchenPrintOrderRef]
  )

  const formatTraceIdTail = React.useCallback((traceId: string) => {
    const raw = String(traceId || '').trim()
    if (!raw) return '-'
    return raw.length <= 8 ? raw : `...${raw.slice(-8)}`
  }, [])

  const copyTraceId = React.useCallback((traceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const raw = String(traceId || '').trim()
    if (!raw) return
    navigator.clipboard.writeText(raw).then(
      () => {
        setTraceCopyToast({
          tone: 'success',
          message: t('adminPosOrdersTraceIdCopied') || 'Trace ID를 복사했습니다.',
        })
        window.setTimeout(() => setTraceCopyToast(null), 1400)
      },
      () => {
        setTraceCopyToast({
          tone: 'error',
          message: t('adminPosOrdersTraceIdCopyFailed') || 'Trace ID 복사에 실패했습니다.',
        })
        window.setTimeout(() => setTraceCopyToast(null), 1600)
      },
    )
  }, [t])

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const store = (o.storeCode ?? '').trim()
    if (!store || !o.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    let lastTrackingId = ''
    try {
      const settings = await getPosPrinterSettings({ storeCode: store })
      const ki = kitchenSlipPrintI18n(settings, lang)
      const items = enrichPosOrderLikeItemsWithPromoSnapshot(
        (o.items || []) as unknown as Record<string, unknown>[],
        posReceiptLineOptsKitchen
      ) as { id?: string; name?: string; price?: number; qty?: number }[]
      const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, ki.kLabels))
      if (!slips.length) {
        await appAlert(t('posKitchenNoItemsToPrint'))
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenMemo = parsePosOrderMemo(o.memo).plainMemo
      const memoLine = kitchenMemo.trim()
        ? `${ki.t('posCustomerMemo') || '메모'}: ${kitchenMemo.trim()}`
        : ''
      const dateStr = o.createdAt
        ? formatPosDateTimeMedium(new Date(o.createdAt), ki.lang)
        : '-'
      let shellIssueDetected = false
      const printOne = async (idx: number): Promise<void> => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const printTrackingId = buildKitchenPrintTrackingId({
          orderRef: resolveKitchenPrintOrderRef(o),
          station: slip.station,
          label: slip.label,
        })
        lastTrackingId = printTrackingId
        const segLabel =
          normalizePosOrderTypeKey(o.orderType) === 'dine_in'
            ? ki.t('posTable') || '테이블'
            : ki.t('posReceiptColSegment') || '구분'
        const tablePart = o.tableName ? ` · ${segLabel}: ${o.tableName}` : ''
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: String(o.orderNo ?? ''),
          storeCode: store,
          orderTypeLabel: ki.orderTypeLabels[normalizePosOrderTypeKey(o.orderType)] || o.orderType,
          tablePart,
          dateStr,
          printTrackingId,
          items: slip.items.map((it) => {
            const row = it as { name?: string; qty?: number; note?: string }
            return {
              name: translatePosMenuLineForReceipt(String(row.name ?? '-'), ki.t),
              qty: Number(row.qty ?? 1),
              note: row.note,
            }
          }),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: 'economy',
        })
        await printHtmlWithPosEngine(html, slip.label, {
          printRole: 'kitchen',
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
          onShellPrintResult: (r) => {
            if (r?.ok === false || r?.cutOk === false) shellIssueDetected = true
          },
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
          await printOne(idx + 1)
        }
      }
      await printOne(0)
      if (shellIssueDetected) {
        markKitchenPrintFailure({
          orderRef: resolveKitchenPrintOrderRef(o),
          reason: 'shell_print_or_cut_failed',
          ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
        })
      } else {
        clearKitchenPrintFailure(resolveKitchenPrintOrderRef(o))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      markKitchenPrintFailure({
        orderRef: resolveKitchenPrintOrderRef(o),
        reason: msg || 'print_failed',
        ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
      })
      if (msg === POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE) {
        await appAlert(t('posPrintBlockedBrowser'))
        return
      }
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: msg }))
    }
  }

  /**
   * 정정 가능: 결제·주방 진행 중이거나 완료된 당일(POS 영업일) 주문.
   * - 영업일은 매장별 영업시간(시작·종료)에 따라 자정을 넘길 수 있으므로,
   *   `pos-business-day-hydrate.tsx`가 주입한 매장 영업시간을 사용한다.
   * - 야간 영업 마감 후 다음 날 오전에 전날 주문을 정정할 수 있도록 **오늘·어제 영업일**까지 허용.
   * - 권한·매장 일치, 사유 필수 등 추가 검증은 서버(correctPosOrderPayment)에서 수행.
   */
  const isPayCorrectableOrder = (o: PosOrder) => {
    const st = String(o.status ?? '').toLowerCase()
    if (!['paid', 'completed', 'ready', 'cooking', 'preparing'].includes(st)) return false
    if (!(Number(o.total) > 0.005)) return false
    if (!o.createdAt) return false
    const orderBd = getPosBusinessDateStr(new Date(o.createdAt))
    const todayBd = getPosBusinessDateStr(new Date())
    if (!orderBd || !todayBd) return false
    if (orderBd === todayBd) return true
    return orderBd === addDaysYmd(todayBd, -1)
  }

  const openPayCorrect = (o: PosOrder) => {
    if (!online) {
      void appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    setPayCorrectOrder(o)
    setPayCorrectReason('')
    setPcOrderTotal(String(Math.round(Math.max(0, Number(o.total ?? 0) || 0) * 100) / 100))
    setPcCash(String(Math.max(0, Number(o.paymentCash ?? 0) || 0)))
    setPcCard(String(Math.max(0, Number(o.paymentCard ?? 0) || 0)))
    setPcQr(String(Math.max(0, Number(o.paymentQr ?? 0) || 0)))
    setPcOther(String(Math.max(0, Number(o.paymentOther ?? 0) || 0)))
    setPcDelApp(String(Math.max(0, Number(o.paymentDeliveryApp ?? 0) || 0)))
    const ch0 = String(o.deliveryPaymentChannel ?? '').trim().toLowerCase()
    if (ch0 === 'lineman') setPcDelChannel('lineman')
    else if (ch0 === 'shopee') setPcDelChannel('shopee')
    else if (ch0 === 'dine_in') setPcDelChannel('dine_in')
    else setPcDelChannel('grab')
    const pcash = Math.max(0, Number(o.paymentCash ?? 0) || 0)
    const pcard = Math.max(0, Number(o.paymentCard ?? 0) || 0)
    const pqr = Math.max(0, Number(o.paymentQr ?? 0) || 0)
    const pother = Math.max(0, Number(o.paymentOther ?? 0) || 0)
    const pdel = Math.max(0, Number(o.paymentDeliveryApp ?? 0) || 0)
    if (pcash > 0.005) setPcActiveMethod('cash')
    else if (pcard > 0.005) setPcActiveMethod('card')
    else if (pqr > 0.005) setPcActiveMethod('qr')
    else if (pdel > 0.005) setPcActiveMethod('delivery_app')
    else if (pother > 0.005) setPcActiveMethod('other')
    else setPcActiveMethod('cash')
    if (pcash > 0.005) setPcMoveFromMethod('cash')
    else if (pcard > 0.005) setPcMoveFromMethod('card')
    else if (pqr > 0.005) setPcMoveFromMethod('qr')
    else if (pdel > 0.005) setPcMoveFromMethod('delivery_app')
    else if (pother > 0.005) setPcMoveFromMethod('other')
    else setPcMoveFromMethod('cash')
    const br = parsePaymentOtherBreakdown(o.paymentOtherBreakdown)
    if ((Number(br?.trueMoney) || 0) > 0.005) setPcOtherDetailKey('trueMoney')
    else if ((Number(br?.weChat) || 0) > 0.005) setPcOtherDetailKey('weChat')
    else if ((Number(br?.alipay) || 0) > 0.005) setPcOtherDetailKey('alipay')
    else if ((Number(br?.linePay) || 0) > 0.005) setPcOtherDetailKey('linePay')
    else if ((Number(br?.shopeePay) || 0) > 0.005) setPcOtherDetailKey('shopeePay')
    else if ((Number(br?.misc) || 0) > 0.005) setPcOtherDetailKey('misc')
    else if (br?.admin && typeof br.admin === 'object') {
      const firstAdmin = Object.keys(br.admin)[0]
      setPcOtherDetailKey(firstAdmin ? `admin:${firstAdmin}` : 'misc')
    } else {
      setPcOtherDetailKey('misc')
    }
  }

  const applyTaxInvoiceProfile = React.useCallback((profile: PosTaxInvoiceData) => {
    setTiCustomerType(profile.customerType === 'company' ? 'company' : 'person')
    setTiMemberNo(String(profile.memberNo || '').trim())
    setTiName(String(profile.name || '').trim())
    setTiTaxId(String(profile.taxId || '').replace(/\D/g, '').slice(0, 13))
    setTiBranchNo(String(profile.branchNo || '').replace(/\D/g, '').slice(0, 5))
    setTiPhone(String(profile.phone || '').trim())
    setTiEmail(String(profile.email || '').trim())
    setTiAddress(String(profile.address || '').trim())
  }, [])

  const openTaxInvoiceEditor = React.useCallback((order: PosOrder) => {
    const parsed = parsePosOrderMemo(order.memo)
    setTaxInvoiceOrder(order)
    setTaxSearchField('taxId')
    setTaxSearchKeyword('')
    setTaxSearchRows([])
    setTaxSearchMessage('')
    if (parsed.taxInvoice) {
      applyTaxInvoiceProfile(parsed.taxInvoice)
      return
    }
    setTiCustomerType('person')
    setTiMemberNo('')
    setTiName('')
    setTiTaxId('')
    setTiBranchNo('')
    setTiPhone('')
    setTiEmail('')
    setTiAddress('')
  }, [applyTaxInvoiceProfile])

  const normalizedTiTaxId = tiTaxId.replace(/\D/g, '').slice(0, 13)
  const normalizedTiBranchNo = tiBranchNo.replace(/\D/g, '').slice(0, 5)
  const normalizedTiPhone = tiPhone.replace(/\D/g, '').slice(0, 10)
  const normalizedTiEmail = tiEmail.trim()
  const normalizedTiAddress = tiAddress.trim()
  const normalizedTiName = tiName.trim()
  const normalizedTiMemberNo = tiMemberNo.trim()
  const taxBranchRequired = tiCustomerType === 'company'
  const effectiveTiBranchNo = taxBranchRequired ? normalizedTiBranchNo : (normalizedTiBranchNo || '00000')
  const taxEmailValid =
    normalizedTiEmail.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedTiEmail)
  const taxFormErrors: string[] = []
  if (!normalizedTiName) taxFormErrors.push('name')
  if (normalizedTiTaxId.length !== 13) taxFormErrors.push('taxId')
  if (taxBranchRequired && effectiveTiBranchNo.length !== 5) taxFormErrors.push('branch')
  if (!taxBranchRequired && normalizedTiBranchNo && normalizedTiBranchNo.length !== 5) taxFormErrors.push('branch')
  if (normalizedTiPhone.length < 9 || normalizedTiPhone.length > 10) taxFormErrors.push('phone')
  if (!normalizedTiAddress) taxFormErrors.push('address')
  if (!taxEmailValid) taxFormErrors.push('email')

  const handleTaxRecipientSearch = async () => {
    if (!auth?.store || !auth?.role) {
      await appAlert(t('posReceiptPayCorrectUnauthorized') || '권한 정보가 없습니다.')
      return
    }
    const keyword = taxSearchKeyword.trim()
    if (!keyword) {
      setTaxSearchMessage(t('posTaxSearchNeedKeyword') || '검색어를 입력해 주세요.')
      return
    }
    const qForApi =
      taxSearchField === 'taxId' || taxSearchField === 'phone'
        ? keyword.replace(/\D/g, '')
        : keyword
    if (!qForApi) {
      setTaxSearchMessage(t('posTaxSearchNeedKeyword') || '검색어를 입력해 주세요.')
      return
    }
    setTaxSearchLoading(true)
    setTaxSearchMessage('')
    try {
      const res = await getPosTaxInvoiceRecipients({
        userStore: auth.store,
        userRole: auth.role,
        storeCode: taxInvoiceOrder?.storeCode || storeCode || undefined,
        q: qForApi,
        by: taxSearchField,
        limit: 20,
      })
      if (!res.success) {
        setTaxSearchRows([])
        setTaxSearchMessage(String(res.message || t('itemsNoResults') || '검색 결과가 없습니다.'))
        return
      }
      const rows = Array.isArray(res.rows) ? res.rows.filter((r) => r.is_active) : []
      setTaxSearchRows(rows)
      if (rows.length === 0) {
        setTaxSearchMessage(t('posTaxSearchNoSavedProfile') || '저장된 수취인 정보가 없습니다.')
      }
    } catch (e) {
      setTaxSearchRows([])
      setTaxSearchMessage(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setTaxSearchLoading(false)
    }
  }

  const handleSaveTaxInvoice = async () => {
    if (!taxInvoiceOrder) return
    if (!online) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    if (taxFormErrors.length > 0) {
      await appAlert(t('posTaxInvoiceInvalid') || '세금계산서 정보를 확인해 주세요.')
      return
    }
    const nextTaxInvoice: PosTaxInvoiceData = {
      memberNo: normalizedTiMemberNo,
      customerType: tiCustomerType,
      name: normalizedTiName,
      taxId: normalizedTiTaxId,
      branchNo: effectiveTiBranchNo,
      phone: normalizedTiPhone,
      email: normalizedTiEmail,
      address: normalizedTiAddress,
      member: Boolean(normalizedTiMemberNo),
    }
    const nextMemo = upsertPosOrderTaxInvoiceMemo(taxInvoiceOrder.memo, nextTaxInvoice)
    if (!taxInvoiceOrder.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    setTaxInvoiceSaving(true)
    try {
      const res = await updatePosOrder({
        id: taxInvoiceOrder.id,
        items: taxInvoiceOrder.items,
        tableName: taxInvoiceOrder.tableName || '',
        memo: nextMemo,
        discountAmt: Number(taxInvoiceOrder.discountAmt || 0),
        discountReason: String(taxInvoiceOrder.discountReason || ''),
        paymentCash: Number(taxInvoiceOrder.paymentCash || 0),
        paymentCard: Number(taxInvoiceOrder.paymentCard || 0),
        paymentQr: Number(taxInvoiceOrder.paymentQr || 0),
        paymentOther: Number(taxInvoiceOrder.paymentOther || 0),
        paymentOtherBreakdown: taxInvoiceOrder.paymentOtherBreakdown ?? null,
        paymentDeliveryApp: Number(taxInvoiceOrder.paymentDeliveryApp || 0),
        deliveryPaymentChannel:
          Number(taxInvoiceOrder.paymentDeliveryApp || 0) > 0.005
            ? String(taxInvoiceOrder.deliveryPaymentChannel || 'grab')
            : null,
        memberId: Number(taxInvoiceOrder.memberId || 0) || undefined,
        memberNo: String(taxInvoiceOrder.memberNo || ''),
        couponCode: String(taxInvoiceOrder.couponCode || ''),
        couponDiscountAmt: Number(taxInvoiceOrder.couponDiscountAmt || 0),
        pointUsed: Number(taxInvoiceOrder.pointUsed || 0),
        pointEarned: Number(taxInvoiceOrder.pointEarned || 0),
        guestCount: Number(taxInvoiceOrder.guestCount || 0),
      })
      if (!res.success) {
        await appAlert(String(res.message || t('processFail') || '실패'))
        return
      }
      await handlePrintCustomerReceipt({ ...taxInvoiceOrder, memo: nextMemo })
      if (auth?.store && auth?.role) {
        await upsertPosTaxInvoiceRecipient({
          userStore: auth.store,
          userRole: auth.role,
          storeCode: taxInvoiceOrder.storeCode || storeCode,
          memberNo: normalizedTiMemberNo || null,
          customerType: tiCustomerType,
          name: normalizedTiName,
          taxId: normalizedTiTaxId,
          branchNo: effectiveTiBranchNo,
          phone: normalizedTiPhone,
          email: normalizedTiEmail,
          address: normalizedTiAddress,
          source: 'receipt_management_after_payment',
        })
      }
      await appAlert(t('msg_saved'))
      setTaxInvoiceOrder(null)
      setTaxSearchRows([])
      setTaxSearchMessage('')
      void loadOrders()
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setTaxInvoiceSaving(false)
    }
  }

  const resolvePayCorrectErrorMessage = (code: string) => {
    const c = String(code || '').trim()
    if (c === 'today_only') return t('posReceiptPayCorrectTodayOnly')
    if (c === 'status_not_correctable') return t('posReceiptPayCorrectStatus')
    if (c === 'payment_total_mismatch') return t('posReceiptPayCorrectMismatch')
    if (c === 'total_invalid') return t('posReceiptPayCorrectTotalInvalid')
    if (c === 'total_fix_requires_positive_prev') return t('posReceiptPayCorrectTotalFixBlocked')
    if (c === 'payment_other_breakdown_mismatch') return t('posReceiptPayCorrectOtherBreakdownMismatch')
    if (c === 'forbidden_store') return t('posReceiptPayCorrectForbidden')
    if (c === 'reason_required') return t('posReceiptPayCorrectReasonShort')
    if (c === 'Unauthorized') return t('posReceiptPayCorrectUnauthorized')
    return c || t('processFail') || '실패'
  }

  const payCorrectOrderTotal = React.useMemo(() => {
    if (!payCorrectOrder) return 0
    const raw = parseFloat(String(pcOrderTotal).replace(/,/g, '').trim())
    if (!Number.isFinite(raw)) return 0
    return Math.round(Math.max(0, raw) * 100) / 100
  }, [payCorrectOrder, pcOrderTotal])
  const pcMethodAmount = React.useCallback(
    (m: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'): number => {
      if (m === 'cash') return Math.max(0, parseFloat(pcCash) || 0)
      if (m === 'card') return Math.max(0, parseFloat(pcCard) || 0)
      if (m === 'qr') return Math.max(0, parseFloat(pcQr) || 0)
      if (m === 'delivery_app') return Math.max(0, parseFloat(pcDelApp) || 0)
      return Math.max(0, parseFloat(pcOther) || 0)
    },
    [pcCash, pcCard, pcQr, pcDelApp, pcOther]
  )
  const setPcMethodAmount = React.useCallback(
    (m: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other', amount: number) => {
      const s = String(Math.round(Math.max(0, amount) * 100) / 100)
      if (m === 'cash') setPcCash(s)
      else if (m === 'card') setPcCard(s)
      else if (m === 'qr') setPcQr(s)
      else if (m === 'delivery_app') setPcDelApp(s)
      else setPcOther(s)
    },
    []
  )
  const moveAmountToActiveMethod = React.useCallback(() => {
    const from = pcMoveFromMethod
    const to = pcActiveMethod
    if (from === to) return
    const amt = pcMethodAmount(from)
    if (amt <= 0.005) return
    setPcMethodAmount(from, 0)
    setPcMethodAmount(to, pcMethodAmount(to) + amt)
    if (to === 'other' && !pcOtherDetailKey) setPcOtherDetailKey('misc')
    setPcMoveFromMethod(to)
  }, [pcMoveFromMethod, pcActiveMethod, pcMethodAmount, setPcMethodAmount, pcOtherDetailKey])
  const pcMoveFromCandidates = React.useMemo(
    () =>
      (['cash', 'card', 'qr', 'delivery_app', 'other'] as const).filter((m) => pcMethodAmount(m) > 0.005),
    [pcMethodAmount]
  )
  const payCorrectSumVal =
    (parseFloat(pcCash) || 0) +
    (parseFloat(pcCard) || 0) +
    (parseFloat(pcQr) || 0) +
    (parseFloat(pcOther) || 0) +
    (parseFloat(pcDelApp) || 0)
  const payCorrectSumOk =
    payCorrectOrderTotal > 0.005 && Math.abs(payCorrectSumVal - payCorrectOrderTotal) < 0.02

  const handleSavePayCorrect = async () => {
    if (!payCorrectOrder) return
    const reason = payCorrectReason.trim()
    if (reason.length < 2) {
      await appAlert(t('posReceiptPayCorrectReasonShort'))
      return
    }
    const del = parseFloat(pcDelApp) || 0
    const payDelChannel = del > 0.005 ? pcDelChannel : null
    const otherAmt = parseFloat(pcOther) || 0
    const roundedOther = Math.round(Math.max(0, otherAmt) * 100) / 100
    let paymentOtherBreakdown: PosPaymentOtherBreakdown | undefined
    if (roundedOther > 0.005) {
      if (pcOtherDetailKey === 'trueMoney') paymentOtherBreakdown = { trueMoney: roundedOther }
      else if (pcOtherDetailKey === 'weChat') paymentOtherBreakdown = { weChat: roundedOther }
      else if (pcOtherDetailKey === 'alipay') paymentOtherBreakdown = { alipay: roundedOther }
      else if (pcOtherDetailKey === 'linePay') paymentOtherBreakdown = { linePay: roundedOther }
      else if (pcOtherDetailKey === 'shopeePay') paymentOtherBreakdown = { shopeePay: roundedOther }
      else if (pcOtherDetailKey.startsWith('admin:')) {
        const adminId = pcOtherDetailKey.slice(6).trim()
        paymentOtherBreakdown = adminId ? { admin: { [adminId]: roundedOther } } : { misc: roundedOther }
      } else paymentOtherBreakdown = { misc: roundedOther }
    }
    const payload = {
      id: payCorrectOrder.id,
      reason,
      total: payCorrectOrderTotal,
      paymentCash: parseFloat(pcCash) || 0,
      paymentCard: parseFloat(pcCard) || 0,
      paymentQr: parseFloat(pcQr) || 0,
      paymentOther: otherAmt,
      ...(paymentOtherBreakdown ? { paymentOtherBreakdown } : {}),
      paymentDeliveryApp: del,
      deliveryPaymentChannel: payDelChannel,
    }
    const targetTotal = payCorrectOrderTotal
    const sum =
      payload.paymentCash +
      payload.paymentCard +
      payload.paymentQr +
      payload.paymentOther +
      payload.paymentDeliveryApp
    if (targetTotal > 0.005 && Math.abs(sum - targetTotal) > 0.02) {
      await appAlert(t('posReceiptPayCorrectMismatch'))
      return
    }
    const hasLinkpos = Boolean(
      payCorrectOrder.linkposApprovalCode ||
        payCorrectOrder.linkposTraceNo ||
        payCorrectOrder.linkposResponseCode
    )
    if (hasLinkpos) {
      const ok = await appConfirm(
        `${t('posReceiptPayCorrectLinkposWarn')}\n\n${t('posReceiptPayCorrectConfirm')}`
      )
      if (!ok) return
    }
    setPayCorrectSaving(true)
    try {
      const res = await correctPosOrderPayment(payload)
      if (!res.success) {
        await appAlert(resolvePayCorrectErrorMessage(String(res.message ?? '')))
        return
      }
      await appAlert(t('posReceiptPayCorrectSaved'))
      setPayCorrectOrder(null)
      setPayCorrectReason('')
      setPcOrderTotal('')
      void loadOrders()
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setPayCorrectSaving(false)
    }
  }

  const handleCancelOrderFromPayCorrect = async () => {
    if (!payCorrectOrder) return
    const reason = payCorrectReason.trim()
    if (reason.length < 2) {
      await appAlert(t('posReceiptPayCorrectReasonShort'))
      return
    }
    if (!online) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    const ok = await appConfirm(t('posReceiptPayCorrectCancelConfirm'))
    if (!ok) return
    const hasLinkpos = Boolean(
      payCorrectOrder.linkposApprovalCode ||
        payCorrectOrder.linkposTraceNo ||
        payCorrectOrder.linkposResponseCode
    )
    if (hasLinkpos) {
      const w = await appConfirm(
        `${t('posReceiptPayCorrectLinkposWarn')}\n\n${t('posReceiptPayCorrectCancelConfirm')}`
      )
      if (!w) return
    }
    setPayCorrectSaving(true)
    try {
      const res = await updatePosOrderStatus({
        id: payCorrectOrder.id,
        status: 'cancelled',
        memoAppend: reason,
      })
      if (!res.success) {
        await appAlert(String(res.message ?? '').trim() || t('processFail') || '실패')
        return
      }
      await appAlert(t('posReceiptPayCorrectCanceled'))
      setPayCorrectOrder(null)
      setPayCorrectReason('')
      setPcOrderTotal('')
      void loadOrders()
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setPayCorrectSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
              <span className="hidden text-slate-500 sm:inline">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
            </div>
            <Button
              variant={isToday ? 'secondary' : 'outline'}
              size="sm"
              className="h-9 px-3"
              onClick={() => {
                setStartStr(todayStr)
                setEndStr(todayStr)
              }}
            >
              {t('posToday') || '오늘'}
            </Button>
            {receiptStoreChoices.length > 1 && (
              <Select
                value={
                  isHqWideAccess ? storeFilter || '__all__' : storeFilter || receiptStoreChoices[0] || '__all__'
                }
                onValueChange={(v) => setStoreFilter(v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder={t('posStoreSelect') || '매장'} />
                </SelectTrigger>
                <SelectContent>
                  {isHqWideAccess && (
                    <SelectItem value="__all__">{t('posStatusAll') || '전체'}</SelectItem>
                  )}
                  {receiptStoreChoices.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder={t('posStatus') || '상태'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('posStatusAll') || '전체'}</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t('posSearchPh') || '주문번호, 메뉴, 메모 검색'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runReceiptSearch()
              }}
              className="h-9 w-[min(11rem,30vw)] max-w-[200px] shrink-0"
            />
            <Select value={segmentDeliveryCode || '__all__'} onValueChange={(v) => setSegmentDeliveryCode(v)}>
              <SelectTrigger
                className="h-9 w-[112px] shrink-0 sm:w-[154px]"
                aria-label={t('posReceiptDeliveryAppFilter') || '배달앱'}
              >
                <SelectValue placeholder={t('posReceiptDeliveryAppFilter') || '배달앱'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('posStatusAll') || '전체'}</SelectItem>
                {deliveryAppSelectOptions.map((app) => {
                  const v = String(app.code).trim().toLowerCase()
                  if (!v) return null
                  return (
                    <SelectItem key={`${app.id}-${v}`} value={v}>
                      {String(app.name || v).trim() || v}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 shrink-0 px-3" onClick={runReceiptSearch} disabled={loading}>
              <Search className="mr-1 h-4 w-4" />
              {t('search') || '검색'}
            </Button>
          </div>

          {loading && (
            <div className="mb-4 flex justify-center py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          )}

          {todaySummary && !loading && (
            <div className="mb-4 flex flex-wrap gap-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('posTodayCompleted') || '오늘 완료'}:
                </span>
                <span className="font-bold text-amber-600">
                  {todaySummary.completedCount}
                  {t('posCount') || '건'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('posInputTotal') || '합계'}:
                </span>
                <span className="font-bold tabular-nums">
                  {formatBahtNum(todaySummary.completedTotal)} ฿
                </span>
              </div>
              {todaySummary.pendingCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t('posPending') || '대기'}: {todaySummary.pendingCount}
                  {t('posCount') || '건'}
                </div>
              )}
              {todaySummary.cancelledCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
                  <span>
                    {t('posTodayCancelled') || '오늘 취소'}: {todaySummary.cancelledCount}
                    {t('posCount') || '건'}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    ({todaySummary.cancelledTotal.toLocaleString()} ฿)
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-xl border bg-card">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderNo') || '주문번호'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posStoreSelect') || '매장'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderType') || '유형'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posReceiptColSegment') || '구분'}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('posInputTotal') || '합계'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posStatus') || '상태'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderDateTime')}</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      {t('itemsNoResults') || '조회된 내역이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <React.Fragment key={o.id}>
                      <tr
                        id={`admin-receipt-order-row-${o.id}`}
                        className={cn(
                          'border-b cursor-pointer hover:bg-muted/20 transition',
                          expandedId === o.id && 'bg-muted/20',
                          o.status === 'cancelled' &&
                            'bg-rose-50/60 hover:bg-rose-50/80 dark:bg-rose-950/25 dark:hover:bg-rose-950/35'
                        )}
                        onClick={() => setExpandedId((prev) => (prev === o.id ? null : o.id))}
                      >
                        <td className="px-4 py-3 font-medium">{o.orderNo}</td>
                        <td className="px-4 py-3">{o.storeCode || '-'}</td>
                        <td className="px-4 py-3">
                          {orderTypeLabels[o.orderType] || o.orderType}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{receiptSegmentCell(o)}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {formatBahtNum(o.total)} ฿
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-xs',
                              o.status === 'completed' && 'bg-emerald-50 text-emerald-700',
                              o.status === 'cancelled' &&
                                'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
                              o.status === 'pending' && 'bg-amber-50 text-amber-700'
                            )}
                          >
                            {statusLabels[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatBangkokDateTime(o.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isPayCorrectableOrder(o) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950/40 dark:hover:text-amber-200"
                                title={t('posReceiptPayCorrect') || '결제 수단 정정'}
                                aria-label={t('posReceiptPayCorrect') || '결제 수단 정정'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openPayCorrect(o)
                                }}
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition',
                                expandedId === o.id && 'rotate-180'
                              )}
                            />
                          </div>
                        </td>
                      </tr>
                      {expandedId === o.id && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="space-y-2 text-xs">
                              {(o.tableName ||
                                o.memo ||
                                (o.discountAmt && o.discountAmt > 0) ||
                                (['delivery', 'takeout'].includes(
                                  normalizePosOrderTypeKey(o.orderType)
                                ) &&
                                  receiptSegmentCell(o) !== '-')) && (
                                <div className="mb-2 pb-2 border-b">
                                  {(o.tableName?.trim() ||
                                    (['delivery', 'takeout'].includes(
                                      normalizePosOrderTypeKey(o.orderType)
                                    ) &&
                                      receiptSegmentCell(o) !== '-')) && (
                                    <div className="text-muted-foreground">
                                      {t('posReceiptColSegment') || '구분'}:{' '}
                                      {o.tableName?.trim() || receiptSegmentCell(o)}
                                    </div>
                                  )}
                                  {o.memo && (
                                    <div className="text-muted-foreground mt-0.5">
                                      {t('posCustomerMemo') || '메모'}: {o.memo}
                                    </div>
                                  )}
                                  {o.discountAmt && o.discountAmt > 0 && (
                                    <div className="text-green-600 mt-0.5">
                                      {t('posDiscount') || '할인'}: -{formatBahtNum(o.discountAmt)} ฿
                                      {o.discountReason && ` (${o.discountReason})`}
                                    </div>
                                  )}
                                </div>
                              )}
                              {o.items?.length ? (
                                <>
                                  <div className="mb-1 text-muted-foreground">
                                    {t('posTableStatusServed') || '서빙'}:{' '}
                                    {o.items.filter((it) => Boolean(it.servedAt)).length}/
                                    {o.items.length}
                                  </div>
                                  {o.items.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between gap-2 text-muted-foreground"
                                    >
                                      <span className="min-w-0 truncate">
                                        {it.name} × {it.qty ?? 1}
                                      </span>
                                      <span className="tabular-nums shrink-0">
                                        {formatBahtNum((it.price ?? 0) * (it.qty ?? 1))} ฿
                                      </span>
                                    </div>
                                  ))}
                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handlePrintCustomerReceipt(o)
                                      }}
                                    >
                                      <Printer className="h-3 w-3" />
                                      {t('posCustomerReceiptPrint') || '손님 영수증'}
                                    </Button>
                                    {(() => {
                                      const failureRec = getKitchenPrintFailure(resolveKitchenPrintOrderRef(o))
                                      const hasKitchenPrintFailure = Boolean(failureRec)
                                      return (
                                        <>
                                          <Button
                                            size="sm"
                                            variant={hasKitchenPrintFailure ? 'destructive' : 'outline'}
                                            className="h-7 gap-1 px-2 text-xs"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handlePrintKitchenSlip(o)
                                            }}
                                          >
                                            <Printer className="h-3 w-3" />
                                            {hasKitchenPrintFailure
                                              ? t('posKitchenSlipRetryAfterMiss') || '미출력 감지 재출력'
                                              : t('posKitchenSlip') || '주방 주문서'}
                                          </Button>
                                          {failureRec?.lastTrackingId ? (
                                            <span className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                className="h-7 rounded border border-amber-300 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  jumpToOrderByTraceId(failureRec.lastTrackingId || '')
                                                }}
                                                title={`${failureRec.lastTrackingId}\n${t('posTraceIdJumpOrder') || 'Trace ID로 주문 이동'}`}
                                              >
                                                Trace ID: {formatTraceIdTail(failureRec.lastTrackingId)}
                                              </button>
                                              <button
                                                type="button"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
                                                onClick={(e) => copyTraceId(failureRec.lastTrackingId || '', e)}
                                                title={`${failureRec.lastTrackingId}\nTrace ID 복사`}
                                                aria-label="Trace ID 복사"
                                              >
                                                <Copy className="h-3.5 w-3.5" />
                                              </button>
                                            </span>
                                          ) : null}
                                        </>
                                      )
                                    })()}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openTaxInvoiceEditor(o)
                                      }}
                                    >
                                      <PencilLine className="h-3 w-3" />
                                      {t('posReceiptTaxInvoice') || '세금계산서'}
                                    </Button>
                                    {isPayCorrectableOrder(o) && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 gap-1 px-2 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openPayCorrect(o)
                                        }}
                                      >
                                        <PencilLine className="h-3 w-3" />
                                        {t('posReceiptPayCorrect') || '결제 수단 정정'}
                                      </Button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={taxInvoiceOrder != null}
        onOpenChange={(open) => {
          if (!open) {
            setTaxInvoiceOrder(null)
            setTaxInvoiceSaving(false)
            setTaxSearchLoading(false)
            setTaxSearchRows([])
            setTaxSearchMessage('')
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('posReceiptTaxInvoice') || '세금계산서'}</DialogTitle>
            <DialogDescription className="text-left">
              <span className="font-mono text-foreground">{taxInvoiceOrder?.orderNo}</span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {t('posTaxInvoiceAfterPaymentHint') || '결제 완료 후에도 세금계산서 정보를 저장할 수 있습니다.'}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
              <Select
                value={taxSearchField}
                onValueChange={(v) => setTaxSearchField(v as 'taxId' | 'name' | 'phone')}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="taxId">{t('posTaxIdLabel') || 'Tax ID'}</SelectItem>
                  <SelectItem value="name">{t('company_name') || t('posName') || '이름'}</SelectItem>
                  <SelectItem value="phone">{t('posPhone') || '전화번호'}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-9"
                value={taxSearchKeyword}
                onChange={(e) => setTaxSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleTaxRecipientSearch()
                  }
                }}
                placeholder={t('search') || '검색'}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => void handleTaxRecipientSearch()}
                disabled={taxSearchLoading}
              >
                {t('search') || '검색'}
              </Button>
            </div>
            {taxSearchRows.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {taxSearchRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full rounded border border-transparent px-2 py-1 text-left text-xs hover:border-border hover:bg-muted/40"
                    onClick={() => applyTaxInvoiceProfile(taxInvoiceFromRecipientRow(row))}
                  >
                    <div className="font-medium">{row.name || '-'}</div>
                    <div className="text-muted-foreground">
                      {row.tax_id || '-'} · {row.phone || '-'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {taxSearchMessage && <p className="text-xs text-muted-foreground">{taxSearchMessage}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('posTaxCustomerTypeLabel') || '구분'}</Label>
                <Select
                  value={tiCustomerType}
                  onValueChange={(v) => setTiCustomerType(v === 'company' ? 'company' : 'person')}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person">{t('posTaxCustomerIndividual') || '개인'}</SelectItem>
                    <SelectItem value="company">{t('posTaxCustomerCorporate') || '법인'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('member_no') || '회원번호'}</Label>
                <Input className="h-9" value={tiMemberNo} onChange={(e) => setTiMemberNo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('posName') || '이름'}</Label>
              <Input className="h-9" value={tiName} onChange={(e) => setTiName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('posTaxIdLabel') || 'Tax ID'}</Label>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  value={tiTaxId}
                  onChange={(e) => setTiTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('posBranchLabel') || '지점'}</Label>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  value={tiBranchNo}
                  onChange={(e) => setTiBranchNo(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder={tiCustomerType === 'company' ? '00000' : '00000'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('posPhone') || '전화번호'}</Label>
                <Input
                  className="h-9"
                  inputMode="tel"
                  value={tiPhone}
                  onChange={(e) => setTiPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('posTaxEmailLabel') || 'E-mail'}</Label>
                <Input className="h-9" value={tiEmail} onChange={(e) => setTiEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('settings_address') || '주소'}</Label>
              <Textarea value={tiAddress} onChange={(e) => setTiAddress(e.target.value)} rows={3} />
            </div>
            {taxFormErrors.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                {t('posTaxInvoiceInvalid') || '세금계산서 정보를 확인해 주세요.'}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTaxInvoiceOrder(null)} disabled={taxInvoiceSaving}>
              {t('btnClose') || '닫기'}
            </Button>
            <Button type="button" onClick={() => void handleSaveTaxInvoice()} disabled={taxInvoiceSaving || taxFormErrors.length > 0}>
              {t('save') || '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={payCorrectOrder != null}
        onOpenChange={(open) => {
          if (!open) {
            setPayCorrectOrder(null)
            setPayCorrectSaving(false)
            setPcOrderTotal('')
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-md overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{t('posReceiptPayCorrect')}</DialogTitle>
            <DialogDescription className="text-left">
              {payCorrectOrder ? (
                <>
                  <span className="font-mono text-foreground">{payCorrectOrder.orderNo}</span>
                  {' · '}
                  <span className="tabular-nums font-semibold text-foreground">
                    {formatBahtNum(payCorrectOrderTotal)} ฿
                  </span>
                </>
              ) : null}
              <span className="mt-2 block text-xs text-muted-foreground">{t('posReceiptPayCorrectHint')}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('posReceiptPayCorrectOrderTotal')}</Label>
              <Input
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                value={pcOrderTotal}
                onChange={(e) => setPcOrderTotal(e.target.value)}
                disabled={payCorrectSaving}
              />
            </div>
            <div className="grid grid-cols-5 gap-1 rounded-xl border p-1">
              {[
                { key: 'cash', label: t('posPaymentCash') || '현금', icon: Banknote },
                { key: 'card', label: t('posPaymentCard') || '카드', icon: CreditCard },
                { key: 'qr', label: t('posPaymentQrCode') || 'QR 코드', icon: QrCode },
                { key: 'delivery_app', label: t('posPaymentDeliveryApp') || '배달앱', icon: Bike },
                { key: 'other', label: t('posPaymentOther') || '기타', icon: Wallet },
              ].map((m) => {
                const Icon = m.icon
                const active = pcActiveMethod === m.key
                return (
                  <Button
                    key={m.key}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    className={cn('h-14 flex-col gap-1 px-1 text-[11px]', active ? 'shadow-sm' : '')}
                    onClick={() => setPcActiveMethod(m.key as typeof pcActiveMethod)}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{m.label}</span>
                  </Button>
                )
              })}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <Select
                value={pcMoveFromMethod}
                onValueChange={(v) =>
                  setPcMoveFromMethod(v as 'cash' | 'card' | 'qr' | 'delivery_app' | 'other')
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pcMoveFromCandidates.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === 'cash'
                        ? t('posPaymentCash') || '현금'
                        : m === 'card'
                          ? t('posPaymentCard') || '카드'
                          : m === 'qr'
                            ? t('posPaymentQrCode') || 'QR 코드'
                            : m === 'delivery_app'
                              ? t('posPaymentDeliveryApp') || '배달앱'
                              : t('posPaymentOther') || '기타'}{' '}
                      · {formatBahtNum(pcMethodAmount(m))} ฿
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={moveAmountToActiveMethod}
                disabled={pcMoveFromMethod === pcActiveMethod || pcMethodAmount(pcMoveFromMethod) <= 0.005}
              >
                {t('posMoveAmount') || '이동'}
              </Button>
            </div>

            {pcActiveMethod === 'cash' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('posPaymentCash')}</Label>
                <Input
                  className="h-10 text-right tabular-nums"
                  inputMode="decimal"
                  value={pcCash}
                  onChange={(e) => setPcCash(e.target.value)}
                  disabled={payCorrectSaving}
                />
              </div>
            )}
            {pcActiveMethod === 'card' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('posPaymentCard')}</Label>
                <Input
                  className="h-10 text-right tabular-nums"
                  inputMode="decimal"
                  value={pcCard}
                  onChange={(e) => setPcCard(e.target.value)}
                  disabled={payCorrectSaving}
                />
              </div>
            )}
            {pcActiveMethod === 'qr' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('posPaymentQr')}</Label>
                <Input
                  className="h-10 text-right tabular-nums"
                  inputMode="decimal"
                  value={pcQr}
                  onChange={(e) => setPcQr(e.target.value)}
                  disabled={payCorrectSaving}
                />
              </div>
            )}
            {pcActiveMethod === 'delivery_app' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">{t('posPaymentDeliveryApp')}</Label>
                  <Input
                    className="h-10 text-right tabular-nums"
                    inputMode="decimal"
                    value={pcDelApp}
                    onChange={(e) => setPcDelApp(e.target.value)}
                    disabled={payCorrectSaving}
                  />
                </div>
                {(parseFloat(pcDelApp) || 0) > 0.005 && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t('posDeliveryPaymentChannel')}</Label>
                    <Select
                      value={pcDelChannel}
                      onValueChange={(v) =>
                        setPcDelChannel(v as 'grab' | 'lineman' | 'shopee' | 'dine_in')
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grab">Grab</SelectItem>
                        <SelectItem value="lineman">Line Man</SelectItem>
                        <SelectItem value="shopee">Shopee</SelectItem>
                        <SelectItem value="dine_in">{t('posDeliveryPayDineIn') || 'Dine in'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            {pcActiveMethod === 'other' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">{t('posPaymentOther')}</Label>
                  <Input
                    className="h-10 text-right tabular-nums"
                    inputMode="decimal"
                    value={pcOther}
                    onChange={(e) => setPcOther(e.target.value)}
                    disabled={payCorrectSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('posPaymentOtherExpand') || '세부 수단'}</Label>
                  <Select value={pcOtherDetailKey} onValueChange={setPcOtherDetailKey}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {payCorrectOtherDetailOptions.map((it) => (
                        <SelectItem key={it.key} value={it.key}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {(parseFloat(pcDelApp) || 0) > 0.005 && pcActiveMethod !== 'delivery_app' && (
              <div className="space-y-1 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                <Label className="text-xs">{t('posDeliveryPaymentChannel')}</Label>
                <div className="mt-1">{pcDelChannel}</div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t('posReceiptPayCorrectReason')}</Label>
              <Textarea
                value={payCorrectReason}
                onChange={(e) => setPayCorrectReason(e.target.value)}
                placeholder={t('posReceiptPayCorrectReasonPh')}
                rows={3}
                className="min-h-[72px] resize-y"
              />
            </div>
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                payCorrectSumOk
                  ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                  : 'border-amber-500/35 bg-amber-500/[0.08]'
              )}
            >
              <div className="flex justify-between gap-2 tabular-nums">
                <span className="text-muted-foreground">{t('posPaymentSum') || '입력 합계'}</span>
                <span className="font-semibold">{formatBahtNum(payCorrectSumVal)} ฿</span>
              </div>
              <div className="mt-1 flex justify-between gap-2 tabular-nums text-muted-foreground">
                <span>{t('posTotal') || '합계'}</span>
                <span>{formatBahtNum(payCorrectOrderTotal)} ฿</span>
              </div>
              {!payCorrectSumOk && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  {t('posReceiptPayCorrectMismatch')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-2">
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={payCorrectSaving || payCorrectReason.trim().length < 2}
              onClick={() => void handleCancelOrderFromPayCorrect()}
            >
              {t('posReceiptPayCorrectCancelOrder')}
            </Button>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={payCorrectSaving}
                onClick={() => setPayCorrectOrder(null)}
              >
                {t('btnClose') || '닫기'}
              </Button>
              <Button
                type="button"
                disabled={
                  payCorrectSaving ||
                  !payCorrectSumOk ||
                  payCorrectReason.trim().length < 2
                }
                onClick={() => void handleSavePayCorrect()}
              >
                {t('save') || '저장'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {traceCopyToast ? (
        <div
          className={cn(
            'pointer-events-none fixed bottom-4 right-4 z-[10060] rounded-md px-3 py-2 text-xs font-semibold text-white shadow-lg',
            traceCopyToast.tone === 'error' ? 'bg-rose-600/95' : 'bg-amber-600/95'
          )}
        >
          {traceCopyToast.message}
        </div>
      ) : null}
    </div>
  )
}
