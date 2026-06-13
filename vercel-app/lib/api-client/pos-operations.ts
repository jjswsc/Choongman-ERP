/**
 * POS 운영 API — 쿠폰·테이블·프린터·주문·정산·KBank 등 (move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { isLinkposCardApiEnabled } from '../linkpos-card-api-enabled'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'

export interface PosAppliedCoupon {
  code: string
  name?: string
  discountAmt: number
  quantity?: number
  couponId?: number
  priority?: number
}

export interface PosCoupon {
  id?: number
  code: string
  name?: string
  discountType: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  usedCount?: number
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
}

export async function getPosCoupons() {
  const res = await apiFetchWithOffline('/api/getPosCoupons')
  return jsonAsArray<PosCoupon>(await res.json())
}

export async function savePosCoupon(params: {
  id?: number
  code: string
  name?: string
  discountType?: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosCoupon(params: { code: string; subtotal: number }) {
  const q = new URLSearchParams()
  q.set('code', params.code.trim().toUpperCase())
  q.set('subtotal', String(Math.max(0, params.subtotal)))
  const res = await apiFetchWithOffline('/api/validatePosCoupon?' + q.toString())
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
  }>
}

export async function validatePosCoupons(params: {
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  cartLines?: Array<{
    menuId?: string
    categoryCode?: string
    quantity: number
    lineSubtotal: number
  }>
  applied?: PosAppliedCoupon[]
  appliedCoupons?: PosAppliedCoupon[]
  candidate?: { code: string; quantity?: number; memberIssueId?: number }
  memberId?: number
}) {
  const res = await apiFetchWithOffline('/api/validatePosCoupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
    appliedCoupons?: PosAppliedCoupon[]
    couponDiscountTotal?: number
    couponCode?: string
    couponDiscountAmt?: number
  }>
}

export async function deletePosCoupon(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosTableItem {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** 층 (1~3) */
  floor?: number
  /** rect | square - 테이블 형태 */
  shape?: string
  /** 좌석 수 (몇 명 앉는 테이블) */
  seats?: number
  /** 테이블 회전 각도 (0, 90, 180, 270) */
  rotation?: number
}

