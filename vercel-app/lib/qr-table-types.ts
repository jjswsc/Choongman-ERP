/** Shared types for QR table order + buffet (client + server). */

import { parseBangkokWallClockToMs } from '@/lib/bangkok-time'

export type QrOrderMode = 'buffet' | 'a_la_carte' | 'both'
export type QrPaymentMode = 'prepay' | 'postpay' | 'guest_choice'
export type QrResolvedPaymentMode = 'prepay' | 'postpay'
export type QrSessionStatus = 'awaiting_entry' | 'active' | 'closed' | 'expired'
export type QrEntryPaymentChannel = 'qr' | 'pos'

export type QrOrderStoreSettings = {
  storeCode: string
  enabled: boolean
  mode: QrOrderMode
  entryPaymentMode: QrPaymentMode
  extrasPaymentMode: QrPaymentMode
  requireStaffOpen: boolean
  maxOpenMinutes: number
  allowReorderAfterPaid: boolean
  /** Guest-facing print card */
  printLogoUrl?: string
  printBrandColor?: string
  printAccentColor?: string
  printBrandLine?: string
}

export type QrBuffetTier = {
  id: number
  storeCode: string
  code: string
  nameTh: string
  nameEn: string
  nameKo: string
  pricePerPerson: number
  sortOrder: number
  active: boolean
  validFrom?: string | null
  validTo?: string | null
  includedMenuIds?: number[]
  /** Extra 탭 허용 메뉴. 비어 있으면 포함 메뉴를 뺀 전체 */
  extraMenuIds?: number[]
}

export type QrTableToken = {
  id: number
  storeCode: string
  tableName: string
  token: string
  active: boolean
  publicUrl?: string
}

export type QrTableSession = {
  id: number
  storeCode: string
  tableName: string
  tokenId: number | null
  status: QrSessionStatus
  guestCount: number
  tierId: number | null
  tierPriceSnapshot: number
  entryTotal: number
  entryPaymentModeResolved: QrResolvedPaymentMode
  extrasPaymentModeResolved: QrResolvedPaymentMode
  entryPaid: boolean
  entryPaidAt: string | null
  entryPaymentChannel: QrEntryPaymentChannel | null
  posOrderId: number | null
  openedBy: string
  staffCallAt?: string | null
  staffCallNote?: string | null
  createdAt: string
  updatedAt: string
}

export type QrCartLineInput = {
  menuId: number
  qty: number
  note?: string
  optionIds?: number[]
}

export const QR_TABLE_SESSION_COOKIE = 'cm_qr_table_session'
export const QR_TABLE_CREATED_BY_PREFIX = 'qr_table:'

export function isQrTableCreatedBy(createdBy: string | null | undefined): boolean {
  return String(createdBy || '').startsWith(QR_TABLE_CREATED_BY_PREFIX)
}

/** 손님 폰 QR로 넣은 줄(패키지 입장료·메뉴). POS 직원이 담은 줄은 해당 없음. */
export function isQrTableGuestOrderLine(it: { source?: unknown; id?: unknown } | null | undefined): boolean {
  if (!it) return false
  if (String(it.source ?? '').trim().toLowerCase() === 'qr_table') return true
  const id = String(it.id ?? '').trim().toLowerCase()
  return id.startsWith('qr-') || id.startsWith('buffet-entry-')
}

/**
 * 결제 금액이 있으면 주방 추가출력을 막는다(정산 UPDATE를 추가주문으로 오인 방지).
 * QR 테이블은 입장료 선결제 후에도 주방에 음식을 보내야 하므로 예외.
 */
export function shouldSkipDineInKitchenAddonBecausePayment(
  paymentSum: number,
  createdBy?: string | null
): boolean {
  if (!(Number(paymentSum) > 0)) return false
  return !isQrTableCreatedBy(createdBy)
}

export function orderLooksLikeQrTableGuestOrder(
  createdBy?: string | null,
  items?: Array<{ source?: unknown; id?: unknown }> | null
): boolean {
  if (isQrTableCreatedBy(createdBy)) return true
  if (!Array.isArray(items) || items.length === 0) return false
  return items.some(isQrTableGuestOrderLine)
}

