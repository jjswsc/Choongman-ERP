/**
 * POS 테이블·프린터·서랍 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached, notifyPosCatalogUpdated } from '../offline/pos-catalog-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { jsonAsArray } from '../safe-api-json'

export interface PosTableItem {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** 구역 슬롯 (1~3). UI 표시명은 floorLabels */
  floor?: number
  /** rect | square - 테이블 형태 */
  shape?: string
  /** 좌석 수 (몇 명 앉는 테이블) */
  seats?: number
  /** 테이블 회전 각도 (0, 90, 180, 270) */
  rotation?: number
}

/** 매장별 구역(층·방 등) 표시명. 키는 슬롯 1~3 */
export type PosFloorLabels = Partial<Record<1 | 2 | 3, string>>

export async function getPosTableLayout(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const url = '/api/getPosTableLayout?' + q.toString()
  const cacheKey = `erp:posTableLayout:${params.storeCode.trim()}`
  const empty = {
    layout: [] as PosTableItem[],
    floorLabels: {} as PosFloorLabels,
    storeCode: params.storeCode,
  }
  return fetchPosCatalogCached<{
    layout: PosTableItem[]
    floorLabels?: PosFloorLabels
    storeCode: string
    isFallback?: boolean
  }>(cacheKey, url, empty)
}

export interface PosPrinterSettings {
  storeCode: string
  kitchenMode: 1 | 2 | 3
  kitchen1Categories: string[]
  kitchen2Categories: string[]
  kitchen3Categories?: string[]
  /** 프린터 탭: 메뉴 id → 0 주방 미인쇄, 1~3 주방 (pos_menus.kitchen_printer 보다 우선) */
  kitchenRouteByMenu?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategory?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategoryMain?: Record<string, 0 | 1 | 2 | 3>
  autoStockDeduction?: boolean
  deliveryFee?: number
  packagingFee?: number
  cookingFreshMaxMin?: number
  cookingWarningMaxMin?: number
  cookingRuleMode?: 'elapsed' | 'recipe_diff'
  cookingRecipeWarningDiffMin?: number
  cookingRecipeUrgentDiffMin?: number
  cookingDelayBadgeEnabled?: boolean
  cookingDelaySoundEnabled?: boolean
  cookingDelayAlertOverMin?: number
  cardAutoOpen?: boolean
  checkAutoOpen?: boolean
  /** true면 카드 금액만 반영하고 LINKPOS 단말/릴레이 승인 호출을 하지 않음 */
  linkposSkipTerminalForCard?: boolean
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
  drawerPinConfigured?: boolean
  logoPrint?: boolean
  receiptPrintTiming?: 'per_payment' | 'final_payment'
  customerReceiptOrderDetails?: boolean
  merchantReceiptOrderDetails?: boolean
  cashPaymentReceipt?: boolean
  signatureLine?: boolean
  receiptBarcode?: boolean
  itemBarcode?: boolean
  qrCodeOption?: 'yes' | 'no' | 'return_points'
  discountSeparatePrint?: boolean
  merchantReceiptPrint?: boolean
  actualOrderDetails?: boolean
  toppingOptionsPrint?: boolean
  autoPrintReceiptOnOrder?: boolean
  autoPrintReceiptOnAddOrder?: boolean
  autoPrintReceiptOnPayment?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  /** 결제 모달 열기 직전 최종 주문서(홀) 자동 인쇄 */
  autoPrintFinalOrderBeforePayment?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizAbn?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  /** true일 때만 손님 영수증 간이 출력에 사업장 주소 인쇄 (상호·Tax ID·전화는 항상) */
  receiptShowBizAddress?: boolean
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  receiptFooterPrimaryText?: string
  receiptFooterSecondaryText?: string
  receiptLogoImageUrl?: string
  receiptStampImageUrl?: string
  receiptShowStamp?: boolean
  receiptStampOnlyTaxInvoice?: boolean
  receiptMembershipQrImageUrl?: string
  receiptMembershipQrLinkUrl?: string
  receiptMembershipQrText?: string
  receiptShowMembershipQr?: boolean
  receiptPrintLang?: string
  /** 주방 주문서 인쇄 언어(미설정 시 POS 화면 언어) */
  kitchenSlipPrintLang?: string
  /** 주방 주문서 글자 크기 */
  kitchenSlipFontScale?: 'sm' | 'md' | 'lg'
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
  /** 주방 주문서 옵션 그룹 노출 정책 (group key -> print enabled) */
  kitchenSlipOptionGroupPrint?: Record<string, boolean>
  /** Windows 하이브리드: 주방 주문서 ESC/POS 절단 (기본 true) */
  escPosCutAfterKitchenHtml?: boolean
  /** Windows 하이브리드: 홀 주문서(주문·터미널) 절단 */
  escPosCutAfterHallOrderHtml?: boolean
  /** Windows 하이브리드: 결제 영수증 절단 */
  escPosCutAfterPaymentReceiptHtml?: boolean
  vatRate?: number
  vatMode?: 'included' | 'separate'
  serviceRate?: number
  serviceMode?: 'included' | 'separate'
  cardRate?: number
  cardMode?: 'included' | 'separate'
  cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
  otherRate?: number
  otherMode?: 'included' | 'separate'
  feeStackMode?: 'parallel' | 'sequential'
  feeStackOrder?: Array<'vat' | 'service' | 'other'>
  /**
   * 카운터(프론트) 포스 — 여러 대 가능. 해당 토큰을 가진 기기에서 주문 수신·자동 인쇄.
   * mainDeviceToken 은 하위 호환용(목록의 첫 토큰과 동일).
   */
  mainDeviceToken?: string | null
  mainDeviceTokens?: string[]
  /** 매장당 메인 POS 최대 대수 (본사 설정) */
  mainDeviceMaxCount?: number
  /** 매장당 주문 단말 최대 대수 (본사 설정) */
  orderDeviceMaxCount?: number
  /** true면 POS에서 메인/주문 토글 불가 */
  mainDeviceRoleLocked?: boolean
  dualMonitorEnabled?: boolean
  customerDisplayAutoOpen?: boolean
  customerDisplayMonitorPreference?: 'secondary-first' | 'primary-only'
  /** 고객화면 언어: follow-pos=POS 직원 화면 언어 따라감, custom=고객화면만 고정 */
  customerDisplayLangMode?: 'follow-pos' | 'custom'
  /** custom 일 때만 사용 */
  customerDisplayLangOverride?: 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms' | ''
  customerDisplayTheme?: 'dark' | 'light' | 'brand'
  customerDisplayDefaultState?: 'idle' | 'qr'
  customerDisplayIdleMessage?: string
  customerDisplayPaymentMessage?: string
  customerDisplayQrPayload?: string
  customerDisplayShowOrderSummary?: boolean
  customerDisplayShowOrderTotal?: boolean
  /** 평상시 고객화면 배경: 없음 / 이미지 / 동영상 */
  customerDisplayIdleMediaType?: 'none' | 'image' | 'video'
  customerDisplayIdleMediaUrl?: string
}