export async function getPosTableLayout(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const url = '/api/getPosTableLayout?' + q.toString()
  const cacheKey = `erp:posTableLayout:${params.storeCode.trim()}`
  const empty = { layout: [] as PosTableItem[], storeCode: params.storeCode }
  return fetchPosCatalogCached<{ layout: PosTableItem[]; storeCode: string; isFallback?: boolean }>(
    cacheKey,
    url,
    empty
  )
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

export async function clearPosMainDevice(params: { storeCode: string; deviceToken?: string }) {
  const res = await apiFetchWithOffline('/api/clearPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function registerPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/registerPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export interface PosDeviceItem {
  deviceToken: string
  role: 'main' | 'order'
  lastSeenAt: string
  createdAt: string
  isMain: boolean
  displayLabel: string | null
  clientHint: string | null
}

export async function getPosDevices(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosDevices?' + q.toString())
  const data = await res.json() as { success: boolean; message?: string; devices?: PosDeviceItem[] }
  return { ...data, devices: data.devices ?? [] }
}

export async function registerPosDevice(params: {
  storeCode: string
  deviceToken: string
  role: 'main' | 'order'
  /** 브라우저 UA·OS 등 (선택). 접속 시마다 갱신되면 목록에서 단말 구분에 도움 */
  clientHint?: string
}) {
  const res = await apiFetchWithOffline('/api/registerPosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      role: params.role,
      ...(params.clientHint != null && String(params.clientHint).trim()
        ? { clientHint: String(params.clientHint).trim().slice(0, 240) }
        : {}),
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosDeviceDisplayLabel(params: {
  storeCode: string
  deviceToken: string
  displayLabel: string
}) {
  const res = await apiFetchWithOffline('/api/updatePosDeviceDisplayLabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      displayLabel: params.displayLabel,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function revokePosDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/revokePosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceQrDeviceItem {
  deviceToken: string
  lastSeenAt: string
  createdAt: string
  displayLabel: string | null
  clientHint: string | null
}

export async function getAttendanceQrDevices(params: { storeCode: string }) {
  const q = new URLSearchParams({ storeCode: params.storeCode })
  const res = await apiFetch('/api/getAttendanceQrDevices?' + q.toString())
  const data = (await res.json()) as {
    success: boolean
    message?: string
    devices?: AttendanceQrDeviceItem[]
  }
  return { ...data, devices: data.devices ?? [] }
}

export async function registerAttendanceQrDevice(params: {
  storeCode: string
  deviceToken: string
  displayLabel?: string
  clientHint?: string
}) {
  const res = await apiFetch('/api/registerAttendanceQrDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; storeCode?: string; deviceToken?: string }>
}

export async function checkAttendanceQrDevice(params: { storeCode: string; deviceToken: string }) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    deviceToken: params.deviceToken,
  })
  const res = await fetch(`/api/checkAttendanceQrDevice?${q.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  return res.json() as Promise<{
    success: boolean
    registered: boolean
    reason?: string
    storeCode?: string
    displayLabel?: string | null
    lastSeenAt?: string
    message?: string
  }>
}

export async function getAttendanceQrDisplay(params: { storeCode: string; deviceToken: string }) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    deviceToken: params.deviceToken,
  })
  const res = await fetch(`/api/getAttendanceQrDisplay?${q.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'X-Cm-Client-Hint': typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : '',
    },
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeCode?: string
    qrPayload?: string
    expiresAt?: string
    bucketStartMs?: number
    bucketHours?: number
    displayLabel?: string | null
  }>
}

export async function setPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/setPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function savePosDeviceRoleLimits(params: {
  storeCode: string
  mainDeviceMaxCount: number
  orderDeviceMaxCount: number
  mainDeviceRoleLocked: boolean
}) {
  const res = await apiFetch('/api/savePosDeviceRoleLimits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    mainDeviceMaxCount?: number
    orderDeviceMaxCount?: number
    mainDeviceRoleLocked?: boolean
  }>
}

export async function savePosTableLayout(params: {
  storeCode: string
  layout: PosTableItem[]
}) {
  const res = await apiFetchWithOffline('/api/savePosTableLayout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosDeliveryApp {
  id: number
  code: string
  name: string
  matchKeywords: string[]
  displayOrder: number
  enabled: boolean
  dineOutEnabled: boolean
  accentColor: string | null
  storeCode: string | null
}

export async function getPosDeliveryApps(params?: { storeCode?: string; includeDisabled?: boolean }) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeDisabled) q.set('includeDisabled', 'true')
  const qs = q.toString()
  const url = '/api/getPosDeliveryApps' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posDeliveryApps:${params?.storeCode?.trim() || ''}:${params?.includeDisabled ? '1' : '0'}`
  return fetchPosCatalogCached<PosDeliveryApp[]>(cacheKey, url, [])
}

export async function savePosDeliveryApps(params: {
  storeCode?: string
  items: Array<{
    id?: number
    code: string
    name: string
    matchKeywords?: string[]
    displayOrder?: number
    enabled?: boolean
    dineOutEnabled?: boolean
    accentColor?: string | null
  }>
}) {
  const res = await apiFetchWithOffline('/api/savePosDeliveryApps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface GrabStoreIntegrationSnapshot {
  id: number
  grabMerchantID: string
  partnerMerchantID: string
  integrationStatus: string
  lastRequestID: string | null
  lastMessage: string | null
  payload: unknown
  createdAt: string | null
  updatedAt: string | null
}

export async function getGrabStoreIntegrations(params?: {
  grabMerchantID?: string
  partnerMerchantID?: string
  status?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.grabMerchantID) q.set('grabMerchantID', params.grabMerchantID)
  if (params?.partnerMerchantID) q.set('partnerMerchantID', params.partnerMerchantID)
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  const url = '/api/getGrabStoreIntegrations' + (qs ? `?${qs}` : '')
  const res = await apiFetch(url)
  const json = await res.json()
  return Array.isArray(json) ? (json as GrabStoreIntegrationSnapshot[]) : []
}

export interface PosMenuScreenConfig {
  storeCode: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
  updatedAt?: string | null
}

export async function getPosMenuScreenConfig(params?: {
  storeCode?: string
  scope?: 'dine-in' | 'delivery' | 'takeout'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.scope) q.set('scope', params.scope)
  const qs = q.toString()
  const url = '/api/getPosMenuScreenConfig' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posMenuScreenConfig:${params?.storeCode?.trim() || 'default'}:${params?.scope || 'dine-in'}`
  const fallback: PosMenuScreenConfig = {
    storeCode: params?.storeCode?.trim() || null,
    scope: params?.scope || 'dine-in',
    mainCategoryFontSize: 18,
    categoryFontSize: 15,
    menuTileFontSize: 13,
    menuTileCols: 4,
    menuListFontSize: 14,
    menuListPageSize: 8,
    kioskGroupFontSize: 16,
  }
  return fetchPosCatalogCached<PosMenuScreenConfig>(cacheKey, url, fallback)
}

export async function savePosMenuScreenConfig(params: {
  storeCode?: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuScreenConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosMenuBoardConfig {
  id: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols: number
  groupGridRows: number
  menuGridCols: number
  menuGridRows: number
  resolutionWidth: number
  resolutionHeight: number
  groupCount: number
  menuCount: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export async function getPosMenuBoards(params?: {
  storeCode?: string
  boardType?: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.boardType) q.set('boardType', params.boardType)
  const res = await apiFetchWithOffline('/api/getPosMenuBoards?' + q.toString())
  return jsonAsArray<PosMenuBoardConfig>(await res.json())
}

export async function savePosMenuBoard(params: {
  id?: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols?: number
  groupGridRows?: number
  menuGridCols?: number
  menuGridRows?: number
  resolutionWidth?: number
  resolutionHeight?: number
  groupCount?: number
  menuCount?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuBoard(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosPaymentSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosPaymentSettings?' + q.toString())
  return res.json() as Promise<{
    storeCode: string
    cardKeys: string[]
    qrKeys: string[]
    otherKeys: string[]
    deliveryKeys?: string[]
  }>
}

export interface PosPaymentMethodItem {
  id: string
  storeCode: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden: boolean
  sortOrder: number
}

export async function getPosPaymentMethodItems(params: { storeCode?: string }) {
  const q = new URLSearchParams()
  if (params.storeCode?.trim()) q.set('storeCode', params.storeCode.trim())
  const qs = q.toString()
  const url = '/api/getPosPaymentMethodItems' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posPaymentMethodItems:${params.storeCode?.trim() || 'default'}`
  return fetchPosCatalogCached<PosPaymentMethodItem[]>(cacheKey, url, [])
}

export async function savePosPaymentMethodItem(params: {
  id?: string
  storeCode?: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function deletePosPaymentMethodItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosPaymentSettings(params: {
  storeCode: string
  cardKeys: string[]
  qrKeys: string[]
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosOrderItem {
  id: string
  name: string
  price: number
  qty: number
  /** 주문 저장 시점 메뉴별 할인 스냅샷(손님 영수증 우선 표시) */
  lineDiscountAmt?: number
  /** 일부 `items_json`·연동은 quantity 만 사용 (서버/클라이언트에서 qty 와 병용 해석) */
  quantity?: number
  /** 줄 단위 메모 (주방·영수증) */
  note?: string
  servedAt?: string | null
  servedBy?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  setChildrenState?: Record<
    string,
    {
      servedAt?: string | null
      servedBy?: string | null
      packedAt?: string | null
      packedBy?: string | null
    }
  >
  menuId1?: string
  optionId1?: string
  optionCode1?: string
  menuId2?: string
  optionId2?: string
  optionCode2?: string
}

export interface PosOrder {
  id: number
  orderNo: string
  storeCode: string
  orderType: string
  /** pos_orders.order_type (메모·채널 추론 전 DB 값) — 테이블 점유 매칭용 */
  dbOrderType?: string
  tableName: string
  memo: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  cardRate?: number
  paymentCash?: number
  /** 현금 받은 금액(손님 영수증 거스름 표시) */
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD'
  paymentOther?: number
  /** payment_other 세부(트루머니·위챗·관리자 지갑 등). 합계는 payment_other 와 일치 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  /** 배달앱(Grab/Line Man/Shopee 등) 플랫폼 결제 금액 */
  paymentDeliveryApp?: number
  /** grab | lineman | shopee | dine_in */
  deliveryPaymentChannel?: string
  /** pos_orders.delivery_app_code — POS 수동 배달·연동 주문의 플랫폼 구분 */
  deliveryAppCode?: string
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  /** 홀 주문 인원(포장/배달 등은 0) */
  guestCount?: number
  items: PosOrderItem[]
  subtotal: number
  vat: number
  total: number
  status: string
  createdAt: string
  /** 결제·수정 시각(DB updated_at). 결제 완료 시각 추정에 사용 */
  updatedAt?: string
  /** 최초 결제 완료 시각(DB paid_at). 영수증 관리 결제일시 표시용 */
  paidAt?: string
  linkposProvider?: string
  linkposMode?: string
  linkposTxCode?: string
  linkposBankId?: string
  linkposResponseCode?: string
  linkposApprovalCode?: string
  linkposTraceNo?: string
  linkposRefNo?: string
  linkposTerminalId?: string
  linkposMerchantId?: string
  linkposReference1?: string
  linkposRequestedAmount?: number
  linkposApprovedAmount?: number
  linkposRequestedAt?: string
  linkposRespondedAt?: string
}

export async function getPosTodaySales(params?: {
  storeCode?: string
  startStr?: string
  endStr?: string
  /** true면 IDB 즉시 반환 없이 네트워크 조회를 기다림(헤더 새로고침 등) */
  forceNetwork?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  const qs = q.toString()
  const url = '/api/getPosTodaySales' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posTodaySales:${params?.storeCode?.trim() || ''}:${params?.startStr?.trim() || ''}:${params?.endStr?.trim() || ''}`
  const fallback = {
    completedCount: 0,
    completedTotal: 0,
    completedCash: 0,
    pendingCount: 0,
  }
  return fetchPosCatalogCached<{
    completedCount: number
    completedTotal: number
    completedCash: number
    pendingCount: number
  }>(cacheKey, url, fallback, { forceNetwork: Boolean(params?.forceNetwork) })
}

export async function getPosReversalJournals(params: {
  startStr: string
  endStr: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosReversalJournals?' + q.toString())
  const data = (await res.json()) as {
    success?: boolean
    rows?: {
      id: number
      accountingDate: string
      posOrderId: number
      storeCode: string
      memo: string
      postedAt: string
    }[]
    message?: string
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `HTTP ${res.status}`)
  }
  return Array.isArray(data.rows) ? data.rows : []
}

export async function getPosOrders(params?: {
  startStr?: string
  endStr?: string
  /** 단일 영업일(YYYY-MM-DD) 조회 시 POS 영업일 경계(설정된 시작 시각~익일 동시각)로 UTC 구간 적용 */
  posBizDayScope?: boolean
  storeCode?: string
  status?: string
  strictStore?: boolean
  /** 임시 디버그: getPosOrders 상세 서버 로그 출력 */
  debugPosOrders?: boolean
  sinceId?: number
  /** 단건 조회(결제 영수증 동기화 등). 지정 시 날짜·sinceId 없이 id 우선 조회 */
  orderId?: number
  /** status가 paid 또는 completed 인 행만 (OR). 메인 기기 결제 영수증 폴링 등 */
  statusPaidLike?: boolean
  orderBy?: 'created_at.desc' | 'id.desc' | 'updated_at.desc'
  /** 목록 조회 시 행 수 상한(서버에서 최대 2000으로 캡) */
  limit?: number
  /** 메인 POS 폴링용 — linkpos 등 대형 컬럼 제외 select */
  pollMinimal?: boolean
}): Promise<PosOrder[]> {
  const q = new URLSearchParams()
  if (params?.orderId != null && params.orderId > 0) q.set('orderId', String(params.orderId))
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.posBizDayScope) q.set('posBizDayScope', '1')
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.status) q.set('status', params.status)
  if (params?.strictStore) q.set('strictStore', '1')
  if (params?.debugPosOrders) q.set('debugPosOrders', '1')
  if (params?.sinceId != null && params.sinceId > 0) q.set('sinceId', String(params.sinceId))
  if (params?.statusPaidLike) q.set('statusPaidLike', '1')
  if (params?.orderBy) q.set('orderBy', params.orderBy)
  if (params?.limit != null && params.limit > 0) q.set('limit', String(params.limit))
  if (params?.pollMinimal) q.set('pollMinimal', '1')
  const res = await apiFetchWithOffline('/api/getPosOrders?' + q.toString())
  if (res.status === 204) return []
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosOrder[]
}

export type PosBusinessDayStartDto = { hour: number; minute: number }

export type PosBusinessDaySettingsDto = PosBusinessDayStartDto & {
  endHour: number
  endMinute: number
  scope?: 'store_override' | 'org_default'
  storeCode?: string | null
  hasStoreOverride?: boolean
  globalHour?: number
  globalMinute?: number
  globalEndHour?: number
  globalEndMinute?: number
  defaultHour?: number
  defaultMinute?: number
  defaultEndHour?: number
  defaultEndMinute?: number
}

export async function getPosBusinessDaySettings(storeCode?: string | null): Promise<PosBusinessDaySettingsDto> {
  const q = storeCode?.trim() ? `?storeCode=${encodeURIComponent(String(storeCode).trim())}` : ''
  const res = await fetch('/api/posBusinessDaySettings' + q, { cache: 'no-store' })
  const j = (await res.json().catch(() => null)) as Partial<PosBusinessDaySettingsDto> | null
  const hour = Number(j?.hour)
  const minute = Number(j?.minute ?? 0)
  const base =
    !Number.isFinite(hour)
      ? { hour: POS_BUSINESS_DAY_DEFAULT_START.hour, minute: POS_BUSINESS_DAY_DEFAULT_START.minute }
      : { hour: Math.min(23, Math.max(0, Math.trunc(hour))), minute: Math.min(59, Math.max(0, Math.trunc(minute))) }
  const ehRaw = Number(j?.endHour)
  const emRaw = Number(j?.endMinute ?? 0)
  const end =
    !Number.isFinite(ehRaw)
      ? { hour: base.hour, minute: base.minute }
      : {
          hour: Math.min(23, Math.max(0, Math.trunc(ehRaw))),
          minute: Math.min(59, Math.max(0, Math.trunc(emRaw))),
        }
  const def = POS_BUSINESS_DAY_DEFAULT_HOURS.start
  const defEnd = POS_BUSINESS_DAY_DEFAULT_HOURS.end
  return {
    ...base,
    endHour: end.hour,
    endMinute: end.minute,
    scope: j?.scope === 'store_override' ? 'store_override' : 'org_default',
    storeCode: j?.storeCode ?? null,
    hasStoreOverride: Boolean(j?.hasStoreOverride),
    globalHour: Number.isFinite(Number(j?.globalHour)) ? Math.trunc(Number(j?.globalHour)) : def.hour,
    globalMinute: Number.isFinite(Number(j?.globalMinute)) ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalMinute)))) : def.minute,
    globalEndHour: Number.isFinite(Number(j?.globalEndHour)) ? Math.trunc(Number(j?.globalEndHour)) : defEnd.hour,
    globalEndMinute: Number.isFinite(Number(j?.globalEndMinute))
      ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalEndMinute))))
      : defEnd.minute,
    defaultHour: def.hour,
    defaultMinute: def.minute,
    defaultEndHour: defEnd.hour,
    defaultEndMinute: defEnd.minute,
  }
}