/**
 * 손님 폰 QR 추가주문은 홀 체크빌을 찍지 않고 주방만 출력.
 * 델타가 비었거나 POS 직원이 담은 줄이 섞이면 false.
 */
export function shouldSkipHallAutoprintForQrGuestAddon(
  deltaLines: Array<{ source?: unknown; id?: unknown }> | null | undefined
): boolean {
  if (!Array.isArray(deltaLines) || deltaLines.length === 0) return false
  return deltaLines.every(isQrTableGuestOrderLine)
}

/**
 * Realtime UPDATE 는 old.items_json 이 비는 경우가 많다.
 * 이전 스냅샷이 없을 때, 방금 들어온 QR 손님 줄만 델타로 본다.
 */
export const QR_GUEST_ADDON_AUTOPRINT_WINDOW_MS = 90_000

/** `qr-{session}-{menuId}-{epochMs}-{rand}` — menuId는 숫자만이 아닐 수 있음 */
const QR_LINE_ID_MS_RE = /^qr-.+-(\d{12,13})-[a-z0-9]+$/i

function qrGuestLineAddedAtMs(it: { id?: unknown; addedAt?: unknown }): number | null {
  const fromField = parseBangkokWallClockToMs(String(it.addedAt ?? '').trim())
  if (fromField != null) return fromField
  const id = String(it.id ?? '').trim()
  const m = id.match(QR_LINE_ID_MS_RE)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 1e12 ? n : null
}

export function isRecentQrGuestAddonLine(
  it: { source?: unknown; id?: unknown; addedAt?: unknown } | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = QR_GUEST_ADDON_AUTOPRINT_WINDOW_MS
): boolean {
  if (!it || !isQrTableGuestOrderLine(it)) return false
  const addedMs = qrGuestLineAddedAtMs(it)
  if (addedMs == null) return false
  const age = nowMs - addedMs
  if (age > windowMs) return false
  /** POS 시계가 서버보다 조금 느리면 addedAt이 미래로 보임 */
  if (age < -5_000) return false
  return true
}

export function inferPrevQtySnapshotExcludingRecentQrGuestLines<
  T extends { id?: string; name?: string; qty?: number; source?: unknown; addedAt?: unknown },
>(opts: {
  items: T[]
  newQtyById: Map<string, number>
  resolveKey: (item: T) => string
  nowMs?: number
  windowMs?: number
}): Map<string, number> | null {
  const recentKeys = new Set<string>()
  for (const it of opts.items) {
    if (!isRecentQrGuestAddonLine(it, opts.nowMs, opts.windowMs)) continue
    const key = String(opts.resolveKey(it) || '').trim()
    if (key) recentKeys.add(key)
  }
  if (recentKeys.size === 0) return null
  const prev = new Map(opts.newQtyById)
  for (const key of recentKeys) prev.delete(key)
  return prev
}

export function buffetTierDisplayName(
  tier: Pick<QrBuffetTier, 'nameTh' | 'nameEn' | 'nameKo' | 'code'>,
  lang?: string
): string {
  const l = String(lang || '').toLowerCase()
  if (l.startsWith('ko') && tier.nameKo) return tier.nameKo
  if (l.startsWith('en') && tier.nameEn) return tier.nameEn
  if (tier.nameTh) return tier.nameTh
  if (tier.nameEn) return tier.nameEn
  if (tier.nameKo) return tier.nameKo
  return tier.code
}

export function defaultQrOrderStoreSettings(storeCode: string): QrOrderStoreSettings {
  return {
    storeCode: String(storeCode || '').trim(),
    enabled: false,
    mode: 'buffet',
    entryPaymentMode: 'postpay',
    extrasPaymentMode: 'postpay',
    requireStaffOpen: true,
    maxOpenMinutes: 240,
    allowReorderAfterPaid: false,
    printLogoUrl: '',
    printBrandColor: '#b45309',
    printAccentColor: '#faf7f2',
    printBrandLine: '',
  }
}