export async function getPosPrinterSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const url = '/api/getPosPrinterSettings?' + q.toString()
  const cacheKey = `erp:posPrinterSettings:${params.storeCode.trim()}`
  const fallback: PosPrinterSettings = {
    storeCode: params.storeCode,
    kitchenMode: 1,
    kitchen1Categories: [],
    kitchen2Categories: [],
  }
  const readCachedOrFallback = async () => {
    try {
      const cached = await getFromErpCache<PosPrinterSettings>(cacheKey)
      return cached ?? fallback
    } catch {
      return fallback
    }
  }

  try {
    const res = await apiFetch(url, { cache: 'no-store' })
    if (!res.ok) return readCachedOrFallback()
    const data = (await res.json()) as PosPrinterSettings
    try {
      await setErpCache(cacheKey, data)
      notifyPosCatalogUpdated(cacheKey, data)
    } catch {
      /* ignore cache write errors */
    }
    return data
  } catch {
    return readCachedOrFallback()
  }
}

export async function verifyPosDrawerPin(params: { storeCode: string; pin: string }) {
  const res = await apiFetch('/api/verifyPosDrawerPin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; skipped?: boolean }
}

export async function savePosDrawerPin(params: {
  storeCode: string
  newPin?: string
  currentPin?: string
  clearPin?: boolean
}) {
  const res = await apiFetch('/api/savePosDrawerPin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; cleared?: boolean }
}

export async function savePosPrinterSettings(params: {
  storeCode: string
  kitchenMode: 1 | 2 | 3
  kitchen1Categories: string[]
  kitchen2Categories: string[]
  kitchen3Categories?: string[]
  kitchenRouteByMenu?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategory?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategoryMain?: Record<string, 0 | 1 | 2 | 3>
  autoStockDeduction?: boolean
  deliveryFee?: number
  packagingFee?: number
  cookingFreshMaxMin?: number
  cookingWarningMaxMin?: number
  cookingRuleMode?: 'elapsed' | 'recipe_diff'
  cookingRecipeWarningDiffMin?: number
  cookingRecipeUrgentDiffMin?: number
  cookingDelayBadgeEnabled?: boolean
  cookingDelaySoundEnabled?: boolean
  cookingDelayAlertOverMin?: number
  cardAutoOpen?: boolean
  checkAutoOpen?: boolean
  linkposSkipTerminalForCard?: boolean
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
  drawerPinConfigured?: boolean
  logoPrint?: boolean
  receiptPrintTiming?: 'per_payment' | 'final_payment'
  customerReceiptOrderDetails?: boolean
  merchantReceiptOrderDetails?: boolean
  cashPaymentReceipt?: boolean
  signatureLine?: boolean
  receiptBarcode?: boolean
  itemBarcode?: boolean
  qrCodeOption?: 'yes' | 'no' | 'return_points'
  discountSeparatePrint?: boolean
  merchantReceiptPrint?: boolean
  actualOrderDetails?: boolean
  toppingOptionsPrint?: boolean
  autoPrintReceiptOnOrder?: boolean
  autoPrintReceiptOnAddOrder?: boolean
  autoPrintReceiptOnPayment?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  autoPrintFinalOrderBeforePayment?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizAbn?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  /** true일 때만 손님 영수증 간이 출력에 사업장 주소 인쇄 (상호·Tax ID·전화는 항상) */
  receiptShowBizAddress?: boolean
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  receiptFooterPrimaryText?: string
  receiptFooterSecondaryText?: string
  receiptLogoImageUrl?: string
  receiptStampImageUrl?: string
  receiptShowStamp?: boolean
  receiptStampOnlyTaxInvoice?: boolean
  receiptMembershipQrImageUrl?: string
  receiptMembershipQrLinkUrl?: string
  receiptMembershipQrText?: string
  receiptShowMembershipQr?: boolean
  receiptPrintLang?: string
  /** 주방 주문서 인쇄 언어(미설정 시 POS 화면 언어) */
  kitchenSlipPrintLang?: string
  kitchenSlipFontScale?: 'sm' | 'md' | 'lg'
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
  kitchenSlipOptionGroupPrint?: Record<string, boolean>
  escPosCutAfterKitchenHtml?: boolean
  escPosCutAfterHallOrderHtml?: boolean
  escPosCutAfterPaymentReceiptHtml?: boolean
  vatRate?: number
  vatMode?: 'included' | 'separate'
  serviceRate?: number
  serviceMode?: 'included' | 'separate'
  cardRate?: number
  cardMode?: 'included' | 'separate'
  cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
  otherRate?: number
  otherMode?: 'included' | 'separate'
  feeStackMode?: 'parallel' | 'sequential'
  feeStackOrder?: Array<'vat' | 'service' | 'other'>
  dualMonitorEnabled?: boolean
  customerDisplayAutoOpen?: boolean
  customerDisplayMonitorPreference?: 'secondary-first' | 'primary-only'
  customerDisplayLangMode?: 'follow-pos' | 'custom'
  customerDisplayLangOverride?: 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms' | ''
  customerDisplayTheme?: 'dark' | 'light' | 'brand'
  customerDisplayDefaultState?: 'idle' | 'qr'
  customerDisplayIdleMessage?: string
  customerDisplayPaymentMessage?: string
  customerDisplayQrPayload?: string
  customerDisplayShowOrderSummary?: boolean
  customerDisplayShowOrderTotal?: boolean
  customerDisplayIdleMediaType?: 'none' | 'image' | 'video'
  customerDisplayIdleMediaUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/savePosPrinterSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const queued = res.headers.get('X-Offline-Queued') === '1'
  const text = await res.text()
  let data: { success?: boolean; message?: string } = {}
  try {
    if (text) data = JSON.parse(text) as { success?: boolean; message?: string }
  } catch {
    return {
      success: false,
      message: text ? text.slice(0, 240) : `HTTP ${res.status}`,
      queued,
    }
  }
  const shouldWriteOptimisticCache = queued || res.ok
  const cacheKey = `erp:posPrinterSettings:${String(params.storeCode || '').trim()}`
  if (shouldWriteOptimisticCache && cacheKey !== 'erp:posPrinterSettings:') {
    try {
      const prev = await getFromErpCache<PosPrinterSettings>(cacheKey)
      const p = params as Partial<PosPrinterSettings>
      const kitchenMode: 1 | 2 | 3 = p.kitchenMode ?? prev?.kitchenMode ?? 1
      const optimistic: PosPrinterSettings = {
        ...(prev || ({} as PosPrinterSettings)),
        ...p,
        storeCode: params.storeCode,
        kitchenMode,
      }
      await setErpCache(cacheKey, optimistic)
      notifyPosCatalogUpdated(cacheKey, optimistic)
    } catch {
      /* ignore cache write errors */
    }
  }
  if (queued) return { success: true, queued: true }
  if (!res.ok) {
    return { success: false, message: data.message || `HTTP ${res.status}`, queued: false }
  }
  return {
    success: data.success !== false,
    message: data.message,
    queued: false,
  }
}