export async function savePosBusinessDaySettings(params: {
  hour: number
  minute: number
  endHour?: number
  endMinute?: number
  /** 없으면 전사 기본값(본사만) */
  storeCode?: string | null
  /** true 이면 해당 매장 덮어쓰기 제거 */
  resetStoreOverride?: boolean
}): Promise<{ success: boolean; message?: string }> {
  const body: Record<string, unknown> = {}
  if (params.resetStoreOverride) {
    body.reset = true
    body.storeCode = params.storeCode ?? ''
  } else {
    body.hour = params.hour
    body.minute = params.minute
    body.endHour = params.endHour ?? params.hour
    body.endMinute = params.endMinute ?? params.minute
    if (params.storeCode != null && String(params.storeCode).trim()) body.storeCode = String(params.storeCode).trim()
  }
  const res = await fetch('/api/posBusinessDaySettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  return { success: Boolean(j?.success), message: j?.message }
}

export interface PosSettlement {
  id?: number
  storeCode: string
  settleDate: string
  cashActual: number | null
  /** 돈통 시제 권종별 장 수(키 1000,500,…). DB `cash_actual_denoms` */
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt: number
  cardBreakdown?: Record<string, number>
  qrAmt: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt: number
  deliveryAppBreakdown?: Record<string, number>
  /** 매장 홀에서 배달앱 탭·Dine in 채널 (플랫폼 배달과 별도) */
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt: number
  otherBreakdown?: Record<string, number>
  memo: string
  closed: boolean
}

export interface PosCloseRun {
  id: number
  status: 'draft' | 'validated' | 'locked' | 'posted'
  checks: Record<string, unknown>
  totals: Record<string, unknown>
  settlementRef: number | null
  postedJournalEntryId: number | null
  validatedAt: string | null
  finalizedAt: string | null
}

export interface PosPaymentAttempt {
  id: number
  orderId: number | null
  orderNo: string
  storeCode: string
  localTxId: string
  provider: string
  mode: string
  txCode: string
  retryOfAttemptId?: number | null
  retryOfLocalTxId?: string
  bankId: string
  requestAmount: number
  approvedAmount: number
  responseCode: string
  approvalCode: string
  traceNo: string
  terminalId: string
  merchantId: string
  responseText: string
  status: string
  errorReason: string
  createdAt: string
}

export interface PosLinkposTenderRule {
  id: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority: number
  isActive: boolean
  createdAt: string
}

export async function getPosSettlement(params: {
  settleDate: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('settleDate', params.settleDate)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosSettlement?' + q.toString(), { cache: 'no-store' })
  return res.json() as Promise<{
    systemTotal: number
    systemSubtotal?: number
    systemVat?: number
    /** 완료 주문 `payment_cash` 합계 — 결산 현금 줄 자동 채움용 */
    systemCashFromOrders?: number
    /** 해당 결산일(trans_date)·매장 시재 거래 순액(입금+, 출금-/매출출금-) — 마감 예상 돈통용 */
    tillNetForSettleDate?: number
    linkpos?: {
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
    }
    settlement: PosSettlement | PosSettlement[] | null
    closeRun?: PosCloseRun | null
  }>
}

export async function getPosPaymentAttempts(params?: {
  startStr?: string
  endStr?: string
  storeCode?: string
  localTxId?: string
  status?: 'all' | 'approved' | 'declined' | 'failed'
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.localTxId) q.set('localTxId', params.localTxId)
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/getPosPaymentAttempts?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosPaymentAttempt[]
}

export async function getPosLinkposTenderRules(params?: {
  storeCode?: string
  includeShared?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeShared != null) q.set('includeShared', params.includeShared ? 'true' : 'false')
  const res = await apiFetchWithOffline('/api/getPosLinkposTenderRules?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosLinkposTenderRule[]
}

export async function savePosLinkposTenderRule(params: {
  id?: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deletePosLinkposTenderRule(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosChannelSettlementChannel = 'card' | 'grab' | 'lineman' | 'shopee' | 'delivery_all'

export interface PosChannelSettlementRow {
  id: number
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  fee: number
  net: number
  feeSource?: string | null
  memo?: string | null
  bankTransactionId?: number | null
  journalEntryId?: number | null
}

export async function getPosChannelSettlementGross(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
}) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
    channel: params.channel,
  })
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlementGross?${q}`)
  return res.json() as Promise<{
    success: boolean
    gross?: number
    orderCount?: number
    cardFeeTotal?: number
    suggestedFee?: number | null
    suggestedFeeSource?: string | null
    platformFeePct?: number | null
    platformAppCode?: string | null
    message?: string
  }>
}

export async function getPosChannelSettlements(params: { storeCode: string; settleDate: string }) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
  })
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlements?${q}`)
  return res.json() as Promise<{
    success: boolean
    settlements?: PosChannelSettlementRow[]
    message?: string
  }>
}

export async function savePosChannelSettlement(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  net: number
  fee?: number
  feeSource?: string
  memo?: string
  bankTransactionId?: number
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosChannelSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    settlementId?: number
    journalEntryId?: number | null
    alreadyPosted?: boolean
    message?: string
  }>
}

