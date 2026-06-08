'use client'
import { appAlert } from "@/lib/app-message"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Wallet, Save, RotateCw, Printer, ChevronDown, ChevronRight, House } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminTabsListRowCn, adminTabsTriggerCn } from '@/lib/admin-tab-styles'
import { AdminTabsBarWithHelp } from '@/components/erp/admin-tabs-bar-with-help'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getPosSettlement,
  getPosDeliveryApps,
  getPosPaymentSettings,
  getPosPrinterSettings,
  getPosBusinessDaySettings,
  validatePosClose,
  finalizePosClose,
  useStoreList,
  type PosDeliveryApp,
  type PosCloseRun,
  type PosSettlement,
} from '@/lib/api-client'
import {
  parseBahtAmount,
  formatBahtInputDisplay,
  formatBahtAmountForField,
  mapBreakdownStringsToBahtDisplay,
} from '@/lib/baht-input-format'
import {
  computeSettlementDeliveryKeys,
  deliverySettlementKeyIsDineIn,
  POS_SETTLEMENT_DINE_IN_CODE,
} from '@/lib/pos-settlement-delivery-split'
import { hydrateSettlementQrOtherBreakdowns } from '@/lib/pos-settlement-breakdown-hydrate'
import { DEFAULT_OTHER_KEYS, DEFAULT_QR_KEYS } from '@/lib/pos-payment-default-keys'
import {
  getPosSettlementWithCache,
  persistPosBusinessOpenAfterSave,
  resolvePosBusinessOpenSettleDates,
} from '@/lib/offline/settlement-offline'
import { useOnlineStatus } from '@/lib/offline'
import { shouldPreferOfflineCache } from '@/lib/offline/network'
import { savePosSettlementWithOffline } from '@/lib/offline'
import { useAuth } from '@/lib/auth-context'
import { ADMIN_UI_LANG_OPTIONS, type LangCode, useLang } from '@/lib/lang-context'
import { tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { PosChannelSettlementPanel } from '@/components/erp/pos-channel-settlement-panel'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import {
  isOfficeRole,
  canAccessSettings,
  isAccountingRole,
  isManagerRole,
  isFranchiseeRole,
} from '@/lib/permissions'
import { filterNonOfficeStores } from '@/lib/store-view-context'
import { cn, escapeHtml, formatBahtNum } from '@/lib/utils'
import { isPosDemoFromQuery } from '@/lib/pos-tour/pos-demo-mode'
import { POS_DEMO_ROUTES } from '@/lib/pos-tour/demo-routes'
import { OfflineBanner } from '@/components/offline-banner'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import Link from 'next/link'
import {
  formatPosBusinessDateRangeLabel,
  getPosBusinessDateStr,
  setPosBusinessHoursClient,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

function getBangkokDateYmd() {
  return getPosBusinessDateStr()
}

function shiftYmd(dateYmd: string, deltaDays: number) {
  const d = new Date(`${dateYmd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function normalizePayKey(key: string): string {
  return String(key || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

function normalizeDigitChars(raw: string): string {
  return String(raw || '')
    .replace(/[๐-๙]/g, (ch) => String(ch.charCodeAt(0) - 3664))
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 65296))
}

function toIntegerInput(raw: string): string {
  return normalizeDigitChars(raw).replace(/[^\d]/g, '')
}

function isBreakdownEmpty(breakdown: Record<string, string | number>): boolean {
  return Object.values(breakdown || {}).every((v) => !(parseBahtAmount(String(v)) > 0))
}

function pickBreakdownKey(keys: string[], rawKey: string): string | null {
  const target = normalizePayKey(rawKey)
  if (!target) return null
  const normalized = keys.map((k) => ({ raw: k, n: normalizePayKey(k) }))
  const exact = normalized.find((k) => k.n === target)
  if (exact) return exact.raw
  const aliases: Record<string, string[]> = {
    master: ['master', 'mastercard'],
    amex: ['amex', 'americanexpress'],
    unionpay: ['unionpay', 'cup'],
    promptpay: ['promptpay', 'thaiqr'],
    wechat: ['wechat', 'wechatpay'],
    truemoney: ['truemoney', 'truewallet', 'truemoneywallet'],
    linepay: ['linepay'],
    shopeepay: ['shopeepay'],
  }
  const aliasHit = Object.entries(aliases).find(([, arr]) => arr.includes(target))?.[0]
  if (aliasHit) {
    const aliasKey = normalized.find((k) => k.n.includes(aliasHit))
    if (aliasKey) return aliasKey.raw
  }
  const other = normalized.find((k) => k.n.includes('other'))
  return other?.raw ?? null
}

function buildAutoBreakdown(
  autoMap: Record<string, number> | undefined,
  keys: string[],
  opts?: { allowExtra?: boolean }
): Record<string, string> {
  const outNum: Record<string, number> = {}
  for (const k of keys) outNum[k] = 0
  for (const [rawKey, rawAmount] of Object.entries(autoMap || {})) {
    const amount = Number(rawAmount) || 0
    if (!(amount > 0)) continue
    const matched = pickBreakdownKey(keys, rawKey)
    if (matched) {
      outNum[matched] = (outNum[matched] || 0) + amount
      continue
    }
    if (opts?.allowExtra) {
      outNum[rawKey] = (outNum[rawKey] || 0) + amount
      continue
    }
    const other = keys.find((k) => normalizePayKey(k).includes('other')) || keys[0]
    if (other) outNum[other] = (outNum[other] || 0) + amount
  }
  return Object.fromEntries(Object.entries(outNum).map(([k, v]) => [k, v > 0 ? String(v) : '']))
}

/** 결산 「실제 배달(플랫폼)」 등: 플랫폼명만 표시 — "Dine in" 접미사는 매장 홀 하위 블록에서만 */
function deliveryPlatformSettlementLabel(name: string): string {
  const k = String(name || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (k === 'grab') return 'Grab'
  if (k === 'lineman') return 'Line Man'
  if (k === 'shopee' || k === 'shopeefood') return 'Shopee'
  return String(name || '').trim()
}

function hasHybridPosPrintShell(win: Window & typeof globalThis): boolean {
  return typeof (win as Window & { cmPosShell?: { printHtml?: unknown } }).cmPosShell?.printHtml === 'function'
}

/** 태국 바트 지폐·동전 단위 (฿) */
const CASH_DENOMINATIONS = [
  { value: 1000, label: '1,000' },
  { value: 500, label: '500' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 20, label: '20' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
  { value: 2, label: '2' },
  { value: 1, label: '1' },
] as const

function emptyDenomCountRecord(): Record<number, string> {
  return Object.fromEntries(CASH_DENOMINATIONS.map((d) => [d.value, '' as string]))
}

/**
 * DB에 저장된 cash_actual(바트 합계, 정수로 반올림)만 있을 때 권종 입력란을 채운다.
 * 권종별 장수는 DB에 없으므로 큰 단위 우선 분해(합계 일치) — 사용자가 예전에 넣은 장수와 다를 수 있음.
 */
function denomStringsFromCashActualBaht(total: number): Record<number, string> {
  const out = emptyDenomCountRecord()
  let remaining = Math.max(0, Math.round(Number(total) || 0))
  for (const d of CASH_DENOMINATIONS) {
    const v = d.value
    const cnt = Math.floor(remaining / v)
    if (cnt > 0) out[v] = String(cnt)
    remaining -= cnt * v
  }
  return out
}

/** 저장된 권종 JSON → 입력란 (DB에 있을 때만) */
function denomCountsFromSavedDenoms(saved: Record<string, number>): Record<number, string> | null {
  const out = emptyDenomCountRecord()
  let has = false
  for (const d of CASH_DENOMINATIONS) {
    const k = String(d.value)
    const n = Math.max(0, Math.floor(Number(saved[k]) || 0))
    if (n > 0) {
      out[d.value] = String(n)
      has = true
    }
  }
  return has ? out : null
}

/** 저장 시 권종 JSON (전부 0이면 null → DB에서 컬럼 비움) */
function denomCountsToSavePayload(counts: Record<number, string>): Record<string, number> | null {
  const out: Record<string, number> = {}
  let any = false
  for (const d of CASH_DENOMINATIONS) {
    const n = Math.max(0, parseInt(toIntegerInput(counts[d.value] || '0'), 10) || 0)
    out[String(d.value)] = n
    if (n > 0) any = true
  }
  return any ? out : null
}

function sumDenomCountsRecord(counts: Record<number, string>): number {
  return CASH_DENOMINATIONS.reduce(
    (s, d) => s + d.value * (parseInt(toIntegerInput(counts[d.value] || '0'), 10) || 0),
    0
  )
}

function patchDenomCount(
  prev: Record<number, string>,
  denomValue: number,
  raw: string
): Record<number, string> {
  return { ...prev, [denomValue]: toIntegerInput(raw) }
}

export type PosSettlementFormProps = {
  t: (key: string) => string
  /** POS 전용 모드 (레이아웃/패딩 최소화) */
  compact?: boolean
  /** 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장 */
  offlineAware?: boolean
  /** 영업 시작 모드: 현금 시제만 단위별 입력 */
  openMode?: boolean
}

export function PosSettlementForm({ t, compact, offlineAware = false, openMode = false }: PosSettlementFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const settlementFullCloseHref = React.useMemo(
    () =>
      isPosDemoFromQuery(searchParams)
        ? POS_DEMO_ROUTES.businessClose
        : '/pos/settlement',
    [searchParams]
  )
  const posHomeHref = React.useMemo(
    () => (isPosDemoFromQuery(searchParams) ? '/pos?demo=1' : '/pos'),
    [searchParams]
  )
  const { lang, setLang } = useLang()
  const { auth } = useAuth()
  const { stores, resolveStoreKey } = useStoreList()
  const online = useOnlineStatus()

  const [settleDate, setSettleDate] = React.useState(() => getBangkokDateYmd())
  const [businessHours, setBusinessHours] = React.useState<PosBusinessHoursConfig | null>(null)
  const userPickedSettleDateRef = React.useRef(false)
  const [storeFilter, setStoreFilter] = React.useState('')
  const [systemTotal, setSystemTotal] = React.useState(0)
  /** 완료 주문 `payment_cash` 합계 — 마감 결산에서 현금 줄은 이 값만 사용(수정 불가) */
  const [systemCashFromOrders, setSystemCashFromOrders] = React.useState(0)
  const [settlement, setSettlement] = React.useState<PosSettlement | null>(null)
  const [closeRun, setCloseRun] = React.useState<PosCloseRun | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [closeRunning, setCloseRunning] = React.useState(false)
  const [systemSubtotal, setSystemSubtotal] = React.useState(0)
  const [systemVat, setSystemVat] = React.useState(0)
  const [linkposSummary, setLinkposSummary] = React.useState<{
    approvedCount: number
    failedCount: number
    requestedTotal: number
    approvedTotal: number
    cardReportedTotal: number
    diffVsApproved: number
    autoCardBreakdown?: Record<string, number>
    autoQrBreakdown?: Record<string, number>
    autoDeliveryAppBreakdown?: Record<string, number>
    autoDineInDeliveryBreakdown?: Record<string, number>
    autoOtherBreakdown?: Record<string, number>
  } | null>(null)
  const [activeTab, setActiveTab] = React.useState<'entry' | 'history'>('entry')
  const [historyRange, setHistoryRange] = React.useState<'7' | '30'>('7')
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyRows, setHistoryRows] = React.useState<
    Array<{
      date: string
      systemTotal: number
      inputTotal: number
      diff: number
      closed: boolean
      hasSettlement: boolean
    }>
  >([])

  const [, setCashActual] = React.useState<string>('')
  const [cashAmt, setCashAmt] = React.useState<string>('')
  const [cardAmt, setCardAmt] = React.useState<string>('')
  const [qrAmt, setQrAmt] = React.useState<string>('')
  const [deliveryAppAmt, setDeliveryAppAmt] = React.useState<string>('')
  /** 예전 결산: other_breakdown 없이 other_amt만 있는 경우 폴백 */
  const [otherAmt, setOtherAmt] = React.useState<string>('')
  const [cardBreakdown, setCardBreakdown] = React.useState<Record<string, string>>({})
  const [qrBreakdown, setQrBreakdown] = React.useState<Record<string, string>>({})
  const [otherBreakdown, setOtherBreakdown] = React.useState<Record<string, string>>({})
  const [deliveryAppBreakdown, setDeliveryAppBreakdown] = React.useState<Record<string, string>>({})
  const [dineInDeliveryBreakdown, setDineInDeliveryBreakdown] = React.useState<Record<string, string>>({})
  const [deliveryApps, setDeliveryApps] = React.useState<PosDeliveryApp[]>([])
  const [memo, setMemo] = React.useState('')
  const [closed, setClosed] = React.useState(false)
  const [closedSavedOnce, setClosedSavedOnce] = React.useState(false)
  const [openingCashActual, setOpeningCashActual] = React.useState<number | null>(null)
  /** 결산일 기준 pos_till_transactions 순액 (마감 예상 돈통·오프라인 캐시 동기화) */
  const [tillNetForSettleDate, setTillNetForSettleDate] = React.useState(0)
  const [autoFilledFlags, setAutoFilledFlags] = React.useState({
    card: false,
    qr: false,
    delivery: false,
    other: false,
    cash: false,
  })
  /** 영업 시작: 단위별 현금 수량 (장/개) */
  const [denomCounts, setDenomCounts] = React.useState<Record<number, string>>(
    Object.fromEntries(CASH_DENOMINATIONS.map((d) => [d.value, '']))
  )
  /** 영업 시작: 전날 마감 시재 */
  const [prevDayCashActual, setPrevDayCashActual] = React.useState<number | null>(null)
  /** 결산: 카드/QR/배달앱 상세 펼침 */
  const [cashExpanded, setCashExpanded] = React.useState(false)
  const [cardExpanded, setCardExpanded] = React.useState(false)
  const [qrExpanded, setQrExpanded] = React.useState(false)
  const [otherExpanded, setOtherExpanded] = React.useState(false)
  /** 배달앱: 실제 배달 + 홀(Dine in) 한 블록 안에서 두 종류로 입력 */
  const [deliveryExpanded, setDeliveryExpanded] = React.useState(false)

  const [cardKeys, setCardKeys] = React.useState<string[]>(['Visa', 'Master', 'Amex', 'JCB', 'Other'])
  const [qrKeys, setQrKeys] = React.useState<string[]>([...DEFAULT_QR_KEYS])
  const [otherKeys, setOtherKeys] = React.useState<string[]>([...DEFAULT_OTHER_KEYS])
  const [deliveryAppKeys, setDeliveryAppKeys] = React.useState<string[]>(['Grab', 'Line Man', 'Shopee', 'Other'])
  const CARD_KEYS = cardKeys.length > 0 ? cardKeys : ['Visa', 'Master', 'Amex', 'JCB', 'Other']
  const QR_KEYS = qrKeys.length > 0 ? qrKeys : [...DEFAULT_QR_KEYS]
  const OTHER_KEYS = otherKeys.length > 0 ? otherKeys : [...DEFAULT_OTHER_KEYS]
  const displayQrKeyList = React.useMemo(() => {
    const extra = Object.keys(qrBreakdown).filter((k) => !QR_KEYS.includes(k))
    return [...QR_KEYS, ...extra.sort()]
  }, [QR_KEYS, qrBreakdown])
  const displayOtherKeyList = React.useMemo(() => {
    const extra = Object.keys(otherBreakdown).filter((k) => !OTHER_KEYS.includes(k))
    return [...OTHER_KEYS, ...extra.sort()]
  }, [OTHER_KEYS, otherBreakdown])
  const { platformKeys: PLATFORM_DELIVERY_KEYS, dineInKeys: DINE_IN_DELIVERY_KEYS } = React.useMemo(
    () => computeSettlementDeliveryKeys(deliveryAppKeys, deliveryApps),
    [deliveryAppKeys, deliveryApps]
  )
  const displayDineInKeyList = React.useMemo(() => {
    const extra = Object.keys(dineInDeliveryBreakdown).filter((k) => !DINE_IN_DELIVERY_KEYS.includes(k))
    return [...DINE_IN_DELIVERY_KEYS, ...extra.sort()]
  }, [DINE_IN_DELIVERY_KEYS, dineInDeliveryBreakdown])

  const canSearchAll = isOfficeRole(auth?.role || '')
  const canUnclose = canAccessSettings(auth?.role || '')
  const canEditBusinessHours =
    canSearchAll || isManagerRole(auth?.role || '') || isFranchiseeRole(auth?.role || '')
  /** 주문 집계(AUTO) QR·배달·기타 — 매장 역할은 수정 불가(본사·회계만). 데모 튜토리얼은 입력 가능 유지 */
  const payAutoBreakdownStaffLocked =
    !isPosDemoFromQuery(searchParams) &&
    !(isOfficeRole(auth?.role || '') || isAccountingRole(auth?.role || ''))
  const effectiveStore = React.useMemo(() => {
    const raw = canSearchAll && storeFilter ? storeFilter : auth?.store || ''
    const trimmed = String(raw || '').trim()
    return trimmed ? resolveStoreKey(trimmed) || trimmed : ''
  }, [canSearchAll, storeFilter, auth?.store, resolveStoreKey])

  React.useEffect(() => {
    userPickedSettleDateRef.current = false
  }, [effectiveStore])

  /** 매장별 영업시간 반영 + 결산·영업 시작 모두 현재 영업일 기본(터미널 게이트와 동일) */
  React.useEffect(() => {
    if (!effectiveStore) return
    let cancel = false
    void (async () => {
      try {
        const j = await getPosBusinessDaySettings(effectiveStore)
        if (cancel) return
        const hours: PosBusinessHoursConfig = {
          start: { hour: j.hour, minute: j.minute },
          end: { hour: j.endHour, minute: j.endMinute },
        }
        setBusinessHours(hours)
        setPosBusinessHoursClient(hours)
        if (openMode || !userPickedSettleDateRef.current) {
          setSettleDate(getPosBusinessDateStr())
        }
      } catch {
        /* 기본 영업시간 유지 */
      }
    })()
    return () => {
      cancel = true
    }
  }, [effectiveStore, openMode])

  const businessDayRangeLabel = React.useMemo(() => {
    if (!businessHours || !settleDate) return ''
    return formatPosBusinessDateRangeLabel(settleDate, businessHours)
  }, [businessHours, settleDate])

  const syncSettleDateToCurrentBusinessDay = React.useCallback(() => {
    userPickedSettleDateRef.current = false
    setSettleDate(getPosBusinessDateStr())
  }, [])

  /** loadData는 결제 키 로드 후 재실행되면 권종 입력을 덮어쓰므로 ref로 최신 키만 참조 */
  const cardKeysRef = React.useRef(cardKeys)
  cardKeysRef.current = cardKeys
  const qrKeysRef = React.useRef(qrKeys)
  qrKeysRef.current = qrKeys
  const otherKeysRef = React.useRef(otherKeys)
  otherKeysRef.current = otherKeys
  const deliveryAppKeysRef = React.useRef(deliveryAppKeys)
  deliveryAppKeysRef.current = deliveryAppKeys
  const deliveryAppsRef = React.useRef(deliveryApps)
  deliveryAppsRef.current = deliveryApps
  /** 매장·날짜 변경 전까지 사용자 권종 입력 유지 (백그라운드 refresh 시 초기화 방지) */
  const denomCountsUserEditedRef = React.useRef(false)
  const denomContextRef = React.useRef('')
  React.useEffect(() => {
    denomCountsUserEditedRef.current = false
    denomContextRef.current = `${effectiveStore}:${settleDate}`
  }, [effectiveStore, settleDate])

  /** 결산 인쇄 직후 await 최소화(웹에서 print 제스처 만료 완화) + 수동 인쇄 재사용 */
  const settlementPrinterHwRef = React.useRef<Awaited<ReturnType<typeof getPosPrinterSettings>> | null | undefined>(
    undefined
  )
  React.useEffect(() => {
    settlementPrinterHwRef.current = undefined
    if (!effectiveStore) return
    let cancelled = false
    getPosPrinterSettings({ storeCode: effectiveStore })
      .then((h) => {
        if (!cancelled) settlementPrinterHwRef.current = h ?? null
      })
      .catch(() => {
        if (!cancelled) settlementPrinterHwRef.current = null
      })
    return () => {
      cancelled = true
    }
  }, [effectiveStore])

  React.useEffect(() => {
    if (!effectiveStore) return
    getPosDeliveryApps({ storeCode: effectiveStore })
      .then((list) => setDeliveryApps(Array.isArray(list) ? list : []))
      .catch(() => setDeliveryApps([]))
  }, [effectiveStore])

  /** 카드/QR/배달앱 breakdown 키 - 관리자 결제 관리(pos_payment_method_items)와 연동 */
  React.useEffect(() => {
    if (!effectiveStore) return
    getPosPaymentSettings({ storeCode: effectiveStore })
      .then(({ cardKeys: ck, qrKeys: qk, otherKeys: ok, deliveryKeys: dk }) => {
        setCardKeys(Array.isArray(ck) && ck.length > 0 ? ck : ['Visa', 'Master', 'Amex', 'JCB', 'Other'])
        setQrKeys(Array.isArray(qk) && qk.length > 0 ? qk : [...DEFAULT_QR_KEYS])
        setOtherKeys(Array.isArray(ok) && ok.length > 0 ? ok : [...DEFAULT_OTHER_KEYS])
        if (Array.isArray(dk) && dk.length > 0) {
          setDeliveryAppKeys(dk)
        } else {
          getPosDeliveryApps({ storeCode: effectiveStore })
            .then((list) => {
              const names = (list || []).filter((a) => a.enabled).map((a) => a.name)
              setDeliveryAppKeys(names.length > 0 ? [...names, 'Other'] : ['Grab', 'Line Man', 'Shopee', 'Other'])
            })
            .catch(() => setDeliveryAppKeys(['Grab', 'Line Man', 'Shopee', 'Other']))
        }
      })
      .catch(() => {
        setOtherKeys([...DEFAULT_OTHER_KEYS])
        getPosDeliveryApps({ storeCode: effectiveStore })
          .then((list) => {
            const names = (list || []).filter((a) => a.enabled).map((a) => a.name)
            setDeliveryAppKeys(names.length > 0 ? [...names, 'Other'] : ['Grab', 'Line Man', 'Shopee', 'Other'])
          })
          .catch(() => setDeliveryAppKeys(['Grab', 'Line Man', 'Shopee', 'Other']))
      })
  }, [effectiveStore])

  const applyDenomCountsFromSettlement = React.useCallback(
    (single: PosSettlement, force = false) => {
      const ctx = `${effectiveStore}:${settleDate}`
      if (!force && denomCountsUserEditedRef.current && denomContextRef.current === ctx) return
      denomContextRef.current = ctx
      if (force) denomCountsUserEditedRef.current = false
      const savedDenoms =
        single.cashActualDenoms && typeof single.cashActualDenoms === 'object'
          ? denomCountsFromSavedDenoms(single.cashActualDenoms as Record<string, number>)
          : null
      const cashActNum = single.cashActual != null ? Number(single.cashActual) : NaN
      const cashActOk = Number.isFinite(cashActNum)
      if (savedDenoms && cashActOk) {
        const sumSaved = sumDenomCountsRecord(savedDenoms)
        if (Math.abs(sumSaved - cashActNum) > 0.5) {
          setDenomCounts(denomStringsFromCashActualBaht(cashActNum))
        } else {
          setDenomCounts(savedDenoms)
        }
      } else if (cashActOk && cashActNum > 0) {
        setDenomCounts(denomStringsFromCashActualBaht(cashActNum))
      } else {
        setDenomCounts(emptyDenomCountRecord())
      }
    },
    [effectiveStore, settleDate]
  )

  const loadData = React.useCallback((opts?: { forceDenoms?: boolean }) => {
    if (!effectiveStore) return
    if (opts?.forceDenoms) denomCountsUserEditedRef.current = false
    setLoading(true)
    const activeCardKeys =
      cardKeysRef.current.length > 0 ? cardKeysRef.current : ['Visa', 'Master', 'Amex', 'JCB', 'Other']
    const activeQrKeys = qrKeysRef.current.length > 0 ? qrKeysRef.current : [...DEFAULT_QR_KEYS]
    const activeOtherKeys = otherKeysRef.current.length > 0 ? otherKeysRef.current : [...DEFAULT_OTHER_KEYS]
    const activeDeliveryAppKeys = deliveryAppKeysRef.current
    const activeDeliveryApps = deliveryAppsRef.current
    const fetcher = offlineAware ? getPosSettlementWithCache : getPosSettlement
    const mainPromise = fetcher({
      settleDate,
      storeCode: effectiveStore,
    })
    const prevDayPromise = openMode
      ? fetcher({
          settleDate: shiftYmd(settleDate, -1),
          storeCode: effectiveStore,
        })
      : Promise.resolve(null)
    Promise.all([mainPromise, prevDayPromise])
      .then(([main, prev]) => {
        const { platformKeys, dineInKeys } = computeSettlementDeliveryKeys(
          activeDeliveryAppKeys,
          activeDeliveryApps
        )
        const {
          systemTotal: st,
          systemSubtotal: sub,
          systemVat: vat,
          systemCashFromOrders: cashFromOrdersRaw,
          tillNetForSettleDate: tillNetRaw,
          linkpos,
          settlement: s,
          closeRun: nextCloseRun,
        } = main
        const autoCashTotal = Number(cashFromOrdersRaw ?? 0) || 0
        setSystemCashFromOrders(autoCashTotal)
        setTillNetForSettleDate(Number(tillNetRaw ?? 0) || 0)
        const posCardOrdersTotal = Number(linkpos?.cardReportedTotal ?? 0) || 0
        const autoCardMap = (linkpos?.autoCardBreakdown || {}) as Record<string, number>
        const autoQrMap = (linkpos?.autoQrBreakdown || {}) as Record<string, number>
        const autoDeliveryMap = (linkpos?.autoDeliveryAppBreakdown || {}) as Record<string, number>
        const autoDineInMap = (linkpos?.autoDineInDeliveryBreakdown || {}) as Record<string, number>
        const autoOtherMap = (linkpos?.autoOtherBreakdown || {}) as Record<string, number>
        const autoCardTotal = Object.values(autoCardMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
        const cardAmtFallbackFromPos = posCardOrdersTotal > 0 ? posCardOrdersTotal : autoCardTotal
        const autoQrTotal = Object.values(autoQrMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
        const autoDeliveryTotal = Object.values(autoDeliveryMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
        const autoDineInTotal = Object.values(autoDineInMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
        const autoOtherTotal = Object.values(autoOtherMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
        setSystemTotal(st)
        setSystemSubtotal(sub ?? st)
        setSystemVat(vat ?? 0)
        setLinkposSummary(linkpos ?? null)
        const single = Array.isArray(s) ? s[0] : s
        setCloseRun(nextCloseRun ?? null)
        if (single) {
          const preferLiveAuto = !Boolean(single.closed)
          setSettlement(single)
          setCashActual(single.cashActual != null ? String(single.cashActual) : '')
          if (openMode) {
            let nextCashAmt = formatBahtAmountForField(single.cashAmt ?? 0)
            if ((Number(single.cashAmt ?? 0) || 0) <= 0 && autoCashTotal > 0) {
              nextCashAmt = formatBahtAmountForField(autoCashTotal)
            }
            setCashAmt(nextCashAmt)
          } else {
            setCashAmt(formatBahtAmountForField(autoCashTotal))
          }
          const nextCardAmt = preferLiveAuto
            ? cardAmtFallbackFromPos > 0
              ? cardAmtFallbackFromPos
              : Number(single.cardAmt ?? 0)
            : Number(single.cardAmt ?? 0)
          const nextQrAmt = preferLiveAuto
            ? autoQrTotal > 0
              ? autoQrTotal
              : Number(single.qrAmt ?? 0)
            : Number(single.qrAmt ?? 0)
          const nextDeliveryAmt = preferLiveAuto
            ? autoDeliveryTotal > 0
              ? autoDeliveryTotal
              : Number(single.deliveryAppAmt ?? 0)
            : Number(single.deliveryAppAmt ?? 0)
          const nextOtherAmt = preferLiveAuto
            ? autoOtherTotal > 0
              ? autoOtherTotal
              : Number(single.otherAmt ?? 0)
            : Number(single.otherAmt ?? 0)
          setCardAmt(formatBahtAmountForField(nextCardAmt))
          setQrAmt(formatBahtAmountForField(nextQrAmt))
          setDeliveryAppAmt(formatBahtAmountForField(nextDeliveryAmt))
          setOtherAmt(formatBahtAmountForField(nextOtherAmt))
          const cb: Record<string, string> = {}
          activeCardKeys.forEach((k) => {
            cb[k] = String((single.cardBreakdown ?? {})[k] ?? '')
          })
          const autoCb = buildAutoBreakdown(autoCardMap, activeCardKeys, { allowExtra: false })
          const cardBreakdownEmpty = isBreakdownEmpty(cb)
          const cardAutoApplied = (preferLiveAuto || cardBreakdownEmpty) && autoCardTotal > 0
          setCardBreakdown(
            mapBreakdownStringsToBahtDisplay(cardAutoApplied ? autoCb : cb)
          )
          if ((Number(single.cardAmt ?? 0) || 0) <= 0 && cardAmtFallbackFromPos > 0) {
            setCardAmt(formatBahtAmountForField(cardAmtFallbackFromPos))
          }
          const hydrated = hydrateSettlementQrOtherBreakdowns(single, activeQrKeys, activeOtherKeys)
          const autoQb = buildAutoBreakdown(autoQrMap, activeQrKeys, { allowExtra: true })
          const qrBreakdownEmpty = isBreakdownEmpty(hydrated.qrBreakdown)
          const qrAutoApplied = (preferLiveAuto || qrBreakdownEmpty) && autoQrTotal > 0
          setQrBreakdown(
            mapBreakdownStringsToBahtDisplay(qrAutoApplied ? autoQb : hydrated.qrBreakdown)
          )
          if ((Number(single.qrAmt ?? 0) || 0) <= 0 && autoQrTotal > 0) {
            setQrAmt(formatBahtAmountForField(autoQrTotal))
          }
          setOtherBreakdown(mapBreakdownStringsToBahtDisplay(hydrated.otherBreakdown))
          const hydratedOtherEmpty = isBreakdownEmpty(hydrated.otherBreakdown)
          const autoOtherBreakdownNext = buildAutoBreakdown(autoOtherMap, activeOtherKeys, { allowExtra: true })
          const otherAutoApplied = (preferLiveAuto || hydratedOtherEmpty) && autoOtherTotal > 0
          if (otherAutoApplied) {
            setOtherBreakdown(mapBreakdownStringsToBahtDisplay(autoOtherBreakdownNext))
          }
          if ((Number(single.otherAmt ?? 0) || 0) <= 0 && autoOtherTotal > 0) {
            setOtherAmt(formatBahtAmountForField(autoOtherTotal))
          }
          const oldDel = (single.deliveryAppBreakdown ?? {}) as Record<string, number>
          const newDine = (single.dineInDeliveryBreakdown ?? {}) as Record<string, number>
          const db: Record<string, string> = {}
          platformKeys.forEach((k) => {
            db[k] = String(oldDel[k] ?? '')
          })
          const autoDb = buildAutoBreakdown(autoDeliveryMap, platformKeys, { allowExtra: true })
          const deliveryBreakdownEmpty = isBreakdownEmpty(db)
          const deliveryAutoApplied = (preferLiveAuto || deliveryBreakdownEmpty) && autoDeliveryTotal > 0
          setDeliveryAppBreakdown(
            mapBreakdownStringsToBahtDisplay(deliveryAutoApplied ? autoDb : db)
          )
          const di: Record<string, string> = {}
          dineInKeys.forEach((k) => {
            di[k] = String(newDine[k] ?? oldDel[k] ?? '')
          })
          for (const [k, v] of Object.entries(newDine)) {
            if (!Object.prototype.hasOwnProperty.call(di, k)) {
              di[k] = String(v ?? '')
            }
          }
          let extraDine = 0
          for (const [k, v] of Object.entries(oldDel)) {
            if (deliverySettlementKeyIsDineIn(k, activeDeliveryApps) && !dineInKeys.includes(k)) {
              extraDine += Number(v) || 0
            }
          }
          if (extraDine > 0 && dineInKeys.length > 0) {
            const pk = dineInKeys[0]
            di[pk] = formatBahtInputDisplay(
              String(parseBahtAmount(di[pk] || '') + extraDine)
            )
          }
          if (
            dineInKeys.length === 1 &&
            parseBahtAmount(di[dineInKeys[0]] || '') === 0 &&
            (single.dineInDeliveryAmt ?? 0) > 0
          ) {
            di[dineInKeys[0]] = formatBahtAmountForField(single.dineInDeliveryAmt)
          }
          const dineInBreakdownEmpty = isBreakdownEmpty(di)
          setDineInDeliveryBreakdown(
            mapBreakdownStringsToBahtDisplay(
              (preferLiveAuto || dineInBreakdownEmpty) && autoDineInTotal > 0
                ? buildAutoBreakdown(autoDineInMap, dineInKeys, { allowExtra: true })
                : di
            )
          )
          if ((Number(single.deliveryAppAmt ?? 0) || 0) <= 0 && autoDeliveryTotal > 0) {
            setDeliveryAppAmt(formatBahtAmountForField(autoDeliveryTotal))
          }
          setMemo(single.memo ?? '')
          setClosed(single.closed ?? false)
          setClosedSavedOnce(Boolean(single.closed))
          setOpeningCashActual(single.cashActual != null ? Number(single.cashActual) : null)
          const cashAutoApplied = (Number(single.cashAmt ?? 0) || 0) <= 0 && autoCashTotal > 0
          setAutoFilledFlags({
            card:
              cardAutoApplied ||
              ((Number(single.cardAmt ?? 0) || 0) <= 0 &&
                cardBreakdownEmpty &&
                cardAmtFallbackFromPos > 0),
            qr: qrAutoApplied,
            delivery: deliveryAutoApplied || (dineInBreakdownEmpty && autoDineInTotal > 0),
            other: otherAutoApplied,
            cash: openMode ? cashAutoApplied : autoCashTotal > 0,
          })
          applyDenomCountsFromSettlement(single, Boolean(opts?.forceDenoms))
        } else {
          setSettlement(null)
          setSystemSubtotal(0)
          setSystemVat(0)
          setCashActual('')
          setCashAmt(formatBahtAmountForField(autoCashTotal || 0))
          setCardAmt(formatBahtAmountForField(cardAmtFallbackFromPos || 0))
          setQrAmt(formatBahtAmountForField(autoQrTotal || 0))
          setDeliveryAppAmt(formatBahtAmountForField(autoDeliveryTotal || 0))
          setOtherAmt(formatBahtAmountForField(autoOtherTotal || 0))
          setCardBreakdown(
            mapBreakdownStringsToBahtDisplay(
              buildAutoBreakdown(autoCardMap, activeCardKeys, { allowExtra: false })
            )
          )
          setQrBreakdown(
            mapBreakdownStringsToBahtDisplay(
              buildAutoBreakdown(autoQrMap, activeQrKeys, { allowExtra: true })
            )
          )
          setOtherBreakdown(
            mapBreakdownStringsToBahtDisplay(
              buildAutoBreakdown(autoOtherMap, activeOtherKeys, { allowExtra: true })
            )
          )
          setDeliveryAppBreakdown(
            mapBreakdownStringsToBahtDisplay(
              buildAutoBreakdown(autoDeliveryMap, platformKeys, { allowExtra: true })
            )
          )
          setDineInDeliveryBreakdown(
            mapBreakdownStringsToBahtDisplay(
              buildAutoBreakdown(autoDineInMap, dineInKeys, { allowExtra: true })
            )
          )
          setMemo('')
          setClosed(false)
          setClosedSavedOnce(false)
          setOpeningCashActual(null)
          setAutoFilledFlags({
            card: autoCardTotal > 0 || posCardOrdersTotal > 0,
            qr: autoQrTotal > 0,
            delivery: autoDeliveryTotal > 0 || autoDineInTotal > 0,
            other: autoOtherTotal > 0,
            cash: autoCashTotal > 0,
          })
          if (!denomCountsUserEditedRef.current || opts?.forceDenoms) {
            denomCountsUserEditedRef.current = false
            setDenomCounts(emptyDenomCountRecord())
          }
        }
        if (openMode && prev) {
          const prevS = Array.isArray(prev.settlement) ? prev.settlement[0] : prev.settlement
          setPrevDayCashActual(prevS?.cashActual != null ? Number(prevS.cashActual) : null)
        } else {
          setPrevDayCashActual(null)
        }
      })
      .catch(() => {
        setSystemTotal(0)
        setSystemSubtotal(0)
        setSystemVat(0)
        setSystemCashFromOrders(0)
        setTillNetForSettleDate(0)
        setLinkposSummary(null)
        setSettlement(null)
        setClosedSavedOnce(false)
        setPrevDayCashActual(null)
        setDineInDeliveryBreakdown({})
        setOpeningCashActual(null)
        setAutoFilledFlags({ card: false, qr: false, delivery: false, other: false, cash: false })
        if (!denomCountsUserEditedRef.current) {
          setDenomCounts(emptyDenomCountRecord())
        }
      })
      .finally(() => setLoading(false))
  }, [settleDate, effectiveStore, openMode, offlineAware, applyDenomCountsFromSettlement])

  React.useEffect(() => {
    if (canSearchAll) {
      if (storeFilter) return
      const authStoreRaw = String(auth?.store || '').trim()
      const authStoreResolved = authStoreRaw ? resolveStoreKey(authStoreRaw) || authStoreRaw : ''
      const authStoreMatched =
        stores.find((s) => resolveStoreKey(s) === authStoreResolved) || authStoreResolved
      if (authStoreMatched) {
        setStoreFilter(authStoreMatched)
        return
      }
      const branches = filterNonOfficeStores(stores)
      const first = branches[0] || stores[0]
      if (first) setStoreFilter(first)
      return
    }
    if (auth?.store) setStoreFilter(resolveStoreKey(auth.store) || auth.store)
  }, [canSearchAll, stores, auth?.store, storeFilter, resolveStoreKey])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadData()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, loadData])

  const loadHistory = React.useCallback(async () => {
    if (!effectiveStore) {
      setHistoryRows([])
      return
    }
    setHistoryLoading(true)
    try {
      const days = Number(historyRange)
      const dates = Array.from({ length: days }, (_, i) => shiftYmd(settleDate, -i))
      const fetcher = offlineAware ? getPosSettlementWithCache : getPosSettlement
      const rows = await Promise.all(
        dates.map(async (date) => {
          const res = await fetcher({
            settleDate: date,
            storeCode: effectiveStore,
          })
          const s = Array.isArray(res.settlement) ? res.settlement[0] : res.settlement
          const inputTotal = s
            ? Number(s.cashAmt ?? 0) +
              Number(s.cardAmt ?? 0) +
              Number(s.qrAmt ?? 0) +
              Number(s.deliveryAppAmt ?? 0) +
              Number(s.dineInDeliveryAmt ?? 0) +
              Number(s.otherAmt ?? 0)
            : 0
          return {
            date,
            systemTotal: Number(res.systemTotal ?? 0),
            inputTotal,
            diff: inputTotal - Number(res.systemTotal ?? 0),
            closed: !!s?.closed,
            hasSettlement: !!s,
          }
        })
      )
      setHistoryRows(rows)
    } catch {
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }, [effectiveStore, historyRange, settleDate, offlineAware])

  React.useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
  }, [activeTab, loadHistory])

  /** 영업 시작: 단위별 합산 */
  const denomTotal = CASH_DENOMINATIONS.reduce(
    (sum, d) => sum + d.value * (parseInt(toIntegerInput(denomCounts[d.value] || '0') || '0', 10) || 0),
    0
  )
  /** 돈통 시제: 영업시작·결산 모두 화폐 단위 입력 사용 */
  const cashActualNum = denomTotal
  const cashAmtNum = openMode ? parseBahtAmount(cashAmt) : systemCashFromOrders
  const cardFromBreakdownLines = CARD_KEYS.reduce((s, k) => s + parseBahtAmount(cardBreakdown[k]), 0)
  const cardNum =
    cardFromBreakdownLines > 0.005 ? cardFromBreakdownLines : parseBahtAmount(cardAmt)
  const qrFromLines = displayQrKeyList.reduce((s, k) => s + parseBahtAmount(qrBreakdown[k]), 0)
  const qrNum = qrFromLines > 0.005 ? qrFromLines : parseBahtAmount(qrAmt)
  const otherFromLines = displayOtherKeyList.reduce((s, k) => s + parseBahtAmount(otherBreakdown[k]), 0)
  const otherNum = otherFromLines > 0.005 ? otherFromLines : parseBahtAmount(otherAmt)
  const deliveryNum =
    PLATFORM_DELIVERY_KEYS.reduce((s, k) => s + parseBahtAmount(deliveryAppBreakdown[k]), 0) ||
    parseBahtAmount(deliveryAppAmt) ||
    0
  const dineInNum = Object.values(dineInDeliveryBreakdown).reduce((s, v) => s + parseBahtAmount(v), 0)
  const deliveryAppTotalNum = deliveryNum + dineInNum
  const totalInput = cashAmtNum + cardNum + qrNum + deliveryNum + dineInNum + otherNum
  const currencySuffix = ' ฿'
  /** 화면 금액 표시 — 영수증·주문과 동일하게 `formatBahtNum`(소수 둘째 자리) */
  const fmtBahtSuffix = (n: number | null | undefined) => `${formatBahtNum(n)}${currencySuffix}`
  const fmtSignedBaht = (n: number) => `${n > 0 ? '+' : ''}${formatBahtNum(n)} ฿`
  const savedCash = Number(settlement?.cashAmt ?? 0)
  const savedCard = Number(settlement?.cardAmt ?? 0)
  const savedQr = Number(settlement?.qrAmt ?? 0)
  const savedDelivery = Number(settlement?.deliveryAppAmt ?? 0)
  const savedDineIn = Number(settlement?.dineInDeliveryAmt ?? 0)
  const savedOther = Number(settlement?.otherAmt ?? 0)
  const savedTotal = savedCash + savedCard + savedQr + savedDelivery + savedDineIn + savedOther
  const tillNetAppliedToDrawer = openMode ? 0 : tillNetForSettleDate
  const expectedDrawerByOpenAndCash = (openingCashActual ?? 0) + cashAmtNum + tillNetAppliedToDrawer
  /** 권종 실사 − 「예상 돈통 시제」(시작+당일 현금 매출±시재 입출금 순액). Till 순액을 빼면 출금 분만큼 차이가 틀어짐 */
  const drawerDenomDeltaVsPosCash =
    openingCashActual != null ? cashActualNum - expectedDrawerByOpenAndCash : null

  /** 서버 확정(또는 이번 세션 즉시 확정) 마감은 저장/수정 재시도 차단 */
  const inputsLocked = (Boolean(settlement?.closed) || closedSavedOnce) && !canUnclose

  const handleDenomCountChange = React.useCallback((denomValue: number, raw: string) => {
    denomCountsUserEditedRef.current = true
    setDenomCounts((prev) => patchDenomCount(prev, denomValue, raw))
  }, [])

  const composeSettlementReceiptFullHtml = (): string => {
    const storeLabel = canSearchAll && storeFilter ? storeFilter : effectiveStore
    const reportTitle = openMode
      ? t('posSettlementOpenReport') || t('posBusinessOpen') || 'POS opening report'
      : t('posSettlementReport') || 'POS 결산 리포트'
    const dateLabel =
      openMode ? t('posOpenReportDate') || t('posSettleDate') || '결산일' : t('posSettleDate') || '결산일'
    const htmlLang =
      typeof lang === 'string' && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(lang.trim()) ? lang.trim() : undefined
    const docTitle = `${reportTitle} - ${storeLabel} - ${settleDate}`

    const amt = (label: string, value: string, rowClass = '') =>
      `<div class="receipt-row${rowClass}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
    const amtIndent = (label: string, value: string) =>
      `<div class="receipt-row"><span style="padding-left:2mm">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
    const headerBlock = `
      <div class="receipt-order-header text-center">
        <div class="receipt-store-name">${escapeHtml(String(storeLabel))}</div>
        <div class="receipt-order-label">${escapeHtml(reportTitle)}</div>
      </div>
      <div class="receipt-divider"></div>
      <div class="text-xs text-center">${escapeHtml(dateLabel)}: ${escapeHtml(settleDate)}</div>
      <div class="receipt-divider"></div>`
    const footerStamp = `
      ${closed ? `<div class="text-center" style="margin-top:6px;font-weight:700">${escapeHtml(t('posClosed') || '마감')}</div>` : ''}
      <div class="text-xs text-center" style="margin-top:8px;color:#333">${escapeHtml(formatPosDateTimeMedium(new Date(), lang))}</div>`
    const platformBreakdownPrintRows = PLATFORM_DELIVERY_KEYS
      .map((k) => ({ key: k, amount: parseBahtAmount(deliveryAppBreakdown[k]) }))
      .filter((row) => row.amount > 0.005)
      .map((row) => amtIndent(`- ${deliveryPlatformSettlementLabel(row.key)}`, formatBahtNum(row.amount)))
      .join('')
    const dineInBreakdownPrintRows = displayDineInKeyList
      .map((k) => ({ key: k, amount: parseBahtAmount(dineInDeliveryBreakdown[k]) }))
      .filter((row) => row.amount > 0.005)
      .map((row) =>
        amtIndent(
          `- ${
            row.key === POS_SETTLEMENT_DINE_IN_CODE
              ? (t('posDeliveryPayDineIn') || 'Dine in')
              : deliveryPlatformSettlementLabel(row.key)
          }`,
          formatBahtNum(row.amount)
        )
      )
      .join('')

    const bodyInner = openMode
      ? (() => {
          const denomRows = CASH_DENOMINATIONS.map((d) => {
            const qty = parseInt(toIntegerInput(denomCounts[d.value] || '0'), 10) || 0
            if (qty === 0) return ''
            const line = d.value * qty
            return amt(`${d.label} ฿ × ${t('qty') || '수량'} ${qty}`, formatBahtNum(line))
          }).join('')
          const prevDayRow =
            prevDayCashActual != null
              ? amt(t('posPrevDayCash') || '전날 시재', formatBahtNum(prevDayCashActual))
              : ''
          const denomHeadingEsc = escapeHtml(t('posOpenPrintDenomHeading') || '권종')
          const noDenomNote =
            denomRows.trim().length === 0
              ? `<p class="memo" style="color:#444">${escapeHtml(t('posOpenPrintNoDenom') || '권종 수량이 없습니다.')}</p>`
              : ''
          return `<div class="receipt-content receipt-order-simple">${headerBlock}${prevDayRow}<div class="text-xs" style="font-weight:700;margin:8px 0 4px;text-align:center">${denomHeadingEsc}</div>${denomRows || noDenomNote}<div class="receipt-divider"></div>${amt(t('posCashActual') || '돈통 시재', formatBahtNum(cashActualNum), ' receipt-total')}${memo.trim() ? `<div class="memo"><span class="footer-strong">${escapeHtml(t('posMemo') || '비고')}:</span> ${escapeHtml(memo.trim())}</div>` : ''}${footerStamp}</div>`
        })()
      : `<div class="receipt-content receipt-order-simple">${headerBlock}
${amt(t('posSystemSubtotal') || '공급가액', formatBahtNum(systemSubtotal))}
${amt(t('posSystemVat') || 'VAT (7%)', formatBahtNum(systemVat))}
<div class="receipt-divider"></div>
${amt(t('posSystemTotal') || '시스템 매출', formatBahtNum(systemTotal), ' receipt-total')}
<div class="receipt-divider"></div>
${amt(t('posCash') || '현금', formatBahtNum(cashAmtNum))}
${amt(t('posCashActual') || '돈통 시재', formatBahtNum(cashActualNum))}
${amt(t('posCard') || '카드', formatBahtNum(cardNum))}
${amt(t('posPaymentQrCode') || 'QR 코드', formatBahtNum(qrNum))}
<div class="receipt-divider-strong"></div>
${amt(t('posPaymentDeliveryApp') || '배달앱', formatBahtNum(deliveryAppTotalNum))}
${amtIndent(t('posSettlementDeliverySubActual') || '실제 배달 (플랫폼)', formatBahtNum(deliveryNum))}
${platformBreakdownPrintRows}
${amtIndent(t('posSettlementDeliverySubDineIn') || '홀 (Dine in)', formatBahtNum(dineInNum))}
${dineInBreakdownPrintRows}
${amt(t('posPaymentOther') || '기타', formatBahtNum(otherNum))}
<div class="receipt-divider"></div>
${amt(t('posInputTotal') || '입력 합계', formatBahtNum(totalInput), ' receipt-total')}
${memo ? `<div class="memo"><span class="footer-strong">${escapeHtml(t('posMemo') || '비고')}:</span> ${escapeHtml(memo)}</div>` : ''}
${footerStamp}
</div>`

    return buildReceiptDocumentHtml({
      title: escapeHtml(docTitle),
      bodyContent: bodyInner,
      htmlLang,
    })
  }

  const resolveSettlementPrinterHw = async () => {
    if (!effectiveStore) return null
    const cached = settlementPrinterHwRef.current
    if (cached !== undefined) return cached
    const fetched = await getPosPrinterSettings({ storeCode: effectiveStore }).catch(() => null)
    settlementPrinterHwRef.current = fetched ?? null
    return fetched ?? null
  }

  const handlePrint = async () => {
    const reportTitle = openMode
      ? t('posSettlementOpenReport') || t('posBusinessOpen') || 'POS opening report'
      : t('posSettlementReport') || 'POS 결산 리포트'
    const hw =
      effectiveStore.length > 0 ? await resolveSettlementPrinterHw().catch(() => null) : null
    const fullHtml = composeSettlementReceiptFullHtml()
    await new Promise<void>((resolve, reject) => {
      printPosHtmlDocument(fullHtml, {
        title: reportTitle,
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        printRole: 'receipt',
        printReceiptKind: 'hall_order',
        escPosCutOverride: resolveEscPosCutOverride(hw, { printRole: 'receipt', printReceiptKind: 'hall_order' }),
        onPrintUnavailable: () => {
          reject(new Error(t('posPrintUnavailable')))
        },
        onAfterCleanup: () => resolve(),
      })
    })
  }

  const handleSave = async () => {
    if (!effectiveStore) {
      await appAlert(t('store') || '매장을 선택하세요.')
      return
    }
    if (!canUnclose && (Boolean(settlement?.closed) || closedSavedOnce)) {
      await appAlert(t('posClosedByAdminOnly') || '마감 해제는 본사 관리자만 가능합니다.')
      return
    }

    /**
     * Chromium: 저장 API·알림 뒤엔 사용자 제스처가 사라져 iframe print 무시되는 경우 있음
     * → 클릭 직후 보조 창 확보(웹만). 영업 시작 저장 / 마감 체크 후 결산 저장 시 자동 인쇄에 사용.
     */
    const autoPrintAfterSuccess =
      typeof window !== 'undefined' && (openMode || (!openMode && closed))
    const reserveWebKioskPrintPopup =
      autoPrintAfterSuccess && !hasHybridPosPrintShell(window)
    let webKioskPrintPopup: Window | null = null
    if (reserveWebKioskPrintPopup) {
      try {
        webKioskPrintPopup = window.open(
          '',
          openMode ? 'cm_pos_business_open_receipt' : 'cm_pos_settlement_receipt',
          'popup=yes,width=160,height=100,left=0,top=0'
        )
      } catch {
        webKioskPrintPopup = null
      }
    }

    setSaving(true)
    try {
      const openBusinessDate = openMode ? getPosBusinessDateStr() : settleDate
      const openSettleDates =
        openMode && Number.isFinite(cashActualNum)
          ? resolvePosBusinessOpenSettleDates(openBusinessDate)
          : []

      if (openMode && Number.isFinite(cashActualNum) && openSettleDates.length > 0) {
        try {
          await persistPosBusinessOpenAfterSave({
            storeCode: effectiveStore,
            settleDates: openSettleDates,
            cashActual: cashActualNum,
          })
        } catch {
          /* IndexedDB·sessionStorage 불능 — 아래 서버·큐 저장 계속 */
        }
      }

      const res = await savePosSettlementWithOffline({
        storeCode: effectiveStore,
        settleDate: openMode ? openBusinessDate : settleDate,
        cashActual: cashActualNum,
        cashActualDenoms: denomCountsToSavePayload(denomCounts),
        cashAmt: cashAmtNum,
        cardAmt: cardNum,
        cardBreakdown: Object.fromEntries(
          CARD_KEYS.map((k) => [k, parseBahtAmount(cardBreakdown[k])])
        ) as Record<string, number>,
        qrAmt: qrNum,
        qrBreakdown: Object.fromEntries(
          displayQrKeyList.map((k) => [k, parseBahtAmount(qrBreakdown[k])])
        ) as Record<string, number>,
        deliveryAppAmt: deliveryNum,
        deliveryAppBreakdown: Object.fromEntries(
          PLATFORM_DELIVERY_KEYS.map((k) => [k, parseBahtAmount(deliveryAppBreakdown[k])])
        ) as Record<string, number>,
        dineInDeliveryAmt: dineInNum,
        dineInDeliveryBreakdown: Object.fromEntries(
          displayDineInKeyList.map((k) => [k, parseBahtAmount(dineInDeliveryBreakdown[k])])
        ) as Record<string, number>,
        otherAmt: otherNum,
        otherBreakdown: Object.fromEntries(
          OTHER_KEYS.map((k) => [k, parseBahtAmount(otherBreakdown[k])])
        ) as Record<string, number>,
        memo,
        closed,
      })
      const closePrintPopup = (p: Window | null) => {
        if (p && !p.closed) {
          try {
            p.close()
          } catch {
            /* ignore */
          }
        }
      }
      if (res.success) {
        if (!canUnclose && closed) {
          setClosedSavedOnce(true)
        }
        if (openMode && Number.isFinite(cashActualNum) && openSettleDates.length > 0) {
          try {
            await persistPosBusinessOpenAfterSave({
              storeCode: effectiveStore,
              settleDates: openSettleDates,
              cashActual: cashActualNum,
            })
          } catch {
            /* IndexedDB·sessionStorage 불능 — 서버 저장은 이미 성공 */
          }
        }
        /** 영업 시작 저장 또는 마감 체크 후 결산 저장: 요약(오픈/마감) 영수증 자동 인쇄 — 알림 전, 웹 제스처·하이브리드 ESC/POS */
        if (autoPrintAfterSuccess) {
          const fullHtml = composeSettlementReceiptFullHtml()
          if (typeof window !== 'undefined' && hasHybridPosPrintShell(window)) {
            closePrintPopup(webKioskPrintPopup)
            webKioskPrintPopup = null
            try {
              await handlePrint()
            } catch {
              await new Promise((resolve) => window.setTimeout(resolve, 450))
              await handlePrint()
            }
          } else if (webKioskPrintPopup && !webKioskPrintPopup.closed) {
            const p = webKioskPrintPopup
            webKioskPrintPopup = null
            try {
              p.document.open()
              p.document.write(fullHtml)
              p.document.close()
              p.focus()
              p.print()
              window.setTimeout(() => {
                closePrintPopup(p)
              }, 800)
            } catch {
              closePrintPopup(p)
              await handlePrint()
            }
          } else {
            closePrintPopup(webKioskPrintPopup)
            webKioskPrintPopup = null
            await handlePrint()
          }
        } else {
          closePrintPopup(webKioskPrintPopup)
          webKioskPrintPopup = null
        }
        await appAlert(t('itemsAlertSaved') || '저장되었습니다.')
        loadData({ forceDenoms: true })
      } else {
        closePrintPopup(webKioskPrintPopup)
        webKioskPrintPopup = null
        await appAlert(localizeApiMessage(res.message, t, t('msg_save_fail_detail'), lang))
      }
    } catch (e) {
      if (typeof window !== 'undefined' && webKioskPrintPopup && !webKioskPrintPopup.closed) {
        try {
          webKioskPrintPopup.close()
        } catch {
          /* ignore */
        }
      }
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setSaving(false)
    }
  }

  const handleValidateClose = async () => {
    if (!effectiveStore) return
    setCloseRunning(true)
    try {
      const res = await validatePosClose({
        storeCode: effectiveStore,
        settleDate,
      })
      if (!res.success || !res.result) {
        await appAlert(localizeApiMessage(res.message, t, t('msg_save_fail_detail'), lang))
        return
      }
      const diff = Number(res.result.diffTotal || 0)
      await appAlert(
        `${t('posSettlement') || '결산'} Validate: ${
          res.result.status === 'validated' ? 'OK' : 'Draft'
        }\nDiff: ${formatBahtNum(diff)}`
      )
      loadData()
    } finally {
      setCloseRunning(false)
    }
  }

  const handleFinalizeClose = async () => {
    if (!effectiveStore) return
    setCloseRunning(true)
    try {
      const res = await finalizePosClose({
        storeCode: effectiveStore,
        settleDate,
      })
      if (!res.success || !res.result) {
        await appAlert(localizeApiMessage(res.message, t, t('msg_save_fail_detail'), lang))
        return
      }
      await appAlert(
        `${t('posSettlementClosedDone') || '마감 완료'}${
          res.result.postedJournalEntryId ? `\nJE#${res.result.postedJournalEntryId}` : ''
        }`
      )
      loadData()
    } finally {
      setCloseRunning(false)
    }
  }

  const paddingClass = 'px-4 py-6 sm:px-6 lg:px-8'
  const maxWClass = compact ? '' : 'max-w-2xl mx-auto'

  return (
    <div className={cn('w-full min-w-0 shrink-0', maxWClass)} data-tour="pos-tour-settlement-shell">
      <div className={paddingClass}>
        <OfflineBanner
          offlineOnly={offlineAware}
          onSyncComplete={() => loadData({ forceDenoms: true })}
          offlineMsg={t('posSettlementOfflineSaved') || '오프라인 모드 - 결산이 로컬에 저장됩니다. 복구 후 자동 전송됩니다.'}
          syncingMsg={t('posSyncing') || '동기화 중...'}
          retryLabel={t('posRetrySync') || '재시도'}
          queueScope="pos_runtime_critical"
        />
        <div className={cn('flex flex-wrap items-start gap-3', compact ? 'mb-4' : 'mb-6')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
            <h1 className={cn('font-bold tracking-tight text-foreground', compact ? 'text-lg' : 'text-xl')}>
              {openMode ? (t('posBusinessOpen') || '영업 시작') : (t('posSettlement') || 'POS 결산')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {openMode
                ? (t('posOpenCashCountHint') || '현금 시제를 화폐 단위별로 입력하세요.')
                : (t('posSettlementSub') || '일별 매출·결제수단 입력, 돈통 시제')}
            </p>
          </div>
          <div className="ml-auto shrink-0 basis-[9.5rem] sm:basis-auto">
            <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
              <SelectTrigger className="h-10 w-full sm:w-36" aria-label={t('posLanguage') || 'Language'}>
                <SelectValue placeholder={t('posLanguage') || '언어'} />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_UI_LANG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          className={cn('flex flex-wrap items-center gap-3', compact ? 'mb-4' : 'mb-6')}
          data-tour="pos-tour-settlement-toolbar"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('posSettleBusinessDayLabel') || '영업일'}
            </span>
            <Input
              type="date"
              value={settleDate}
              onChange={(e) => {
                userPickedSettleDateRef.current = true
                setSettleDate(e.target.value)
              }}
              className="h-10 w-40"
              aria-label={t('posSettleBusinessDayLabel') || '영업일'}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 self-end"
            onClick={syncSettleDateToCurrentBusinessDay}
          >
            {t('posSettleCurrentBusinessDay') || '현재 영업일'}
          </Button>
          {canSearchAll && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-10 w-36">
                <SelectValue placeholder={t('store') || '매장'} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="h-10 gap-1.5" onClick={() => loadData({ forceDenoms: true })} disabled={loading}>
            <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {t('posRefresh') || '새로고침'}
          </Button>
          {effectiveStore && (
            <Button size="sm" variant="outline" className="h-10 gap-1.5" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              {t('printBtn') || '인쇄'}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-10 gap-1.5" onClick={() => router.push(posHomeHref)}>
            <House className="h-4 w-4" />
            {t('mobileStoreSalesBackHome') || '홈으로 돌아가기'}
          </Button>
        </div>

        {effectiveStore && businessDayRangeLabel ? (
          <div
            className={cn(
              'rounded-lg border bg-muted/30 px-4 py-3 text-sm',
              compact ? 'mb-4' : 'mb-6'
            )}
            data-tour="pos-tour-settlement-business-day-range"
          >
            <p className="font-medium">{t('posSettleBusinessDayRange') || '집계 구간 (방콕)'}</p>
            <p className="mt-1 font-erp-numeric text-muted-foreground">{businessDayRangeLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('posSettleBusinessDayRangeHint') ||
                '영업 시작·종료 시각과 동일합니다. 결산·POS 매출·일마감이 이 구간으로 묶입니다.'}
            </p>
            {canEditBusinessHours ? (
              <Link
                href="/admin/sales-management?hours=1"
                className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
              >
                {t('posSettleBusinessHoursSettingsLink') || '영업시간 설정'}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-[calc(100vh-260px)] min-h-0 overflow-y-auto overflow-x-hidden -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t('loading')}</div>
        )}

        {effectiveStore && (!loading || offlineAware) && openMode && (
          <div
            className={cn(
              'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]',
              compact ? 'p-4' : 'p-6 sm:p-8'
            )}
            data-tour="pos-tour-open-cash-counts"
          >
            <div className="space-y-6">
              <div
                className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/60 to-muted/20 px-4 py-3.5 shadow-sm"
                data-tour="pos-tour-open-prev-summary"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('posPrevDayCash') || '전날 시재'}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {prevDayCashActual != null ? `${formatBahtNum(prevDayCashActual)} ฿` : '—'}
                </p>
              </div>
              {settlement?.cashActual != null && Number(settlement.cashActual) > 0 && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                  {t('posSavedCashActual') || '저장된 시제'}:{' '}
                  <span className="font-semibold tabular-nums">{formatBahtNum(Number(settlement.cashActual))} ฿</span>
                </p>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{t('posCashActual') || '돈통 시제'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('posOpenCashCountHint') || '현금 시제를 화폐 단위별로 입력하세요.'}
                </p>
              </div>
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
                data-tour="pos-tour-open-denom-grid"
              >
                {CASH_DENOMINATIONS.map((d) => {
                  const qty = parseInt(toIntegerInput(denomCounts[d.value] || '0'), 10) || 0
                  const line = d.value * qty
                  const qtyLabel = t('qty') || '수량'
                  return (
                    <div
                      key={d.value}
                      className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 py-2 pl-3 pr-2.5 shadow-sm transition-colors hover:border-primary/25 hover:bg-background sm:gap-2"
                    >
                      <span className="shrink-0 basis-[4rem] text-sm font-bold tabular-nums text-foreground sm:basis-[4.25rem] sm:text-base">
                        {d.label}
                        <span className="ml-0.5 text-xs font-semibold text-muted-foreground">฿</span>
                      </span>
                      <span className="shrink-0 select-none text-muted-foreground/70" aria-hidden>
                        ×
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="0"
                        aria-label={`${d.label} ${qtyLabel}`}
                        className="h-9 w-[3.25rem] shrink-0 border-input/80 px-2 text-center text-sm font-semibold tabular-nums shadow-inner sm:w-14 sm:text-base"
                        value={denomCounts[d.value] ?? ''}
                        onChange={(e) => handleDenomCountChange(d.value, e.target.value)}
                        disabled={inputsLocked}
                      />
                      <span className="mx-0.5 shrink-0 text-muted-foreground/50 sm:mx-1" aria-hidden>
                        =
                      </span>
                      <div className="ml-auto min-w-[4.5rem] shrink-0 text-right sm:min-w-[5.25rem]">
                        <span className="text-sm font-bold tabular-nums text-primary sm:text-base">
                          {formatBahtNum(line)}
                        </span>
                        <span className="ml-0.5 text-xs font-medium text-muted-foreground">฿</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div
                className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/[0.07] to-transparent px-5 py-5 text-center shadow-inner"
                data-tour="pos-tour-open-denom-total"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                  {t('posCashActualDenomGrandTotal') || t('posCashActual')}
                </div>
                <div className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-primary">
                  {formatBahtNum(denomTotal)} <span className="text-xl font-bold text-primary/70">฿</span>
                </div>
              </div>
              <div className="space-y-2.5">
                <Button
                  className="h-12 w-full text-base font-semibold shadow-md transition-shadow hover:shadow-lg"
                  onClick={handleSave}
                  disabled={saving || inputsLocked}
                  data-tour="pos-tour-open-save"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? '...' : t('itemsBtnSave') || '저장'}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full border-dashed"
                  onClick={() => router.push(settlementFullCloseHref)}
                  data-tour="pos-tour-open-link-full-settlement"
                >
                  {t('posSettlement') || '전체 결산'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {effectiveStore && !loading && !openMode && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'entry' | 'history')} className={cn('rounded-xl border bg-card', compact ? 'p-4' : 'p-6')} data-tour="pos-tour-close-entry">
            <AdminTabsBarWithHelp className="mb-4 overflow-hidden rounded-lg">
              <TabsList className={adminTabsListRowCn} data-tour="pos-tour-close-tabs">
                <TabsTrigger value="entry" className={adminTabsTriggerCn}>
                  {t('posSettlementEntryTab')}
                </TabsTrigger>
                <TabsTrigger value="history" className={adminTabsTriggerCn}>
                  {t('posSettlementHistoryTab')}
                </TabsTrigger>
              </TabsList>
            </AdminTabsBarWithHelp>

            <TabsContent value="entry" className="space-y-4">
              <div className="space-y-1.5 rounded-lg bg-muted/30 px-4 py-3" data-tour="pos-tour-close-system-summary">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('posSystemSubtotal') || '공급가액'}</span>
                  <span className="tabular-nums">{formatBahtNum(systemSubtotal)} ฿</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('posSystemVat') || 'VAT (7%)'}</span>
                  <span className="tabular-nums">{formatBahtNum(systemVat)} ฿</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-border">
                  <span className="font-medium">{t('posSystemTotal') || '시스템 매출'}</span>
                  <span className="text-lg font-bold tabular-nums">{formatBahtNum(systemTotal)} ฿</span>
                </div>
              </div>
              {linkposSummary && (
                <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-primary">{t('posLinkposReconcileTitle')}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {i18nTr(t, 'posLinkposReconcileCountSummary', {
                        approved: linkposSummary.approvedCount,
                        failed: linkposSummary.failedCount,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('posLinkposCardInputTotal')}</span>
                    <span className="tabular-nums">{formatBahtNum(linkposSummary.cardReportedTotal)} ฿</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('posLinkposApprovedTotal')}</span>
                    <span className="tabular-nums">{formatBahtNum(linkposSummary.approvedTotal)} ฿</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('posLinkposRequestedTotal')}</span>
                    <span className="tabular-nums">{formatBahtNum(linkposSummary.requestedTotal)} ฿</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-primary/20">
                    <span className="font-medium">{t('posLinkposCardVsApprovedDiff')}</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        Math.abs(linkposSummary.diffVsApproved) > 0.005 ? 'text-amber-700' : 'text-emerald-700'
                      )}
                    >
                      {linkposSummary.diffVsApproved >= 0 ? '+' : ''}
                      {formatBahtNum(linkposSummary.diffVsApproved)} ฿
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* 돈통 시제: 화폐 단위 입력 (영업시작과 동일) */}
                <div data-tour="pos-tour-close-cash-actual">
                  <p className="mb-2 text-sm font-medium">{t('posCashActual') || '돈통 시제'}</p>
                  {inputsLocked && (
                    <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                      {t('posClosedByAdminOnly') || '마감 해제는 본사 관리자만 가능합니다.'}
                    </p>
                  )}
                  {settlement?.cashActual != null && Number(settlement.cashActual) > 0 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('posSavedCashActual') || '저장된 시제'}: {formatBahtNum(Number(settlement.cashActual))} ฿
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {CASH_DENOMINATIONS.map((d) => {
                      const qty = parseInt(toIntegerInput(denomCounts[d.value] || '0'), 10) || 0
                      const line = d.value * qty
                      const qtyLabel = t('qty') || '수량'
                      return (
                        <div
                          key={d.value}
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 py-1.5 pl-2.5 pr-2 shadow-sm sm:gap-2"
                        >
                          <span className="shrink-0 basis-[3.5rem] text-sm font-bold tabular-nums text-foreground sm:basis-[4rem]">
                            {d.label}
                            <span className="ml-0.5 text-xs font-semibold text-muted-foreground">฿</span>
                          </span>
                          <span className="shrink-0 select-none text-muted-foreground/70" aria-hidden>
                            ×
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="0"
                            aria-label={`${d.label} ${qtyLabel}`}
                            className="h-8 w-[3rem] shrink-0 px-1.5 text-center text-sm font-semibold tabular-nums sm:h-9 sm:w-[3.25rem]"
                            value={denomCounts[d.value] ?? ''}
                            onChange={(e) => handleDenomCountChange(d.value, e.target.value)}
                            disabled={inputsLocked}
                          />
                          <span className="mx-0.5 shrink-0 text-muted-foreground/50 sm:mx-1" aria-hidden>
                            =
                          </span>
                          <div className="ml-auto min-w-[4rem] shrink-0 text-right sm:min-w-[4.75rem]">
                            <span className="text-sm font-bold tabular-nums text-primary">{formatBahtNum(line)}</span>
                            <span className="ml-0.5 text-xs text-muted-foreground">฿</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">
                    {t('posCashActualDenomGrandTotal') || `${t('posCashActual')} 합계`}:{' '}
                    {formatBahtNum(denomTotal)}
                    {currencySuffix}
                  </p>
                </div>

                <Collapsible open={cashExpanded} onOpenChange={setCashExpanded}>
                  <CollapsibleTrigger asChild>
                    <div
                      className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/30 cursor-pointer"
                      data-tour="pos-tour-close-cash-line"
                    >
                      <span className="font-medium flex items-center gap-2">
                        {t('posCash') || '현금'}
                        {systemCashFromOrders > 0 && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                            {t('posSettlementCashFromPosBadge') || 'POS'}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">
                          {fmtBahtSuffix(cashAmtNum)}
                        </span>
                        {cashExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="mt-2 pl-2 text-[10px] leading-snug text-muted-foreground border-t pt-2">
                      {t('posSettlementCashFromPosReadOnly') ||
                        '완료 주문의 현금 결제 합계입니다. 결제 화면과 맞추기 위해 수정할 수 없습니다.'}
                    </p>
                  </CollapsibleContent>
                </Collapsible>

                {/* 카드: 큰 제목 + 펼치기/접기 */}
                <Collapsible open={cardExpanded} onOpenChange={setCardExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/30 cursor-pointer">
                      <span className="font-medium flex items-center gap-2">
                        {t('posCard') || '카드'}
                        {autoFilledFlags.card && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            AUTO
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">{fmtBahtSuffix(cardNum)}</span>
                        {cardExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 border-t pt-2 pl-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                        <span className="text-muted-foreground">{t('posSettlementPosCardOrdersTotal')}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatBahtNum(linkposSummary?.cardReportedTotal ?? 0)}
                          {currencySuffix}
                        </span>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        {t('posSettlementCardBrandEdcHint') ||
                          '결제 화면에는 카드 구분 없이 기록됩니다. EDC 단말 결산서를 보고 아래에 브랜드별 금액을 입력해 주세요.'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {CARD_KEYS.map((k) => (
                          <label key={k} className="flex items-center gap-2 text-xs">
                            <span className="w-16 shrink-0">{k}</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              className="h-8 text-right tabular-nums"
                              value={cardBreakdown[k] ?? ''}
                              onChange={(e) =>
                                setCardBreakdown((prev) => ({
                                  ...prev,
                                  [k]: formatBahtInputDisplay(e.target.value),
                                }))
                              }
                              disabled={inputsLocked}
                            />
                            <span className="text-muted-foreground w-5">฿</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* QR(계좌이체): 큰 제목 + 펼치기/접기 */}
                <Collapsible open={qrExpanded} onOpenChange={setQrExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/30 cursor-pointer">
                      <span className="font-medium flex items-center gap-2">
                        {t('posPaymentQrCode') || 'QR 코드'} ({t('posQrBankTransfer') || 'PromptPay 등'})
                        {autoFilledFlags.qr && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            AUTO
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">{fmtBahtSuffix(qrNum)}</span>
                        {qrExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {payAutoBreakdownStaffLocked && autoFilledFlags.qr && (
                      <p className="mt-2 pl-2 text-[10px] leading-snug text-muted-foreground border-t pt-2">
                        {t('posSettlementAutoQrLockedHint') ||
                          'QR·PromptPay 등 금액은 완료 주문·LinkPOS 집계값입니다. 매장 계정에서는 수정할 수 없습니다. 오류 시 본사·회계에서 주문 결제 정정 또는 권한 있는 계정으로만 조정하세요.'}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pl-2 pt-2 border-t mt-2">
                      {displayQrKeyList.map((k) => (
                        <label key={k} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0">{k}</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-8 text-right tabular-nums"
                            value={qrBreakdown[k] ?? ''}
                            onChange={(e) =>
                              setQrBreakdown((prev) => ({
                                ...prev,
                                [k]: formatBahtInputDisplay(e.target.value),
                              }))
                            }
                            disabled={inputsLocked || (payAutoBreakdownStaffLocked && autoFilledFlags.qr)}
                          />
                          <span className="text-muted-foreground w-5">฿</span>
                        </label>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* 배달앱: 결산 시 한 묶음 안에서 ①실제 배달 ②홀(Dine in) 두 종류 */}
                <Collapsible open={deliveryExpanded} onOpenChange={setDeliveryExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/30 cursor-pointer">
                      <span className="font-medium flex items-center gap-2">
                        {t('posPaymentDeliveryApp') || '배달앱'}
                        {autoFilledFlags.delivery && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            AUTO
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">
                          {fmtBahtSuffix(deliveryAppTotalNum)}
                        </span>
                        {deliveryExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="mt-2 pl-2 text-[10px] leading-snug text-muted-foreground">
                      {t('posSettlementDeliveryAppIntro') ||
                        '홀에서 배달앱으로 결제한 금액도 결산에서는 「배달앱」 안에 넣되, 아래 두 종류로 나눕니다: 실제 배달 vs 홀(Dine in).'}
                    </p>
                    {payAutoBreakdownStaffLocked && autoFilledFlags.delivery && (
                      <p className="mt-2 pl-2 text-[10px] leading-snug text-amber-800/90 dark:text-amber-200/90">
                        {t('posSettlementAutoDeliveryLockedHint') ||
                          '배달앱 금액은 완료 주문 집계입니다. 매장 계정에서는 수정할 수 없습니다.'}
                      </p>
                    )}
                    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/15 p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {t('posSettlementDeliverySubActual') || '실제 배달 (플랫폼)'}
                          <span className="ml-2 tabular-nums font-normal text-muted-foreground">
                            {formatBahtNum(deliveryNum)}
                            {currencySuffix}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                          {t('posSettlementDeliveryPlatformHint') ||
                            'Grab·Line Man·Shopee 등 실제 배달 플랫폼 매출.'}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {PLATFORM_DELIVERY_KEYS.map((k) => (
                            <label key={k} className="flex items-center gap-2 text-xs">
                              <span className="w-16 shrink-0">{deliveryPlatformSettlementLabel(k)}</span>
                              <Input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                className="h-8 text-right tabular-nums"
                                value={deliveryAppBreakdown[k] ?? ''}
                                onChange={(e) =>
                                  setDeliveryAppBreakdown((prev) => ({
                                    ...prev,
                                    [k]: formatBahtInputDisplay(e.target.value),
                                  }))
                                }
                                disabled={inputsLocked || (payAutoBreakdownStaffLocked && autoFilledFlags.delivery)}
                              />
                              <span className="text-muted-foreground w-5">฿</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-border/60 pt-3">
                        <p className="text-xs font-semibold text-foreground">
                          {t('posSettlementDeliverySubDineIn') || '홀 (Dine in)'}
                          <span className="ml-2 tabular-nums font-normal text-muted-foreground">
                            {formatBahtNum(dineInNum)}
                            {currencySuffix}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                          {t('posSettlementDineInDeliveryHint') ||
                            '홀 주문인데 POS 배달앱 탭·채널 Dine in 으로 받은 금액.'}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {displayDineInKeyList.map((k) => (
                            <label key={k} className="flex items-center gap-2 text-xs">
                              <span className="w-16 shrink-0">
                                {k === POS_SETTLEMENT_DINE_IN_CODE
                                  ? t('posDeliveryPayDineIn') || 'Dine in'
                                  : deliveryPlatformSettlementLabel(k)}
                              </span>
                              <Input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                className="h-8 text-right tabular-nums"
                                value={dineInDeliveryBreakdown[k] ?? ''}
                                onChange={(e) =>
                                  setDineInDeliveryBreakdown((prev) => ({
                                    ...prev,
                                    [k]: formatBahtInputDisplay(e.target.value),
                                  }))
                                }
                                disabled={inputsLocked || (payAutoBreakdownStaffLocked && autoFilledFlags.delivery)}
                              />
                              <span className="text-muted-foreground w-5">฿</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={otherExpanded} onOpenChange={setOtherExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 hover:bg-muted/30 cursor-pointer">
                      <span className="font-medium flex items-center gap-2">
                        {t('posPaymentOther') || '기타'} · {t('posPaymentOtherExpand') || '세부 수단'}
                        {autoFilledFlags.other && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            AUTO
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">{fmtBahtSuffix(otherNum)}</span>
                        {otherExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="mt-2 pl-2 text-[10px] leading-snug text-muted-foreground">
                      {t('posSettlementOtherMatchPaymentHint') ||
                        'POS 결제 화면의 「기타」탭·결제 관리의 기타 항목과 같은 줄로 맞춥니다.'}
                    </p>
                    {payAutoBreakdownStaffLocked && autoFilledFlags.other && (
                      <p className="mt-2 pl-2 text-[10px] leading-snug text-amber-800/90 dark:text-amber-200/90">
                        {t('posSettlementAutoOtherLockedHint') ||
                          '기타 금액이 주문에서 자동 집계된 경우 매장 계정에서는 수정할 수 없습니다.'}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pl-2 pt-2 border-t mt-2">
                      {displayOtherKeyList.map((k) => (
                        <label key={k} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0">{k}</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-8 text-right tabular-nums"
                            value={otherBreakdown[k] ?? ''}
                            onChange={(e) =>
                              setOtherBreakdown((prev) => ({
                                ...prev,
                                [k]: formatBahtInputDisplay(e.target.value),
                              }))
                            }
                            disabled={inputsLocked || (payAutoBreakdownStaffLocked && autoFilledFlags.other)}
                          />
                          <span className="text-muted-foreground w-5">฿</span>
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      <span>{t('posSettlementOtherLegacyAmt') || '구 방식 합계(상세 없음)'}</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          className="h-8 w-28 text-right tabular-nums"
                          value={otherAmt}
                          onChange={(e) => setOtherAmt(formatBahtInputDisplay(e.target.value))}
                          disabled={inputsLocked || (payAutoBreakdownStaffLocked && autoFilledFlags.other)}
                        />
                        <span className="w-5">{currencySuffix}</span>
                      </div>
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {!openMode && effectiveStore && settleDate && !offlineAware ? (
                <div className="space-y-1.5" data-tour="pos-channel-settlement-section">
                  <p className="text-xs font-medium text-foreground px-0.5">
                    {t('posSettlementChannelSettleLead') ||
                      '카드·배달 수수료 — 채널 정산 (1130 소거)'}
                  </p>
                  <p className="text-[11px] text-muted-foreground px-0.5 leading-snug">
                    {t('posSettlementChannelSettleLeadHint') ||
                      'GROSS=위 결제수단 합계, NET=통장 실입금, FEE=GROSS−NET. 통장 입금은 「매출 수령」만 사용.'}
                  </p>
                  <PosChannelSettlementPanel
                    t={t}
                    storeCode={effectiveStore}
                    settleDate={settleDate}
                    className="border-primary/35 bg-primary/[0.04]"
                  />
                </div>
              ) : null}

              <div className="space-y-1 rounded-lg border px-4 py-2 text-sm" data-tour="pos-tour-close-input-totals">
                <p className="text-[11px] leading-snug text-muted-foreground pb-1">
                  {t('posSettlementInputTotalsScopeHint') ||
                    '아래 「입력 합계」는 결제 수단별 금액(POS 매출 대사용)입니다. 서랍의 실물 현금과의 일치 여부는 하단 「돈통 차이」를 확인하세요.'}
                </p>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {t('posCash') || '현금'} + {t('posCard') || '카드'} + {t('posPaymentQrCode') || 'QR'} +{' '}
                    {t('posPaymentDeliveryApp') || '배달앱'} + {t('posPaymentOther') || '기타'}
                  </span>
                  <span className="tabular-nums">{fmtBahtSuffix(totalInput)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t font-medium">
                  <span>{t('posInputTotal') || '입력 합계'}</span>
                  <span className="font-bold tabular-nums">{fmtBahtSuffix(totalInput)}</span>
                </div>
              </div>

              <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('posMorningOpeningFloat') || '아침 시작 시제'}</span>
                  <span className="tabular-nums">{openingCashActual != null ? `${formatBahtNum(openingCashActual)} ฿` : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('posTodayCashTotal') || '당일 현금 총액'}</span>
                  <span className="tabular-nums">{formatBahtNum(cashAmtNum)} ฿</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink">
                    {t('posSettlementTillNetLine') || 'Till in/out net (transactions dated close day)'}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums shrink-0',
                      Math.abs(tillNetAppliedToDrawer) > 0.005 ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {tillNetAppliedToDrawer !== 0
                      ? fmtSignedBaht(tillNetAppliedToDrawer)
                      : `0${currencySuffix}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('posExpectedDrawerCash') || '예상 돈통 시제(시작+현금)'}</span>
                  <span className="tabular-nums font-semibold">
                    {openingCashActual != null ? `${formatBahtNum(expectedDrawerByOpenAndCash)} ฿` : '-'}
                  </span>
                </div>

                <div
                  className="mt-3 space-y-2 rounded-xl border-2 border-primary/45 bg-background/90 px-3 py-3.5 shadow-sm"
                  data-tour="pos-tour-close-drawer-variance"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/90">
                    {t('posSettlementDrawerVarianceBadge') || '돈통 점검'}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t('posSettlementDrawerVarianceHint') ||
                      '(권종 합 − 아침 시작 시제 − 당일 POS 현금). 아침 권종 그대로라면 차이만큼 권종을 늘리면 「당일 현금 총액」 반영처럼 확인됩니다. 출금까지 맞추려면 「예상 돈통 시제」에 맞춰 줄이거나 재실사하세요.'}
                  </p>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-primary/15 pt-2">
                    <span className="text-base font-bold text-foreground">
                      {t('posDrawerVarianceFocusTitle') || t('posDrawerCashDiff')}
                    </span>
                    <span
                      className={cn(
                        'text-xl font-black tabular-nums tracking-tight',
                        drawerDenomDeltaVsPosCash == null
                          ? 'text-muted-foreground'
                          : Math.abs(drawerDenomDeltaVsPosCash) > 0.005
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      )}
                    >
                      {drawerDenomDeltaVsPosCash != null
                        ? fmtSignedBaht(drawerDenomDeltaVsPosCash)
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>

              <div data-tour="pos-tour-close-memo">
                <label className="text-sm">{t('posMemo') || '비고'}</label>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('posMemoPh') || '메모'}
                  className="mt-1"
                  disabled={inputsLocked}
                />
              </div>

              <div className="flex items-center justify-between gap-3" data-tour="pos-tour-close-checkbox">
                <div className="min-w-0 flex-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => setClosed(e.target.checked)}
                      disabled={inputsLocked}
                    />
                    <span>{t('posClosed') || '마감'}</span>
                  </label>
                  <p className="mt-1 pl-6 text-[10px] leading-snug text-muted-foreground">
                    {t('posSettlementAutoPrintHint')}
                  </p>
                </div>
                {settlement?.closed && !canUnclose && (
                  <span className="text-xs text-muted-foreground">
                    {t('posClosedByAdminOnly') || '마감 해제는 본사 관리자만 가능합니다.'}
                  </span>
                )}
              </div>

              <Button className="w-full" onClick={handleSave} disabled={saving || inputsLocked} data-tour="pos-tour-close-save">
                <Save className="mr-2 h-4 w-4" />
                {saving ? '...' : t('itemsBtnSave') || '저장'}
              </Button>
              {!openMode && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleValidateClose}
                    disabled={saving || closeRunning || !effectiveStore}
                  >
                    {closeRunning ? '...' : 'Validate'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleFinalizeClose}
                    disabled={saving || closeRunning || !effectiveStore}
                  >
                    Finalize
                  </Button>
                </div>
              )}
              {!openMode && closeRun && (
                <p className="text-xs text-muted-foreground">
                  Close run: <span className="font-medium">{closeRun.status}</span>
                </p>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={historyRange === '7' ? 'default' : 'outline'}
                  onClick={() => setHistoryRange('7')}
                >
                  {t('posHistoryRecent7Days')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={historyRange === '30' ? 'default' : 'outline'}
                  onClick={() => setHistoryRange('30')}
                >
                  {t('posHistoryRecent30Days')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading}>
                  {historyLoading ? t('posHistoryLoading') : t('posHistorySearchRange')}
                </Button>
              </div>

              {!settlement ? (
                <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('posSettlementNoSavedData')}
                </div>
              ) : (
                <>
                  <div className="grid gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm sm:grid-cols-2">
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">{t('posSettleDate')}</span>
                      <p className="font-medium">{settleDate}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">{t('store')}</span>
                      <p className="font-medium">{effectiveStore}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">{t('posSettlementClosedStatus')}</span>
                      <p className="font-medium">{settlement.closed ? t('posSettlementClosedDone') : t('posSettlementNotClosed')}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">{t('posSettlementSavedAt')}</span>
                      <p className="font-medium">{settleDate}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-lg border px-4 py-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('posSystemTotal') || '시스템 매출'}</span>
                      <span className="tabular-nums">{formatBahtNum(systemTotal)} ฿</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('posInputTotal') || '입력 합계'}</span>
                      <span className="tabular-nums">{formatBahtNum(savedTotal)} ฿</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium pt-1 border-t">
                      <span>{t('posDifference') || '차액'}</span>
                      <span className="tabular-nums">{formatBahtNum(savedTotal - systemTotal)} ฿</span>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border px-4 py-3 text-sm">
                    <div className="flex justify-between">
                      <span>{t('posCashActual') || '돈통 시제'}</span>
                      <span className="tabular-nums">{formatBahtNum(Number(settlement.cashActual ?? 0))} ฿</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('posCash') || '현금'}</span>
                      <span className="tabular-nums">{formatBahtNum(savedCash)} ฿</span>
                    </div>
                    <Collapsible className="group">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 hover:bg-muted/30 rounded">
                        <span>{t('posCard') || '카드'}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {formatBahtNum(savedCard)} ฿
                          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-2 pt-1 space-y-0.5 border-t mt-1">
                          {settlement.cardBreakdown && Object.entries(settlement.cardBreakdown).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs text-muted-foreground">
                              <span>{k}</span>
                              <span className="tabular-nums">{formatBahtNum(Number(v))} ฿</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Collapsible className="group">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 hover:bg-muted/30 rounded">
                        <span>{t('posPaymentQrCode') || 'QR 코드'}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {formatBahtNum(savedQr)} ฿
                          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-2 pt-1 space-y-0.5 border-t mt-1">
                          {settlement.qrBreakdown && Object.entries(settlement.qrBreakdown).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs text-muted-foreground">
                              <span>{k}</span>
                              <span className="tabular-nums">{formatBahtNum(Number(v))} ฿</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Collapsible className="group">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 hover:bg-muted/30 rounded">
                        <span>{t('posPaymentDeliveryApp') || '배달앱'}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {formatBahtNum(savedDelivery + savedDineIn)} ฿
                          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-2 pt-2 space-y-2 border-t mt-1 text-xs">
                          <p className="text-[10px] leading-snug text-muted-foreground">
                            {t('posSettlementDeliveryAppIntro') ||
                              '배달앱 결산은 실제 배달과 홀(Dine in) 두 종류로 구분합니다.'}
                          </p>
                          <div>
                            <p className="font-medium text-foreground">
                              {t('posSettlementDeliverySubActual') || '실제 배달 (플랫폼)'}
                              <span className="ml-2 tabular-nums text-muted-foreground">
                                {formatBahtNum(savedDelivery)} ฿
                              </span>
                            </p>
                            <div className="mt-1 space-y-0.5 pl-1">
                              {settlement.deliveryAppBreakdown &&
                                Object.entries(settlement.deliveryAppBreakdown)
                                  .filter(([, v]) => (v ?? 0) > 0)
                                  .map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-muted-foreground">
                                      <span>{deliveryPlatformSettlementLabel(k)}</span>
                                      <span className="tabular-nums">{formatBahtNum(Number(v))} ฿</span>
                                    </div>
                                  ))}
                            </div>
                          </div>
                          <div className="border-t border-border/60 pt-2">
                            <p className="font-medium text-foreground">
                              {t('posSettlementDeliverySubDineIn') || '홀 (Dine in)'}
                              <span className="ml-2 tabular-nums text-muted-foreground">
                                {formatBahtNum(savedDineIn)} ฿
                              </span>
                            </p>
                            <div className="mt-1 space-y-0.5 pl-1">
                              {settlement.dineInDeliveryBreakdown &&
                                Object.entries(settlement.dineInDeliveryBreakdown)
                                  .filter(([, v]) => (v ?? 0) > 0)
                                  .map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-muted-foreground">
                                      <span>
                                        {k === POS_SETTLEMENT_DINE_IN_CODE
                                          ? t('posDeliveryPayDineIn') || 'Dine in'
                                          : deliveryPlatformSettlementLabel(k)}
                                      </span>
                                      <span className="tabular-nums">{formatBahtNum(Number(v))} ฿</span>
                                    </div>
                                  ))}
                              {savedDineIn > 0 &&
                                (!settlement.dineInDeliveryBreakdown ||
                                  Object.keys(settlement.dineInDeliveryBreakdown).length === 0) && (
                                  <div className="text-muted-foreground">
                                    {t('posSettlementDineInNoBreakdown') || '세부 항목 없음'}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Collapsible className="group">
                      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 hover:bg-muted/30 rounded">
                        <span>
                          {t('posPaymentOther') || '기타'} · {t('posPaymentOtherExpand') || '세부'}
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {formatBahtNum(savedOther)} ฿
                          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-2 pt-1 space-y-0.5 border-t mt-1">
                          {settlement.otherBreakdown &&
                            Object.entries(settlement.otherBreakdown)
                              .filter(([, v]) => (v ?? 0) > 0)
                              .map(([k, v]) => (
                                <div key={k} className="flex justify-between text-xs text-muted-foreground">
                                  <span>{k}</span>
                                  <span className="tabular-nums">{formatBahtNum(Number(v))} ฿</span>
                                </div>
                              ))}
                          {savedOther > 0 &&
                            (!settlement.otherBreakdown ||
                              Object.keys(settlement.otherBreakdown).length === 0 ||
                              Object.values(settlement.otherBreakdown).every((v) => !v || Number(v) <= 0)) && (
                              <div className="text-xs text-muted-foreground">
                                {t('posSettlementOtherLegacyAmt') || '구 방식 합계만 저장됨'}
                              </div>
                            )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  {!!settlement.memo && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                      <p className="mb-1 text-muted-foreground">{t('posMemo') || '비고'}</p>
                      <p>{settlement.memo}</p>
                    </div>
                  )}
                </>
              )}

              <div className="rounded-lg border">
                <div className="border-b px-4 py-3 text-sm font-medium">
                  {t('posSettlementDailyHistoryTitle')}
                </div>
                <div className="overflow-auto max-h-[calc(100vh-420px)] min-h-[160px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <tr className="border-b text-muted-foreground bg-muted/30">
                        <th className="px-4 py-2 text-left">{t('date')}</th>
                        <th className="px-4 py-2 text-right">{t('posSystemTotal')}</th>
                        <th className="px-4 py-2 text-right">{t('posInputTotal')}</th>
                        <th className="px-4 py-2 text-right">{t('posDifference')}</th>
                        <th className="px-4 py-2 text-center">{t('posClosed')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => (
                        <tr
                          key={r.date}
                          className={cn(
                            'border-b last:border-0 cursor-pointer hover:bg-muted/40',
                            r.date === settleDate && 'bg-muted/30'
                          )}
                          onClick={() => setSettleDate(r.date)}
                          title={t('posSettlementHistoryRowTitle')}
                        >
                          <td className="px-4 py-2">
                            {r.date}
                            {r.date === settleDate && (
                              <span className="ml-2 text-xs text-primary">({t('posSelected')})</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatBahtNum(r.systemTotal)} ฿</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.hasSettlement ? `${formatBahtNum(r.inputTotal)} ฿` : '-'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.hasSettlement ? `${formatBahtNum(r.diff)} ฿` : '-'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {r.hasSettlement ? (r.closed ? t('posSettlementClosedDone') : t('posSettlementNotClosed')) : '-'}
                          </td>
                        </tr>
                      ))}
                      {!historyLoading && historyRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                            {t('posSettlementNoHistoryData')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
        </div>
      </div>
    </div>
  )
}