export async function importPosChannelSettlements(params: {
  rows: {
    storeCode: string
    settleDate: string
    channel: PosChannelSettlementChannel
    gross: number
    net: number
    fee?: number
    memo?: string
    feeSource?: string
  }[]
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/importPosChannelSettlements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    processed?: number
    failed?: number
    results?: { index: number; ok: boolean; code?: string; channel?: string; settleDate?: string }[]
    message?: string
  }>
}

export async function savePosSettlement(params: {
  storeCode?: string
  settleDate: string
  cashActual?: number | null
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt?: number
  cardBreakdown?: Record<string, number>
  qrAmt?: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt?: number
  deliveryAppBreakdown?: Record<string, number>
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt?: number
  otherBreakdown?: Record<string, number>
  memo?: string
  closed?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      diffTotal: number
      hasSettlement: boolean
    }
  }>
}

export async function finalizePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      postedJournalEntryId: number | null
      finalized: boolean
    }
  }>
}

export async function updatePosOrder(params: {
  id: number
  items: PosOrderItem[]
  /** 결제 단말 매장 — 주문 store_code와 시재 store_code 불일치 시 영업 시작 폴백 */
  terminalStoreCode?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD'
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  guestCount?: number
  linkposPayment?: LinkposPaymentSummary | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
  }
}) {
  const res = await apiFetchWithOffline('/api/updatePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 영수증 관리: 당일(방콕) 결제 반영 주문의 결제 수단 분해 정정(필요 시 total·과세 스냅샷 비율 조정). 오프라인 시 큐 동기화 필요 */
export async function correctPosOrderPayment(params: {
  id: number
  reason: string
  /** 생략 시 기존 주문 total 유지(결제 분할만 정정) */
  total?: number
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  /** 생략 시 기존 DB breakdown 을 새 payment_other 에 맞게 재검증·유지 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp: number
  deliveryPaymentChannel?: string | null
}) {
  const res = await apiFetchWithOffline('/api/correctPosOrderPayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 홀 주문: 빈 테이블로 이동 (table_name만 변경) */
export async function posDineInTableMove(params: { orderId: number; targetTableName: string }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'move',
      orderId: params.orderId,
      targetTableName: params.targetTableName,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/**
 * 홀 주문 합석: keep는 매장(dine_in)만. absorb는 매장 또는 포장(takeout) — 포장은 이 테이블 청구서로만 합침.
 * keep에 absorb 품목·인원 등을 합치고 absorb는 cancelled + `[ORDER_MERGED …]` 메모. 결제 반영된 주문은 합석 불가(API).
 */
export async function posDineInTableMerge(params: { keepOrderId: number; absorbOrderId: number }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'merge',
      keepOrderId: params.keepOrderId,
      absorbOrderId: params.absorbOrderId,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosOrderStatusUpdateResult = {
  success: boolean
  message?: string
  retryAfterQueue?: boolean
  statusAlreadyApplied?: boolean
  failedSideEffects?: string[]
}

export type PosOrderAuditTrailRow = {
  id: number
  changedAt: string
  orderId: number
  orderNo: string
  storeCode: string
  actionType: string
  changedBy: string
  changedByRole: string
  changedByStore: string
  changedByEmployeeCode: string
  changedByEmployeeId: number | null
  changeSource: string
  reason: string
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  changedFields: Array<{ field: string; before: unknown; after: unknown }>
}

export async function getPosOrderAuditTrail(params: {
  startStr: string
  endStr: string
  employee?: string
  orderNo?: string
  store?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.employee) q.set('employee', params.employee)
  if (params.orderNo) q.set('orderNo', params.orderNo)
  if (params.store) q.set('store', params.store)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getPosOrderAuditTrail?${q.toString()}`)
  const json = (await res.json().catch(() => ({}))) as { rows?: Record<string, unknown>[] }
  const rows = Array.isArray(json.rows) ? json.rows : []
  return rows.map((r) => ({
    id: Number(r.id || 0),
    changedAt: String(r.changed_at || ''),
    orderId: Number(r.order_id || 0),
    orderNo: String(r.order_no || ''),
    storeCode: String(r.store_code || ''),
    actionType: String(r.action_type || ''),
    changedBy: String(r.changed_by || ''),
    changedByRole: String(r.changed_by_role || ''),
    changedByStore: String(r.changed_by_store || ''),
    changedByEmployeeCode: String(r.changed_by_employee_code || ''),
    changedByEmployeeId:
      r.changed_by_employee_id != null && Number.isFinite(Number(r.changed_by_employee_id))
        ? Number(r.changed_by_employee_id)
        : null,
    changeSource: String(r.change_source || ''),
    reason: String(r.reason || ''),
    beforeJson:
      r.before_json && typeof r.before_json === 'object' && !Array.isArray(r.before_json)
        ? (r.before_json as Record<string, unknown>)
        : null,
    afterJson:
      r.after_json && typeof r.after_json === 'object' && !Array.isArray(r.after_json)
        ? (r.after_json as Record<string, unknown>)
        : null,
    changedFields: Array.isArray(r.changed_fields_json)
      ? (r.changed_fields_json as Array<{ field: string; before: unknown; after: unknown }>)
      : [],
  })) as PosOrderAuditTrailRow[]
}

export async function updatePosOrderStatus(params: {
  id: number
  status: string
  grabState?: string
  /** 취소·환불 시 pos_orders.memo 에 감사 로그 한 줄 추가 */
  memoAppend?: string
  retrySideEffects?: boolean
}) {
  const res = await apiFetchWithOffline('/api/updatePosOrderStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<PosOrderStatusUpdateResult>
}

export type PosKitchenPrintJobClaim = {
  id: number
  order_id: number
  payload_json: Record<string, unknown> | null
}

export async function claimKitchenPrintJob(params: {
  storeCode: string
  workerId?: string
}): Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/claimKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }>
}

export async function markKitchenPrintJob(params: {
  jobId: number
  status: 'printed' | 'failed'
  reason?: string
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/markKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabMarkOrderReadyApi(params: { orderID: string; markStatus: 1 | 2 }) {
  const res = await apiFetchWithOffline('/api/grab/markOrderReady', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabCancelOrderByStoreApi(params: {
  orderID: string
  storeCode?: string
  merchantID?: string
  cancelCode?: 1001 | 1002 | 1003 | 1004
}) {
  const res = await apiFetchWithOffline('/api/grab/cancelOrderByStore', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function markPosOrderItemServed(params: {
  id: number
  itemId: string
  served: boolean
  mode?: 'served' | 'packed'
  childKey?: string
  servedBy?: string
  cancelled?: boolean
  cancelledBy?: string
  cancelReason?: string
}) {
  const res = await apiFetchWithOffline('/api/markPosOrderItemServed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    servedCount?: number
    totalCount?: number
    cancelledCount?: number
    childServedCount?: number
    childTotalCount?: number
  }>
}

export type LinkposPaymentSummary = {
  provider: 'kbtg_linkpos'
  mode: 'hypercom'
  txCode: '20' | '26' | '50'
  bankId: string
  responseCode: string
  approvalCode?: string
  traceNo?: string
  refNo?: string
  terminalId?: string
  merchantId?: string
  reference1: string
  requestedAmount: number
  approvedAmount: number
  requestedAt: string
  respondedAt: string
}

export type KbankQrGenerateResult = {
  success: boolean
  partnerTransactionId?: string
  statusCode?: string | null
  statusMessage?: string | null
  requestedQrType?: string | null
  sentQrTypeCode?: string | null
  bankQrTypeCode?: string | null
  bankSof?: string | null
  displayQrType?: 'THAI_QR' | 'CREDIT_CARD' | null
  displayQrTypeSource?: 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested' | null
  qrTypeMismatch?: boolean
  terminalIdIncluded?: boolean
  requestMessage?: Record<string, unknown> | null
  responseMessage?: unknown
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrCheckStatusResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  status?: string | null
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrActionResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  data?: Record<string, unknown>
  message?: string
}

const LOCAL_LINKPOS_TX_ENDPOINTS = [
  'http://127.0.0.1:18181/linkpos/transaction',
  'http://localhost:18181/linkpos/transaction',
  'http://127.0.0.1:17888/linkpos/transaction',
  'http://localhost:17888/linkpos/transaction',
]

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(800, timeoutMs))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: String(data?.message || `HTTP ${res.status}`) }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function executeLinkposPayment(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: true as const,
      payment: null as LinkposPaymentSummary | null,
      source: 'disabled' as const,
    }
  }

  const timeoutMs = Math.max(2000, Number(params.timeoutMs ?? 12000))
  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    protocol: 'hypercom_v2',
  }

  // Hybrid #1: POS 로컬 브리지 우선
  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) {
      return {
        success: true,
        payment: (r.data.payment || null) as LinkposPaymentSummary | null,
        source: 'local' as const,
      }
    }
  }

  // Hybrid #2: 서버 중계 fallback
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

async function executeLinkposTransactionAction(
  action: 'display_qr' | 'clear_qr',
  fields: Record<string, unknown>,
  timeoutMs: number
): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  if (!isLinkposCardApiEnabled()) {
    return { success: false, message: 'linkpos_card_api_disabled' }
  }
  const payload = { action, protocol: 'hypercom_v2', ...fields }
  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) return { success: true, source: 'local' as const }
  }
  return {
    success: false,
    message:
      action === 'display_qr' ? 'linkpos_display_qr_not_supported' : 'linkpos_clear_qr_not_supported',
  }
}

export async function executeLinkposDisplayQr(params: {
  qrPayload: string
  amount?: number
  reference1?: string
  reference2?: string
  storeCode?: string
  timeoutMs?: number
}): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  const qrPayload = String(params.qrPayload || '').trim()
  if (!qrPayload) return { success: false, message: 'qr_payload_required' }
  const timeoutMs = Math.max(800, Number(params.timeoutMs ?? 2000))
  return executeLinkposTransactionAction(
    'display_qr',
    {
      qrPayload,
      amount: Number(params.amount ?? 0),
      reference1: String(params.reference1 || '').slice(0, 20),
      reference2: String(params.reference2 || '').slice(0, 20),
      storeCode: String(params.storeCode || ''),
    },
    timeoutMs
  )
}

/** EDC/LinkPOS QR 화면 해제 — 결제 완료·취소·세션 정리 시 호출 */
export async function executeLinkposClearQr(params?: {
  storeCode?: string
  timeoutMs?: number
}): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  const timeoutMs = Math.max(800, Number(params?.timeoutMs ?? 1500))
  return executeLinkposTransactionAction(
    'clear_qr',
    { storeCode: String(params?.storeCode || '') },
    timeoutMs
  )
}

export async function executeKbankGenerateQr(params: {
  amount: number
  qrType?: string
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  reference1?: string
  reference2?: string
  reference3?: string
  reference4?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrGenerateResult> {
  const terminalId = String(params.terminalId || '').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
  }
  const res = await apiFetch('/api/pos/kbank/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const meta = {
    requestedQrType: data.requestedQrType != null ? String(data.requestedQrType) : null,
    sentQrTypeCode: data.sentQrTypeCode != null ? String(data.sentQrTypeCode) : null,
    bankQrTypeCode: data.bankQrTypeCode != null ? String(data.bankQrTypeCode) : null,
    bankSof: data.bankSof != null ? String(data.bankSof) : null,
    displayQrType:
      data.displayQrType === 'CREDIT_CARD' || data.displayQrType === 'THAI_QR'
        ? (data.displayQrType as 'THAI_QR' | 'CREDIT_CARD')
        : null,
    displayQrTypeSource:
      data.displayQrTypeSource === 'bank_qr_type' ||
      data.displayQrTypeSource === 'bank_sof' ||
      data.displayQrTypeSource === 'emv_payload' ||
      data.displayQrTypeSource === 'requested'
        ? (data.displayQrTypeSource as 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested')
        : null,
    qrTypeMismatch: data.qrTypeMismatch === true,
    terminalIdIncluded: data.terminalIdIncluded === true,
    requestMessage:
      data.requestMessage && typeof data.requestMessage === 'object'
        ? (data.requestMessage as Record<string, unknown>)
        : null,
    responseMessage: data.responseMessage ?? null,
  }
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
      ...meta,
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
    ...meta,
  }
}

export async function executeKbankCheckStatus(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrCheckStatusResult> {
  const res = await apiFetch('/api/pos/kbank/check-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      status: String(data.status || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    status: String(data.status || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankCancelQr(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/cancel-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankVoidPayment(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const txnNo = String(params.txnNo || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(txnNo ? { txnNo } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/void-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      txnNo: txnNo || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankSettlement(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  qrType?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const qrType = String(params.qrType || 'THAI_QR').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
    qrType,
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/settlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      qrType,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeLinkposPaymentServer(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  orderId?: number
  retryOfAttemptId?: number
  retryOfLocalTxId?: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: false as const,
      message: 'linkpos_card_api_disabled',
      source: 'disabled' as const,
    }
  }

  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    orderId: params.orderId != null ? Number(params.orderId) : undefined,
    retryOfAttemptId: params.retryOfAttemptId != null ? Number(params.retryOfAttemptId) : undefined,
    retryOfLocalTxId: params.retryOfLocalTxId ? String(params.retryOfLocalTxId).slice(0, 20) : undefined,
    protocol: 'hypercom_v2',
    timeoutMs: params.timeoutMs != null ? Number(params.timeoutMs) : undefined,
  }
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

export async function savePosOrder(params: {
  storeCode?: string
  /** 주문 접수·결제한 담당자(담당자별 조회용) */
  createdBy?: string
  orderType?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  /** 홀 dine_in 시 권장. 미입력 시 0 */
  guestCount?: number
  /** 배달 주문 시 pos_orders.delivery_app_code (예: grab, lineman) */
  deliveryAppCode?: string
  /**
   * 클라이언트 멱등 키(선택). 있으면 `X-Idempotency-Key`·바디 `localOrderNo`로 전달되어 동일 제출 중복 저장을 막는다.
   */
  localOrderNo?: string
  /**
   * 결제 합계가 total 에 도달할 때 저장 직후 주문 상태 (오프라인 동기화 시 updatePosOrderStatus 생략용).
   * 서버에서 payment 합계·total 로 검증 후 적용.
   */
  closeStatus?: 'paid' | 'completed'
  /** 카드 승인 완료 메타 (KBTG LINKPOS) */
  linkposPayment?: LinkposPaymentSummary | null
  /** KBank QR 생성 시 발급된 partnerTransactionId (주문 저장 후 결제 시도 연결용) */
  kbankPartnerTransactionId?: string | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
  }
  items: PosOrderItem[]
}) {
  const idem = String(params.localOrderNo ?? '').trim()
  const res = await apiFetchWithOffline('/api/savePosOrder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idem ? { 'X-Idempotency-Key': idem } : {}),
    },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; orderId?: number; orderNo?: string; message?: string }>
}

export interface PosTaxInvoiceRecipientRow {
  id: string
  /** 전 매장 공유 마스터는 `__shared__` */
  store_code: string
  member_id: number | null
  member_no: string | null
  customer_type: 'person' | 'company'
  name: string
  tax_id: string
  branch_no: string
  phone: string
  phone_normalized: string
  email: string
  address: string
  is_active: boolean
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

/** 세금계산서 수취인 검색·목록 (관리자·POS) */
export async function getPosTaxInvoiceRecipients(params: {
  userStore: string
  userRole: string
  storeCode?: string
  q?: string
  by?: 'phone' | 'taxId' | 'name' | 'memberNo'
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('userStore', params.userStore)
  q.set('userRole', params.userRole)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  if (params.q) q.set('q', params.q)
  if (params.by) q.set('by', params.by)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetch(`/api/posTaxInvoiceRecipients?${q}`)
  return res.json() as Promise<{
    success: boolean
    rows?: PosTaxInvoiceRecipientRow[]
    message?: string
  }>
}

/** 세금계산서 수취인 upsert (POS 결제 등) — 오프라인 시 큐 */
export async function upsertPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  storeCode: string
  memberId?: number | null
  memberNo?: string | null
  customerType: 'person' | 'company'
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  source?: string
}) {
  const res = await apiFetchWithOffline('/api/posTaxInvoiceRecipients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}

/** 관리자: 수취인 수정·비활성화 */
export async function patchPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  id: string
  is_active?: boolean
  notes?: string | null
  name?: string
  taxId?: string
  branchNo?: string
  phone?: string
  email?: string
  address?: string
  customerType?: 'person' | 'company'
  member_id?: number | null
  member_no?: string | null
}) {
  const res = await apiFetch('/api/posTaxInvoiceRecipients', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}

export async function getLineMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/line' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    member: Member
    identity: {
      id: number
      providerUserId: string
      displayName: string
      pictureUrl: string
      status: string
      linkedAt: string
      lastSeenAt: string
    }
  }>>
}

export async function linkMemberLine(params: {
  memberId: number
  lineUserId: string
  displayName?: string
  pictureUrl?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/link-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function unlinkMemberLine(params: { memberId: number; lineUserId?: string }) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/unlink-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getLineMessagingStatus() {
  const res = await apiFetchWithOffline('/api/members/line-messaging-status')
  return res.json() as Promise<{
    channelAccessTokenConfigured: boolean
    channelSecretConfigured: boolean
  }>
}

export async function syncLineMembers(params?: { limit?: number }) {
  const res = await apiFetchWithOffline('/api/members/line-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: params?.limit ?? 2000 }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    scanned?: number
    synced?: number
    syncedWithProfile?: number
    syncedStubOnly?: number
    failed?: number
    hasNextCursor?: boolean
    nextCursor?: string
    errors?: string[]
  }>
}

export async function importLineCrmFile(params: { file: File }) {
  const form = new FormData()
  form.set('file', params.file)
  const res = await apiFetchWithOffline('/api/members/line-import', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    jobId?: string
    reportType?: 'customer' | 'point' | 'coupon'
    rowCount?: number
    successCount?: number
    failedCount?: number
  }>
}

export async function resetLineMemberList() {
  const res = await apiFetchWithOffline('/api/members/line-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    deactivatedLineIdentities?: number
    deactivatedLineMembers?: number
    deletedImportRows?: number
    deletedImportJobs?: number
  }>
}

export async function getMemberPoints(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/member-points?' + q.toString())
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    orderId: number | null
    kind: string
    points: number
    amount: number
    note: string
    createdAt: string
  }>>
}

export async function adjustMemberPoints(params: { memberId: number; points: number; note?: string }) {
  const res = await apiFetchWithOffline('/api/member-points/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMemberTiers() {
  const res = await apiFetchWithOffline('/api/member-tiers')
  const data = (await res.json()) as
    | Array<{
        code: string
        name: string
        min_amount: number
        min_points: number
        point_rate: number
        sort_order: number
        benefits_ko?: string | null
        benefits_en?: string | null
        benefits_th?: string | null
      }>
    | {
        tiers?: Array<{
          code: string
          name: string
          min_amount: number
          min_points: number
          point_rate: number
          sort_order: number
          benefits_ko?: string | null
          benefits_en?: string | null
          benefits_th?: string | null
        }>
        upgradeBasis?: 'amount' | 'points'
      }
  if (Array.isArray(data)) return data
  return data.tiers || []
}

export async function getMemberTierPolicy() {
  const res = await apiFetchWithOffline('/api/member-tiers/policy')
  return res.json() as Promise<{
    success: boolean
    upgradeBasis?: 'amount' | 'points'
    earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
    message?: string
  }>
}

export async function saveMemberTierPolicy(params: {
  upgradeBasis?: 'amount' | 'points'
  earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
}) {
  const res = await apiFetchWithOffline('/api/member-tiers/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    upgradeBasis?: 'amount' | 'points'
    earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
    message?: string
  }>
}

export async function saveMemberTier(params: {
  code: string
  name: string
  minAmount: number
  minPoints?: number
  pointRate: number
  sortOrder?: number
  benefitsKo?: string
  benefitsEn?: string
  benefitsTh?: string
}) {
  const res = await apiFetchWithOffline('/api/member-tiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function recalculateMemberTier(params?: { memberId?: number }) {
  const res = await apiFetchWithOffline('/api/member-tiers/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  })
  return res.json() as Promise<{ success: boolean; updated?: number; message?: string }>
}

export async function getMemberVisits(params?: {
  memberId?: number
  limit?: number
  startStr?: string
  endStr?: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.startStr) q.set('start', params.startStr)
  if (params?.endStr) q.set('end', params.endStr)
  if (params?.storeCode) q.set('store', params.storeCode)
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-visits' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    orderId: number
    memberId: number
    memberNo: string
    storeCode: string
    orderNo: string
    total: number
    visitedAt: string
  }>>
}

export async function getMemberCoupons(params?: {
  memberId?: number
  limit?: number
  status?: string
  couponCode?: string
  q?: string
}) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.couponCode) q.set('couponCode', params.couponCode)
  if (params?.q) q.set('q', params.q)
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-coupons' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    memberNo?: string
    memberName?: string
    couponCode: string
    couponName?: string
    discountType?: string
    discountValue?: number
    minOrderAmt?: number
    validTo?: string
    issuedAt: string
    expiresAt?: string
    usedAt: string
    orderId: number | null
    status: string
    campaignId?: number | null
    campaignName?: string
  }>>
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const res = await apiFetchWithOffline('/api/member-coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface Member {
  id: number
  memberNo: string
  name: string
  fullName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  phone: string
  email: string
  joinChannel?: string
  joinStoreCode?: string
  referredByMemberId?: number
  referralCode?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  source: string
  status: string
  lineLinked: boolean
  lineUserId?: string
  lineDisplayName?: string
  tierCode?: string
  pointBalance?: number
  lifetimeAmount?: number
  lastLineEventType?: string
  lastLineEventAt?: string
  lastUpdateReason?: string
  lastVisitedAt?: string
  createdAt?: string
  updatedAt?: string
}

export async function getMembersCursor(params?: { q?: string; afterId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.afterId != null) q.set('afterId', String(params.afterId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/cursor' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{ success: boolean; rows: Member[]; nextCursor: number | null; message?: string }>
}

export async function getMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const url = '/api/members' + (suffix ? `?${suffix}` : '')
  const searchQ = params?.q?.trim() || ''
  if (searchQ) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as Member[]) : []
  }
  const cacheKey = `erp:posMembers::${params?.limit ?? 'default'}`
  const list = await fetchPosCatalogCached<unknown>(cacheKey, url, [])
  return Array.isArray(list) ? (list as Member[]) : []
}

export async function createMember(params: {
  name: string
  phone?: string
  email?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export async function updateMember(params: {
  id: number
  name?: string
  fullName?: string
  lineDisplayName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      fullName: params.fullName,
      lineDisplayName: params.lineDisplayName,
      birthDate: params.birthDate,
      gender: params.gender,
      nationality: params.nationality,
      joinChannel: params.joinChannel,
      referralCode: params.referralCode,
      referredByMemberId: params.referredByMemberId,
      phone: params.phone,
      email: params.email,
      consentMarketing: params.consentMarketing,
      consentPrivacy: params.consentPrivacy,
      consentAt: params.consentAt,
      status: params.status,
    }),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export type MemberMergeResult = {
  targetMemberId: number
  targetMemberNo: string
  sourceMemberId: number
  sourceMemberNo: string
  transferred: {
    coupons: number
    couponDuplicatesCancelled: number
    pointLedgerRows: number
    orders: number
    identitiesMoved: number
    identitiesDeactivated: number
    notes: number
    events: number
    tierHistories: number
    campaignRunMembers: number
    referralEventsUpdated: number
    referredByUpdated: number
  }
}

export async function mergeMembers(params: {
  targetMemberId: number
  sourceMemberId?: number
  sourceRef?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.targetMemberId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceMemberId: params.sourceMemberId,
      sourceRef: params.sourceRef,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: MemberMergeResult
    member?: Member
  }>
}

export async function registerLineMember(params: {
  lineUserId: string
  displayName?: string
  pictureUrl?: string
  phone?: string
  email?: string
  name?: string
}) {
  const res = await apiFetchWithOffline('/api/members/line-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; member?: Member }>
}

export async function saveVendor(params: {
  code: string
  name: string
  gps_name?: string
  sales_outlet?: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  tax_no?: string
  type?: string
  memo?: string
  direct_settlement?: boolean
  editingCode?: string
}) {
  const res = await apiFetchWithOffline('/api/saveVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteVendor(params: { code: string }) {
  const res = await apiFetchWithOffline('/api/deleteVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
