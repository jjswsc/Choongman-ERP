'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type ComponentProps } from 'react'
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
  type CartPanelSplitReceiptPayload,
} from '@/components/pos/cart-panel'
import { LiveMenuSearchDialog } from '@/components/pos/live-menu-search-dialog'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { useStoreList } from '@/lib/use-store-list'
import { LayoutGrid, Bike, Package, Search, QrCode as QrCodeIcon } from 'lucide-react'
import {
  getMembers,
  getPosMenus,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosOrders,
  getPosPrinterSettings,
  getPosTodaySales,
  getPosDeliveryApps,
  getPosBusinessDaySettings,
  getPosTaxInvoiceRecipients,
  getPosPaymentAttempts,
  executeKbankCancelQr,
  executeKbankCheckStatus,
  executeKbankGenerateQr,
  executeKbankSettlement,
  executeKbankVoidPayment,
  executeLinkposDisplayQr,
  executeLinkposPayment,
  grabCancelOrderByStoreApi,
  upsertPosTaxInvoiceRecipient,
  updatePosOrder,
  updatePosOrderStatus,
  type PosMenu,
  type PosMenuOption,
  type PosDeliveryApp,
  type LinkposPaymentSummary,
  type PosOrder,
  type PosOrderItem,
  type PosTableItem,
  type PosPrinterSettings,
  type PosPromoWithItems,
  type PosPaymentAttempt,
  type PosTaxInvoiceRecipientRow,
} from '@/lib/api-client'
import { mergeQueuedSavePosOrderByLocalOrderNo, savePosOrderWithOffline } from '@/lib/offline'
import {
  consumeSuppressMainPosAutoPrintForQueuedSync,
  registerLocallyPrintedQueuedOrderNo,
} from '@/lib/offline/pos-queued-sync-print-suppress'
import { usePosMenusCatalogLiveRefresh } from '@/lib/offline/use-pos-menus-catalog-live-refresh'
import {
  cartLinesToPosOrderItems,
  mergeDineInAddonCartPosItemsWithExisting,
  normalizeCartLineIdForSave,
  orderUiItemsToPosOrderItems,
  resolveCartLineQuantityForSave,
} from '@/lib/pos-order-item-map'
import { OfflineBanner } from '@/components/offline-banner'
import { PosReceiptModal, type ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { PosPostPaymentCashChangeDialog } from '@/components/pos/pos-post-payment-cash-change-dialog'
import { DeliveryEditOrderNoDialog } from '@/components/pos/delivery-edit-order-no-dialog'
import { PosKbankPaymentOutcomeDialog } from '@/components/pos/pos-kbank-payment-outcome-dialog'
import { useAuth } from '@/lib/auth-context'
import { isLangCode, useLang, type LangCode } from '@/lib/lang-context'
import { tr, useT } from '@/lib/i18n'
import { translateApiMessage } from '@/lib/translate-api-message'
import type { Order, OrderItem, Table } from '@/lib/pos-types'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'
import { newPosOrderClientRequestId } from '@/lib/pos-order-client-request-id'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { buildOptionNameByCodeFromMenus, resolveGrabDeliveryLineNote } from '@/lib/grab-pos-order-enrich'
import {
  parsePosOrderMemo,
  upsertPosOrderTaxInvoiceMemo,
  type PosTaxInvoiceData,
} from '@/lib/pos-tax-invoice'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { escapeHtml, cn } from '@/lib/utils'
import { getPosBusinessDateStr, setPosBusinessHoursClient } from '@/lib/pos-business-day'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { kitchenSlipPrintI18n } from '@/lib/pos-kitchen-slip-print-i18n'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import {
  getPosDeliveryPlatformName,
  isApiInboundDeliveryOrderMemo,
  pickPosChannelOrderNo,
} from '@/lib/pos-delivery-platform'
import { filterKitchenCartLinesForDineInAdd } from '@/lib/pos-kitchen-dine-in-delta'
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
  mergeKitchenSlipGroupsCancelledFirst,
  type KitchenSlipRoutingItem,
  type PosKitchenReprintPayload,
} from '@/lib/pos-kitchen-slip-routing'
import { mapKitchenSlipGroupItemsForPrint } from '@/lib/pos-kitchen-slip-display'
import {
  printPosHtmlDocument,
  POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS,
  resolveBetweenKitchenSlipsDelayMs,
  resolveBetweenSplitReceiptsDelayMs,
  resolveAfterReceiptToKitchenDelayMs,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import {
  normalizePosTableNameForMatch,
  translatePosMenuLineForReceipt,
  translateReceiptTableDisplayName,
  translateTakeoutOrderDisplayLabel,
} from '@/lib/pos-print-translate'
import {
  buildPosHallOrderReceiptDocumentHtml,
  mergeSetChildrenForReceipt,
} from '@/lib/pos-hall-order-receipt-document-html'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  enrichReceiptModalItemsForPromoDisplay,
  isPosOrderPaidLikeStatus,
  posOrderPaymentSum,
  posOrderRowPaymentSum,
  receiptModalDataFromPosOrderForPayment,
  receiptModalDataFromTerminalOrderTaxReprint,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import { negatePosReceiptMoney, receiptModalDataForVoidReceipt } from '@/lib/pos-void-receipt'
import {
  posOrderPaymentFieldsFromSnapshot,
  receiptPaymentFieldsFromSnapshot,
} from '@/lib/pos-receipt-cash-tender'
import { mergeGrabSetChildLinesIntoPromoParents, parseGrabSetChildLineName } from '@/lib/grab-set-pos-lines'
import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { orderPaymentsSum } from '@/lib/pos-order-line-update'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'
import { PosQrGuidelineCard } from '@/components/pos/pos-qr-guideline-card'
import {
  extractKbankQrResponseMeta,
  isKbankCreditCardQrUnavailableError,
  isKbankRateLimitError,
  resolveKbankCreditCardBrandLabels,
  resolveKbankDisplayQrTypeDetails,
  type KbankDisplayQrTypeSource,
} from '@/lib/payments/kbank-api-reference'
import {
  subscribePosOrdersInsert,
  subscribePosOrdersUpdate,
  type PosRealtimeSubscribeStatus,
} from '@/lib/supabase-client'
import {
  isMainPosRealtimeRecentlyActive,
  resolveMainPosPollIntervalMs,
} from '@/lib/pos-main-poll-interval'
import {
  applyGrabCancelWatchRealtimeRow,
  syncGrabCancelWatchSnapshot,
  type GrabCancelWatchSnap,
} from '@/lib/pos-grab-cancel-watch'
import {
  consumePosSelfInitiatedGrabCancel,
  markPosSelfInitiatedGrabCancel,
} from '@/lib/pos-grab-cancel-alert-suppress'
import { usePosCashDrawerOpen } from '@/components/pos/pos-drawer-pin-provider'
import {
  publishPosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from '@/lib/pos-customer-display-state'
import {
  applyPosOrderStatusWithRetry,
  notifyQueuedPosSave,
} from '@/app/pos/terminal/lib/terminal-order-actions'
import {
  getPosTourScenarioIdFromQuery,
  isPosDemoFromQuery,
  PosTerminalTourController,
  PosTourTerminalManualNextGates,
  PosTourOverlay,
  PosTourProvider,
  usePosTour,
} from '@/lib/pos-tour'
import { PosBusinessOpenGateBlock } from '@/components/pos/pos-business-open-gate-block'
import { usePosBusinessOpenGate } from '@/lib/use-pos-business-open-gate'

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

function resolveCardPaymentAmountForPricing(payment?: CartPanelPaymentPayload | null): number {
  if (!payment) return 0
  return normalizePosPaymentTender({
    paymentCard: payment.paymentCard,
    paymentQr: payment.paymentQr,
    paymentQrType: payment.paymentQrType,
  }).paymentCard
}

function asPlainObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function pickFirstNonEmptyText(
  sources: Array<Record<string, unknown> | null>,
  keys: readonly string[]
): string {
  for (const src of sources) {
    if (!src) continue
    for (const key of keys) {
      const raw = src[key]
      if (typeof raw === 'string') {
        const value = raw.trim()
        if (value) return value
        continue
      }
      if (typeof raw === 'number' || typeof raw === 'bigint') {
        const value = String(raw).trim()
        if (value) return value
      }
    }
  }
  return ''
}

function extractKbankGenerateResponseInfo(raw: unknown): {
  qrPayload: string
  originalTxnId: string
  txnNo: string
  referenceId: string
  sof: unknown
  cardScheme: string
  allowVoid: string
} {
  const root = asPlainObject(raw)
  const data = asPlainObject(root?.data)
  const result = asPlainObject(root?.result)
  const payment = asPlainObject(root?.payment)
  const paymentInfo = asPlainObject(root?.paymentInfo)
  const sources = [root, data, result, payment, paymentInfo]
  return {
    qrPayload: pickFirstNonEmptyText(sources, [
      'qrPayload',
      'qrCode',
      'qrString',
      'qrData',
      'payload',
      'qrRawData',
      'qrRaw',
      'thaiQr',
    ]),
    originalTxnId: pickFirstNonEmptyText(sources, [
      'origPartnerTxnUid',
      'originalTransactionId',
      'transactionId',
      'partnerTxnUid',
    ]),
    txnNo: pickFirstNonEmptyText(sources, ['txnNo', 'transactionNo']),
    referenceId: pickFirstNonEmptyText(sources, ['refId', 'referenceId']),
    sof: (() => {
      for (const src of sources) {
        if (!src || src.sof == null) continue
        return src.sof
      }
      return ''
    })(),
    cardScheme: pickFirstNonEmptyText(sources, ['cardScheme', 'card_scheme']),
    allowVoid: pickFirstNonEmptyText(sources, ['allowVoid', 'allow_void']),
  }
}

function buildKbankGenerateAuditPaste(input: {
  partnerTxnUid: string
  amount: number
  requestedQrType: string
  sentQrTypeCode?: string
  bankQrTypeCode?: string | null
  bankSof?: string | null
  requestMessage?: Record<string, unknown> | null
  responseMessage?: unknown
  storeCode?: string
}): string {
  const lines = [
    'KBank Generate QR',
    `store: ${String(input.storeCode || '').trim() || '-'}`,
    `partnerTxnUid: ${input.partnerTxnUid}`,
    `amount: ${input.amount.toFixed(2)} THB`,
    `requestedQrType: ${input.requestedQrType}`,
    `sentQrType: ${String(input.sentQrTypeCode || '-').trim() || '-'}`,
    `bankQrType: ${String(input.bankQrTypeCode || '-').trim() || '-'}`,
    `bankSof: ${String(input.bankSof || '-').trim() || '-'}`,
    '',
    '=== Request Body (masked) ===',
    JSON.stringify(input.requestMessage || {}, null, 2),
    '',
    '=== Response Body (masked) ===',
    JSON.stringify(input.responseMessage || {}, null, 2),
  ]
  return lines.join('\n')
}

function readEmvTagValue(payload: string, wantedTag: string): string {
  let i = 0
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2)
    const lenText = payload.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(lenText)) return ''
    const len = Number(lenText)
    const valueStart = i + 4
    const valueEnd = valueStart + len
    if (valueEnd > payload.length) return ''
    if (tag === wantedTag) return payload.slice(valueStart, valueEnd).trim()
    i = valueEnd
  }
  return ''
}

function extractAmountFromEmvQrPayload(payload: string): number {
  const raw = String(payload || '').trim()
  if (!raw) return 0
  const amountText = readEmvTagValue(raw, '54')
  if (!amountText) return 0
  const amount = Number(amountText.replace(/,/g, '').trim())
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

/** 1–99만 영수증·주방전표에 노출 */
function posGuestCountForThermalPrint(n: unknown): number | undefined {
  const g = Math.max(0, Math.min(99, Math.trunc(Number(n) || 0)))
  return g > 0 ? g : undefined
}

function posGuestCountSpread(n: unknown): { guestCount: number } | Record<PropertyKey, never> {
  const g = posGuestCountForThermalPrint(n)
  return g != null ? { guestCount: g } : {}
}

function posKitchenGuestSpread(
  n: unknown,
  label: string
): { guestCount: number; guestCountLabel: string } | Record<PropertyKey, never> {
  const g = posGuestCountForThermalPrint(n)
  return g != null ? { guestCount: g, guestCountLabel: label } : {}
}

type StoreAutoPrintFlags = {
  receiptOnOrder: boolean
  receiptOnAddOrder: boolean
  receiptOnPayment: boolean
  kitchenOnOrder: boolean
}

function storeAutoPrintFlagsFromSettings(s: PosPrinterSettings | null | undefined): StoreAutoPrintFlags {
  return {
    receiptOnOrder: Boolean(s?.autoPrintReceiptOnOrder),
    receiptOnAddOrder: Boolean(s?.autoPrintReceiptOnAddOrder || s?.autoPrintReceiptOnOrder),
    receiptOnPayment: Boolean(s?.autoPrintReceiptOnPayment ?? s?.autoPrintReceiptOnOrder),
    kitchenOnOrder: Boolean(s?.autoPrintKitchenSlipOnOrder),
  }
}

function mergeStoreAutoPrintFlags(
  fromSettings: StoreAutoPrintFlags,
  fromState: StoreAutoPrintFlags
): StoreAutoPrintFlags {
  return {
    receiptOnOrder: fromState.receiptOnOrder || fromSettings.receiptOnOrder,
    receiptOnAddOrder: fromState.receiptOnAddOrder || fromSettings.receiptOnAddOrder,
    receiptOnPayment: fromState.receiptOnPayment || fromSettings.receiptOnPayment,
    kitchenOnOrder: fromState.kitchenOnOrder || fromSettings.kitchenOnOrder,
  }
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

function isSessionNewOrder(createdAtRaw: unknown, sessionStartedAtMs: number, graceMs = 5000): boolean {
  const s = String(createdAtRaw ?? '').trim()
  if (!s) return false
  const ms = new Date(s).getTime()
  if (!Number.isFinite(ms)) return false
  return ms >= sessionStartedAtMs - graceMs
}

const MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX = 'pos_main_last_seen_order_id:'
const MAIN_POS_STARTUP_CATCHUP_WINDOW_MS = 10 * 60 * 1000
const MAIN_POS_STARTUP_CATCHUP_DURATION_MS = 3 * 60 * 1000
const POS_PRINT_DEBUG_STORAGE_KEY = 'pos_print_debug'
const MAIN_POS_META_SCAN_INTERVAL_MS = 30000
const KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS = 80

function readMainPosLastSeenOrderId(storeCodeRaw: unknown): number {
  if (typeof window === 'undefined') return 0
  const storeCode = String(storeCodeRaw ?? '').trim()
  if (!storeCode) return 0
  try {
    const raw = localStorage.getItem(`${MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX}${storeCode}`)
    const n = Number(raw ?? 0)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.trunc(n)
  } catch {
    return 0
  }
}

function writeMainPosLastSeenOrderId(storeCodeRaw: unknown, orderIdRaw: unknown): void {
  if (typeof window === 'undefined') return
  const storeCode = String(storeCodeRaw ?? '').trim()
  const orderId = Number(orderIdRaw)
  if (!storeCode || !Number.isFinite(orderId) || orderId <= 0) return
  try {
    localStorage.setItem(
      `${MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX}${storeCode}`,
      String(Math.trunc(orderId))
    )
  } catch {
    /* ignore localStorage failures */
  }
}

function isPosPrintDebugEnabledInBrowser(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const byQuery = new URLSearchParams(window.location.search).get('printDebug')
    if (byQuery === '1' || byQuery === 'true') return true
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(POS_PRINT_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function extractGrabOrderIdFromMemoText(memo: string): string {
  return (/grab_order:([A-Za-z0-9._:-]+)/i.exec(String(memo || ''))?.[1] || '').trim()
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

let POS_INCOMING_WAV_DATA_URI_CACHE = ''

function getPosIncomingWavDataUri(): string {
  if (POS_INCOMING_WAV_DATA_URI_CACHE) return POS_INCOMING_WAV_DATA_URI_CACHE
  const sampleRate = 22050
  const durationSec = 0.62
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const pcm = new Int16Array(totalSamples)

  const mixNote = (startSec: number, lenSec: number, freqHz: number, gain: number) => {
    const start = Math.max(0, Math.floor(startSec * sampleRate))
    const end = Math.min(totalSamples, Math.floor((startSec + lenSec) * sampleRate))
    const attack = Math.floor(sampleRate * 0.018)
    const release = Math.floor(sampleRate * 0.08)
    for (let i = start; i < end; i += 1) {
      const t = (i - start) / sampleRate
      const idx = i - start
      const tail = end - i
      const envA = attack > 0 ? Math.min(1, idx / attack) : 1
      const envR = release > 0 ? Math.min(1, tail / release) : 1
      const env = Math.min(envA, envR)
      const v = Math.sin(2 * Math.PI * freqHz * t) * gain * env
      const next = pcm[i] + Math.floor(v * 32767)
      pcm[i] = Math.max(-32768, Math.min(32767, next))
    }
  }

  // 매장 알림용 3노트 차임
  mixNote(0.00, 0.16, 784, 0.24)
  mixNote(0.17, 0.16, 988, 0.22)
  mixNote(0.34, 0.20, 1174, 0.24)

  const dataSize = pcm.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byteRate
  view.setUint16(32, 2, true) // blockAlign
  view.setUint16(34, 16, true) // bitsPerSample
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(44 + i * 2, pcm[i], true)
  }

  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...part)
  }
  POS_INCOMING_WAV_DATA_URI_CACHE = `data:audio/wav;base64,${btoa(binary)}`
  return POS_INCOMING_WAV_DATA_URI_CACHE
}

/** 배달앱 코드 (API에서 동적 로드 가능) */
export type DeliveryApp = string
type TakeoutMode = 'slot' | 'member'
type PendingPayRequest = {
  tableName: string
  items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
  /** 기존 주문 결제 시 영수증용 */
  orderNo?: string
} | null

type KbankOutcomeState = {
  kind: 'success' | 'cancelled'
  amount: number
  refId: string
  paymentMethod?: string
  cardLabel?: string
  approvalCode?: string
  timeLabel?: string
}

/** 테이블 현황 + 배달/포장 주문 + 장바구니. 테이블 선택 시 메뉴로 주문 추가. */
const FLOOR_PREF_KEY = 'pos-terminal-floor:'
/** 720×480 바닥 기준 3×3. 관리자 테이블 구성과 동일한 1:1 배율 기준 */
const DEMO_FLOOR_3X3_SLOTS = [
  { x: 44, y: 48 }, { x: 276, y: 48 }, { x: 508, y: 48 },
  { x: 44, y: 196 }, { x: 276, y: 196 }, { x: 508, y: 196 },
  { x: 44, y: 344 }, { x: 276, y: 344 }, { x: 508, y: 344 },
] as const

function TableFloorWithW13dTimeTour(props: ComponentProps<typeof TableFloorView> & { isPosDemo: boolean }) {
  const { isPosDemo, layout, ...rest } = props
  const { currentStep } = usePosTour()
  const timeTourSpotlights = useMemo(() => {
    if (currentStep?.id !== 'w13d_table_time_guide' || !isPosDemo) return null
    const a = layout[0]?.id
    const b = layout[1]?.id
    const c = layout[2]?.id
    if (!a || !b || !c) return null
    return {
      elapsedTableId: a,
      freshSurfaceTableId: a,
      warningSurfaceTableId: b,
      urgentSurfaceTableId: c,
      orderClockTableId: a,
    }
  }, [currentStep?.id, isPosDemo, layout])
  return <TableFloorView {...rest} layout={layout} timeTourSpotlights={timeTourSpotlights} />
}

/**
 * `CartPanel`이 넘긴 `payload.items`와 실제 `terminalCartLines`가 한 틱 어긋나거나(0·qty 혼용),
 * 카트 줄 id가 과거에 중복이면 `find`로 잘못 붙을 수 있어, **동일 id가 터미널에 있으면 터미널 수량을 단일 소스로** 쓴다.
 */
function reconcilePayloadItemsWithTerminalCart<
  T extends { id?: unknown; quantity?: unknown; qty?: unknown; menuId?: unknown; optionId?: unknown; optionCode?: unknown },
>(payloadItems: T[] | undefined | null, terminalLines: OrderItem[]): T[] {
  return (payloadItems || []).map((it) => {
    const hit = (terminalLines || []).find((line) => String(line.id ?? '') === String(it.id ?? ''))
    if (hit) {
      const q = resolveCartLineQuantityForSave(hit as { quantity?: unknown; qty?: unknown })
      const mid = String(
        (it as { menuId?: unknown }).menuId ?? hit.menuId ?? ''
      ).trim()
      const oid = String(
        (it as { optionId?: unknown }).optionId ?? hit.optionId ?? ''
      ).trim()
      const oc = String(
        (it as { optionCode?: unknown }).optionCode ?? hit.optionCode ?? ''
      ).trim()
      return {
        ...it,
        quantity: q,
        ...(mid ? { menuId: mid } : {}),
        ...(oid ? { optionId: oid } : {}),
        ...(oc ? { optionCode: oc } : {}),
      }
    }
    const raw = Number((it as { quantity?: unknown }).quantity ?? (it as { qty?: unknown }).qty)
    if (Number.isFinite(raw) && raw > 0) return it
    return { ...it, quantity: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }) }
  })
}

export default function PosTerminalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type') ?? 'dine_in'
  /** 테이블 오더 등 손님 단말: URL `audience=guest` — 메뉴 설명 표시(직원 POS는 미사용) */
  const showGuestMenuDescriptions = searchParams.get('audience') === 'guest'
  const orderType = useMemo(() => {
    if (typeParam === 'takeout') return 'takeout' as const
    if (typeParam === 'delivery') return 'delivery' as const
    return 'dine-in' as const
  }, [typeParam])

  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const localizeApiPopupMessage = useCallback((msg: string | undefined, fallback: string): string => {
    const translated = translateApiMessage(msg, t).trim()
    if (translated) {
      // Non-Korean locales should never show raw Korean text in frontline POS popups.
      if (lang !== 'ko' && /[가-힣]/.test(translated)) return fallback
      return translated
    }
    const original = String(msg || '').trim()
    if (!original) return fallback
    if (lang !== 'ko' && /[가-힣]/.test(original)) return fallback
    return original
  }, [lang, t])
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const tourScenarioId = getPosTourScenarioIdFromQuery(searchParams)
  const [tourMainDeviceTouched, setTourMainDeviceTouched] = useState(false)
  const [tourCartGuestCount, setTourCartGuestCount] = useState(0)
  const posDemoRef = useRef(false)
  const cartRef = useRef<CartPanelHandle>(null)
  useEffect(() => {
    posDemoRef.current = isPosDemo
  }, [isPosDemo])
  useEffect(() => {
    if (!isPosDemo) {
      setTourMainDeviceTouched(false)
      return
    }
    setTourMainDeviceTouched(false)
  }, [isPosDemo, tourScenarioId])
  const [terminalCartLines, setTerminalCartLines] = useState<OrderItem[]>([])
  const bindCartImperative = useCallback((api: CartPanelHandle | null) => {
    cartRef.current = api
  }, [])
  const posCartBackendBusyRef = useRef(false)
  const [posCartBackendBusy, setPosCartBackendBusy] = useState(false)

  const clearCartFromTerminal = useCallback(() => {
    setTerminalCartLines([])
    cartRef.current?.clearCart()
  }, [])
  const {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    refetchStores,
    clearTableOrder,
    upsertOptimisticOrder,
    loadingTables,
  } = usePosStore()
  const { formatStoreLabel } = useStoreList()

  const businessOpenGate = usePosBusinessOpenGate(currentStoreId, { skip: isPosDemo })
  const businessOpenBlocked = !businessOpenGate.allowed
  const ensureBusinessOpenForOrder = useCallback(async (): Promise<boolean> => {
    if (isPosDemo || businessOpenGate.allowed) return true
    await appAlert(
      t('posBusinessOpenRequiredBody') ||
        '오늘 POS를 시작하려면 먼저 영업 관리 > 영업 시작에서 돈통 시제를 입력·저장해 주세요.'
    )
    return false
  }, [isPosDemo, businessOpenGate.allowed, t])

  useEffect(() => {
    if (!currentStoreId) return
    let cancel = false
    void (async () => {
      try {
        const j = await getPosBusinessDaySettings(currentStoreId)
        if (cancel) return
        setPosBusinessHoursClient({
          start: { hour: j.hour, minute: j.minute },
          end: { hour: j.endHour, minute: j.endMinute },
        })
      } catch {
        /* layout hydrate / 기본값 유지 */
      }
    })()
    return () => {
      cancel = true
    }
  }, [currentStoreId])

  useEffect(() => {
    if (loadingTables) return
    if (currentStoreId) return
    router.replace('/pos')
  }, [loadingTables, currentStoreId, router])

  const notifyQueuedSave = useCallback(async (orderNo?: string, queued?: boolean) => {
    await notifyQueuedPosSave({
      orderNo,
      queued,
      onAlert: appAlert,
      i18n: {
        withoutOrderNo:
          t('posQueuedSavedNoOrder') || '오프라인으로 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.',
        withOrderNo: (no) =>
          tr(t, 'posQueuedSavedWithOrder', { orderNo: no }) ||
          `주문 ${no}를 오프라인 큐에 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.`,
      },
    })
  }, [t])

  const applyOrderStatusWithRetry = useCallback(
    async (params: { id: number; status: 'ready' | 'paid' | 'completed' | 'cancelled' | 'refunded' }) => {
      if (isPosDemo) return true
      return applyPosOrderStatusWithRetry({
        id: params.id,
        status: params.status,
        onAlert: appAlert,
        onConfirm: appConfirm,
        failMessageFallback: t('processFail') || '처리 실패',
        i18n: {
          retryConfirm: t('posStatusRetryConfirm') || '후속 처리를 다시 시도할까요?',
          sideEffectLabels: {
            stock: t('posStatusSideEffectStock') || '재고',
            journal: t('posStatusSideEffectJournal') || '분개',
            vat: t('posStatusSideEffectVat') || '부가세',
          },
          postProcessSuffix: (steps) =>
            tr(t, 'posStatusPostProcessSuffix', { steps }) || `(${steps} 후처리)`,
        },
      })
    },
    [isPosDemo, t]
  )

  const refetchCurrentStore = useCallback(() => {
    return refetchStores({ scope: 'current', immediate: true })
  }, [refetchStores])

  /** 주문 저장 직후 — 목록에 즉시 반영 후 서버 스냅샷 동기화(구 캐시·빈 refetch로 사라지는 현상 방지) */
  const refreshStoreListAfterOrderSave = useCallback(
    async (input: {
      orderType: string
      tableName?: string
      memo?: string
      status?: Order['status']
      total?: number
      orderNo?: string
      serverOrderId?: number | null
      items: Array<{
        id?: string
        name?: string
        quantity?: number
        price?: number
        menuId?: string
        optionId?: string
        note?: string
      }>
      queuedWithoutServerId?: boolean
    }) => {
      const serverId =
        input.serverOrderId != null && input.serverOrderId > 0 ? Number(input.serverOrderId) : null
      if (serverId != null) {
        upsertOptimisticOrder({
          storeCode: currentStoreId,
          serverOrderId: serverId,
          orderNo: input.orderNo,
          orderType: input.orderType,
          tableName: input.tableName,
          memo: input.memo,
          status: input.status ?? 'pending',
          total: input.total,
          items: input.items,
        })
      }
      if (!input.queuedWithoutServerId) {
        await refetchStores({ scope: 'current', immediate: true })
      }
    },
    [currentStoreId, refetchStores, upsertOptimisticOrder]
  )

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  /** 데모 홀: 저장 API 없이 서빙 패널용 주문만 오버레이 */
  const [demoDineInOrder, setDemoDineInOrder] = useState<{ tableId: string; order: Order } | null>(null)
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
  const [tourPaymentModalOpen, setTourPaymentModalOpen] = useState(false)
  const [tourPaymentTab, setTourPaymentTab] = useState<'cash' | 'card' | 'qr' | 'delivery_app' | 'other'>('cash')
  const [tourTaxInvoiceEnabled, setTourTaxInvoiceEnabled] = useState(false)
  const [tourPaymentCompletedCount, setTourPaymentCompletedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'takeout'>(
    orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
  )
  useEffect(() => {
    const nextTab = orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab))
  }, [orderType])
  const [pendingDineInOrderId, setPendingDineInOrderId] = useState<number | null>(null)
  /** `pendingDineInOrderId`가 가리키는 주문의 테이블명 — 다른 테이블로 잘못 병합(updatePosOrder)되는 것을 막음 */
  const pendingDineInOrderTableRef = useRef<string>('')
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
  const [promosWithItems, setPromosWithItems] = useState<PosPromoWithItems[]>([])
  const [menuOptions, setMenuOptions] = useState<PosMenuOption[]>([])
  const [menuOptionsForCodeMap, setMenuOptionsForCodeMap] = useState<PosMenuOption[]>([])
  const [receiptData, setReceiptData] = useState<ReceiptModalData | null>(null)
  const receiptQueueRef = useRef<ReceiptModalData[]>([])
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
  const [drawerOpenOption, setDrawerOpenOption] = useState<'password_and_reason' | 'reason_only' | 'force'>('reason_only')
  const { openPosCashDrawerSecure } = usePosCashDrawerOpen()
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
  const [customerDisplayLangMode, setCustomerDisplayLangMode] = useState<'follow-pos' | 'custom'>('follow-pos')
  const [customerDisplayLangOverride, setCustomerDisplayLangOverride] = useState<LangCode>('ko')
  const [customerDisplayDefaultState, setCustomerDisplayDefaultState] = useState<'idle' | 'qr'>('idle')
  const [customerDisplayIdleMessage, setCustomerDisplayIdleMessage] = useState('')
  const [customerDisplayPaymentMessage, setCustomerDisplayPaymentMessage] = useState('')
  const [customerDisplayQrPayload, setCustomerDisplayQrPayload] = useState('')
  const [liveKbankQrPayload, setLiveKbankQrPayload] = useState('')
  const [liveKbankQrAmount, setLiveKbankQrAmount] = useState(0)
  const [liveKbankQrType, setLiveKbankQrType] = useState<'THAI_QR' | 'CREDIT_CARD'>('THAI_QR')
  const [liveKbankQrTypeSource, setLiveKbankQrTypeSource] =
    useState<KbankDisplayQrTypeSource>('requested')
  const [kbankSentQrTypeCode, setKbankSentQrTypeCode] = useState('')
  const [kbankGenerateAuditText, setKbankGenerateAuditText] = useState('')
  const [kbankOpsBusy, setKbankOpsBusy] = useState(false)
  const [kbankOpsTxnUid, setKbankOpsTxnUid] = useState('')
  const [kbankOpsOrigTxnUid, setKbankOpsOrigTxnUid] = useState('')
  const [kbankOpsTxnNo, setKbankOpsTxnNo] = useState('')
  const [kbankOpsTerminalId, setKbankOpsTerminalId] = useState('')
  const [kbankOpsLastResult, setKbankOpsLastResult] = useState('')
  const [kbankOpsCardBrands, setKbankOpsCardBrands] = useState<string[]>([])
  const [kbankCallbackState, setKbankCallbackState] = useState<'idle' | 'waiting' | 'received' | 'failed'>('idle')
  const [kbankOutcomeState, setKbankOutcomeState] = useState<KbankOutcomeState | null>(null)
  const kbankCallbackNotifiedTxRef = useRef('')
  const kbankOutcomeLastKeyRef = useRef('')
  const kbankManualCancelPendingRef = useRef(false)
  const kbankGenerateLastAtRef = useRef(0)
  const kbankInquiryLastAtRef = useRef(0)
  const kbankFollowupLastAtRef = useRef(0)
  const [customerDisplayShowOrderSummary, setCustomerDisplayShowOrderSummary] = useState(true)
  const [customerDisplayShowOrderTotal, setCustomerDisplayShowOrderTotal] = useState(true)
  const [customerDisplayIdleMediaType, setCustomerDisplayIdleMediaType] = useState<'none' | 'image' | 'video'>('none')
  const [customerDisplayIdleMediaUrl, setCustomerDisplayIdleMediaUrl] = useState('')
  const [customerDisplayPaymentDraft, setCustomerDisplayPaymentDraft] = useState<CartPanelPaymentPayload | null>(null)
  const tourPaymentCardAmount = Number(customerDisplayPaymentDraft?.paymentCard ?? 0)
  const tourPaymentQrAmount = Number(customerDisplayPaymentDraft?.paymentQr ?? 0)
  const tourPaymentDeliveryAppAmount = Number(customerDisplayPaymentDraft?.paymentDeliveryApp ?? 0)
  const tourPaymentOtherAmount = Number(customerDisplayPaymentDraft?.paymentOther ?? 0)
  /** 결제 완료 직후 고객 모니터에 설정된 QR을 잠시 표시(ms 기준 타임스탬프) */
  const [postPaymentQrUntil, setPostPaymentQrUntil] = useState(0)
  /** 결제 후 거스름 — CartPanel 언마운트와 무관하게 확인 전까지 유지 */
  const [postPaymentCashChangeBaht, setPostPaymentCashChangeBaht] = useState<number | null>(null)
  /** 기존 주문 결제 시 영수증 orderNo (pendingPayRequest/pendingTakeoutPayRequest에 있던 값) */
  const [pendingReceiptOrderNo, setPendingReceiptOrderNo] = useState<string | null>(null)
  const [taxInvoiceTargetOrder, setTaxInvoiceTargetOrder] = useState<Order | null>(null)
  const [taxInvoiceSaving, setTaxInvoiceSaving] = useState(false)
  const [taxSearchLoading, setTaxSearchLoading] = useState(false)
  const [taxSearchField, setTaxSearchField] = useState<'taxId' | 'name' | 'phone'>('taxId')
  const [taxSearchKeyword, setTaxSearchKeyword] = useState('')
  const [taxSearchRows, setTaxSearchRows] = useState<PosTaxInvoiceRecipientRow[]>([])
  const [taxSearchMessage, setTaxSearchMessage] = useState('')
  const [tiCustomerType, setTiCustomerType] = useState<'person' | 'company'>('person')
  const [tiMemberNo, setTiMemberNo] = useState('')
  const [tiName, setTiName] = useState('')
  const [tiTaxId, setTiTaxId] = useState('')
  const [tiBranchNo, setTiBranchNo] = useState('')
  const [tiPhone, setTiPhone] = useState('')
  const [tiEmail, setTiEmail] = useState('')
  const [tiAddress, setTiAddress] = useState('')
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
  const optionNameById = useMemo(() => {
    const out = new Map<string, string>()
    for (const opt of menuOptions) {
      const id = String(opt.id ?? '').trim()
      const name = String(opt.name ?? '').trim()
      if (!id || !name) continue
      out.set(id, name)
    }
    return out
  }, [menuOptions])
  const optionNameByCode = useMemo(
    () =>
      buildOptionNameByCodeFromMenus(
        menus,
        menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions
      ),
    [menus, menuOptions, menuOptionsForCodeMap]
  )
  const menuCodeById = useMemo(() => {
    const m = new Map<string, string>()
    for (const menu of menus) {
      const id = String(menu.id ?? '').trim()
      const code = String(menu.code ?? '').trim()
      if (!id || !code) continue
      m.set(id, code)
    }
    return m
  }, [menus])
  const menuCodeByName = useMemo(() => {
    const m = new Map<string, string>()
    const norm = (raw: string) =>
      String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    for (const menu of menus) {
      const name = norm(String(menu.name ?? ''))
      const code = String(menu.code ?? '').trim()
      if (!name || !code) continue
      if (!m.has(name)) m.set(name, code)
    }
    return m
  }, [menus])
  const hasExplicitSizeToken = useCallback((rawText?: string | null): boolean => {
    const text = String(rawText ?? '').trim()
    if (!text) return false
    return /(^|[\s(])(?:size\s*)?[sml](?=$|[\s)\-–—,])/i.test(text)
  }, [])
  const inferDefaultSizeLabelForMenuId = useCallback(
    (menuIdRaw?: string | null): string => {
      const menuId = String(menuIdRaw ?? '').trim()
      if (!menuId) return ''
      const menuCode = String(menuCodeById.get(menuId) ?? '').trim().toUpperCase()
      if (!menuCode) return ''
      const labels: string[] = []
      for (const [code, label] of optionNameByCode.entries()) {
        const key = String(code ?? '').trim().toUpperCase()
        if (!key.startsWith(`${menuCode}-`)) continue
        const text = String(label ?? '').trim()
        if (text) labels.push(text)
      }
      if (labels.length === 0) return ''
      const hasMOrL = labels.some(
        (lab) =>
          /(^|[\s\-–—])(size\s*)?(m|l)([\s\-–—]|$)/i.test(lab) || /\bsize\s*(m|l)\b/i.test(lab)
      )
      if (!hasMOrL) return ''
      const sLabel =
        labels.find((lab) => /(^|[\s\-–—])(size\s*)?s([\s\-–—]|$)/i.test(lab)) || 'Size S'
      return sLabel
    },
    [menuCodeById, optionNameByCode]
  )
  const inferDefaultSizeLabelForLine = useCallback(
    (line: { menuId?: string | null; id?: string | null; name?: string | null; note?: string | null }): string => {
      const explicitNote = String(line.note ?? '').trim()
      if (hasExplicitSizeToken(explicitNote)) return ''
      if (hasExplicitSizeToken(String(line.name ?? ''))) return ''
      const menuId = String(line.menuId ?? '').trim()
      if (menuId) {
        const byId = inferDefaultSizeLabelForMenuId(menuId)
        if (byId) return byId
      }
      const idText = String(line.id ?? '').trim()
      const codeFromId = /(?:^|[^A-Za-z0-9])([A-Za-z]\d{2,})\b/.exec(idText)?.[1]
      if (codeFromId) {
        const syntheticMenuId = (() => {
          for (const [mid, code] of menuCodeById.entries()) {
            if (String(code).trim().toUpperCase() === codeFromId.toUpperCase()) return mid
          }
          return ''
        })()
        if (syntheticMenuId) {
          const byCode = inferDefaultSizeLabelForMenuId(syntheticMenuId)
          if (byCode) return byCode
        }
      }
      const nameKey = String(line.name ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
      if (nameKey) {
        const code = String(menuCodeByName.get(nameKey) ?? '').trim()
        if (code) {
          const syntheticMenuId = (() => {
            for (const [mid, c] of menuCodeById.entries()) {
              if (String(c).trim().toUpperCase() === code.toUpperCase()) return mid
            }
            return ''
          })()
          if (syntheticMenuId) {
            const byName = inferDefaultSizeLabelForMenuId(syntheticMenuId)
            if (byName) return byName
          }
        }
      }
      return ''
    },
    [hasExplicitSizeToken, inferDefaultSizeLabelForMenuId, menuCodeById, menuCodeByName]
  )
  const formatLineNoteForPrint = useCallback(
    (rawNote?: string | null): string => {
      const raw = String(rawNote ?? '').trim()
      if (!raw) return ''
      const hasGrabOptionToken = /(?:^|[\s·,])[A-Za-z][A-Za-z0-9]*-\d+/.test(raw)
      const shouldUseGrabParser = /(?:^|\s)(mods?:|optc:)/i.test(raw) || hasGrabOptionToken
      if (!shouldUseGrabParser) return normalizePosLineNote(raw, { keepOptionSummary: false })
      const grabMeta = resolveGrabDeliveryLineNote(raw, optionNameByCode)
      const option = String(grabMeta.optionSummary || '').trim()
      const request = String(grabMeta.requestSummary || '').trim()
      if (option || request) return [option, request].filter(Boolean).join(' · ')
      return normalizePosLineNote(raw, { keepOptionSummary: false })
    },
    [optionNameByCode]
  )
  const promoCatalogById = useMemo(() => {
    const m = new Map<string, PosPromoWithItems>()
    for (const p of promosWithItems) {
      if (p?.id) m.set(String(p.id), p)
    }
    return m
  }, [promosWithItems])
  const posReceiptLineOpts: PosOrderReceiptLineOptions = useMemo(
    () => ({ promoCatalogById, menus, optionNameByCode }),
    [promoCatalogById, menus, optionNameByCode]
  )
  const grabCatalogForPrint = useMemo(
    () =>
      buildGrabPosCatalog(
        menus.map((m) => ({ id: m.id, name: m.name, code: m.code })),
        (menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions).map((o) => ({
          name: o.name,
          optionCode: o.optionCode,
        })),
        promosWithItems
      ),
    [menus, menuOptions, menuOptionsForCodeMap, promosWithItems]
  )
  const enrichPromoItemsWithOptionName = useCallback(
    (list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]) =>
      list.map((p) => ({
        ...p,
        ...((p.optionCode && optionNameByCode.get(String(p.optionCode))) ? { optionName: optionNameByCode.get(String(p.optionCode)) } : {}),
        ...((p.optionId && optionNameById.get(String(p.optionId))) ? { optionName: optionNameById.get(String(p.optionId)) } : {}),
      })),
    [optionNameByCode, optionNameById]
  )
  /** 분할 결제 영수증 배치 시작 — 기존 큐·모달 상태를 비우고 첫 장부터 순서대로 인쇄 */
  const startReceiptBatch = useCallback((batch: ReceiptModalData[]) => {
    if (!Array.isArray(batch) || batch.length === 0) return
    const [first, ...rest] = batch
    receiptQueueRef.current = rest
    setReceiptData(first)
  }, [])
  const splitReceiptFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushNextReceiptQueue = useCallback(() => {
    if (splitReceiptFlushTimerRef.current != null) {
      clearTimeout(splitReceiptFlushTimerRef.current)
      splitReceiptFlushTimerRef.current = null
    }
    const [next, ...rest] = receiptQueueRef.current
    receiptQueueRef.current = rest
    if (!next) {
      setReceiptData(null)
      return
    }
    splitReceiptFlushTimerRef.current = setTimeout(() => {
      splitReceiptFlushTimerRef.current = null
      setReceiptData(next)
    }, resolveBetweenSplitReceiptsDelayMs())
  }, [])
  const clearReceiptQueue = useCallback(() => {
    receiptQueueRef.current = []
    setReceiptData(null)
  }, [])
  const makeSplitPaymentReceiptBatch = useCallback(
    (
      base: {
        orderNo: string
        storeCode: string
        orderType: string
        tableName?: string
        memo?: string
        discountReason?: string
        vatFeeMode?: 'included' | 'separate'
      },
      splitReceipts: CartPanelSplitReceiptPayload[] | undefined,
      suppressReceiptModalAutoPrint: boolean
    ): ReceiptModalData[] => {
      if (!Array.isArray(splitReceipts) || splitReceipts.length === 0) return []
      const out: ReceiptModalData[] = []
      splitReceipts.forEach((split, idx) => {
        const items = split.items
          .map((it) => ({
            id: String(it.id ?? ''),
            name: String(it.name ?? '').trim(),
            price: Number(it.price ?? 0),
            qty: Math.max(0, Number(it.quantity ?? 0) || 0),
            ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
          }))
          .filter((it) => it.qty > 0 && it.name)
        const subtotal = Math.max(0, Number(split.subtotal ?? 0) || 0)
        const total = Math.max(0, Number(split.total ?? 0) || 0)
        if (items.length === 0 && total <= 0.0001) return
        const splitMemoTag = `[DUTCH_SPLIT] ${String(split.label || `${idx + 1}/${splitReceipts.length}`)}`
        const memoCombined = [String(base.memo ?? '').trim(), splitMemoTag].filter(Boolean).join('\n')
        out.push({
          orderNo: base.orderNo,
          storeCode: base.storeCode,
          orderType: base.orderType,
          tableName: base.tableName,
          memo: memoCombined,
          discountReason: base.discountReason,
          items,
          subtotal,
          discountAmt: Math.max(0, Number(split.discountAmt ?? 0) || 0),
          total: total > 0 ? total : subtotal,
          vatFeeMode: base.vatFeeMode,
          ...(split.payment ? receiptPaymentFieldsFromSnapshot(split.payment) : {}),
          receiptAutoPrintContext: 'payment',
          suppressReceiptModalAutoPrint,
          printInstanceKey: `dutch:${base.orderNo}:${idx}:${split.key}`,
        })
      })
      return out
    },
    []
  )
  /** 주방 인쇄: DB에 promoItems 없을 때 카탈로그로 세트 구성 펼침 + 옵션명 보강 */
  const kitchenItemsWithResolvedPromo = useCallback(
    <T extends Record<string, unknown>>(rows: T[]): T[] => {
      if (!rows.length) return rows
      const prepared = preparePosOrderItemsForKitchenSlip(
        rows as Parameters<typeof preparePosOrderItemsForKitchenSlip>[0],
        { ...posReceiptLineOpts, menus }
      )
      const mapped = prepared.map((it) => {
        const list = (it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] })
          .promoItems
        const line = it as {
          menuId?: string
          menuId1?: string
          menu_id1?: string
          kitchenRouteMenuId?: string
          note?: string
        }
        const menuId = String(
          line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.kitchenRouteMenuId ?? ''
        ).trim()
        const note = String(line.note ?? '').trim()
        const inferredDefaultSize =
          !note
            ? inferDefaultSizeLabelForLine({
                menuId,
                id: String((it as { id?: unknown }).id ?? ''),
                name: String((it as { name?: unknown }).name ?? ''),
                note,
              })
            : ''
        const enrichedPromo =
          Array.isArray(list) && list.length > 0
            ? enrichPromoItemsWithOptionName(list).map((p) => {
                const optionName = String((p as { optionName?: string }).optionName ?? '').trim()
                const optionCode = String((p as { optionCode?: string | null }).optionCode ?? '').trim()
                if (optionName || optionCode) return p
                const inferred = inferDefaultSizeLabelForLine({
                  menuId: p.menuId,
                  name: String((p as { menuName?: unknown }).menuName ?? ''),
                })
                return inferred ? { ...p, optionName: inferred } : p
              })
            : undefined
        return {
          ...it,
          ...(enrichedPromo ? { promoItems: enrichedPromo } : {}),
          ...(inferredDefaultSize ? { note: inferredDefaultSize } : {}),
        } as unknown as T
      })
      return mergeSetChildrenForReceipt(mapped as unknown as Parameters<typeof mergeSetChildrenForReceipt>[0], {
        optionNameByCode,
      }) as unknown as T[]
    },
    [
      posReceiptLineOpts,
      enrichPromoItemsWithOptionName,
      inferDefaultSizeLabelForLine,
      menus,
      optionNameByCode,
    ]
  )
  const kitchenSlipItemsForPrint = useCallback(
    (
      slipItems: KitchenSlipRoutingItem[],
      orderSource: KitchenSlipRoutingItem[],
      ki: { t: (key: string) => string }
    ) =>
      mapKitchenSlipGroupItemsForPrint(slipItems, {
        orderItems: orderSource,
        menuCodeByMenuId: Object.fromEntries(
          menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
        ),
        optionNameByCode,
        translateName: (name) => translatePosMenuLineForReceipt(name, ki.t),
        formatNote: formatLineNoteForPrint,
      }),
    [formatLineNoteForPrint, optionNameByCode]
  )
  usePosMenusCatalogLiveRefresh(applyPosMenusList, currentStoreId || null)
  const drawerOpenWarnedRef = useRef(false)
  /** 더치·분할: 인원별 현금 결제 확정 시 돈통을 이미 연 경우(주문 완료 시 중복 오픈 방지) */
  const splitCashDrawerStepsRef = useRef(0)
  const posPrinterSettingsRef = useRef<PosPrinterSettings | null>(null)
  const posPrinterSettingsStoreCodeRef = useRef("")
  const posPrinterSettingsInFlightStoreCodeRef = useRef("")
  const posPrinterSettingsInFlightRef = useRef<Promise<PosPrinterSettings> | null>(null)
  const storeSettingsLoadSeqRef = useRef(0)

  const getPrinterSettingsForStore = useCallback(async (targetStoreCode: string): Promise<PosPrinterSettings> => {
    const normalizedStoreCode = String(targetStoreCode || "").trim()
    if (!normalizedStoreCode) throw new Error("missing_store_code")
    if (
      posPrinterSettingsRef.current &&
      posPrinterSettingsStoreCodeRef.current === normalizedStoreCode
    ) {
      if (isPosPrintDebugEnabledInBrowser()) {
        console.info('[POS_PRINT_DEBUG] printer_settings_cache_hit', {
          requestedStoreCode: normalizedStoreCode,
          currentStoreId: String(currentStoreId ?? ''),
          cachedStoreCode: posPrinterSettingsStoreCodeRef.current,
        })
      }
      return posPrinterSettingsRef.current
    }
    if (
      posPrinterSettingsInFlightRef.current &&
      posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode
    ) {
      return posPrinterSettingsInFlightRef.current
    }
    const request = getPosPrinterSettings({ storeCode: normalizedStoreCode })
      .then((settings) => {
        posPrinterSettingsRef.current = settings
        posPrinterSettingsStoreCodeRef.current = normalizedStoreCode
        if (isPosPrintDebugEnabledInBrowser()) {
          console.info('[POS_PRINT_DEBUG] printer_settings_loaded', {
            requestedStoreCode: normalizedStoreCode,
            currentStoreId: String(currentStoreId ?? ''),
            responseStoreCode: String((settings as { storeCode?: string } | null)?.storeCode ?? ''),
          })
        }
        return settings
      })
      .finally(() => {
        if (posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode) {
          posPrinterSettingsInFlightRef.current = null
          posPrinterSettingsInFlightStoreCodeRef.current = ""
        }
      })
    posPrinterSettingsInFlightStoreCodeRef.current = normalizedStoreCode
    posPrinterSettingsInFlightRef.current = request
    return request
  }, [currentStoreId])

  const storeAutoPrintFromState = useMemo(
    (): StoreAutoPrintFlags => ({
      receiptOnOrder: autoPrintReceiptOnOrder,
      receiptOnAddOrder: autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder,
      receiptOnPayment: autoPrintReceiptOnPayment,
      kitchenOnOrder: autoPrintKitchenSlipOnOrder,
    }),
    [
      autoPrintReceiptOnOrder,
      autoPrintReceiptOnAddOrder,
      autoPrintReceiptOnPayment,
      autoPrintKitchenSlipOnOrder,
    ]
  )

  const resolveStoreAutoPrintFlags = useCallback(
    async (targetStoreCode: string): Promise<StoreAutoPrintFlags> => {
      try {
        const s = await getPrinterSettingsForStore(targetStoreCode)
        return mergeStoreAutoPrintFlags(storeAutoPrintFlagsFromSettings(s), storeAutoPrintFromState)
      } catch {
        return storeAutoPrintFromState
      }
    },
    [getPrinterSettingsForStore, storeAutoPrintFromState]
  )

  const readStoreAutoPrintFlagsSync = useCallback((): StoreAutoPrintFlags => {
    const code = String(currentStoreId || '').trim()
    const fromRef =
      code && String(posPrinterSettingsStoreCodeRef.current || '').trim() === code
        ? storeAutoPrintFlagsFromSettings(posPrinterSettingsRef.current)
        : storeAutoPrintFlagsFromSettings(null)
    return mergeStoreAutoPrintFlags(fromRef, storeAutoPrintFromState)
  }, [currentStoreId, storeAutoPrintFromState])

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
    const requestStoreCode = String(currentStoreId || '').trim()
    if (!requestStoreCode) return
    const seq = ++storeSettingsLoadSeqRef.current
    getPrinterSettingsForStore(requestStoreCode)
      .then((s) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        posPrinterSettingsRef.current = s
        posPrinterSettingsStoreCodeRef.current = requestStoreCode
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
        setAutoPrintReceiptOnAddOrder(Boolean(s.autoPrintReceiptOnAddOrder || s.autoPrintReceiptOnOrder))
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
        const rawCustomerDisplayLangOverride = String(s.customerDisplayLangOverride ?? '').trim()
        setCustomerDisplayLangMode(
          s.customerDisplayLangMode === 'custom' && isLangCode(rawCustomerDisplayLangOverride)
            ? 'custom'
            : 'follow-pos'
        )
        setCustomerDisplayLangOverride(isLangCode(rawCustomerDisplayLangOverride) ? rawCustomerDisplayLangOverride : lang)
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
        if (seq !== storeSettingsLoadSeqRef.current) return
        /**
         * 설정 재조회가 일시 실패해도, 같은 매장에 이미 로드된 프린터 설정이 있으면
         * 자동인쇄 플래그를 false 기본값으로 덮어쓰지 않는다.
         * (주문 직전/직후 네트워크 흔들림으로 수동 인쇄 팝업이 뜨는 현상 방지)
         */
        const hasUsableCachedSettings =
          posPrinterSettingsRef.current != null &&
          String(posPrinterSettingsStoreCodeRef.current || '').trim() === requestStoreCode
        if (hasUsableCachedSettings) return
        posPrinterSettingsRef.current = null
        posPrinterSettingsStoreCodeRef.current = ""
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
        setCustomerDisplayLangMode('follow-pos')
        setCustomerDisplayLangOverride(lang)
        setCustomerDisplayDefaultState('idle')
        setCustomerDisplayIdleMessage('')
        setCustomerDisplayPaymentMessage('')
        setCustomerDisplayQrPayload('')
        setCustomerDisplayShowOrderSummary(true)
        setCustomerDisplayShowOrderTotal(true)
        setCustomerDisplayIdleMediaType('none')
        setCustomerDisplayIdleMediaUrl('')
      })
    getPosMenus({ fresh: true, storeCode: requestStoreCode || undefined })
      .then(applyPosMenusList)
      .catch(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setMenus([])
        setMenuTargets({ byId: new Map(), byName: new Map() })
      })
    getPosMenuOptions({ fresh: true })
      .then((rows) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setMenuOptions(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setMenuOptions([])
      })
    getPosMenuOptions({ fresh: true, forCodeMap: true })
      .then((rows) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setMenuOptionsForCodeMap(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setMenuOptionsForCodeMap([])
      })
    getPosPromosWithItems({ includeInactive: true })
      .then((rows) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setPromosWithItems(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setPromosWithItems([])
      })
  }, [currentStoreId, applyPosMenusList, getPrinterSettingsForStore, lang])

  useLayoutEffect(() => {
    if (!pendingPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDineInPaymentFromOrder(pendingPayRequest)
    setPendingPayRequest(null)
  }, [pendingPayRequest])

  useLayoutEffect(() => {
    if (!pendingTakeoutPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openTakeoutPaymentFromOrder({
      orderLabel: pendingTakeoutPayRequest.tableName,
      items: pendingTakeoutPayRequest.items,
      existingOrderId: pendingTakeoutOrderId,
    })
    setPendingTakeoutPayRequest(null)
  }, [pendingTakeoutPayRequest, pendingTakeoutOrderId])

  useLayoutEffect(() => {
    if (!pendingDeliveryPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDeliveryPaymentFromOrder({
      orderLabel: pendingDeliveryPayRequest.tableName,
      items: pendingDeliveryPayRequest.items,
      existingOrderId: pendingDeliveryOrderId,
    })
    setPendingDeliveryPayRequest(null)
  }, [pendingDeliveryPayRequest, pendingDeliveryOrderId])

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
    const raw = floorLayoutForView.find((tbl) => tbl.id === tableId)?.floor
    return Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
  }

  const floorLayoutForView = useMemo<PosTableItem[]>(() => {
    if (!isPosDemo) return currentLayout
    /** 레이아웃 API·매장 테이블을 id만으로 합치면 이름은 `1번`~`3번`이 반복될 수 있음 → 데모 바닥은 항상 1~9번 고정 */
    return Array.from({ length: 9 }, (_, idx) => {
      const slot = DEMO_FLOOR_3X3_SLOTS[idx] ?? DEMO_FLOOR_3X3_SLOTS[DEMO_FLOOR_3X3_SLOTS.length - 1]
      return {
        id: `demo-table-${idx + 1}`,
        name: `${idx + 1}번`,
        x: slot.x,
        y: slot.y,
        w: 120,
        h: 76,
        floor: 1,
        shape: idx === 4 ? 'round' : 'rect',
        seats: Math.max(2, idx % 3 === 0 ? 4 : idx % 3 === 1 ? 2 : 6),
        rotation: 0,
      } satisfies PosTableItem
    })
  }, [isPosDemo, currentLayout])

  const demoTableVisualStatusById = useMemo(() => {
    if (!isPosDemo) return new Map<string, { status: 'preparing' | 'partial_served' | 'completed'; createdAt: string; guestCount: number }>()
    // 데모에서는 9개 중 6개만 점유 상태로 보여 빈 테이블 주문 테스트가 가능해야 합니다.
    const minutes = [4, 11, 19, 7, 22, 14]
    const statuses: Array<'preparing' | 'partial_served' | 'completed'> = [
      'preparing', 'preparing', 'preparing',
      'partial_served', 'completed', 'partial_served',
    ]
    const map = new Map<string, { status: 'preparing' | 'partial_served' | 'completed'; createdAt: string; guestCount: number }>()
    floorLayoutForView.slice(0, 6).forEach((tbl, idx) => {
      const minAgo = minutes[idx] ?? 6
      map.set(tbl.id, {
        status: statuses[idx] ?? 'preparing',
        createdAt: new Date(Date.now() - minAgo * 60_000).toISOString(),
        guestCount: idx % 3 === 0 ? 4 : idx % 3 === 1 ? 2 : 6,
      })
    })
    return map
  }, [isPosDemo, floorLayoutForView])

  useEffect(() => {
    if (!isPosDemo) return
    // 데모 시작 시 전체 보기로 맞춰 빈 테이블(주문 테스트용)이 항상 보이게 합니다.
    setTableListMode('all')
  }, [isPosDemo, tourScenarioId])
  const selectedTable = useMemo(() => {
    if (!selectedTableId) return undefined
    const base = currentStore?.tables?.find((tbl) => tbl.id === selectedTableId)
    const fallbackLayout = floorLayoutForView.find((tbl) => tbl.id === selectedTableId)
    const fallbackTable: Table | undefined = fallbackLayout
      ? {
          id: fallbackLayout.id,
          name: fallbackLayout.name,
          seats: Math.max(1, Number(fallbackLayout.seats ?? 2) || 2),
          x: Number(fallbackLayout.x ?? 0) || 0,
          y: Number(fallbackLayout.y ?? 0) || 0,
          width: Number(fallbackLayout.w ?? 132) || 132,
          height: Number(fallbackLayout.h ?? 82) || 82,
          shape:
            fallbackLayout.shape === 'round'
              ? 'round'
              : fallbackLayout.shape === 'square'
                ? 'square'
                : 'rectangle',
          rotation: Number(fallbackLayout.rotation ?? 0) || 0,
          isOccupied: false,
        }
      : undefined
    const resolved = base ?? fallbackTable
    if (!resolved) return undefined
    if (demoDineInOrder?.tableId === selectedTableId) {
      return { ...resolved, order: demoDineInOrder.order, isOccupied: true }
    }
    return resolved
  }, [currentStore?.tables, selectedTableId, demoDineInOrder, floorLayoutForView])

  const servingTable = useMemo(() => {
    if (!servingTableId) return undefined
    const base = currentStore?.tables?.find((tbl) => tbl.id === servingTableId)
    const fallbackLayout = floorLayoutForView.find((tbl) => tbl.id === servingTableId)
    const fallbackTable: Table | undefined = fallbackLayout
      ? {
          id: fallbackLayout.id,
          name: fallbackLayout.name,
          seats: Math.max(1, Number(fallbackLayout.seats ?? 2) || 2),
          x: Number(fallbackLayout.x ?? 0) || 0,
          y: Number(fallbackLayout.y ?? 0) || 0,
          width: Number(fallbackLayout.w ?? 132) || 132,
          height: Number(fallbackLayout.h ?? 82) || 82,
          shape:
            fallbackLayout.shape === 'round'
              ? 'round'
              : fallbackLayout.shape === 'square'
                ? 'square'
                : 'rectangle',
          rotation: Number(fallbackLayout.rotation ?? 0) || 0,
          isOccupied: false,
        }
      : undefined
    const resolved = base ?? fallbackTable
    if (!resolved) return undefined
    if (demoDineInOrder?.tableId === servingTableId) {
      return { ...resolved, order: demoDineInOrder.order, isOccupied: true }
    }
    return resolved
  }, [currentStore?.tables, servingTableId, demoDineInOrder, floorLayoutForView])

  useEffect(() => {
    setDemoDineInOrder(null)
  }, [currentStoreId])

  const tourServingOrder = useMemo(() => {
    if (!servingTableId) return null
    if (demoDineInOrder?.tableId === servingTableId) return demoDineInOrder.order
    return currentStore?.tables.find((t) => t.id === servingTableId)?.order ?? null
  }, [servingTableId, demoDineInOrder, currentStore?.tables])
  const tourServingItemChecked = useMemo(() => {
    const order = tourServingOrder
    if (!order) return false
    const st = String(order.status)
    const items = order.items || []
    const servedCount = items.filter((it) => Boolean(it?.servedAt)).length
    const allServed = items.length > 0 && servedCount >= items.length
    if (st === 'ready') return allServed
    if (st === 'partial_served') return true
    return servedCount > 0
  }, [tourServingOrder])

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
      ...receiptTaxDisplayFieldsFromPricing(pricing),
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
  /** 1023px 이하(세로 태블릿/모바일)에서만 하단 카트로 전환 */
  const isNarrowViewport = useMediaQuery('(max-width: 920px)')
  const showSidePanel =
    activeTab !== 'tables' ||
    Boolean(servingTable?.order) ||
    Boolean(selectedTableId) ||
    hasPendingPaymentFlow ||
    postPaymentCashChangeBaht != null
  const shouldFullscreenOrderDetailOnNarrow =
    isNarrowViewport &&
    (
      (activeTab === 'delivery' && Boolean(selectedDeliveryOrder)) ||
      (activeTab === 'takeout' && Boolean(selectedTakeoutOrder)) ||
      (activeTab === 'tables' && Boolean(servingTable?.order))
    )
  const scrollIntoViewOnFocus = useScrollIntoViewOnFocus()
  const [isMainPosDevice, setIsMainPosDevice] = usePosMainDevice(currentStoreId || null)
  const posSessionStartedAtRef = useRef<number>(Date.now())
  const seenOrderIdsRef = useRef<Set<number>>(new Set())
  /** 결제 영수증 자동 인쇄 중복 방지(메인: 로컬 결제 + Realtime UPDATE/INSERT) */
  const printedPaymentReceiptIdsRef = useRef<Set<number>>(new Set())
  /** 주방 주문서 자동 인쇄 중복 방지(수락/Realtime/폴링 동시 발화) */
  const printedKitchenSlipKeysRef = useRef<Map<string, number>>(new Map())
  /** 신규 배달 안내(도착/수락/Grab 승인)·탭 포커스: 주문 id당 한 번만 (last-id 한 개 비교는 다른 주문 처리 후 동일 id 재이벤트에서 뚫림) */
  const promptedPendingDeliveryOrderIdsRef = useRef<Set<number>>(new Set())
  const promptedGrabCustomerCancelIdsRef = useRef<Set<number>>(new Set())
  const grabCancelWatchSnapshotRef = useRef<Map<number, GrabCancelWatchSnap>>(new Map())
  const grabCancelWatchSeededRef = useRef(false)
  /** 첫 폴링에서 당일 기결제 건을 시드해 페이지 로드 시 영수증 대량 재인쇄 방지 */
  const paymentReceiptScanSeededRef = useRef(false)
  /**
   * 메인 포스: dine_in 품목 수량 스냅샷(다른 단말 UPDATE 시 id 추가 + 수량 증가를 모두 감지)
   * - key: orderId
   * - value: (itemId -> qty)
   */
  const dineInRemoteItemQtySnapshotRef = useRef<Map<number, Map<string, number>>>(new Map())
  /** 메인 포스가 updatePosOrder(추가주문) 직후 수신하는 Realtime UPDATE로 이중 인쇄 방지 */
  const mainPosSelfDineInUpdateSuppressUntilRef = useRef<Map<number, number>>(new Map())
  useEffect(() => {
    printedPaymentReceiptIdsRef.current = new Set()
    printedKitchenSlipKeysRef.current = new Map()
    promptedPendingDeliveryOrderIdsRef.current = new Set()
    paymentReceiptScanSeededRef.current = false
    dineInRemoteItemQtySnapshotRef.current = new Map()
    mainPosSelfDineInUpdateSuppressUntilRef.current = new Map()
  }, [currentStoreId])

  const reserveKitchenAutoPrintKey = useCallback((rawKey: string, ttlMs = 6 * 60 * 60 * 1000) => {
    const key = String(rawKey || '').trim()
    if (!key) return true
    const now = Date.now()
    const map = printedKitchenSlipKeysRef.current
    for (const [k, ts] of map.entries()) {
      if (!Number.isFinite(ts) || now - ts > 24 * 60 * 60 * 1000) map.delete(k)
    }
    const prev = map.get(key)
    if (typeof prev === 'number' && now - prev < ttlMs) return false
    map.set(key, now)
    return true
  }, [])

  /**
   * 신규 주문 알림음 (브라우저 autoplay 정책에 따라 무음 처리될 수 있음)
   * - WAV(data URI) 차임 우선, 실패 시 WebAudio 폴백
   */
  const playIncomingOrderBeep = useCallback(() => {
    if (typeof window === 'undefined') return
    const playFallbackWithWebAudio = () => {
      try {
        const AC = (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
          | typeof AudioContext
          | undefined
        if (!AC) return
        const ctx = new AC()
        const now = ctx.currentTime
        const makeTone = (at: number, freq: number, dur: number, gainMax: number) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, at)
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(gainMax, at + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(at)
          osc.stop(at + dur + 0.02)
        }
        makeTone(now, 784, 0.12, 0.04)
        makeTone(now + 0.14, 1046, 0.14, 0.045)
        window.setTimeout(() => {
          void ctx.close().catch(() => {})
        }, 460)
      } catch {
        // ignore (no audio device / blocked by browser policy)
      }
    }
    try {
      const wavDataUri = getPosIncomingWavDataUri()
      const audio = new Audio(wavDataUri)
      audio.preload = 'auto'
      audio.volume = 0.9
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {
          playFallbackWithWebAudio()
        })
      }
      return
    } catch {
      // fall through
    }
    playFallbackWithWebAudio()
  }, [])

  const logPosPrintDebug = useCallback(
    (event: string, detail?: Record<string, unknown>) => {
      if (!isPosPrintDebugEnabledInBrowser()) return
      try {
        console.info('[POS_PRINT_DEBUG]', event, {
          storeCode: String(currentStoreId ?? ''),
          isMainPosDevice,
          ...(detail || {}),
        })
      } catch {
        /* ignore console errors */
      }
    },
    [currentStoreId, isMainPosDevice]
  )

  const recomputeRealtimeChannelHealthyRef = useRef<() => void>(() => {})
  const scheduleRealtimeResubscribeRef = useRef<() => void>(() => {})

  const makeRealtimeStatusHandler = useCallback(
    (channelKey: string) => (status: PosRealtimeSubscribeStatus, err?: Error) => {
      realtimeChannelStateRef.current.set(channelKey, status)
      recomputeRealtimeChannelHealthyRef.current()
      if (status === 'SUBSCRIBED') {
        lastRealtimeOrderEventAtRef.current = Date.now()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        logPosPrintDebug('realtime_channel_degraded', {
          channelKey,
          status,
          message: err?.message,
        })
        triggerMainPosPollNowRef.current?.()
        scheduleRealtimeResubscribeRef.current()
      }
    },
    [logPosPrintDebug]
  )

  const runAutoPrintForAcceptedDeliveryOrder = useCallback(
    async (params: {
      orderId: number
      storeCode?: string
      memo?: string
      deliveryAppCode?: string
    }) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!isMainPosDevice || (!autoPrintReceiptOnOrder && !autoPrintKitchenSlipOnOrder)) {
        logPosPrintDebug('accept_flow_skip_not_main_or_autoprint_off', {
          orderId,
          autoPrintReceiptOnOrder,
          autoPrintKitchenSlipOnOrder,
        })
        return
      }
      let list = await getPosOrders({
        orderId,
        storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
        strictStore: true,
      })
      if (!list.length) {
        list = await getPosOrders({
          orderId,
          storeCode: String(currentStoreId || '').trim() || undefined,
          strictStore: true,
        })
      }
      const order = list[0]
      if (!order?.items?.length) {
        logPosPrintDebug('accept_flow_skip_empty_items', { orderId })
        return
      }
      const items = (order.items || []).map((it) => {
        const note = String(it.note ?? '').trim()
        const menuId = String(it.menuId1 ?? it.menuId2 ?? '').trim()
        const optionCode = String((it as { optionCode1?: string; optionCode2?: string }).optionCode1 ?? (it as { optionCode1?: string; optionCode2?: string }).optionCode2 ?? '').trim()
        const displayName = resolvePosOrderItemMenuDisplayName(
          {
            id: String(it.id ?? ''),
            name: String(it.name ?? ''),
            menuId,
          },
          menus
        )
        const pit = it as {
          promoId?: string
          promo_id?: string
          promoCode?: string
          promo_code?: string
        }
        const promoId = String(pit.promoId ?? pit.promo_id ?? '').trim()
        const promoCode = String(pit.promoCode ?? pit.promo_code ?? '').trim()
        return {
          id: String(it.id ?? ''),
          name: displayName,
          price: Number(it.price ?? 0),
          qty: Number(it.qty ?? 1),
          ...(menuId ? { menuId } : {}),
          ...(optionCode ? { optionCode } : {}),
          ...(note ? { note } : {}),
          ...(promoId ? { promoId } : {}),
          ...(promoCode ? { promoCode } : {}),
          ...(Array.isArray(
            (it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] })
              .promoItems
          )
            ? {
                promoItems: enrichPromoItemsWithOptionName(
                  (it as {
                    promoItems: { menuId: string; optionId: string | null; quantity: number }[]
                  }).promoItems
                ),
              }
            : {}),
        }
      })
      const runKitchenForAcceptedOrder = () => {
        if (!autoPrintKitchenSlipOnOrder) return
        if (!reserveKitchenAutoPrintKey(`order:${orderId}:kitchen`)) return
        void (async () => {
          try {
            const effectiveStoreCode = String(currentStoreId || order.storeCode || '').trim()
            const settings = await getPrinterSettingsForStore(effectiveStoreCode)
            const ki = kitchenSlipPrintI18n(settings, lang)
            const slips = buildKitchenSlipGroups(
              kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as typeof items,
              buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
            )
            if (!slips.length) return
            const slipDesign = resolveKitchenSlipDesign(settings)
            const kitchenMemo = parsePosOrderMemo(order.memo).plainMemo
            const memoLine = kitchenMemo.trim()
              ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
              : ''
            const printOne = (idx: number) => {
              if (idx >= slips.length) return
              const slip = slips[idx]
              const tablePart = order.tableName
                ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, ki.t)
                : ''
              const orderTypeLabel =
                ki.orderTypeLabels[normalizePosOrderTypeKey(order.orderType)] || (order.orderType ?? '')
              const html = buildKitchenSlipDocumentHtml({
                label: slip.label,
                orderNo: order.orderNo ?? '',
                storeCode: effectiveStoreCode,
                orderTypeLabel,
                tablePart,
                dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                items: kitchenSlipItemsForPrint(
                  slip.items,
                  kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                  ki
                ),
                memoLine: memoLine || null,
                escapeHtml,
                design: slipDesign,
                optionNameByCode,
                printColorAdjust: 'exact',
                ...posKitchenGuestSpread(order.guestCount, ki.t('posOrderGuestCount')),
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
                  if (idx + 1 < slips.length) {
                    setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                  }
                },
              })
            }
            setTimeout(() => printOne(0), 0)
          } catch (e) {
            console.error('Kitchen slip print (accept flow):', e)
          }
        })()
      }
      if (autoPrintReceiptOnOrder) {
        await printReceiptNow(
          {
            orderNo: order.orderNo ?? '',
            storeCode: order.storeCode ?? currentStoreId,
            orderType: order.orderType ?? 'delivery',
            tableName: order.tableName,
            memo: order.memo,
            items,
            subtotal: order.subtotal ?? 0,
            discountAmt: order.discountAmt ?? 0,
            total: order.total ?? 0,
            ...posGuestCountSpread(order.guestCount),
          },
          undefined,
          false,
          undefined,
          true,
          autoPrintKitchenSlipOnOrder ? runKitchenForAcceptedOrder : undefined
        )
      } else if (autoPrintKitchenSlipOnOrder) {
        setTimeout(runKitchenForAcceptedOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
      logPosPrintDebug('accept_flow_autoprint_done', {
        orderId,
        autoPrintReceiptOnOrder,
        autoPrintKitchenSlipOnOrder,
      })
    },
    [
      isMainPosDevice,
      autoPrintReceiptOnOrder,
      autoPrintKitchenSlipOnOrder,
      currentStoreId,
      menus,
      t,
      lang,
      kitchenItemsWithResolvedPromo,
      logPosPrintDebug,
      enrichPromoItemsWithOptionName,
      reserveKitchenAutoPrintKey,
    ]
  )

  const decideIncomingPendingDeliveryOrder = useCallback(
    async (params: {
      orderId: number
      storeCode?: string
      memo?: string
      deliveryAppCode?: string
    }) => {
      try {
        const confirmed = await appConfirm(
          t('posIncomingDeliveryDecisionPrompt') ||
            '신규 배달 주문입니다.\n이 주문을 수락할까요?',
          {
            title: t('posOrderTypeDelivery') || '배달',
            confirmLabel: t('posDeliveryOrderAccept') || '수락',
            cancelLabel: t('posDeliveryOrderReject') || '반려',
          }
        )
        const orderId = Number(params.orderId)
        if (!Number.isFinite(orderId) || orderId <= 0) return
        const memo = String(params.memo || '')
        const grabOrderId = extractGrabOrderIdFromMemoText(memo)
        if (confirmed) {
          const res = await updatePosOrderStatus({
            id: orderId,
            status: 'cooking',
            ...(grabOrderId ? { grabState: 'ACCEPTED' } : {}),
          })
          const applied = Boolean(res.success || res.statusAlreadyApplied)
          if (!applied) {
            await appAlert(localizeApiPopupMessage(res.message, t('processFail') || '처리 실패'))
            return
          }
          if (!res.success && res.statusAlreadyApplied && res.message) {
            await appAlert(localizeApiPopupMessage(res.message, t('processFail') || '처리 실패'))
          }
          refetchStores({ scope: 'all' })
          setActiveTab('delivery')
          setDeliveryListMode('all')
          setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
          if (String(params.deliveryAppCode || '').trim()) {
            setDeliveryApp(String(params.deliveryAppCode || '').trim().toLowerCase())
          }
          if (isMainPosDevice && (autoPrintReceiptOnOrder || autoPrintKitchenSlipOnOrder)) {
            let list = await getPosOrders({
              orderId,
              storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
              strictStore: true,
            })
            if (!list.length) {
              list = await getPosOrders({
                orderId,
                storeCode: String(currentStoreId || '').trim() || undefined,
                strictStore: true,
              })
            }
            const order = list[0]
            if (order?.items?.length) {
              const items = (order.items || []).map((it) => {
                const note = String(it.note ?? '').trim()
                const menuId = String(it.menuId1 ?? it.menuId2 ?? '').trim()
                const optionCode = String((it as { optionCode1?: string; optionCode2?: string }).optionCode1 ?? (it as { optionCode1?: string; optionCode2?: string }).optionCode2 ?? '').trim()
                const displayName = resolvePosOrderItemMenuDisplayName({
                  id: String(it.id ?? ''),
                  name: String(it.name ?? ''),
                  menuId,
                }, menus)
                const pit = it as {
                  promoId?: string
                  promo_id?: string
                  promoCode?: string
                  promo_code?: string
                }
                const promoId = String(pit.promoId ?? pit.promo_id ?? '').trim()
                const promoCode = String(pit.promoCode ?? pit.promo_code ?? '').trim()
                return {
                  id: String(it.id ?? ''),
                  name: displayName,
                  price: Number(it.price ?? 0),
                  qty: Number(it.qty ?? 1),
                  ...(menuId ? { menuId } : {}),
                  ...(optionCode ? { optionCode } : {}),
                  ...(note ? { note } : {}),
                  ...(promoId ? { promoId } : {}),
                  ...(promoCode ? { promoCode } : {}),
                  ...(Array.isArray((it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }).promoItems)
                    ? {
                        promoItems: enrichPromoItemsWithOptionName(
                          (it as {
                            promoItems: { menuId: string; optionId: string | null; quantity: number }[]
                          }).promoItems
                        ),
                      }
                    : {}),
                }
              })
              const runKitchenForAcceptedOrder = () => {
                if (!autoPrintKitchenSlipOnOrder) return
                if (!reserveKitchenAutoPrintKey(`order:${orderId}:kitchen`)) return
                void (async () => {
                  try {
                    const effectiveStoreCode = String(currentStoreId || order.storeCode || '').trim()
                    const settings = await getPrinterSettingsForStore(effectiveStoreCode)
                    const ki = kitchenSlipPrintI18n(settings, lang)
                    const slips = buildKitchenSlipGroups(
                      kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as typeof items,
                      buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
                    )
                    if (!slips.length) return
                    const slipDesign = resolveKitchenSlipDesign(settings)
                    const kitchenMemo = parsePosOrderMemo(order.memo).plainMemo
                    const memoLine = kitchenMemo.trim()
                      ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                      : ''
                    const printOne = (idx: number) => {
                      if (idx >= slips.length) return
                      const slip = slips[idx]
                      const tablePart = order.tableName
                        ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, ki.t)
                        : ''
                      const orderTypeLabel =
                ki.orderTypeLabels[normalizePosOrderTypeKey(order.orderType)] || (order.orderType ?? '')
                      const html = buildKitchenSlipDocumentHtml({
                        label: slip.label,
                        orderNo: order.orderNo ?? '',
                        storeCode: effectiveStoreCode,
                        orderTypeLabel,
                        tablePart,
                        dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                        items: kitchenSlipItemsForPrint(
                          slip.items,
                          kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                          ki
                        ),
                        memoLine: memoLine || null,
                        escapeHtml,
                        design: slipDesign,
                        optionNameByCode,
                        printColorAdjust: 'exact',
                        ...posKitchenGuestSpread(order.guestCount, ki.t('posOrderGuestCount')),
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
                          if (idx + 1 < slips.length) {
                            setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                          }
                        },
                      })
                    }
                    setTimeout(() => printOne(0), 0)
                  } catch (e) {
                    console.error('Kitchen slip print (accept flow):', e)
                  }
                })()
              }
              if (autoPrintReceiptOnOrder) {
                await printReceiptNow(
                  {
                    orderNo: order.orderNo ?? '',
                    storeCode: order.storeCode ?? currentStoreId,
                    orderType: order.orderType ?? 'delivery',
                    tableName: order.tableName,
                    memo: order.memo,
                    items,
                    subtotal: order.subtotal ?? 0,
                    discountAmt: order.discountAmt ?? 0,
                    total: order.total ?? 0,
                    ...posGuestCountSpread(order.guestCount),
                  },
                  undefined,
                  false,
                  undefined,
                  true,
                  autoPrintKitchenSlipOnOrder ? runKitchenForAcceptedOrder : undefined
                )
              } else if (autoPrintKitchenSlipOnOrder) {
                setTimeout(runKitchenForAcceptedOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
              }
            }
          }
          refetchStores({ scope: 'all' })
          if (typeof window !== 'undefined') {
            window.setTimeout(() => refetchStores({ scope: 'all' }), 700)
            window.setTimeout(() => refetchStores({ scope: 'all' }), 1800)
          }
          return
        }

        markPosSelfInitiatedGrabCancel(orderId)
        const rejectRes = await updatePosOrderStatus({
          id: orderId,
          status: 'cancelled',
          ...(grabOrderId ? { grabState: 'CANCELLED' } : {}),
        })
        const rejectedApplied = Boolean(rejectRes.success || rejectRes.statusAlreadyApplied)
        if (!rejectedApplied) {
          await appAlert(localizeApiPopupMessage(rejectRes.message, t('processFail') || '처리 실패'))
          return
        }
        if (!rejectRes.success && rejectRes.statusAlreadyApplied && rejectRes.message) {
          await appAlert(localizeApiPopupMessage(rejectRes.message, t('processFail') || '처리 실패'))
        }
        if (grabOrderId) {
          await grabCancelOrderByStoreApi({
            orderID: grabOrderId,
            storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
            cancelCode: 1002,
          })
        }
        refetchStores({ scope: 'all' })
        await appAlert(t('posOrderRejected') || '주문을 반려했습니다.')
      } catch (e) {
        await appAlert(t('posUnexpectedErrorDetail')?.replace('{{detail}}', String(e)) || String(e))
      }
    },
    [
      t,
      refetchStores,
      isMainPosDevice,
      autoPrintReceiptOnOrder,
      autoPrintKitchenSlipOnOrder,
      currentStoreId,
      menus,
      lang,
    ]
  )

  /**
   * 신규 "배달" 주문 자동 처리:
   * - 배달 탭으로 전환
   * - 해당 주문 자동 선택
   * - 배달앱 코드가 있으면 Grab/LineMan/Shopee 자동 선택
   * - 알림음 재생
   */
  const autoFocusIncomingDeliveryOrder = useCallback(
    (params: {
      orderId: number
      orderType?: string
      deliveryAppCode?: string
      status?: string
      createdAt?: string
      storeCode?: string
      memo?: string
    }) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!isSessionNewOrder(params.createdAt, posSessionStartedAtRef.current)) return
      const orderType = String(params.orderType ?? '').trim().toLowerCase()
      if (orderType !== 'delivery') return
      const status = String(params.status ?? '').trim().toLowerCase()
      if (status === 'cancelled' || status === 'refunded') return
      if (promptedPendingDeliveryOrderIdsRef.current.has(orderId)) return
      promptedPendingDeliveryOrderIdsRef.current.add(orderId)

      const deliveryCode = String(params.deliveryAppCode ?? '').trim().toLowerCase()
      if (deliveryCode) setDeliveryApp(deliveryCode)
      refetchStores({ scope: 'all' })
      setActiveTab('delivery')
      setDeliveryListMode('all')
      setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
      setSelectedDeliveryTargetLabel('')
      playIncomingOrderBeep()
      if (status === 'pending') {
        window.setTimeout(() => {
          /** 수동 키잉 배달은 `pending`이어도 웹훅 memo 앵커가 없음 → 수락/거절 팝업 생략 */
          if (!isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))) return
          void decideIncomingPendingDeliveryOrder({
            orderId,
            storeCode: params.storeCode,
            memo: params.memo,
            deliveryAppCode: deliveryCode,
          })
        }, 120)
        return
      }
      window.setTimeout(() => {
        void (async () => {
          const accepted = await appConfirm(
            status === 'pending'
              ? (t('posIncomingDeliveryApprovePrompt') ||
                  '신규 배달 주문이 도착했습니다. 지금 주문 수락 화면으로 이동할까요?')
              : (t('posIncomingDeliveryArrivedPrompt') ||
                  '신규 배달 주문이 도착했습니다. 주문 화면으로 이동할까요?')
          )
          if (!accepted) return
          refetchStores({ scope: 'all' })
          setActiveTab('delivery')
          setDeliveryListMode('all')
          setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
        })()
      }, 120)
    },
    [playIncomingOrderBeep, t, refetchStores, decideIncomingPendingDeliveryOrder]
  )

  /** Grab 고객 취소(push order state) — Realtime UPDATE 시 팝업·알림음 */
  const notifyGrabCustomerCancelledOrder = useCallback(
    (params: { orderId: number; tableName?: string; orderNo?: string }) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (consumePosSelfInitiatedGrabCancel(orderId)) return
      if (promptedGrabCustomerCancelIdsRef.current.has(orderId)) return
      promptedGrabCustomerCancelIdsRef.current.add(orderId)

      playIncomingOrderBeep()
      if (typeof window !== 'undefined') {
        window.setTimeout(() => playIncomingOrderBeep(), 420)
      }
      refetchCurrentStore()
      setActiveTab('delivery')
      setDeliveryListMode('all')
      setSelectedDeliveryTargetId(`delivery-order-${orderId}`)

      const label =
        String(params.tableName ?? '').trim() ||
        (params.orderNo ? `POS #${params.orderNo}` : `Order #${orderId}`)
      const msg = (t('posGrabCustomerCancelledAlert') || '고객이 Grab에서 주문을 취소했습니다.\n\n{{label}}').replace(
        '{{label}}',
        label
      )
      void appAlert(msg)
    },
    [playIncomingOrderBeep, refetchCurrentStore, t]
  )

  const runGrabCancelWatchOnOrders = useCallback(
    (
      orders: Array<{ id?: number; status?: string; memo?: string; orderType?: string; tableName?: string; orderNo?: string }>,
      opts: { seedOnly?: boolean }
    ): boolean => {
      const newlyCancelled = syncGrabCancelWatchSnapshot(orders, grabCancelWatchSnapshotRef.current, {
        seedOnly: Boolean(opts.seedOnly),
      })
      if (opts.seedOnly) {
        grabCancelWatchSeededRef.current = true
        return false
      }
      if (!grabCancelWatchSeededRef.current) return false
      for (const orderId of newlyCancelled) {
        const order = orders.find((o) => Number(o.id) === orderId)
        notifyGrabCustomerCancelledOrder({
          orderId,
          tableName: order?.tableName,
          orderNo: order?.orderNo,
        })
      }
      return newlyCancelled.length > 0
    },
    [notifyGrabCustomerCancelledOrder]
  )

  const currentStoreCodeVariants = useMemo(() => {
    const base = String(currentStoreId || '').trim()
    if (!base) return [] as string[]
    const variants = [
      base,
      base.startsWith('CM ') ? base.slice(3).trim() : `CM ${base}`.trim(),
      base.replace(/^CM\s+/i, '').trim(),
    ].filter(Boolean)
    const out: string[] = []
    for (const raw of variants) {
      const v = String(raw).trim()
      if (!v) continue
      if (out.some((e) => e.toLowerCase() === v.toLowerCase())) continue
      out.push(v)
    }
    return out
  }, [currentStoreId])

  const isCurrentStoreOrder = useCallback(
    (rawStoreCode: unknown) => {
      const rowStore = String(rawStoreCode ?? '').trim()
      if (!rowStore || currentStoreCodeVariants.length === 0) return false
      return currentStoreCodeVariants.some(
        (v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase())
      )
    },
    [currentStoreCodeVariants]
  )

  const isKbankPilotStore = useMemo(() => {
    const values = [
      String(currentStoreId || '').trim(),
      String(currentStore?.name || '').trim(),
      String(formatStoreLabel(currentStoreId || '') || '').trim(),
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
    return values.includes('cm office')
  }, [currentStoreId, currentStore?.name, formatStoreLabel])

  useEffect(() => {
    if (isKbankPilotStore) return
    setLiveKbankQrPayload('')
    setLiveKbankQrAmount(0)
    setLiveKbankQrType('THAI_QR')
    setKbankOpsTxnUid('')
    setKbankOpsOrigTxnUid('')
    setKbankOpsTxnNo('')
    setKbankOpsLastResult('')
    setKbankCallbackState('idle')
    kbankCallbackNotifiedTxRef.current = ''
    setCustomerDisplayPaymentMessage('')
  }, [isKbankPilotStore, currentStoreId])

  const kbankTerminalIdStorageKey = useMemo(() => {
    const store = String(currentStoreId || '').trim().toUpperCase()
    return store ? `pos.kbank.terminalId.${store}` : 'pos.kbank.terminalId'
  }, [currentStoreId])

  useEffect(() => {
    if (!isKbankPilotStore) return
    try {
      const saved = String(localStorage.getItem(kbankTerminalIdStorageKey) || '').trim()
      if (saved) setKbankOpsTerminalId(saved)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey])

  useEffect(() => {
    if (!isKbankPilotStore) return
    const value = String(kbankOpsTerminalId || '').trim()
    try {
      if (value) localStorage.setItem(kbankTerminalIdStorageKey, value)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey, kbankOpsTerminalId])

  const demoKbankQrPayload = useMemo(() => {
    if (!isPosDemo || !tourPaymentModalOpen) return ''
    const amount = Math.max(0, Number(tourPaymentQrAmount || 0))
    if (amount <= 0) return ''
    const store = String(currentStoreId || 'POS DEMO').trim() || 'POS DEMO'
    return `CMERP-DEMO-KBANK|${store}|${amount.toFixed(2)}`
  }, [isPosDemo, tourPaymentModalOpen, tourPaymentQrAmount, currentStoreId])

  const effectiveStaffKbankQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(demoKbankQrPayload || '').trim()
  }, [liveKbankQrPayload, demoKbankQrPayload])
  const effectiveStaffKbankQrAmount = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live && liveKbankQrAmount > 0) return liveKbankQrAmount
    if (live) {
      const fromPayload = extractAmountFromEmvQrPayload(live)
      if (fromPayload > 0) return fromPayload
    }
    return Math.max(0, Number(tourPaymentQrAmount || 0))
  }, [liveKbankQrPayload, liveKbankQrAmount, tourPaymentQrAmount])

  const effectiveCustomerDisplayQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(customerDisplayQrPayload || '').trim()
  }, [liveKbankQrPayload, customerDisplayQrPayload])
  const effectiveCustomerDisplayQrType = useMemo<'THAI_QR' | 'CREDIT_CARD'>(() => {
    if (String(liveKbankQrPayload || '').trim()) return liveKbankQrType
    const draftType = String(customerDisplayPaymentDraft?.paymentQrType || '').trim().toUpperCase()
    return draftType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR'
  }, [liveKbankQrPayload, liveKbankQrType, customerDisplayPaymentDraft?.paymentQrType])

  const staffKbankQrTypeLabel = useMemo(() => {
    const fromBank =
      liveKbankQrTypeSource === 'bank_qr_type' ||
      liveKbankQrTypeSource === 'bank_sof' ||
      liveKbankQrTypeSource === 'emv_payload'
    if (effectiveCustomerDisplayQrType === 'CREDIT_CARD') {
      return fromBank
        ? t('posKbankQrTypeCreditFromBank') || 'Credit Card QR (from bank)'
        : t('posKbankQrTypeCreditRequested') || 'Credit Card QR (requested · bank type not returned)'
    }
    return fromBank
      ? t('posKbankQrTypeThaiFromBank') || 'Thai QR · PromptPay (from bank)'
      : t('posKbankQrTypeThaiRequested') || 'Thai QR · PromptPay (requested)'
  }, [effectiveCustomerDisplayQrType, liveKbankQrTypeSource, t])

  useEffect(() => {
    if (String(liveKbankQrPayload || '').trim()) return
    setLiveKbankQrAmount(0)
  }, [liveKbankQrPayload])

  const schedulePostPaymentCustomerQr = useCallback(() => {
    const q = String(effectiveCustomerDisplayQrPayload || '').trim()
    if (!q) return
    const until = Date.now() + 16000
    if (dualMonitorEnabled) {
      setPostPaymentQrUntil(until)
    }
    window.setTimeout(() => {
      if (!dualMonitorEnabled) {
        setLiveKbankQrPayload('')
        setLiveKbankQrType('THAI_QR')
        return
      }
      setPostPaymentQrUntil((prev) => {
        if (prev === until) {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
        }
        return prev === until ? 0 : prev
      })
    }, 16000)
  }, [dualMonitorEnabled, effectiveCustomerDisplayQrPayload])

  const customerDisplayUiLang = useMemo<LangCode>(() => {
    if (customerDisplayLangMode === 'custom' && isLangCode(customerDisplayLangOverride)) {
      return customerDisplayLangOverride
    }
    return lang
  }, [customerDisplayLangMode, customerDisplayLangOverride, lang])
  const customerDisplayT = useT(customerDisplayUiLang)

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
      uiLang: customerDisplayUiLang,
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
    const showPostPayQr = postPaymentQrUntil > now && String(effectiveCustomerDisplayQrPayload || '').trim().length > 0

    const payload: PosCustomerDisplayPayload = showPostPayQr
      ? {
          ...base,
          kind: 'qr',
          title: customerDisplayT('posCustomerThankYou') || '감사합니다',
          message: customerDisplayT('posCustomerPostPaymentQrHint') || '아래 QR을 이용해 주세요.',
          qrPayload: effectiveCustomerDisplayQrPayload,
          qrType: effectiveCustomerDisplayQrType,
        }
      : hasPendingPaymentFlow
        ? {
            ...base,
            kind: 'payment',
            title: customerDisplayT('posCustomerPayment') || '결제 진행 중',
            message: customerDisplayPaymentMessage || undefined,
            items: customerDisplayOrderItems,
            totalAmount: customerDisplayBreakdown.total,
            breakdown: customerDisplayBreakdown,
            paymentLines: buildCustomerDisplayPaymentLines(customerDisplayPaymentDraft, customerDisplayT),
          }
        : customerDisplayOrderItems.length > 0
          ? {
              ...base,
              kind: 'ordering',
              title: customerDisplayT('posCustomerOrdering') || '주문 확인',
              items: customerDisplayOrderItems,
              totalAmount: customerDisplayOrderTotal,
            }
          : customerDisplayDefaultState === 'qr'
            ? {
                ...base,
                kind: 'qr',
                title: customerDisplayT('posCustomerQrTitle') || 'QR 코드',
                qrPayload: effectiveCustomerDisplayQrPayload,
                qrType: effectiveCustomerDisplayQrType,
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
    customerDisplayLangMode,
    customerDisplayLangOverride,
    customerDisplayPaymentMessage,
    customerDisplayOrderTotal,
    customerDisplayBreakdown,
    customerDisplayOrderItems,
    customerDisplayDefaultState,
    customerDisplayQrPayload,
    liveKbankQrPayload,
    effectiveCustomerDisplayQrPayload,
    effectiveCustomerDisplayQrType,
    customerDisplayIdleMessage,
    customerDisplayIdleMediaType,
    customerDisplayIdleMediaUrl,
    receiptLogoImageUrl,
    postPaymentQrUntil,
    customerDisplayPaymentDraft,
    customerDisplayT,
    customerDisplayUiLang,
  ])

  useEffect(() => {
    if (activeTab === 'tables' && !selectedTableId) {
      clearCartFromTerminal()
    }
  }, [activeTab, selectedTableId, clearCartFromTerminal])

  const hasInitializedMainPosPollRef = useRef(false)
  const lastSeenOrderIdRef = useRef<number>(0)
  const lastSeenOrderIdPersistedRef = useRef<number>(0)
  const startupCatchupUntilRef = useRef<number>(Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS)
  const prevStoreForPollRef = useRef<string | null>(null)
  const triggerMainPosPollNowRef = useRef<(() => void) | null>(null)
  const mainPosPollInFlightRef = useRef(false)
  const lastMetaScanAtRef = useRef(0)
  const lastRealtimeOrderEventAtRef = useRef(0)
  const realtimeChannelStateRef = useRef<Map<string, PosRealtimeSubscribeStatus>>(new Map())
  const realtimeChannelHealthyRef = useRef(false)
  const pendingEmptyItemsOrderIdsRef = useRef<Set<number>>(new Set())
  const mainPosPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeResubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [realtimeResubscribeTick, setRealtimeResubscribeTick] = useState(0)

  const recomputeRealtimeChannelHealthy = useCallback(() => {
    const states = [...realtimeChannelStateRef.current.values()]
    if (!states.length) {
      realtimeChannelHealthyRef.current = false
      return
    }
    realtimeChannelHealthyRef.current =
      states.some((s) => s === 'SUBSCRIBED') &&
      !states.some((s) => s === 'CHANNEL_ERROR' || s === 'TIMED_OUT')
  }, [])

  const scheduleRealtimeResubscribe = useCallback(() => {
    if (realtimeResubscribeTimerRef.current) clearTimeout(realtimeResubscribeTimerRef.current)
    realtimeResubscribeTimerRef.current = setTimeout(() => {
      realtimeChannelStateRef.current.clear()
      realtimeChannelHealthyRef.current = false
      setRealtimeResubscribeTick((n) => n + 1)
    }, 3000)
  }, [])

  useEffect(() => {
    recomputeRealtimeChannelHealthyRef.current = recomputeRealtimeChannelHealthy
  }, [recomputeRealtimeChannelHealthy])

  useEffect(() => {
    scheduleRealtimeResubscribeRef.current = scheduleRealtimeResubscribe
  }, [scheduleRealtimeResubscribe])

  const bumpLastSeenOrderId = useCallback(
    (orderIdRaw: unknown) => {
      const orderId = Number(orderIdRaw)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      const next = Math.trunc(orderId)
      if (next > lastSeenOrderIdRef.current) {
        lastSeenOrderIdRef.current = next
      }
      if (next > lastSeenOrderIdPersistedRef.current) {
        lastSeenOrderIdPersistedRef.current = next
      }
      if (currentStoreId) {
        writeMainPosLastSeenOrderId(currentStoreId, next)
      }
    },
    [currentStoreId]
  )

  const shouldTreatAsIncomingOrder = useCallback(
    (orderIdRaw: unknown, createdAtRaw: unknown) => {
      const orderId = Number(orderIdRaw)
      if (!Number.isFinite(orderId) || orderId <= 0) return false
      if (isSessionNewOrder(createdAtRaw, posSessionStartedAtRef.current)) return true
      if (Date.now() > startupCatchupUntilRef.current) return false
      if (orderId <= lastSeenOrderIdPersistedRef.current) return false
      const createdAtMs = new Date(String(createdAtRaw ?? '').trim()).getTime()
      if (!Number.isFinite(createdAtMs)) return true
      return createdAtMs >= posSessionStartedAtRef.current - MAIN_POS_STARTUP_CATCHUP_WINDOW_MS
    },
    []
  )

  const resolveOrderItemDisplayName = useCallback(
    (item: { id?: string; name?: string; menuId?: string; promoId?: string; promoCode?: string }) => {
      const rawName = String(item.name ?? '').trim()
      // Grab 세트 자식 표식([[...]] child)은 영수증 병합 단계에서 필요하므로 원문 유지
      if (parseGrabSetChildLineName(rawName)) return rawName
      return resolvePosOrderItemMenuDisplayName(
        {
          id: String(item.id ?? ''),
          name: rawName,
          ...(String(item.menuId ?? '').trim() ? { menuId: String(item.menuId).trim() } : {}),
          ...(String(item.promoId ?? '').trim() ? { promoId: String(item.promoId).trim() } : {}),
          ...(String(item.promoCode ?? '').trim() ? { promoCode: String(item.promoCode).trim() } : {}),
        },
        menus,
        promosWithItems
      )
    },
    [menus, promosWithItems]
  )

  type RealtimeParsedPosOrderItem = {
    id: string
    name: string
    price: number
    qty: number
    note?: string
    menuId?: string
    optionCode?: string
    promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  }

  const parseRealtimePosOrderRowItemsJson = useCallback(
    (row: Record<string, unknown>): { ok: true; items: RealtimeParsedPosOrderItem[] } | { ok: false } => {
      try {
        const raw = row.items_json
        const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
        const items = (Array.isArray(arr) ? arr : []).map(
          (it: {
            id?: string
            name?: string
            price?: number
            qty?: number
            quantity?: number
            note?: string
            menuId1?: string
            menu_id1?: string
            menuId?: string
            optionCode1?: string
            option_code1?: string
            optionCode?: string
            promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
          }) => {
            const note = String(it.note ?? '').trim()
            const menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? '').trim()
            const optionCode = String(it.optionCode1 ?? it.option_code1 ?? it.optionCode ?? '').trim()
            const displayName = resolveOrderItemDisplayName({
              id: String(it.id ?? ''),
              name: String(it.name ?? ''),
              menuId,
            })
            return {
              id: String(it.id ?? ''),
              name: displayName,
              price: Number(it.price ?? 0),
              qty: Number(it.qty ?? it.quantity ?? 1),
              ...(menuId ? { menuId } : {}),
              ...(optionCode ? { optionCode } : {}),
              ...(note ? { note } : {}),
              ...(Array.isArray(it.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(it.promoItems) } : {}),
            }
          }
        )
        return { ok: true, items }
      } catch {
        return { ok: false }
      }
    },
    [enrichPromoItemsWithOptionName, resolveOrderItemDisplayName]
  )

  const resolveDineInSnapshotItemKey = useCallback(
    (item: {
      id?: unknown
      name?: unknown
      price?: unknown
      note?: unknown
      menuId?: unknown
      optionCode?: unknown
    }): string => {
      const id = normalizeCartLineIdForSave(item.id)
      if (id) return id
      const name = String(item.name ?? '').trim()
      const price = Number(item.price ?? 0) || 0
      const note = formatLineNoteForPrint(String(item.note ?? '').trim())
      const menuId = String(item.menuId ?? '').trim()
      const optionCode = String(item.optionCode ?? '').trim()
      return `sig:${name}\u001f${price}\u001f${menuId}\u001f${optionCode}\u001f${note}`
    },
    []
  )

  const buildDineInQtySnapshot = useCallback(
    (
      items: Array<{
        id?: unknown
        qty?: unknown
        quantity?: unknown
        name?: unknown
        price?: unknown
        note?: unknown
        menuId?: unknown
        optionCode?: unknown
      }>
    ): Map<string, number> => {
      const map = new Map<string, number>()
      for (const it of items) {
        const key = resolveDineInSnapshotItemKey(it)
        if (!key) continue
        const qty = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
        map.set(key, (map.get(key) ?? 0) + qty)
      }
      return map
    },
    [resolveDineInSnapshotItemKey]
  )

  async function printReceiptNow(
    payload: {
      orderNo: string
      storeCode: string
      orderType: string
      tableName?: string
      memo?: string
      items: {
        id: string
        name: string
        price: number
        qty: number
        note?: string
        isAddon?: boolean
        menuId?: string
        promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
      }[]
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
      guestCount?: number
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
    if (posDemoRef.current) return
    const showPrintButtonInReceipt = (existingWindow != null || fromUserGesture) && !directPrint
    type ReceiptPrintItem = (typeof payload)['items'][number]
    const mergedForReceipt = (() => {
      const base = payload.items ?? []
      const hasSetChild = base.some((it) => parseGrabSetChildLineName(String(it.name ?? '')))
      if (!hasSetChild) return base
      return mergeGrabSetChildLinesIntoPromoParents(
        base as Parameters<typeof mergeGrabSetChildLinesIntoPromoParents>[0],
        grabCatalogForPrint
      ) as ReceiptPrintItem[]
    })()
    const enrichedForReceipt: ReceiptPrintItem[] = enrichPosOrderLikeItemsWithPromoSnapshot(
      mergedForReceipt,
      posReceiptLineOpts
    )
      .filter((it) => !(it as { grabSetChild?: boolean }).grabSetChild)
      .map((it) => {
        const promoItems = Array.isArray(it.promoItems)
          ? enrichPromoItemsWithOptionName(
              it.promoItems as {
                menuId: string
                optionId: string | null
                optionCode?: string | null
                quantity: number
              }[]
            )
          : undefined
        return {
          ...it,
          note:
            formatLineNoteForPrint(String(it.note ?? '')) ||
            inferDefaultSizeLabelForLine({
              menuId: String((it as { menuId?: string }).menuId ?? ''),
              id: String((it as { id?: string }).id ?? ''),
              name: String((it as { name?: string }).name ?? ''),
              note: String((it as { note?: string }).note ?? ''),
            }),
          ...(promoItems ? { promoItems } : {}),
        }
      })
    logPosPrintDebug('receipt_print_item_resolution', {
      orderNo: payload.orderNo,
      storeCode: payload.storeCode,
      beforeCount: mergedForReceipt.length,
      afterCount: enrichedForReceipt.length,
      items: enrichedForReceipt.slice(0, 30).map((it) => {
        const raw = it as {
          id?: string
          name?: string
          menuId?: string
          note?: string
          promoId?: string
          promoCode?: string
          promoItems?: unknown[]
        }
        return {
          id: String(raw.id ?? ''),
          name: String(raw.name ?? ''),
          menuId: String(raw.menuId ?? ''),
          promoId: String(raw.promoId ?? ''),
          promoCode: String(raw.promoCode ?? ''),
          promoItemsCount: Array.isArray(raw.promoItems) ? raw.promoItems.length : 0,
          note: String(raw.note ?? ''),
        }
      }),
      mergedSource: mergedForReceipt.slice(0, 30).map((it) => {
        const raw = it as {
          id?: string
          name?: string
          menuId?: string
          note?: string
          promoId?: string
          promoCode?: string
          promoItems?: unknown[]
          grabSetChild?: boolean
        }
        return {
          id: String(raw.id ?? ''),
          name: String(raw.name ?? ''),
          menuId: String(raw.menuId ?? ''),
          promoId: String(raw.promoId ?? ''),
          promoCode: String(raw.promoCode ?? ''),
          promoItemsCount: Array.isArray(raw.promoItems) ? raw.promoItems.length : 0,
          note: String(raw.note ?? ''),
          grabSetChild: Boolean(raw.grabSetChild),
        }
      }),
    })
    const payloadForPrint = {
      ...payload,
      items: enrichedForReceipt,
    }
    let receiptHtml = buildPosHallOrderReceiptDocumentHtml({
      payload: payloadForPrint,
      t: tPrint,
      lang: printLang,
      resolveOrderItemDisplayName: (it) =>
        resolveOrderItemDisplayName({
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId: String((it as { menuId?: string }).menuId ?? ''),
          promoId: String((it as { promoId?: string }).promoId ?? ''),
          promoCode: String((it as { promoCode?: string }).promoCode ?? ''),
        }),
      menuNameById: (menuId: string) =>
        menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
      menuCodeByMenuId: Object.fromEntries(
        menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
      ),
      optionNameByCode,
    })
    const printButtonLabel = (tPrint('posPrint') || tPrint('btn_print') || '인쇄')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    if (showPrintButtonInReceipt) {
      const footerButton =
        '<div class="receipt-print-actions"><button type="button" onclick="window.print();" style="padding:8px 20px;font-size:14px;cursor:pointer;border:1px solid #000;background:#fff;color:#000;">' +
        printButtonLabel +
        '</button></div>'
      receiptHtml = receiptHtml.replace('</body>', footerButton + '</body>')
    }

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
              const postReceiptDelayMs =
                typeof window !== 'undefined' && window.cmPosShell
                  ? resolveAfterReceiptToKitchenDelayMs()
                  : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
              window.setTimeout(onAfterDirectPrint, postReceiptDelayMs)
            },
          }
        : {}),
    })
  }

  /** 전체 취소 직후: void 영수증 자동 인쇄(결제 있으면 결제 영수증, 없으면 홀 주문표) */
  async function runAfterFullOrderCancelVoidReceiptPrint(orderId: number) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    try {
      const list = await getPosOrders({ orderId, storeCode: currentStoreId, strictStore: true })
      const po = list?.[0] as PosOrder | undefined
      if (!po?.items?.length) return

      const settings = await getPrinterSettingsForStore(currentStoreId)
      const paymentSum = posOrderPaymentSum(po)
      const orderTypeLabelMap = {
        dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
        takeout: tPrint('posOrderTypeTakeout') ?? '포장',
        delivery: tPrint('posOrderTypeDelivery') ?? '배달',
      }

      if (paymentSum > 0.005) {
        const voidBase = receiptModalDataForVoidReceipt(po, posReceiptLineOpts)
        const receiptData = {
          ...voidBase,
          items: enrichReceiptModalItemsForPromoDisplay(voidBase.items, posReceiptLineOpts),
        }
        const receiptHtml = buildPosPaymentReceiptDocumentHtml({
          receiptData,
          menus,
          orderTypeLabels: orderTypeLabelMap,
          t: tPrint,
          lang: printLang,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          printerSettings: settings,
          forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(currentStoreId),
        })
        printPosHtmlDocument(receiptHtml, {
          title: tPrint('posReceipt') || '영수증',
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
        return
      }

      const channel = normalizePosOrderTypeKey(po.orderType ?? 'dine_in')
      const orderTypeLabel =
        channel === 'delivery'
          ? orderTypeLabelMap.delivery
          : channel === 'takeout'
            ? orderTypeLabelMap.takeout
            : orderTypeLabelMap.dine_in
      const subtotal = Math.max(0, Number(po.subtotal ?? 0) || 0)
      const discountAmt = Math.max(0, Number(po.discountAmt ?? 0) || 0)
      const pricing = computePosPricing({
        subtotal,
        discountAmt,
        cardPaymentAmount: Math.max(0, Number(po.paymentCard ?? 0) || 0),
        adjustments: pricingAdjustments,
      })
      const receiptPrintItems = (po.items || []).map((it) => {
        const row = it as PosOrderItem
        const menuId = String(row.menuId1 ?? row.menuId2 ?? '').trim()
        const displayName = resolveOrderItemDisplayName({
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId,
        })
        const note = String(it.note ?? '').trim()
        return {
          id: String(it.id ?? ''),
          name: displayName,
          price: negatePosReceiptMoney(Number(it.price ?? 0)),
          qty: Math.max(1, Number(it.qty ?? 1) || 1),
          ...(note ? { note } : {}),
          ...(Array.isArray(row.promoItems) && row.promoItems.length > 0
            ? { promoItems: enrichPromoItemsWithOptionName(row.promoItems) }
            : {}),
        }
      })
      const hallHtml = buildPosHallOrderReceiptDocumentHtml({
        payload: {
          orderNo: String(po.orderNo ?? '').trim(),
          storeCode: currentStoreId,
          orderType: orderTypeLabel,
          tableName: String(po.tableName ?? '').trim(),
          memo: String(po.memo ?? ''),
          items: receiptPrintItems,
          subtotal: negatePosReceiptMoney(subtotal),
          discountAmt,
          total: negatePosReceiptMoney(pricing.finalTotal),
          vatFeeAmt: pricing.vatFeeAmt,
          vatFeeMode: pricing.vatFeeMode,
          ...receiptTaxDisplayFieldsFromPricing(pricing),
          serviceFeeAmt: pricing.serviceFeeAmt,
          serviceFeeMode: pricing.serviceFeeMode,
          cardFeeAmt: pricing.cardFeeAmt,
          cardFeeMode: pricing.cardFeeMode,
          otherFeeAmt: pricing.otherFeeAmt,
          otherFeeMode: pricing.otherFeeMode,
          ...posGuestCountSpread(po.guestCount),
          voidReceiptMode: true,
        },
        t: tPrint,
        lang: printLang,
        resolveOrderItemDisplayName: (it) =>
          resolveOrderItemDisplayName({
            id: String(it.id ?? ''),
            name: String(it.name ?? ''),
            menuId: String((it as { menuId?: string }).menuId ?? ''),
            promoId: String((it as { promoId?: string }).promoId ?? ''),
            promoCode: String((it as { promoCode?: string }).promoCode ?? ''),
          }),
        menuNameById: (menuId: string) =>
          menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
        menuCodeByMenuId: Object.fromEntries(
          menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
        ),
        optionNameByCode,
      })
      printPosHtmlDocument(hallHtml, {
        title: tPrint('posReceipt') || '영수증',
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        focusIframeBeforePrint: false,
        printRole: 'receipt',
        printReceiptKind: 'hall_order',
        escPosCutOverride: resolveEscPosCutOverride(settings, {
          printRole: 'receipt',
          printReceiptKind: 'hall_order',
        }),
        onPrintUnavailable: () => {
          void appAlert(t('posPrintUnavailable'))
        },
      })
    } catch (e) {
      console.error('Void receipt print (full cancel):', e)
    }
  }

  /** 전체 취소 직후: 주방에 취소 줄(`-`)만 인쇄(프린터 설정 `autoPrintKitchenSlipOnOrder` 따름) */
  async function runAfterFullOrderCancelKitchenPrints(
    orderId: number,
    channel: 'dine_in' | 'takeout' | 'delivery',
    detail: PosKitchenReprintPayload
  ) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    if (!autoPrintKitchenSlipOnOrder) return
    const lines = detail.removedKitchenLines
    if (!lines?.length) return

    const orderNoStr = String(detail.orderNoForPrint ?? orderId).trim()
    const tableName = String(detail.tableName ?? '').trim()
    const memo = String(detail.memo ?? '')

    const kitchenPrintKey = `order:${orderId}:kitchen:full:${Date.now()}`
    const runKitchenFullCancel = () => {
      if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
      void getPrinterSettingsForStore(currentStoreId)
        .then((settings) => {
          const ki = kitchenSlipPrintI18n(settings, lang)
          const slips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(lines as Record<string, unknown>[]) as typeof lines,
            buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
          )
          if (!slips.length) return
          const slipDesign = resolveKitchenSlipDesign(settings)
          const kitchenMemo = parsePosOrderMemo(memo).plainMemo
          const memoLine = kitchenMemo.trim()
            ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
            : ''
          const orderTypeLabelSlip =
            ki.orderTypeLabels[normalizePosOrderTypeKey(channel)] || channel
          const tablePartR = tableName
            ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
            : ''
          const fullBannerText = (
            tPrint('posKitchenFullCancelBanner') ||
            ki.t('posKitchenFullCancelBanner') ||
            'Order fully cancelled'
          ).trim()
          const fullHead =
            '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000;white-space:pre-line">' +
            escapeHtml(fullBannerText) +
            '</div>'
          const printOne = (idx: number) => {
            if (idx >= slips.length) return
            const slip = slips[idx]
            const html = buildKitchenSlipDocumentHtml({
              label: slip.label,
              orderNo: orderNoStr,
              storeCode: currentStoreId,
              orderTypeLabel: orderTypeLabelSlip,
              tablePart: tablePartR,
              dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
              items: kitchenSlipItemsForPrint(
                slip.items,
                kitchenItemsWithResolvedPromo(lines as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                ki
              ).map((row) => ({ ...row, cancelled: true })),
              memoLine: memoLine || null,
              escapeHtml,
              design: slipDesign,
              optionNameByCode,
              printColorAdjust: 'exact',
              prependItemsHtml: idx === 0 ? fullHead : '',
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
                  setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
              },
            })
          }
          setTimeout(() => printOne(0), 0)
        })
        .catch((e) => console.error('Kitchen slip print (full cancel):', e))
    }
    setTimeout(runKitchenFullCancel, 0)
    void runAfterFullOrderCancelVoidReceiptPrint(orderId)
  }

  /** 일부 취소(updatePosOrder) 직후: DB 기준 스냅샷으로 홀 주문표·주방 재인쇄(매장 프린터 설정 따름) */
  async function runAfterPartialLineCancelPrints(
    orderId: number,
    channel: 'dine_in' | 'takeout' | 'delivery',
    kitchenDetail?: PosKitchenReprintPayload,
    opts?: { skipKitchen?: boolean }
  ) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    const list = await getPosOrders({ orderId, storeCode: currentStoreId, strictStore: true })
    const po = list?.[0] as PosOrder | undefined
    if (!po?.items?.length) return

    const orderNoStr = String(po.orderNo ?? '').trim()
    const tableName = String(po.tableName ?? '').trim()
    const memo = String(po.memo ?? '')
    const discountAmt = Math.max(0, Number(po.discountAmt ?? 0) || 0)
    const couponDiscountAmt = Math.max(0, Number(po.couponDiscountAmt ?? 0) || 0)
    const subtotal = Math.max(0, Number(po.subtotal ?? 0) || 0)
    const pricing = computePosPricing({
      subtotal,
      discountAmt,
      cardPaymentAmount: Math.max(0, Number(po.paymentCard ?? 0) || 0),
      adjustments: pricingAdjustments,
    })

    type ReceiptPrintLine = {
      id: string
      name: string
      price: number
      qty: number
      note?: string
      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
    }
    const receiptPrintItems: ReceiptPrintLine[] = (po.items || []).map((it) => {
      const row = it as PosOrderItem
      const menuId = String(row.menuId1 ?? row.menuId2 ?? '').trim()
      const displayName = resolveOrderItemDisplayName({
        id: String(it.id ?? ''),
        name: String(it.name ?? ''),
        menuId,
      })
      const note = String(it.note ?? '').trim()
      return {
        id: String(it.id ?? ''),
        name: displayName,
        price: Number(it.price ?? 0),
        qty: Math.max(1, Number(it.qty ?? 1) || 1),
        ...(note ? { note } : {}),
        ...(Array.isArray(row.promoItems) && row.promoItems.length > 0
          ? { promoItems: enrichPromoItemsWithOptionName(row.promoItems) }
          : {}),
      }
    })

    const orderTypeLabel =
      channel === 'dine_in'
        ? t('posOrderTypeDineIn') ?? '매장'
        : channel === 'takeout'
          ? t('posOrderTypeTakeout') ?? '포장'
          : t('posOrderTypeDelivery') ?? '배달'

    const receiptPayload = {
      orderNo: orderNoStr,
      storeCode: currentStoreId,
      orderType: orderTypeLabel,
      tableName,
      memo,
      items: receiptPrintItems,
      subtotal,
      discountAmt,
      couponDiscountAmt,
      discountReason: String(po.discountReason ?? '').trim() || undefined,
      total: pricing.finalTotal,
      vatFeeAmt: pricing.vatFeeAmt,
      vatFeeMode: pricing.vatFeeMode,
      ...receiptTaxDisplayFieldsFromPricing(pricing),
      serviceFeeAmt: pricing.serviceFeeAmt,
      serviceFeeMode: pricing.serviceFeeMode,
      cardFeeAmt: pricing.cardFeeAmt,
      cardFeeMode: pricing.cardFeeMode,
      otherFeeAmt: pricing.otherFeeAmt,
      otherFeeMode: pricing.otherFeeMode,
      ...posGuestCountSpread(po.guestCount),
    }

    const printHallOrderSheet =
      autoPrintReceiptOnOrder || autoPrintReceiptOnAddOrder || autoPrintFinalOrderBeforePayment

    const kitchenPrintKey = `order:${orderId}:kitchen:partial:${Date.now()}`
    const runKitchenPartialReprint = () => {
      if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
      const itemsForKitchen = (po.items || []).map((it) => {
        const line = it as PosOrderItem & {
          menu_id1?: string
        }
        const menuId = String(line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? '').trim()
        const note = String(line.note ?? '').trim()
        return {
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          price: Number(it.price ?? 0),
          qty: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }),
          ...(menuId ? { menuId } : {}),
          ...(note ? { note } : {}),
          ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
        }
      })
      void getPrinterSettingsForStore(currentStoreId)
        .then((settings) => {
          const ki = kitchenSlipPrintI18n(settings, lang)
          const groupOpts = buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
          const removedLines = kitchenDetail?.removedKitchenLines ?? []
          const cancelledSlips = removedLines.length
            ? buildKitchenSlipGroups(
                kitchenItemsWithResolvedPromo(removedLines as Record<string, unknown>[]) as typeof removedLines,
                groupOpts
              )
            : []
          const activeSlips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
            groupOpts
          )
          const slips = mergeKitchenSlipGroupsCancelledFirst(cancelledSlips, activeSlips)
          if (!slips.length) return
          const slipDesign = resolveKitchenSlipDesign(settings)
          const kitchenMemo = parsePosOrderMemo(memo).plainMemo
          const memoLine = kitchenMemo.trim()
            ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
            : ''
          const otKey = normalizePosOrderTypeKey(po.orderType ?? channel)
          const orderTypeLabelSlip = ki.orderTypeLabels[otKey] || orderTypeLabel
          const tablePartR = tableName
            ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
            : ''
          const partialBannerText = (
            tPrint('posKitchenPartialReprintBanner') ||
            ki.t('posKitchenPartialReprintBanner') ||
            'Order updated (partial cancel)'
          ).trim()
          const partialHead =
            '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000;white-space:pre-line">' +
            escapeHtml(partialBannerText) +
            '</div>'
          const printOne = (idx: number) => {
            if (idx >= slips.length) return
            const slip = slips[idx]
            const html = buildKitchenSlipDocumentHtml({
              label: slip.label,
              orderNo: orderNoStr,
              storeCode: currentStoreId,
              orderTypeLabel: orderTypeLabelSlip,
              tablePart: tablePartR,
              dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
              items: kitchenSlipItemsForPrint(
                slip.items,
                kitchenItemsWithResolvedPromo(
                  itemsForKitchen as Record<string, unknown>[]
                ) as KitchenSlipRoutingItem[],
                ki
              ),
              memoLine: memoLine || null,
              escapeHtml,
              design: slipDesign,
              optionNameByCode,
              printColorAdjust: 'exact',
              prependItemsHtml: idx === 0 ? partialHead : '',
              ...posKitchenGuestSpread(po.guestCount, ki.t('posOrderGuestCount')),
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
                  setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
              },
            })
          }
          setTimeout(() => printOne(0), 0)
        })
        .catch((e) => console.error('Kitchen slip print (partial cancel):', e))
    }

    try {
      const skipKitchen = opts?.skipKitchen === true
      if (printHallOrderSheet && !skipKitchen && autoPrintKitchenSlipOnOrder && receiptPrintItems.length > 0) {
        await printReceiptNow(receiptPayload, null, false, undefined, true, runKitchenPartialReprint)
      } else if (printHallOrderSheet) {
        await printReceiptNow(receiptPayload, null, false, undefined, true)
      } else if (!skipKitchen && autoPrintKitchenSlipOnOrder && receiptPrintItems.length > 0) {
        setTimeout(runKitchenPartialReprint, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
    } catch (e) {
      console.error('runAfterPartialLineCancelPrints:', e)
    }
  }

  /** 테이블 이동·합석 직후: 갱신된 테이블 번호·품목으로 홀 주문서만 재인쇄 */
  async function runAfterTableTransferHallReprint(keepOrderId: number) {
    await runAfterPartialLineCancelPrints(keepOrderId, 'dine_in', undefined, { skipKitchen: true })
  }

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!shouldTreatAsIncomingOrder(orderId, row.created_at)) {
        logPosPrintDebug('realtime_insert_skip_not_incoming', {
          orderId,
          createdAt: String(row.created_at ?? ''),
        })
        return
      }
      const rowStore = String(row.store_code ?? '').trim()
      const variants = currentStoreCodeVariants
      if (!rowStore) {
        logPosPrintDebug('realtime_insert_skip_no_store', { orderId })
        return
      }
      if (!variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))) {
        logPosPrintDebug('realtime_insert_skip_store_mismatch', { orderId, rowStore, variants })
        return
      }
      if (consumeSuppressMainPosAutoPrintForQueuedSync(orderId)) {
        seenOrderIdsRef.current.add(orderId)
        bumpLastSeenOrderId(orderId)
        logPosPrintDebug('realtime_insert_suppress_queued_sync', { orderId })
        return
      }
      if (seenOrderIdsRef.current.has(orderId)) {
        logPosPrintDebug('realtime_insert_skip_seen', { orderId })
        return
      }
      const parsedItems = parseRealtimePosOrderRowItemsJson(row)
      if (!parsedItems.ok) {
        logPosPrintDebug('realtime_insert_skip_items_parse_error', { orderId })
        return
      }
      const items = parsedItems.items
      /* items_json이 Realtime에 비어 있으면 폴링이 다시 잡도록 seen에 넣지 않음 */
      if (items.length === 0) {
        pendingEmptyItemsOrderIdsRef.current.add(orderId)
        logPosPrintDebug('realtime_insert_skip_empty_items', { orderId })
        triggerMainPosPollNowRef.current?.()
        return
      }
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      seenOrderIdsRef.current.add(orderId)
      bumpLastSeenOrderId(orderId)
      autoFocusIncomingDeliveryOrder({
        orderId,
        orderType: String(row.order_type ?? ''),
        deliveryAppCode: String(row.delivery_app_code ?? ''),
        status: String(row.status ?? ''),
        createdAt: String(row.created_at ?? ''),
        storeCode: String(row.store_code ?? ''),
        memo: String(row.memo ?? ''),
      })
      // 주문 바/배달 목록은 usePosStore 스냅샷을 사용하므로, 신규 주문 수신 시 즉시 갱신합니다.
      refetchCurrentStore()
      const storeCode = String(row.store_code ?? currentStoreId)
      const orderNo = String(row.order_no ?? '')
      const orderType = String(row.order_type ?? 'dine_in')
      if (orderType.trim().toLowerCase() === 'dine_in') {
        const snap = buildDineInQtySnapshot(items)
        if (snap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, snap)
      }
      const tableName = String(row.table_name ?? '')
      const memo = String(row.memo ?? '')
      const subtotal = Number(row.subtotal ?? 0)
      const discountAmt = Number(row.discount_amt ?? 0)
      const couponDiscountAmt = Number(row.coupon_discount_amt ?? 0)
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
        couponDiscountAmt,
        discountReason: String(row.discount_reason ?? '').trim() || undefined,
        total,
        ...posGuestCountSpread(row.guest_count),
      }
      const runKitchenFromRealtimeOrderInsert = () => {
        if (!reserveKitchenAutoPrintKey(`order:${orderId}:kitchen`)) return
        const printSettingsStoreCode = String(currentStoreId || storeCode || '').trim()
        getPrinterSettingsForStore(printSettingsStoreCode)
          .then((settings) => {
            const ki = kitchenSlipPrintI18n(settings, lang)
            const slips = buildKitchenSlipGroups(
              kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as typeof items,
              buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
            )
            if (!slips.length) return
            const slipDesign = resolveKitchenSlipDesign(settings)
            const kitchenMemo = parsePosOrderMemo(memo).plainMemo
            const memoLine = kitchenMemo.trim()
              ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
              : ''
            const printOne = (idx: number) => {
              if (idx >= slips.length) return
              const slip = slips[idx]
              const tablePartR = tableName
                ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
                : ''
              const html = buildKitchenSlipDocumentHtml({
                label: slip.label,
                orderNo,
                storeCode,
                orderTypeLabel: ki.orderTypeLabels[normalizePosOrderTypeKey(orderType)] || orderType,
                tablePart: tablePartR,
                dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                items: kitchenSlipItemsForPrint(
                  slip.items,
                  kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                  ki
                ),
                memoLine: memoLine || null,
                escapeHtml,
                design: slipDesign,
                optionNameByCode,
                printColorAdjust: 'exact',
                ...posKitchenGuestSpread(row.guest_count, ki.t('posOrderGuestCount')),
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
                    setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                },
              })
            }
            setTimeout(() => printOne(0), 0)
          })
          .catch((e) => console.error('Kitchen slip print:', e))
      }
      const isPendingDelivery =
        String(orderType).trim().toLowerCase() === 'delivery' &&
        String(row.status ?? '').trim().toLowerCase() === 'pending'
      const shouldWaitForDeliveryAccept =
        isPendingDelivery && isApiInboundDeliveryOrderMemo(String(memo ?? ''))
      if (!shouldWaitForDeliveryAccept) {
        logPosPrintDebug('realtime_insert_autoprint_start', {
          orderId,
          autoPrintReceiptOnOrder,
          autoPrintKitchenSlipOnOrder,
          itemCount: items.length,
          isPendingDelivery,
          shouldWaitForDeliveryAccept,
        })
        if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
          printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true, runKitchenFromRealtimeOrderInsert)
        } else if (autoPrintReceiptOnOrder) {
          printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true)
        } else if (autoPrintKitchenSlipOnOrder) {
          setTimeout(runKitchenFromRealtimeOrderInsert, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
        }
      } else {
        logPosPrintDebug('realtime_insert_pending_delivery_wait_accept', {
          orderId,
          status: String(row.status ?? ''),
          isInboundDeliveryOrder: isApiInboundDeliveryOrderMemo(String(memo ?? '')),
        })
      }
      if (autoPrintReceiptOnPayment) {
        const st = String(row.status ?? '').toLowerCase()
        const paySum = posOrderRowPaymentSum(row)
        if (isPosOrderPaidLikeStatus(st) && paySum > 0 && !printedPaymentReceiptIdsRef.current.has(orderId)) {
          printedPaymentReceiptIdsRef.current.add(orderId)
          void getPosOrders({ orderId, storeCode: currentStoreId, strictStore: true })
            .then((list) => {
              const order = list[0] as PosOrder | undefined
              if (!order?.items?.length) {
                printedPaymentReceiptIdsRef.current.delete(orderId)
                return
              }
              if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
                printedPaymentReceiptIdsRef.current.delete(orderId)
                return
              }
              setReceiptData(receiptModalDataFromPosOrderForPayment(order, pricingAdjustments, posReceiptLineOpts))
            })
            .catch(() => {
              printedPaymentReceiptIdsRef.current.delete(orderId)
            })
        }
      }
    }
    const onUpdatePendingItems = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      if (!pendingEmptyItemsOrderIdsRef.current.has(orderId)) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return
      const parsed = parseRealtimePosOrderRowItemsJson(row)
      if (!parsed.ok || parsed.items.length === 0) return
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      logPosPrintDebug('realtime_update_items_filled', { orderId })
      triggerMainPosPollNowRef.current?.()
    }

    realtimeChannelStateRef.current.clear()
    realtimeChannelHealthyRef.current = false
    const channels = currentStoreCodeVariants.flatMap((storeCode) => {
      const insertKey = `insert:${storeCode}`
      const updateKey = `insert-items:${storeCode}`
      const list = []
      const chInsert = subscribePosOrdersInsert(onInsert, {
        store: storeCode,
        onStatus: makeRealtimeStatusHandler(insertKey),
      })
      if (chInsert) list.push(chInsert)
      const chUpdate = subscribePosOrdersUpdate(onUpdatePendingItems, {
        store: storeCode,
        onStatus: makeRealtimeStatusHandler(updateKey),
      })
      if (chUpdate) list.push(chUpdate)
      return list
    })
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
      if (realtimeResubscribeTimerRef.current) {
        clearTimeout(realtimeResubscribeTimerRef.current)
        realtimeResubscribeTimerRef.current = null
      }
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    realtimeResubscribeTick,
    autoPrintReceiptOnAddOrder,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    posReceiptLineOpts,
    menus,
    t,
    lang,
    refetchCurrentStore,
    logPosPrintDebug,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    parseRealtimePosOrderRowItemsJson,
    buildDineInQtySnapshot,
    isCurrentStoreOrder,
    makeRealtimeStatusHandler,
  ])

  useEffect(() => {
    if (isMainPosDevice || !currentStoreId) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      if (!shouldTreatAsIncomingOrder(orderId, row.created_at)) return
      const rowStore = String(row.store_code ?? '').trim()
      const variants = currentStoreCodeVariants
      if (!rowStore) return
      if (!variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))) return
      if (seenOrderIdsRef.current.has(orderId)) return
      seenOrderIdsRef.current.add(orderId)
      bumpLastSeenOrderId(orderId)
      autoFocusIncomingDeliveryOrder({
        orderId,
        orderType: String(row.order_type ?? ''),
        deliveryAppCode: String(row.delivery_app_code ?? ''),
        status: String(row.status ?? ''),
        createdAt: String(row.created_at ?? ''),
        storeCode: String(row.store_code ?? ''),
        memo: String(row.memo ?? ''),
      })
      refetchCurrentStore()
    }
    const channels = currentStoreCodeVariants
      .map((storeCode) => subscribePosOrdersInsert(onInsert, { store: storeCode }))
      .filter(Boolean)
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    autoFocusIncomingDeliveryOrder,
    refetchCurrentStore,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    runGrabCancelWatchOnOrders,
    notifyGrabCustomerCancelledOrder,
  ])

  useEffect(() => {
    if (!currentStoreId) return
    const deliveryList = [...deliveryOrders, ...packagedDeliveryOrders, ...completedDeliveryOrders]
    if (!deliveryList.length) return
    const rows = deliveryList.map((o) => ({
      id: Number(o.id),
      status: o.status,
      memo: o.memo,
      orderType: 'delivery' as const,
      tableName: o.tableName,
      orderNo: o.orderNo,
    }))
    if (!grabCancelWatchSeededRef.current) {
      runGrabCancelWatchOnOrders(rows, { seedOnly: true })
      return
    }
    runGrabCancelWatchOnOrders(rows, { seedOnly: false })
  }, [
    currentStoreId,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    runGrabCancelWatchOnOrders,
  ])

  useEffect(() => {
    if (!currentStoreId) return

    const handleUpdate = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return

      const shouldAlert = applyGrabCancelWatchRealtimeRow({
        orderId,
        row: {
          id: orderId,
          status: row.status,
          memo: row.memo,
          order_type: row.order_type,
        },
        snapshot: grabCancelWatchSnapshotRef.current,
        seeded: grabCancelWatchSeededRef.current,
      })
      if (!shouldAlert) return
      notifyGrabCustomerCancelledOrder({
        orderId,
        tableName: String(row.table_name ?? ''),
        orderNo: String(row.order_no ?? ''),
      })
      refetchCurrentStore()
    }

    const channels = currentStoreCodeVariants
      .map((storeCode) => subscribePosOrdersUpdate(handleUpdate, { store: storeCode }))
      .filter(Boolean)

    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    currentStoreCodeVariants,
    currentStoreId,
    isCurrentStoreOrder,
    notifyGrabCustomerCancelledOrder,
    refetchCurrentStore,
  ])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const wantPayment = autoPrintReceiptOnPayment
    const wantRemoteDineInAdd =
      (autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder) || autoPrintKitchenSlipOnOrder
    if (!wantPayment && !wantRemoteDineInAdd) return

    const onUpdate = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      const rowStore = String(row.store_code ?? '').trim()
      const variants = currentStoreCodeVariants
      if (!rowStore) return
      if (!variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))) return

      if (
        wantPayment &&
        isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) > 0 &&
        !printedPaymentReceiptIdsRef.current.has(orderId)
      ) {
        printedPaymentReceiptIdsRef.current.add(orderId)
        void getPosOrders({ orderId, storeCode: currentStoreId, strictStore: true })
          .then((list) => {
            const order = list[0] as PosOrder | undefined
            if (!order?.items?.length) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            setReceiptData(receiptModalDataFromPosOrderForPayment(order, pricingAdjustments, posReceiptLineOpts))
          })
          .catch(() => {
            printedPaymentReceiptIdsRef.current.delete(orderId)
          })
      }

      if (!wantRemoteDineInAdd) return
      const ot = String(row.order_type ?? '').trim().toLowerCase()
      if (ot !== 'dine_in') return
      /**
       * 결제(updatePosOrder + status 반영) UPDATE는 주방 추가주문 출력 대상이 아님.
       * - 결제 직전 pending/cooking 상태에서도 payment_* 값이 먼저 반영될 수 있어
       *   "추가 주문"으로 오인해 주방지가 한 번 더 나갈 수 있다.
       */
      if (posOrderRowPaymentSum(row) > 0) return
      if (isPosOrderPaidLikeStatus(String(row.status ?? ''))) return
      const st = String(row.status ?? '').trim().toLowerCase()
      if (st === 'completed' || st === 'cancelled' || st === 'canceled') return

      const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId)
      if (suppressUntil != null) {
        if (Date.now() < suppressUntil) {
          mainPosSelfDineInUpdateSuppressUntilRef.current.delete(orderId)
          const parsedSelf = parseRealtimePosOrderRowItemsJson(row)
          if (parsedSelf.ok && parsedSelf.items.length > 0) {
            const sid = buildDineInQtySnapshot(parsedSelf.items)
            if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
          }
          logPosPrintDebug('realtime_update_skip_self_dine_in_suppress', { orderId })
          return
        }
        mainPosSelfDineInUpdateSuppressUntilRef.current.delete(orderId)
      }

      const parsed = parseRealtimePosOrderRowItemsJson(row)
      if (!parsed.ok || parsed.items.length === 0) return

      const items = parsed.items
      const prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(orderId)
      const newQtyById = buildDineInQtySnapshot(items)
      if (newQtyById.size === 0) return

      if (!prevQtyById) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        logPosPrintDebug('realtime_update_dine_in_snapshot_seeded', { orderId })
        return
      }

      const changedIds = [...newQtyById.keys()].filter((id) => {
        const prevQty = Number(prevQtyById.get(id) ?? 0)
        const nextQty = Number(newQtyById.get(id) ?? 0)
        if (prevQty <= 0) return nextQty > 0
        return nextQty > prevQty
      })
      if (changedIds.length === 0) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }

      const shouldAutoPrintReceipt = autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder
      if (!shouldAutoPrintReceipt && !autoPrintKitchenSlipOnOrder) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }

      const changedSet = new Set(changedIds)
      const previousStub = [...prevQtyById.entries()].map(([id, qty]) => ({ id, qty, quantity: qty }))
      const cartLikeNew = items.map((it) => ({
        id: resolveDineInSnapshotItemKey(it),
        name: it.name,
        price: it.price,
        quantity: it.qty,
        qty: it.qty,
        ...(it.note ? { note: formatLineNoteForPrint(it.note) } : {}),
        ...(it.menuId ? { menuId: it.menuId } : {}),
        ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
      }))
      const kitchenCartLines = filterKitchenCartLinesForDineInAdd(cartLikeNew, previousStub)

      const mergeSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
      const discountAmt = Number(row.discount_amt ?? 0)
      const couponDiscountAmt = Number(row.coupon_discount_amt ?? 0)
      const pricing = computePosPricing({
        subtotal: mergeSubtotal,
        discountAmt,
        cardPaymentAmount: 0,
        adjustments: pricingAdjustments,
      })

      const receiptPrintItemsRemote = items.map((it) => ({
        ...it,
        ...(changedSet.has(resolveDineInSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
      }))

      const storeCode = String(row.store_code ?? currentStoreId)
      const orderNoStr = String(row.order_no ?? '')
      const tableName = String(row.table_name ?? '')
      const memo = String(row.memo ?? '')

      const receiptPayloadRemote = {
        orderNo: orderNoStr,
        storeCode,
        orderType: t('posOrderTypeDineIn') || '매장',
        tableName,
        memo,
        items: receiptPrintItemsRemote,
        subtotal: mergeSubtotal,
        discountAmt,
        couponDiscountAmt,
        discountReason: String(row.discount_reason ?? '').trim() || undefined,
        total: pricing.finalTotal,
        vatFeeAmt: pricing.vatFeeAmt,
        vatFeeMode: pricing.vatFeeMode,
        ...receiptTaxDisplayFieldsFromPricing(pricing),
        serviceFeeAmt: pricing.serviceFeeAmt,
        serviceFeeMode: pricing.serviceFeeMode,
        cardFeeAmt: pricing.cardFeeAmt,
        cardFeeMode: pricing.cardFeeMode,
        otherFeeAmt: pricing.otherFeeAmt,
        otherFeeMode: pricing.otherFeeMode,
        ...posGuestCountSpread(row.guest_count),
      }

      const changedKey = changedIds
        .map((id) => `${id}:${Number(prevQtyById.get(id) ?? 0)}->${Number(newQtyById.get(id) ?? 0)}`)
        .sort()
        .join('|')
      const kitchenDedupeKey = `order:${orderId}:kitchen:add-remote:${changedKey}`
      const runKitchenRemoteDineInAdd = () => {
        if (kitchenCartLines.length === 0) return
        if (!reserveKitchenAutoPrintKey(kitchenDedupeKey)) return
        const printSettingsStoreCode = String(currentStoreId || storeCode || '').trim()
        void getPrinterSettingsForStore(printSettingsStoreCode)
          .then((settings) => {
            const ki = kitchenSlipPrintI18n(settings, lang)
            const itemsForKitchen = kitchenCartLines.map((i) => {
              const line = i as {
                menuId?: string
                menuId1?: string
                menu_id1?: string
                menuId2?: string
                note?: string
                promoId?: string
                promoCode?: string
                promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
              }
              const menuId = String(
                line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? ''
              ).trim()
              const note = String(line.note ?? '').trim()
              const promoId = String(line.promoId ?? '').trim()
              const promoCode = String(line.promoCode ?? '').trim()
              return {
                id: i.id,
                name: i.name,
                price: i.price,
                qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
                ...(menuId ? { menuId } : {}),
                ...(note ? { note } : {}),
                ...(promoId ? { promoId } : {}),
                ...(promoCode ? { promoCode } : {}),
                ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
              }
            })
            const slips = buildKitchenSlipGroups(
              kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
              buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
            )
            if (!slips.length) return
            const slipDesign = resolveKitchenSlipDesign(settings)
            const kitchenMemo = parsePosOrderMemo(memo).plainMemo
            const memoLine = kitchenMemo.trim()
              ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
              : ''
            const cR = (tag: string) => '\u003c/' + tag + '>'
            const tablePartR = tableName
              ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
              : ''
            const addonKitchenHead =
              '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000">' +
              escapeHtml(tPrint('posReceiptAddonSection') || '추가 주문') +
              cR('div')
            const printOne = (idx: number) => {
              if (idx >= slips.length) return
              const slip = slips[idx]
              const html = buildKitchenSlipDocumentHtml({
                label: slip.label,
                orderNo: orderNoStr,
                storeCode,
                orderTypeLabel: ki.orderTypeLabels.dine_in || '매장',
                tablePart: tablePartR,
                dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                items: kitchenSlipItemsForPrint(
                  slip.items,
                  kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                  ki
                ),
                memoLine: memoLine || null,
                escapeHtml,
                design: slipDesign,
                optionNameByCode,
                printColorAdjust: 'exact',
                prependItemsHtml: idx === 0 ? addonKitchenHead : '',
                ...posKitchenGuestSpread(row.guest_count, ki.t('posOrderGuestCount')),
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
                    setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                },
              })
            }
            setTimeout(() => printOne(0), 0)
          })
          .catch((e) => console.error('Kitchen slip print (remote dine-in add):', e))
      }

      dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
      logPosPrintDebug('remote_dine_in_add_autoprint', { orderId, changedCount: changedIds.length })

      if (shouldAutoPrintReceipt && autoPrintKitchenSlipOnOrder && kitchenCartLines.length > 0) {
        void printReceiptNow(receiptPayloadRemote, null, false, undefined, true, runKitchenRemoteDineInAdd)
      } else if (shouldAutoPrintReceipt) {
        void printReceiptNow(receiptPayloadRemote, null, false, undefined, true)
      } else if (autoPrintKitchenSlipOnOrder && kitchenCartLines.length > 0) {
        setTimeout(runKitchenRemoteDineInAdd, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
    }
    const channels = currentStoreCodeVariants
      .map((storeCode) => subscribePosOrdersUpdate(onUpdate, { store: storeCode }))
      .filter(Boolean)
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    autoPrintReceiptOnPayment,
    autoPrintReceiptOnAddOrder,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    pricingAdjustments,
    posReceiptLineOpts,
    parseRealtimePosOrderRowItemsJson,
    enrichPromoItemsWithOptionName,
    kitchenItemsWithResolvedPromo,
    getPrinterSettingsForStore,
    reserveKitchenAutoPrintKey,
    menus,
    lang,
    t,
    tPrint,
    logPosPrintDebug,
    buildDineInQtySnapshot,
    resolveDineInSnapshotItemKey,
  ])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) {
      if (!isMainPosDevice) {
        hasInitializedMainPosPollRef.current = false
        lastSeenOrderIdRef.current = 0
        lastSeenOrderIdPersistedRef.current = 0
        startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
        prevStoreForPollRef.current = null
        lastMetaScanAtRef.current = 0
      }
      triggerMainPosPollNowRef.current = null
      return
    }
    if (prevStoreForPollRef.current !== currentStoreId) {
      const persistedLastSeen = readMainPosLastSeenOrderId(currentStoreId)
      hasInitializedMainPosPollRef.current = false
      lastSeenOrderIdRef.current = persistedLastSeen
      lastSeenOrderIdPersistedRef.current = persistedLastSeen
      startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
      prevStoreForPollRef.current = currentStoreId
      grabCancelWatchSnapshotRef.current.clear()
      grabCancelWatchSeededRef.current = false
      lastMetaScanAtRef.current = 0
    }
    const today = getPosBusinessDateStr()
    const poll = async () => {
      if (mainPosPollInFlightRef.current) return
      mainPosPollInFlightRef.current = true
      try {
        const runPaymentReceiptScan = async () => {
          if (!autoPrintReceiptOnPayment) return
          try {
            const paidLikeRows = await getPosOrders({
              startStr: today,
              endStr: today,
              posBizDayScope: true,
              storeCode: currentStoreId,
              strictStore: true,
              statusPaidLike: true,
              limit: 800,
              orderBy: 'id.desc',
              pollMinimal: true,
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
              const adj = pricingAdjustments
              setTimeout(() => {
                void (async () => {
                  try {
                    const fullRows = await getPosOrders({
                      orderId: oid,
                      storeCode: currentStoreId,
                      strictStore: true,
                    })
                    const full = fullRows[0]
                    if (!full) return
                    if (!isPosOrderPaidLikeStatus(String(full.status ?? ''))) return
                    if (posOrderPaymentSum(full) <= 0) return
                    if (!(full.items || []).length) return
                    setReceiptData(receiptModalDataFromPosOrderForPayment(full, adj, posReceiptLineOpts))
                  } catch {
                    /* ignore */
                  }
                })()
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
          posBizDayScope: true,
          storeCode: currentStoreId,
          strictStore: true,
          pollMinimal: true,
          ...(sinceId != null ? { sinceId } : {}),
        })
        if (!hasInitializedMainPosPollRef.current) {
          const maxId = orders.length ? Math.max(...orders.map((o) => o.id ?? 0)) : 0
          for (const o of orders) {
            const oid = Number(o.id)
            if (Number.isFinite(oid) && oid > 0) {
              seenOrderIdsRef.current.add(oid)
              if (
                String(o.orderType ?? '').trim().toLowerCase() === 'dine_in' &&
                (o.items || []).length > 0
              ) {
                const qtySnap = buildDineInQtySnapshot(o.items || [])
                if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
              }
            }
          }
          const seededMax = Math.max(lastSeenOrderIdRef.current, maxId)
          bumpLastSeenOrderId(seededMax)
          hasInitializedMainPosPollRef.current = true
          runGrabCancelWatchOnOrders(orders, { seedOnly: true })
          await runPaymentReceiptScan()
          return
        }
        const newOrders = orders
        let shouldRefreshCurrentStore = false
        for (const order of newOrders) {
          const oid = Number(order.id)
          if (!Number.isFinite(oid) || oid <= 0) continue
          if (!isCurrentStoreOrder(order.storeCode ?? '')) {
            logPosPrintDebug('poll_skip_store_mismatch', {
              orderId: oid,
              rowStore: String(order.storeCode ?? ''),
            })
            continue
          }
          if (!shouldTreatAsIncomingOrder(oid, order.createdAt)) {
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_skip_not_incoming', {
              orderId: oid,
              createdAt: String(order.createdAt ?? ''),
            })
            continue
          }
          if (seenOrderIdsRef.current.has(oid)) {
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_skip_seen', { orderId: oid })
            continue
          }
          if (consumeSuppressMainPosAutoPrintForQueuedSync(oid)) {
            seenOrderIdsRef.current.add(oid)
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_suppress_queued_sync', { orderId: oid })
            continue
          }
          const items = (order.items || []).map(
            (it: {
              id?: string
              name?: string
              price?: number
              qty?: number
              quantity?: number
              note?: string
              menuId1?: string
              menu_id1?: string
              menuId?: string
              promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
            }) => {
              const note = String(it.note ?? '').trim()
              const menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? '').trim()
              const displayName = resolveOrderItemDisplayName({
                id: String(it.id ?? ''),
                name: String(it.name ?? ''),
                menuId,
              })
              return {
                id: String(it.id ?? ''),
                name: displayName,
                price: Number(it.price ?? 0),
                qty: Number(it.qty ?? it.quantity ?? 1),
                ...(menuId ? { menuId } : {}),
                ...(note ? { note } : {}),
                ...(Array.isArray(it.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(it.promoItems) } : {}),
              }
            }
          )
          /* 품목이 아직 비어 있으면 seen/워터마크에 넣지 않음 → 다음 폴링에서 다시 조회 */
          if (items.length === 0) {
            logPosPrintDebug('poll_skip_empty_items', { orderId: oid })
            continue
          }
          seenOrderIdsRef.current.add(oid)
          bumpLastSeenOrderId(oid)
          const inferredDeliveryCode =
            String((order as unknown as { deliveryAppCode?: string }).deliveryAppCode ?? '').trim() ||
            String(
              (order.items || []).find((it) => String(it.deliveryAppCode ?? '').trim())?.deliveryAppCode ?? ''
            ).trim()
          autoFocusIncomingDeliveryOrder({
            orderId: oid,
            orderType: String(order.orderType ?? ''),
            deliveryAppCode: inferredDeliveryCode,
            status: String(order.status ?? ''),
            createdAt: String(order.createdAt ?? ''),
            storeCode: String(order.storeCode ?? ''),
            memo: String(order.memo ?? ''),
          })
          shouldRefreshCurrentStore = true
          const receiptPayloadPoll = {
            orderNo: order.orderNo ?? '',
            storeCode: order.storeCode ?? currentStoreId,
            orderType: order.orderType ?? 'dine_in',
            tableName: order.tableName,
            memo: order.memo,
            items,
            subtotal: order.subtotal ?? 0,
            discountAmt: order.discountAmt ?? 0,
            couponDiscountAmt: order.couponDiscountAmt ?? 0,
            discountReason: String(order.discountReason ?? '').trim() || undefined,
            total: order.total ?? 0,
            ...posGuestCountSpread(order.guestCount),
          }
          const runKitchenForPolledOrder = () => {
            if (!reserveKitchenAutoPrintKey(`order:${oid}:kitchen`)) return
            void (async () => {
              try {
                const settings = await getPrinterSettingsForStore(
                  String(currentStoreId || order.storeCode || '').trim()
                )
                const ki = kitchenSlipPrintI18n(settings, lang)
                const slips = buildKitchenSlipGroups(
                  kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as typeof items,
                  buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
                )
                if (!slips.length) return
                const slipDesign = resolveKitchenSlipDesign(settings)
                const kitchenMemo = parsePosOrderMemo(order.memo).plainMemo
                const memoLine = kitchenMemo.trim()
                  ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                  : ''
                const printOne = (idx: number) => {
                  if (idx >= slips.length) return
                  const slip = slips[idx]
                  const tablePart = order.tableName
                    ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, ki.t)
                    : ''
                  const orderTypeLabel =
                ki.orderTypeLabels[normalizePosOrderTypeKey(order.orderType)] || (order.orderType ?? '')
                  const html = buildKitchenSlipDocumentHtml({
                    label: slip.label,
                    orderNo: order.orderNo ?? '',
                    storeCode: order.storeCode ?? '',
                    orderTypeLabel,
                    tablePart,
                    dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                    items: kitchenSlipItemsForPrint(
                      slip.items,
                      kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                      ki
                    ),
                    memoLine: memoLine || null,
                    escapeHtml,
                    design: slipDesign,
                    optionNameByCode,
                    printColorAdjust: 'exact',
                    ...posKitchenGuestSpread(order.guestCount, ki.t('posOrderGuestCount')),
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
                    setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                    },
                  })
                }
                setTimeout(() => printOne(0), 0)
              } catch (e) {
                console.error('Kitchen slip print:', e)
              }
            })()
          }
          const isPendingDelivery =
            String(order.orderType ?? '').trim().toLowerCase() === 'delivery' &&
            String(order.status ?? '').trim().toLowerCase() === 'pending'
          const shouldWaitForDeliveryAccept =
            isPendingDelivery && isApiInboundDeliveryOrderMemo(String(order.memo ?? ''))
          if (!shouldWaitForDeliveryAccept) {
            logPosPrintDebug('poll_autoprint_start', {
              orderId: oid,
              autoPrintReceiptOnOrder,
              autoPrintKitchenSlipOnOrder,
              itemCount: items.length,
              isPendingDelivery,
              shouldWaitForDeliveryAccept,
            })
            if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
              printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true, runKitchenForPolledOrder)
            } else if (autoPrintReceiptOnOrder) {
              printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true)
            } else if (autoPrintKitchenSlipOnOrder) {
              setTimeout(runKitchenForPolledOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
            }
          } else {
            logPosPrintDebug('poll_pending_delivery_wait_accept', {
              orderId: oid,
              status: String(order.status ?? ''),
              isInboundDeliveryOrder: isApiInboundDeliveryOrderMemo(String(order.memo ?? '')),
            })
          }
          if (String(order.orderType ?? '').trim().toLowerCase() === 'dine_in' && items.length > 0) {
            const qtySnap = buildDineInQtySnapshot(items)
            if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
          }
        }
        if (shouldRefreshCurrentStore) {
          refetchCurrentStore()
        }

        const nowMs = Date.now()
        const shouldRunMetaScan =
          !lastMetaScanAtRef.current ||
          nowMs - lastMetaScanAtRef.current >= MAIN_POS_META_SCAN_INTERVAL_MS ||
          nowMs - lastRealtimeOrderEventAtRef.current >= MAIN_POS_META_SCAN_INTERVAL_MS
        if (shouldRunMetaScan) {
          lastMetaScanAtRef.current = nowMs
          try {
            const watchOrders = await getPosOrders({
              startStr: today,
              endStr: today,
              posBizDayScope: true,
              storeCode: currentStoreId,
              strictStore: true,
              limit: 800,
              orderBy: 'id.desc',
              pollMinimal: true,
            })
            const wantMetaDineInAddonReceipt =
              autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder
            if (wantMetaDineInAddonReceipt) {
              for (const o of watchOrders) {
                const oid = Number(o.id)
                if (!Number.isFinite(oid) || oid <= 0) continue
                if (String(o.orderType ?? '').trim().toLowerCase() !== 'dine_in') continue
                const statusLower = String(o.status ?? '').trim().toLowerCase()
                if (statusLower === 'completed' || statusLower === 'cancelled' || statusLower === 'canceled') continue
                if (isPosOrderPaidLikeStatus(statusLower)) continue
                if (posOrderPaymentSum(o) > 0) continue
                const items = (o.items || []).map(
                  (it: {
                    id?: string
                    name?: string
                    price?: number
                    qty?: number
                    quantity?: number
                    note?: string
                    menuId1?: string
                    menu_id1?: string
                    menuId?: string
                    optionCode1?: string
                    option_code1?: string
                    optionCode?: string
                    promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                  }) => {
                    const note = String(it.note ?? '').trim()
                    const menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? '').trim()
                    const optionCode = String(it.optionCode1 ?? it.option_code1 ?? it.optionCode ?? '').trim()
                    const displayName = resolveOrderItemDisplayName({
                      id: String(it.id ?? ''),
                      name: String(it.name ?? ''),
                      menuId,
                    })
                    return {
                      id: String(it.id ?? ''),
                      name: displayName,
                      price: Number(it.price ?? 0),
                      qty: Number(it.qty ?? it.quantity ?? 1),
                      ...(menuId ? { menuId } : {}),
                      ...(optionCode ? { optionCode } : {}),
                      ...(note ? { note: formatLineNoteForPrint(note) } : {}),
                      ...(Array.isArray(it.promoItems)
                        ? { promoItems: enrichPromoItemsWithOptionName(it.promoItems) }
                        : {}),
                    }
                  }
                )
                if (!items.length) continue
                const prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(oid)
                const newQtyById = buildDineInQtySnapshot(items)
                if (newQtyById.size === 0) continue
                if (!prevQtyById) {
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  continue
                }
                const changedIds = [...newQtyById.keys()].filter((id) => {
                  const prevQty = Number(prevQtyById.get(id) ?? 0)
                  const nextQty = Number(newQtyById.get(id) ?? 0)
                  if (prevQty <= 0) return nextQty > 0
                  return nextQty > prevQty
                })
                if (changedIds.length === 0) {
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  continue
                }
                dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                const changedSet = new Set(changedIds)
                const receiptPrintItemsRemote = items.map((it) => ({
                  ...it,
                  ...(changedSet.has(resolveDineInSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
                }))
                const mergeSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
                const discountAmt = Number(o.discountAmt ?? 0)
                const couponDiscountAmt = Number(o.couponDiscountAmt ?? 0)
                const pricing = computePosPricing({
                  subtotal: mergeSubtotal,
                  discountAmt,
                  cardPaymentAmount: 0,
                  adjustments: pricingAdjustments,
                })
                const receiptPayloadRemote = {
                  orderNo: String(o.orderNo ?? ''),
                  storeCode: String(o.storeCode ?? currentStoreId),
                  orderType: t('posOrderTypeDineIn') || '매장',
                  tableName: String(o.tableName ?? ''),
                  memo: String(o.memo ?? ''),
                  items: receiptPrintItemsRemote,
                  subtotal: mergeSubtotal,
                  discountAmt,
                  couponDiscountAmt,
                  discountReason: String(o.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...posGuestCountSpread(o.guestCount),
                }
                logPosPrintDebug('poll_meta_remote_dine_in_add_receipt', {
                  orderId: oid,
                  changedCount: changedIds.length,
                })
                void printReceiptNow(receiptPayloadRemote, undefined, false, undefined, true)
              }
            }
            if (!grabCancelWatchSeededRef.current) {
              runGrabCancelWatchOnOrders(watchOrders, { seedOnly: true })
            } else if (runGrabCancelWatchOnOrders(watchOrders, { seedOnly: false })) {
              refetchCurrentStore()
            }
          } catch {
            /* grab cancel watch */
          }
        }

        await runPaymentReceiptScan()
      } catch {
        // ignore poll errors
      } finally {
        mainPosPollInFlightRef.current = false
      }
    }
    triggerMainPosPollNowRef.current = () => {
      void poll()
    }

    let pollLoopCancelled = false

    const scheduleNextPoll = () => {
      if (pollLoopCancelled) return
      const delayMs = resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: realtimeChannelHealthyRef.current,
        realtimeRecentlyActive: isMainPosRealtimeRecentlyActive(lastRealtimeOrderEventAtRef.current),
      })
      mainPosPollTimerRef.current = setTimeout(() => {
        void poll().finally(() => {
          if (!pollLoopCancelled) scheduleNextPoll()
        })
      }, delayMs)
    }

    void poll().finally(() => scheduleNextPoll())

    return () => {
      pollLoopCancelled = true
      triggerMainPosPollNowRef.current = null
      if (mainPosPollTimerRef.current) {
        clearTimeout(mainPosPollTimerRef.current)
        mainPosPollTimerRef.current = null
      }
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    posReceiptLineOpts,
    menus,
    autoFocusIncomingDeliveryOrder,
    t,
    lang,
    refetchCurrentStore,
    isCurrentStoreOrder,
    logPosPrintDebug,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    buildDineInQtySnapshot,
    resolveDineInSnapshotItemKey,
    resolveOrderItemDisplayName,
    enrichPromoItemsWithOptionName,
    printReceiptNow,
  ])

  /** 절전·탭 복귀·온라인 복구 시 Realtime 재구독 + 즉시 증분 폴링 */
  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      logPosPrintDebug('realtime_resume_reconnect', {})
      realtimeChannelStateRef.current.clear()
      realtimeChannelHealthyRef.current = false
      setRealtimeResubscribeTick((n) => n + 1)
      triggerMainPosPollNowRef.current?.()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('online', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onResume)
    }
  }, [isMainPosDevice, currentStoreId, logPosPrintDebug])

  useEffect(() => {
    if (selectedTableId) {
      setActiveFloor(getTableFloor(selectedTableId))
    } else if (servingTableId) {
      setActiveFloor(getTableFloor(servingTableId))
    }
  }, [selectedTableId, servingTableId, floorLayoutForView])

  useEffect(() => {
    if (selectedTableId || servingTableId) return
    const hasActiveFloorTable = floorLayoutForView.some(
      (tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) === activeFloor
    )
    if (hasActiveFloorTable || floorLayoutForView.length === 0) return
    const floors = Array.from(
      new Set(floorLayoutForView.map((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as 1 | 2 | 3))
    ).sort((a, b) => a - b)
    if (floors[0] && floors[0] !== activeFloor) {
      setActiveFloor(floors[0])
    }
  }, [floorLayoutForView, activeFloor, selectedTableId, servingTableId])

  const tryOpenDrawerForPayment = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      if (isPosDemo) return
      if (!payment || !currentStoreId) return
      const cashAmt = Math.max(0, Number(payment.paymentCash || 0))
      if (cashAmt <= 0) return
      // force 는 "수동 강제 열기 전용"으로 간주: 자동 결제 오픈은 수행하지 않음
      if (drawerOpenOption === 'force') return
      const res = await openPosCashDrawerSecure({
        reason: 'cash_payment',
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
    [isPosDemo, currentStoreId, auth?.user, drawerOpenOption, t, openPosCashDrawerSecure]
  )

  const tryOpenDrawerOnOrderComplete = useCallback(
    async (
      payment: CartPanelPaymentPayload | null | undefined,
      options?: { skipAutoOpen?: boolean }
    ) => {
      /** 분할 결제는 인원별 현금 확정 때만 열고, 최종 완료 단계에서는 다시 열지 않는다. */
      if (options?.skipAutoOpen || splitCashDrawerStepsRef.current > 0) {
        splitCashDrawerStepsRef.current = 0
        return
      }
      /** 서랍 브리지/셸 지연이 영수증 자동 인쇄를 막지 않도록 백그라운드로 연다. */
      void tryOpenDrawerForPayment(payment).catch((e) => {
        console.error('tryOpenDrawerForPayment:', e)
      })
    },
    [tryOpenDrawerForPayment]
  )

  const handleSplitCashPaymentStep = useCallback(
    async (payment: CartPanelPaymentPayload) => {
      splitCashDrawerStepsRef.current += 1
      await tryOpenDrawerForPayment(payment)
    },
    [tryOpenDrawerForPayment]
  )

  const runLinkposPaymentIfNeeded = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      if (isPosDemo) return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      const cardAmount = Math.max(0, Number(payment?.paymentCard || 0))
      if (cardAmount <= 0) return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      if (posPrinterSettingsRef.current?.linkposSkipTerminalForCard) {
        return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      }
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
    [isPosDemo, currentStoreId, auth?.user, t]
  )

  const sleepMs = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), [])
  const enforceKbankCooldown = useCallback(
    async (
      bucket: 'generate' | 'inquiry' | 'followup',
      minIntervalMs: number,
      label: string
    ): Promise<boolean> => {
      const targetRef =
        bucket === 'generate'
          ? kbankGenerateLastAtRef
          : bucket === 'inquiry'
            ? kbankInquiryLastAtRef
            : kbankFollowupLastAtRef
      const now = Date.now()
      const elapsed = now - targetRef.current
      const remainingMs = minIntervalMs - elapsed
      if (remainingMs > 0) {
        const waitSec = Math.ceil(remainingMs / 1000)
        await appAlert(
          `KBank rate-limit protection: wait about ${waitSec}s before ${label}.`
        )
        return false
      }
      targetRef.current = now
      return true
    },
    []
  )

  const openKbankOutcomeModal = useCallback(
    (next: KbankOutcomeState, dedupeKey?: string) => {
      const key = String(dedupeKey || `${next.kind}:${next.refId}:${next.amount}`).trim()
      if (key && kbankOutcomeLastKeyRef.current === key) return
      if (key) kbankOutcomeLastKeyRef.current = key
      setKbankOutcomeState(next)
    },
    []
  )

  const runKbankQrPaymentIfNeeded = useCallback(
    async (
      payment: CartPanelPaymentPayload | null | undefined,
      context?: { orderType?: string; orderLabel?: string; orderId?: number }
    ) => {
      if (isPosDemo) return { ok: true as const }
      kbankManualCancelPendingRef.current = false
      const qrAmount = Math.max(0, Number(payment?.paymentQr || 0))
      if (qrAmount <= 0) return { ok: true as const }
      if (!isKbankPilotStore) return { ok: true as const }
      if (!currentStoreId) {
        const msg = t('posStoreRequired') || '매장 정보가 필요합니다.'
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }
      const canGenerate = await enforceKbankCooldown('generate', 5000, 'Generate QR')
      if (!canGenerate) {
        return { ok: false as const, message: 'kbank_generate_cooldown' }
      }
      const requestedQrType =
        String(payment?.paymentQrType || 'THAI_QR').trim().toUpperCase() === 'CREDIT_CARD'
          ? 'CREDIT_CARD'
          : 'THAI_QR'
      setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posLoading') || '로딩 중'))

      const terminalId = String(kbankOpsTerminalId || '').trim()
      const partnerTransactionIdSeed = `POSQR${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
      const generate = await executeKbankGenerateQr({
        amount: qrAmount,
        qrType: requestedQrType,
        storeCode: currentStoreId,
        orderId: context?.orderId,
        partnerTransactionId: partnerTransactionIdSeed,
        reference1: String(context?.orderType || '').slice(0, 20),
        reference2: String(context?.orderLabel || '').slice(0, 20),
        ...(terminalId ? { terminalId } : {}),
      })
      if (!generate.success) {
        setLiveKbankQrPayload('')
        setLiveKbankQrType('THAI_QR')
        setLiveKbankQrTypeSource('requested')
        setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
        setKbankGenerateAuditText(
          generate.requestMessage
            ? buildKbankGenerateAuditPaste({
                partnerTxnUid: String(
                  generate.partnerTransactionId || partnerTransactionIdSeed
                ),
                amount: qrAmount,
                requestedQrType,
                sentQrTypeCode: generate.sentQrTypeCode || undefined,
                bankQrTypeCode: generate.bankQrTypeCode,
                bankSof: generate.bankSof,
                requestMessage: generate.requestMessage,
                responseMessage: generate.responseMessage,
                storeCode: currentStoreId,
              })
            : ''
        )
        setKbankCallbackState('idle')
        setKbankOpsTxnUid('')
        setKbankOpsOrigTxnUid('')
        setKbankOpsTxnNo('')
        setCustomerDisplayPaymentMessage('')
        const rateLimited = isKbankRateLimitError(generate.message || generate.statusMessage)
        const msg =
          rateLimited
            ? 'KBank rate limit exceeded. Wait 2–5 minutes, then try Generate QR again (do not tap repeatedly).'
            : requestedQrType === 'CREDIT_CARD' &&
                isKbankCreditCardQrUnavailableError(generate.statusCode, generate.message)
              ? t('posKbankCreditCardQrNotRegisteredAlert') ||
                'This store is not registered for Credit Card QR with KBank. Use Thai QR, or ask KBank to enable Credit Card QR for the merchant.'
              : (t('posPaymentQr') || 'QR') + ' ' + (generate.message || 'generate_failed')
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }

      const partnerTransactionId = String(generate.partnerTransactionId || partnerTransactionIdSeed)
        .trim()
        .slice(0, 32)

      const data = (generate.data || {}) as Record<string, unknown>
      const generatedInfo = extractKbankGenerateResponseInfo(data)
      const resolvedOrigTxnUid = String(
        generatedInfo.originalTxnId || partnerTransactionId
      )
        .trim()
        .slice(0, 32)
      const resolvedTxnNo = String(generatedInfo.txnNo || '').trim().slice(0, 20)
      setKbankOpsTxnUid(partnerTransactionId)
      setKbankOpsOrigTxnUid(resolvedOrigTxnUid)
      if (resolvedTxnNo) setKbankOpsTxnNo(resolvedTxnNo)
      setKbankCallbackState('waiting')
      const generatedQrPayload = String(generatedInfo.qrPayload || '').trim()
      const generatedCardBrands = resolveKbankCreditCardBrandLabels({
        sof: generatedInfo.sof,
        cardScheme: generatedInfo.cardScheme,
      })
      setKbankOpsCardBrands(generatedCardBrands)
      if (!generatedQrPayload) {
        setCustomerDisplayPaymentMessage('')
        const msg =
          (t('posPaymentQr') || 'QR') +
          ` response parse failed (${requestedQrType}): qrPayload/qrCode not found.`
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }
      setLiveKbankQrPayload(generatedQrPayload)
      setLiveKbankQrAmount(qrAmount)
      const bankQrMeta = extractKbankQrResponseMeta(data)
      const qrTypeDetails = resolveKbankDisplayQrTypeDetails({
        qrType: String(generate.bankQrTypeCode || bankQrMeta.qrTypeCode || '').trim(),
        sof: generatedInfo.sof ?? generate.bankSof,
        requested: requestedQrType,
        emvPayload: generatedQrPayload,
      })
      setLiveKbankQrType(qrTypeDetails.displayType)
      setLiveKbankQrTypeSource(qrTypeDetails.source)
      setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
      setKbankGenerateAuditText(
        buildKbankGenerateAuditPaste({
          partnerTxnUid: partnerTransactionId,
          amount: qrAmount,
          requestedQrType: requestedQrType,
          sentQrTypeCode: generate.sentQrTypeCode || undefined,
          bankQrTypeCode: qrTypeDetails.bankQrTypeCode || generate.bankQrTypeCode,
          bankSof: qrTypeDetails.bankSof || generate.bankSof,
          requestMessage: generate.requestMessage,
          responseMessage: generate.responseMessage,
          storeCode: currentStoreId,
        })
      )
      if (requestedQrType === 'CREDIT_CARD') {
        if (qrTypeDetails.displayType === 'THAI_QR') {
          await appAlert(
            t('posKbankQrReturnedThaiAlert') ||
              'You selected Credit Card QR, but KBank returned Thai QR (PromptPay). Ask KBank to enable Credit Card QR for this merchant.'
          )
        } else if (qrTypeDetails.source === 'requested') {
          await appAlert(
            t('posKbankQrBankTypeUnknownAlert') ||
              'Credit Card QR was requested (qrType 4). KBank did not return qrType in the response. Please send the audit message below to KBank.'
          )
        }
      }
      void executeLinkposDisplayQr({
        qrPayload: generatedQrPayload,
        amount: qrAmount,
        reference1: String(context?.orderType || '').slice(0, 20),
        reference2: String(context?.orderLabel || '').slice(0, 20),
        storeCode: currentStoreId,
      })
      setCustomerDisplayPaymentMessage(
        (t('posPaymentQr') || 'QR') + ' ' + (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      let originalTransactionId = String(generatedInfo.originalTxnId || '').trim()
      let refId = String(generatedInfo.referenceId || '').trim()

      const finalizeKbankQrFailureWithManualOption = async (
        failureHint: string
      ): Promise<
        | { ok: true; partnerTransactionId: string; pending: true }
        | { ok: false; message: string }
      > => {
        const manualMsg =
          (t('posPaymentQr') || 'QR') +
          ' ' +
          failureHint +
          '. ' +
          (t('posProceedQuestion') || '수동 처리로 주문 저장을 계속할까요?')
        const proceed = await appConfirm(manualMsg)
        if (!proceed) {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
          setKbankCallbackState('idle')
          setKbankOpsTxnUid('')
          setKbankOpsOrigTxnUid('')
          setKbankOpsTxnNo('')
          setCustomerDisplayPaymentMessage('')
          return { ok: false as const, message: failureHint }
        }
        setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posManual') || '수동 처리'))
        return { ok: true as const, partnerTransactionId, pending: true as const }
      }

      // Rate-limit safe: wait before first inquiry; at most 2 checks (not 3 back-to-back).
      await sleepMs(5000)
      if (kbankManualCancelPendingRef.current) {
        return { ok: false as const, message: 'kbank_qr_cancelled' }
      }
      for (let i = 0; i < 2; i += 1) {
        if (kbankManualCancelPendingRef.current) break
        kbankInquiryLastAtRef.current = Date.now()
        const st = await executeKbankCheckStatus({
          storeCode: currentStoreId,
          orderId: context?.orderId,
          partnerTransactionId,
          originalTransactionId: originalTransactionId || undefined,
          refId: refId || undefined,
        })
        const stData = (st.data || {}) as Record<string, unknown>
        const stTxnNo = String(stData.txnNo || '').trim().slice(0, 20)
        if (st.success) {
          const s = String(st.status || '').trim().toLowerCase()
          if (s === 'approved') {
            setKbankCallbackState('received')
            setCustomerDisplayPaymentMessage('')
            openKbankOutcomeModal(
              {
                kind: 'success',
                amount: qrAmount,
                refId: partnerTransactionId,
                paymentMethod: requestedQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                cardLabel:
                  requestedQrType === 'CREDIT_CARD' && generatedCardBrands.length > 0
                    ? generatedCardBrands.join(' / ')
                    : undefined,
                approvalCode: stTxnNo || undefined,
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `success:${partnerTransactionId}`
            )
            return { ok: true as const, partnerTransactionId }
          }
          if (s === 'declined' || s === 'failed') {
            const txnStatusRaw = String(
              stData.txnStatus || stData.transactionStatus || stData.status || stData.paymentStatus || ''
            )
              .trim()
              .toUpperCase()
            const declineBlob = `${String(st.statusMessage || '')} ${String(st.message || '')} ${txnStatusRaw}`
              .trim()
              .toLowerCase()
            const treatedAsCancelled =
              kbankManualCancelPendingRef.current ||
              txnStatusRaw.includes('CANCEL') ||
              declineBlob.includes('cancel')
            if (treatedAsCancelled) {
              kbankManualCancelPendingRef.current = false
              setKbankCallbackState('failed')
              setCustomerDisplayPaymentMessage('')
              openKbankOutcomeModal(
                {
                  kind: 'cancelled',
                  amount: qrAmount,
                  refId: partnerTransactionId,
                  paymentMethod: requestedQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                  timeLabel: formatPosDateTimeMedium(new Date(), lang),
                },
                `cancelled-by-inquiry:${partnerTransactionId}`
              )
              return { ok: false as const, message: 'kbank_qr_cancelled' }
            }
            setKbankCallbackState('failed')
            const failureHint =
              s === 'failed'
                ? String(st.statusMessage || st.message || t('processFail') || '결제 실패').trim()
                : t('posPaymentDeclined') || '결제가 거절되었습니다.'
            return finalizeKbankQrFailureWithManualOption(failureHint)
          }
        }
        if (!st.success && i === 1) {
          const failureHint = String(
            st.statusMessage || st.message || t('processFail') || 'kbank_check_status_failed'
          ).trim()
          return finalizeKbankQrFailureWithManualOption(failureHint)
        }
        if (stTxnNo) setKbankOpsTxnNo(stTxnNo)
        const inquiryMeta = extractKbankQrResponseMeta(stData)
        if (inquiryMeta.qrTypeCode || inquiryMeta.sof) {
          const inquiryDetails = resolveKbankDisplayQrTypeDetails({
            qrType: inquiryMeta.qrTypeCode,
            sof: inquiryMeta.sof,
            requested: requestedQrType,
            emvPayload: String(liveKbankQrPayload || '').trim(),
          })
          setLiveKbankQrType(inquiryDetails.displayType)
          setLiveKbankQrTypeSource(inquiryDetails.source)
        }
        if (!originalTransactionId) originalTransactionId = String(st.originalTransactionId || '').trim()
        if (!refId) refId = String(st.refId || '').trim()
        if (i < 1) {
          await sleepMs(5000)
          if (kbankManualCancelPendingRef.current) break
        }
      }

      if (kbankManualCancelPendingRef.current) {
        return { ok: false as const, message: 'kbank_qr_cancelled' }
      }

      // Still pending after inquiry: keep QR visible and wait for callback / manual Inquiry.
      setCustomerDisplayPaymentMessage(
        (t('posPaymentQr') || 'QR') +
          ' ' +
          (t('posPending') || '대기') +
          ' — ' +
          (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      return { ok: false as const, message: 'kbank_qr_pending' }
    },
    [isPosDemo, isKbankPilotStore, currentStoreId, kbankOpsTerminalId, t, sleepMs, enforceKbankCooldown, openKbankOutcomeModal, lang]
  )

  const runKbankFollowupAction = useCallback(
    async (action: 'inquiry' | 'cancel' | 'void' | 'settlement') => {
      if (!currentStoreId) {
        await appAlert(t('posStoreRequired') || '매장 정보가 필요합니다.')
        return
      }
      const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
      if (!partnerTxnUid) {
        await appAlert(t('posKbankGenerateFirstAlert') || 'Please run QR Generate first.')
        return
      }
      const origPartnerTxnUid = String(kbankOpsOrigTxnUid || partnerTxnUid).trim().slice(0, 32)
      const terminalId = String(kbankOpsTerminalId || '').trim()
      const txnNo = String(kbankOpsTxnNo || '').trim()
      if (action === 'inquiry') {
        const canInquiry = await enforceKbankCooldown('inquiry', 5000, 'Inquiry')
        if (!canInquiry) return
      } else {
        const canFollowup = await enforceKbankCooldown('followup', 3000, action)
        if (!canFollowup) return
      }
      setKbankOpsBusy(true)
      try {
        if (action === 'inquiry') {
          kbankInquiryLastAtRef.current = Date.now()
          const out = await executeKbankCheckStatus({
            storeCode: currentStoreId,
            partnerTransactionId: partnerTxnUid,
            originalTransactionId: origPartnerTxnUid || undefined,
            terminalId: terminalId || undefined,
            txnNo: txnNo || undefined,
            payload: {
              ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
              ...(terminalId ? { terminalId } : {}),
              ...(txnNo ? { txnNo } : {}),
            },
          })
          if (out.success) {
            const d = (out.data || {}) as Record<string, unknown>
            const nextTxnNo = String(d.txnNo || txnNo || '').trim().slice(0, 20)
            if (nextTxnNo) setKbankOpsTxnNo(nextTxnNo)
            const brands = resolveKbankCreditCardBrandLabels({
              sof: d.sof,
              cardScheme: d.cardScheme,
            })
            if (brands.length > 0) setKbankOpsCardBrands(brands)
          }
          setKbankOpsLastResult(`[INQUIRY] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'cancel') {
          const cancelPartnerTxnUid = `CCH${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankCancelQr({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: cancelPartnerTxnUid,
            terminalId: terminalId || undefined,
            payload: {
              partnerTxnUid: cancelPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
            },
          })
          if (out.success) {
            kbankManualCancelPendingRef.current = true
            setKbankCallbackState('failed')
            openKbankOutcomeModal(
              {
                kind: 'cancelled',
                amount: Math.max(0, Number(liveKbankQrAmount || 0)),
                refId: origPartnerTxnUid || partnerTxnUid,
                paymentMethod: liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `cancel:${origPartnerTxnUid || partnerTxnUid}:${cancelPartnerTxnUid}`
            )
          }
          setKbankOpsLastResult(`[CANCEL] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'void') {
          if (!txnNo) {
            await appAlert(
              t('posKbankTxnNoRequiredAlert') ||
                'txnNo is required for Void Payment. Run Inquiry after payment or enter txnNo from the payment callback.'
            )
            return
          }
          const voidPartnerTxnUid = `VOD${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankVoidPayment({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: voidPartnerTxnUid,
            terminalId: terminalId || undefined,
            txnNo: txnNo || undefined,
            payload: {
              partnerTxnUid: voidPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
              ...(txnNo ? { txnNo } : {}),
            },
          })
          if (out.success) {
            const d = (out.data || {}) as Record<string, unknown>
            const nextTxnNo = String(d.txnNo || txnNo || '').trim().slice(0, 20)
            if (nextTxnNo) setKbankOpsTxnNo(nextTxnNo)
          }
          if (out.success) {
            setLiveKbankQrPayload('')
            setLiveKbankQrType('THAI_QR')
            setKbankCallbackState('idle')
          }
          setKbankOpsLastResult(`[VOID] ${JSON.stringify(out)}`)
          return
        }
        if (liveKbankQrType === 'CREDIT_CARD') {
          await appAlert(
            t('posKbankSettlementThaiQrOnlyAlert') ||
              'Manual Settlement is not supported for Credit Card QR. Only Thai QR supports immediate settlement.'
          )
          return
        }
        if (!terminalId) {
          await appAlert(
            t('posKbankTerminalIdRequiredAlert') ||
              'terminalId is required for Settlement. Enter terminalId in the KBank panel or set KBANK_TERMINAL_ID.'
          )
          return
        }
        const settlementPartnerTxnUid = `STM${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
        const out = await executeKbankSettlement({
          storeCode: currentStoreId,
          partnerTxnUid: settlementPartnerTxnUid,
          terminalId,
          qrType: 'THAI_QR',
          payload: {
            partnerTxnUid: settlementPartnerTxnUid,
            terminalId,
            qrType: 'THAI_QR',
          },
        })
        setKbankOpsLastResult(`[SETTLEMENT] ${JSON.stringify(out)}`)
      } finally {
        setKbankOpsBusy(false)
      }
    },
    [
      currentStoreId,
      kbankOpsTxnUid,
      kbankOpsOrigTxnUid,
      kbankOpsTerminalId,
      kbankOpsTxnNo,
      liveKbankQrType,
      t,
      enforceKbankCooldown,
      liveKbankQrAmount,
      openKbankOutcomeModal,
      lang,
    ]
  )

  const applyKbankManualMemoTag = useCallback(
    (
      memo: string | null | undefined,
      result: { pending?: boolean; partnerTransactionId?: string } | { ok?: boolean }
    ) => {
      const base = String(memo ?? '').trim()
      const isManual = Boolean((result as { pending?: boolean }).pending)
      if (!isManual) return base
      const txnId = String((result as { partnerTransactionId?: string }).partnerTransactionId ?? '').trim()
      const tag = txnId ? `[KBANK_MANUAL:${txnId}]` : '[KBANK_MANUAL]'
      if (base.includes(tag)) return base
      if (base.includes('[KBANK_MANUAL')) return base
      return base ? `${base}\n${tag}` : tag
    },
    []
  )

  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    const localTxId = String(kbankOpsTxnUid || '').trim()
    if (!localTxId) {
      setKbankCallbackState('idle')
      return
    }
    if (kbankCallbackState === 'idle') {
      setKbankCallbackState('waiting')
    }
    let cancelled = false
    const applyCallbackAttempt = async () => {
      const businessDate = getPosBusinessDateStr()
      const rows = await getPosPaymentAttempts({
        startStr: businessDate,
        endStr: businessDate,
        storeCode: currentStoreId,
        status: 'all',
        localTxId,
        limit: 1,
      })
      if (cancelled || !Array.isArray(rows) || rows.length === 0) return
      const hit = rows[0] as PosPaymentAttempt | undefined
      if (!hit) return
      const status = String(hit.status || '').trim().toLowerCase()
      const lowerText = String(hit.responseText || '').trim().toLowerCase()
      const txnNoFromTextMatch =
        lowerText.match(/(?:txnno|transactionno)\s*[:=]\s*([a-z0-9-]{4,30})/i) ||
        lowerText.match(/\btxnno\b.*?\b([a-z0-9-]{4,30})\b/i)
      const txnNoFromText = String(txnNoFromTextMatch?.[1] || '').trim()
      if (txnNoFromText && !String(kbankOpsTxnNo || '').trim()) {
        setKbankOpsTxnNo(txnNoFromText.slice(0, 20))
      }
      if (status === 'approved') {
        setKbankCallbackState('received')
        setKbankOpsLastResult(
          `[CALLBACK] ${JSON.stringify({
            localTxId,
            status: hit.status,
            responseCode: hit.responseCode,
            responseText: hit.responseText,
            createdAt: hit.createdAt,
          })}`
        )
        const methodFromText = lowerText.includes('credit') || lowerText.includes('card')
        openKbankOutcomeModal(
          {
            kind: 'success',
            amount: Math.max(0, Number(hit.approvedAmount || hit.requestAmount || liveKbankQrAmount || 0)),
            refId: localTxId,
            paymentMethod:
              methodFromText || liveKbankQrType === 'CREDIT_CARD'
                ? 'Credit Card QR'
                : 'PromptPay QR',
            cardLabel: kbankOpsCardBrands.length > 0 ? kbankOpsCardBrands.join(' / ') : undefined,
            approvalCode: String(hit.approvalCode || kbankOpsTxnNo || '').trim() || undefined,
            timeLabel: formatPosDateTimeMedium(
              hit.createdAt ? new Date(hit.createdAt) : new Date(),
              lang
            ),
          },
          `callback:${localTxId}:${hit.createdAt || ''}:${hit.responseCode || ''}`
        )
        if (kbankCallbackNotifiedTxRef.current !== localTxId) {
          kbankCallbackNotifiedTxRef.current = localTxId
        }
        return
      }
      if (status === 'declined' || status === 'failed' || status === 'timeout' || status === 'error') {
        setKbankCallbackState('failed')
      }
    }
    void applyCallbackAttempt().catch(() => {})
    const timerId = window.setInterval(() => {
      void applyCallbackAttempt().catch(() => {})
    }, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [isKbankPilotStore, currentStoreId, kbankOpsTxnUid, kbankOpsTxnNo, kbankCallbackState, liveKbankQrAmount, liveKbankQrType, kbankOpsCardBrands, openKbankOutcomeModal, lang])

  const applyTaxInvoiceProfile = useCallback((profile: PosTaxInvoiceData) => {
    setTiCustomerType(profile.customerType === 'company' ? 'company' : 'person')
    setTiMemberNo(String(profile.memberNo || '').trim())
    setTiName(String(profile.name || '').trim())
    setTiTaxId(String(profile.taxId || '').replace(/\D/g, '').slice(0, 13))
    setTiBranchNo(String(profile.branchNo || '').replace(/\D/g, '').slice(0, 5))
    setTiPhone(String(profile.phone || '').replace(/\D/g, '').slice(0, 10))
    setTiEmail(String(profile.email || '').trim())
    setTiAddress(String(profile.address || '').trim())
  }, [])

  const openTaxInvoiceEditorForOrder = useCallback((order: Order | null | undefined) => {
    if (!order) return
    const parsed = parsePosOrderMemo(order.memo)
    setTaxInvoiceTargetOrder(order)
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
        storeCode: currentStoreId || undefined,
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
      setTaxSearchMessage(String(e || 'search_failed'))
    } finally {
      setTaxSearchLoading(false)
    }
  }

  const buildPosOrderItemsForUpdate = (order: Order) =>
    order.items.map((it) => ({
      id: String(it.id || ''),
      name: String(it.name || ''),
      price: Number(it.price || 0),
      qty: Math.max(1, Number(it.quantity || 1)),
      ...(it.note?.trim() ? { note: it.note.trim() } : {}),
      ...(it.menuId ? { menuId1: String(it.menuId) } : {}),
      ...(it.optionId ? { optionId1: String(it.optionId) } : {}),
      ...(it.optionCode ? { optionCode1: String(it.optionCode) } : {}),
      ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
    }))

  const handleSaveTaxInvoiceForOrder = async () => {
    if (!taxInvoiceTargetOrder) return
    if (!(await ensureBusinessOpenForOrder())) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    if (taxFormErrors.length > 0) {
      await appAlert(t('posTaxInvoiceInvalid') || '세금계산서 정보를 확인해 주세요.')
      return
    }
    const taxInvoicePayload: PosTaxInvoiceData = {
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
    const nextMemo = upsertPosOrderTaxInvoiceMemo(taxInvoiceTargetOrder.memo, taxInvoicePayload)
    const orderId = Number(taxInvoiceTargetOrder.id)
    if (!Number.isFinite(orderId) || orderId <= 0 || !taxInvoiceTargetOrder.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    setTaxInvoiceSaving(true)
    try {
      const res = await updatePosOrder({
        id: orderId,
        items: buildPosOrderItemsForUpdate(taxInvoiceTargetOrder),
        tableName: String(taxInvoiceTargetOrder.tableName || ''),
        memo: nextMemo,
        discountAmt: Number(taxInvoiceTargetOrder.discountAmt || 0),
        discountReason: String(taxInvoiceTargetOrder.discountReason || ''),
        paymentCash: Number(taxInvoiceTargetOrder.paymentCash || 0),
        paymentCard: Number(taxInvoiceTargetOrder.paymentCard || 0),
        paymentQr: Number(taxInvoiceTargetOrder.paymentQr || 0),
        paymentOther: Number(taxInvoiceTargetOrder.paymentOther || 0),
        paymentDeliveryApp: Number(taxInvoiceTargetOrder.paymentDeliveryApp || 0),
        deliveryPaymentChannel:
          Number(taxInvoiceTargetOrder.paymentDeliveryApp || 0) > 0.005
            ? String(taxInvoiceTargetOrder.deliveryPaymentChannel || 'grab')
            : null,
        memberId: Number(taxInvoiceTargetOrder.memberId || 0),
        memberNo: String(taxInvoiceTargetOrder.memberNo || ''),
        couponCode: String(taxInvoiceTargetOrder.couponCode || ''),
        couponDiscountAmt: Number(taxInvoiceTargetOrder.couponDiscountAmt || 0),
        pointUsed: Number(taxInvoiceTargetOrder.pointUsed || 0),
        pointEarned: Number(taxInvoiceTargetOrder.pointEarned || 0),
        guestCount: Number(taxInvoiceTargetOrder.guestCount || 0),
      })
      if (!res.success) {
        await appAlert(
          translateApiMessage(String(res.message || ''), t) || t('processFail') || '실패'
        )
        return
      }
      /** 결제 후 세금 정보 저장 시: 결제(세금계산서) 영수증 재인쇄 — 홀 주문표는 매장·VAT·결제 수단이 빠짐 */
      if (isMainPosDevice) {
        const settings = await getPrinterSettingsForStore(currentStoreId)
        const receiptBase = receiptModalDataFromTerminalOrderTaxReprint(
          taxInvoiceTargetOrder,
          currentStoreId,
          nextMemo,
          pricingAdjustments,
          posReceiptLineOpts
        )
        const receiptData = {
          ...receiptBase,
          items: enrichReceiptModalItemsForPromoDisplay(receiptBase.items, posReceiptLineOpts),
        }
        const receiptHtml = buildPosPaymentReceiptDocumentHtml({
          receiptData,
          menus,
          orderTypeLabels: {
            dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
            takeout: tPrint('posOrderTypeTakeout') ?? '포장',
            delivery: tPrint('posOrderTypeDelivery') ?? '배달',
          },
          t: tPrint,
          lang: printLang,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          printedAt: new Date(),
          printerSettings: settings,
          forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(currentStoreId),
        })
        printPosHtmlDocument(receiptHtml, {
          title: tPrint('posReceipt') || '영수증',
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
      }
      if (auth?.store && auth?.role) {
        await upsertPosTaxInvoiceRecipient({
          userStore: auth.store,
          userRole: auth.role,
          storeCode: currentStoreId,
          memberNo: normalizedTiMemberNo || null,
          customerType: tiCustomerType,
          name: normalizedTiName,
          taxId: normalizedTiTaxId,
          branchNo: effectiveTiBranchNo,
          phone: normalizedTiPhone,
          email: normalizedTiEmail,
          address: normalizedTiAddress,
          source: 'terminal_after_payment',
        })
      }
      await appAlert(t('msg_saved'))
      setTaxInvoiceTargetOrder(null)
      setTaxSearchRows([])
      setTaxSearchMessage('')
      await refetchCurrentStore()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTaxInvoiceSaving(false)
    }
  }

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
  const takeoutLabel = translateTakeoutOrderDisplayLabel(
    selectedTakeoutTargetLabel || baseTakeoutLabel,
    t
  )
  const resolveTakeoutOrderBarLabel = (order: Order) => {
    const raw =
      String(order.customerName ?? '').trim() ||
      String(order.tableName ?? '').trim()
    return translateTakeoutOrderDisplayLabel(raw, t, { fallbackOrderId: order.id })
  }

  const takeoutMergePeerTables = useMemo((): Table[] => {
    const takeoutFallback = t('posOrderTypeTakeout') || 'Takeout'
    const rows = [...takeoutOrders, ...packagedTakeoutOrders]
    return rows
      .filter((o) => {
        if (o.status === 'paid' || o.status === 'cancelled' || o.status === 'completed') return false
        if (!o.items?.length) return false
        if (orderPaymentsSum(o) > 0.005) return false
        return true
      })
      .map((o) => {
        const nameRaw =
          String(o.tableName ?? '').trim() ||
          String(o.customerName ?? '').trim() ||
          `${takeoutFallback} #${o.id}`
        return {
          id: `merge-takeout-${o.id}`,
          name: translateTakeoutOrderDisplayLabel(nameRaw, t, { fallbackOrderId: o.id }),
          seats: 0,
          x: 0,
          y: 0,
          width: 80,
          height: 60,
          shape: 'square' as const,
          rotation: 0,
          isOccupied: true,
          order: o,
        }
      })
  }, [takeoutOrders, packagedTakeoutOrders, t])

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
    const createdAt = order.createdAt
      ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt))
      : undefined
    /** POS `pending`은 플랫폼·수동 주문의 미수락 상태 — 목록에서 조리중과 구분 */
    if (normalizedStatus === 'pending') {
      return { status: 'pending' as const, createdAt, targetMin: 0 }
    }
    const allServed = items.length > 0 && servedCount >= items.length
    const status: 'preparing' | 'partial_served' | 'packaged' | 'completed' =
      normalizedStatus === 'completed'
        ? 'completed'
        : normalizedStatus === 'ready' && allServed
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

  const mapPosAccentToBar = (accent: string | null | undefined): NonNullable<OrderBarItem['deliveryAppAccent']> => {
    const raw = String(accent || '').trim().toLowerCase()
    if (raw === 'grab' || raw === 'lime') return 'lime'
    if (raw === 'lineman' || raw === 'sky') return 'sky'
    if (raw === 'shopee' || raw === 'amber') return 'amber'
    if (raw === 'slate') return 'slate'
    return 'slate'
  }

  const resolveMatchedDeliveryAppForOrder = (order: Order): PosDeliveryApp | null => {
    const storedCode = String(order.deliveryAppCode ?? '').trim().toLowerCase()
    if (storedCode) {
      for (const app of deliveryAppsFromApi) {
        const c = String(app.code || '').trim().toLowerCase()
        if (c && c === storedCode) return app
      }
    }
    const tableName = String(order.tableName || '').trim()
    const memo = String(order.memo || '').trim()
    const label = String(order.customerName || '').trim()
    const orderNoRaw = String(order.orderNo || '').trim()
    const probeText = [label, memo, orderNoRaw, tableName].filter(Boolean).join(' \n ')
    const byKeyword = detectDeliveryApp(probeText)
    if (byKeyword) return byKeyword

    const platformName = getPosDeliveryPlatformName(
      { tableName, orderNo: orderNoRaw, memo },
      deliveryAppsFromApi
    ).trim()
    if (!platformName) return null
    const want = platformName.toLowerCase()
    for (const app of deliveryAppsFromApi) {
      const n = String(app.name || '').trim().toLowerCase()
      if (n && n === want) return app
      const c = String(app.code || '').trim().toLowerCase()
      if (c && c === want) return app
    }
    return null
  }

  const buildDeliveryBarFields = (
    order: Order
  ): Pick<OrderBarItem, 'deliveryAppAccent' | 'deliveryAppName' | 'posOrderNo' | 'platformOrderNo' | 'rightLabel'> => {
    const tableName = String(order.tableName || '').trim()
    const memo = String(order.memo || '').trim()
    const orderNoRaw = String(order.orderNo || '').trim()
    const pick = pickPosChannelOrderNo({ tableName, orderNo: orderNoRaw, memo })
    const orderNoDisp = orderNoRaw ? formatPosOrderNoForPrint(orderNoRaw) : ''
    const platformOrderNo =
      pick.kind === 'hash' || pick.kind === 'memo_anchor'
        ? (pick.text.trim() ? `#${pick.text.trim()}` : '')
        : ''

    const matched = resolveMatchedDeliveryAppForOrder(order)
    const platformFromKeywords = getPosDeliveryPlatformName({ tableName, orderNo: orderNoRaw, memo }, deliveryAppsFromApi).trim()
    const platformFromStoredCode = (() => {
      const c = String(order.deliveryAppCode ?? '').trim().toLowerCase()
      if (!c) return ''
      if (c === 'grab') return 'Grab'
      if (c === 'lineman' || c === 'line_man') return 'Line Man'
      if (c === 'shopee') return 'Shopee'
      return ''
    })()
    const platformLabel = (matched?.name || platformFromKeywords || platformFromStoredCode).trim()
    const accentRaw = matched?.accentColor || null
    const accent = mapPosAccentToBar(accentRaw || (platformLabel.toLowerCase().includes('grab') ? 'lime' : platformLabel.toLowerCase().includes('line') ? 'sky' : platformLabel.toLowerCase().includes('shopee') ? 'amber' : 'slate'))

    const customer = String(order.customerName || '').trim()
    return {
      deliveryAppAccent: accent,
      deliveryAppName: platformLabel || undefined,
      ...(orderNoDisp ? { posOrderNo: orderNoDisp } : {}),
      ...(platformOrderNo ? { platformOrderNo } : {}),
      ...(customer ? { rightLabel: customer } : {}),
    }
  }

  const deliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...deliveryOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const visual = getOrderVisual(order)
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel:
          visual.status === 'pending'
            ? t('posOrderBarPendingAccept') || '수락 대기'
            : t('posOrderStatusPreparing') || '진행 중',
        ...bar,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const packagedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedDeliveryOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        ...bar,
      } satisfies OrderBarItem
    })
  }, [packagedDeliveryOrders, t, deliveryAppsFromApi])

  const completedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...completedDeliveryOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: formatPosOrderNoForPrint(order.orderNo || ''),
        ...bar,
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
    const listTypeRank = (lt: 'in_progress' | 'packaged' | 'completed') =>
      lt === 'completed' ? 3 : lt === 'packaged' ? 2 : 1
    const byId = new Map<string, Tagged>()
    for (const row of merged) {
      const oid = String(row.id || '').trim()
      if (!oid) continue
      const lt = (row as Tagged)._listType || 'in_progress'
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, row)
        continue
      }
      const prevLt = (prev as Tagged)._listType || 'in_progress'
      if (listTypeRank(lt) > listTypeRank(prevLt)) {
        byId.set(oid, row)
        continue
      }
      if (listTypeRank(lt) === listTypeRank(prevLt)) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(row.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, row)
      }
    }
    const filtered = Array.from(byId.values())
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const listType = (order as Tagged)._listType
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      const bar = buildDeliveryBarFields(order)
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
              : visual.status === 'pending'
                ? t('posOrderBarPendingAccept') || '수락 대기'
                : t('posOrderStatusPreparing') || '진행 중',
        ...bar,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, packagedDeliveryOrders, completedDeliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const inProgressOrPackagedDeliveryBarItems = useMemo(() => {
    const merged = [...deliveryBarItems, ...packagedDeliveryBarItems]
    const statusRank = (st: OrderBarItem['status']) => {
      if (st === 'packaged') return 4
      if (st === 'completed') return 3
      if (st === 'partial_served') return 2
      if (st === 'preparing') return 1
      if (st === 'pending') return 0
      return 0
    }
    const byId = new Map<string, OrderBarItem>()
    for (const it of merged) {
      const m = /^delivery-order-(.+)$/.exec(String(it.id || '').trim())
      const oid = (m?.[1] || '').trim()
      if (!oid) continue
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, it)
        continue
      }
      const a = statusRank(it.status)
      const b = statusRank(prev.status)
      if (a > b) {
        byId.set(oid, it)
        continue
      }
      if (a === b) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(it.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, it)
      }
    }
    const deduped = Array.from(byId.values())
    deduped.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return deduped
  }, [deliveryBarItems, packagedDeliveryBarItems])
  const currentDeliveryBarItems = deliveryListMode === 'all' ? allDeliveryBarItems : deliveryListMode === 'completed' ? completedDeliveryBarItems : inProgressOrPackagedDeliveryBarItems

  const takeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...takeoutOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = resolveTakeoutOrderBarLabel(order)
      const visual = getOrderVisual(order)
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel:
          visual.status === 'pending'
            ? t('posOrderBarPendingAccept') || '수락 대기'
            : t('posOrderStatusPreparing') || '진행 중',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, menuTargets, t])

  const packagedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedTakeoutOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = resolveTakeoutOrderBarLabel(order)
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
      const label = resolveTakeoutOrderBarLabel(order)
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
    const listTypeRank = (lt: 'in_progress' | 'packaged' | 'completed') =>
      lt === 'completed' ? 3 : lt === 'packaged' ? 2 : 1
    const byId = new Map<string, Tagged>()
    for (const row of merged) {
      const oid = String(row.id || '').trim()
      if (!oid) continue
      const lt = (row as Tagged)._listType || 'in_progress'
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, row)
        continue
      }
      const prevLt = (prev as Tagged)._listType || 'in_progress'
      if (listTypeRank(lt) > listTypeRank(prevLt)) {
        byId.set(oid, row)
        continue
      }
      if (listTypeRank(lt) === listTypeRank(prevLt)) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(row.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, row)
      }
    }
    const filtered = Array.from(byId.values())
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = resolveTakeoutOrderBarLabel(order)
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
              : visual.status === 'pending'
                ? t('posOrderBarPendingAccept') || '수락 대기'
                : t('posOrderStatusPreparing') || '진행 중',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, packagedTakeoutOrders, completedTakeoutOrders, menuTargets, t])

  const inProgressOrPackagedTakeoutBarItems = useMemo(() => {
    const merged = [...takeoutBarItems, ...packagedTakeoutBarItems]
    const statusRank = (st: OrderBarItem['status']) => {
      if (st === 'packaged') return 4
      if (st === 'completed') return 3
      if (st === 'partial_served') return 2
      if (st === 'preparing') return 1
      if (st === 'pending') return 0
      return 0
    }
    const byId = new Map<string, OrderBarItem>()
    for (const it of merged) {
      const m = /^takeout-order-(.+)$/.exec(String(it.id || '').trim())
      const oid = (m?.[1] || '').trim()
      if (!oid) continue
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, it)
        continue
      }
      const a = statusRank(it.status)
      const b = statusRank(prev.status)
      if (a > b) {
        byId.set(oid, it)
        continue
      }
      if (a === b) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(it.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, it)
      }
    }
    const deduped = Array.from(byId.values())
    deduped.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return deduped
  }, [takeoutBarItems, packagedTakeoutBarItems])
  const currentTakeoutBarItems = takeoutListMode === 'all' ? allTakeoutBarItems : takeoutListMode === 'completed' ? completedTakeoutBarItems : inProgressOrPackagedTakeoutBarItems

  const handleTableSelect = (tableId: string) => {
    if (selectedTableId != null && selectedTableId !== tableId) {
      clearCartFromTerminal()
      setPendingDineInOrderId(null)
      pendingDineInOrderTableRef.current = ''
    }
    const table = currentStore?.tables.find((t) => t.id === tableId)
    const order = demoDineInOrder?.tableId === tableId ? demoDineInOrder.order : table?.order
    if (order) {
      setSelectedTableId(null)
      setServingTableId(tableId)
      return
    }
    setServingTableId(null)
    setSelectedTableId(tableId)
  }
  const handleAddItemToCart = useCallback((item: CartPanelAddItemPayload) => {
    if (!isPosDemo && businessOpenBlocked) {
      void appAlert(
        t('posBusinessOpenRequiredBody') ||
          '오늘 POS를 시작하려면 먼저 영업 관리 > 영업 시작에서 돈통 시제를 입력·저장해 주세요.'
      )
      return
    }
    // CartPanel ref가 있으면 addItem으로 위임 (패널 내부 setCartItems = setTerminalCartLines)
    if (cartRef.current?.addItem) {
      cartRef.current.addItem(item)
    } else {
      // 패널 마운트 전/전환 중이면 state 직접 갱신
      setTerminalCartLines((prev) => mergeCartPanelAddItem(prev, item))
    }
  }, [businessOpenBlocked, isPosDemo, t])

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
            onStoreChange={() => {}}
            t={t}
            onSplitCashPaymentStep={handleSplitCashPaymentStep}
            onPaymentModalOpenChange={(open) => {
              setTourPaymentModalOpen(open)
              if (open) {
                splitCashDrawerStepsRef.current = 0
                setTourPaymentCompletedCount(0)
              } else {
                setTourPaymentTab('cash')
                setTourTaxInvoiceEnabled(false)
              }
            }}
            onPaymentTabChange={setTourPaymentTab}
            onTaxInvoiceToggleChange={setTourTaxInvoiceEnabled}
            onPaymentComplete={() => setTourPaymentCompletedCount((v) => v + 1)}
            onPostPaymentCashChange={setPostPaymentCashChangeBaht}
            onGuestCountChange={setTourCartGuestCount}
            posDineInDemoDefaultGuestCount={undefined}
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
            posBackendActionInFlight={posCartBackendBusy}
            onCustomerDisplayPaymentDraftChange={setCustomerDisplayPaymentDraft}
            onDeliveryOrderComplete={async (payload, existingOrderId) => {
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingDeliveryOrderId(null)
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                let memoWithKbank = String(payload.memo ?? '')
                if (existingOrderId != null && payload.payment != null) {
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return
                  const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                    orderType: 'delivery',
                    orderLabel: payload.orderLabel,
                    orderId: existingOrderId,
                  })
                  if (!kbankQr.ok) return
                  memoWithKbank = applyKbankManualMemoTag(payload.memo, kbankQr)
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payloadItemsNormalized),
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    ...posOrderPaymentFieldsFromSnapshot(payload.payment),
                    linkposPayment: linkpos.linkposPayment,
                    pricingAdjustments,
                  })
                  const completedOk = await applyOrderStatusWithRetry({
                    id: existingOrderId,
                    status: 'paid',
                  })
                  if (!completedOk) return
                }
                const subtotal = payloadItemsNormalized.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment), adjustments: pricingAdjustments })
                await tryOpenDrawerOnOrderComplete(payload.payment, {
                  skipAutoOpen: Boolean(payload.splitReceipts?.length),
                })
                const receiptPayload: ReceiptModalData = {
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: cartLinesToPosOrderItems(payloadItemsNormalized),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'delivery',
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...(String(deliveryApp ?? '').trim()
                    ? { deliveryAppCode: String(deliveryApp).trim().toLowerCase() }
                    : {}),
                  ...(payload.payment ? receiptPaymentFieldsFromSnapshot(payload.payment) : {}),
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                }
                const splitBatch = makeSplitPaymentReceiptBatch(
                  {
                    orderNo: receiptPayload.orderNo,
                    storeCode: receiptPayload.storeCode,
                    orderType: receiptPayload.orderType,
                    tableName: receiptPayload.tableName,
                    memo: receiptPayload.memo,
                    discountReason: receiptPayload.discountReason,
                    vatFeeMode: receiptPayload.vatFeeMode,
                  },
                  payload.splitReceipts,
                  !isMainPosDevice
                )
                if (splitBatch.length > 0) {
                  startReceiptBatch(splitBatch)
                } else {
                  setReceiptData(receiptPayload)
                }
                if (existingOrderId != null && existingOrderId > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(existingOrderId)
                }
                setPendingReceiptOrderNo(null)
                setPendingDeliveryOrderId(null)
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
                await refetchCurrentStore()
                if (payload.payment != null) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onTakeoutOrderComplete={async (payload, existingOrderId) => {
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingTakeoutOrderId(null)
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                let memoWithKbank = String(payload.memo ?? '')
                if (existingOrderId != null && payload.payment != null) {
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return
                  const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                    orderType: 'takeout',
                    orderLabel: payload.orderLabel,
                    orderId: existingOrderId,
                  })
                  if (!kbankQr.ok) return
                  memoWithKbank = applyKbankManualMemoTag(payload.memo, kbankQr)
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payloadItemsNormalized),
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    ...posOrderPaymentFieldsFromSnapshot(payload.payment),
                    linkposPayment: linkpos.linkposPayment,
                    pricingAdjustments,
                  })
                  const completedOk = await applyOrderStatusWithRetry({
                    id: existingOrderId,
                    status: 'paid',
                  })
                  if (!completedOk) return
                }
                const subtotal = payloadItemsNormalized.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment), adjustments: pricingAdjustments })
                await tryOpenDrawerOnOrderComplete(payload.payment, {
                  skipAutoOpen: Boolean(payload.splitReceipts?.length),
                })
                const receiptPayload: ReceiptModalData = {
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: cartLinesToPosOrderItems(payloadItemsNormalized),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'takeout',
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...(payload.payment ? receiptPaymentFieldsFromSnapshot(payload.payment) : {}),
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                }
                const splitBatch = makeSplitPaymentReceiptBatch(
                  {
                    orderNo: receiptPayload.orderNo,
                    storeCode: receiptPayload.storeCode,
                    orderType: receiptPayload.orderType,
                    tableName: receiptPayload.tableName,
                    memo: receiptPayload.memo,
                    discountReason: receiptPayload.discountReason,
                    vatFeeMode: receiptPayload.vatFeeMode,
                  },
                  payload.splitReceipts,
                  !isMainPosDevice
                )
                if (splitBatch.length > 0) {
                  startReceiptBatch(splitBatch)
                } else {
                  setReceiptData(receiptPayload)
                }
                if (existingOrderId != null && existingOrderId > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(existingOrderId)
                }
                setPendingReceiptOrderNo(null)
                setPendingTakeoutOrderId(null)
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
                await refetchCurrentStore()
                if (payload.payment != null) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onOrderSubmit={async (payload) => {
              if (posCartBackendBusyRef.current) return
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              /** `await getPosOrders` 등으로 한참 뒤에 맞추면 카트가 비거나 바뀐 뒤라 수량이 엇갈릴 수 있음 → 제출 직후 스냅샷 */
              const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
              let existingOrder = selectedTable?.order ?? null
              let existingOrderId = Number(existingOrder?.id ?? 0)
              const pendingExistingOrderId = Number(pendingDineInOrderId ?? 0)
              const payloadTableKey = normalizePosTableNameForMatch(payload.tableName)
              const pendingTableKey = normalizePosTableNameForMatch(pendingDineInOrderTableRef.current)
              if (
                !(Number.isFinite(existingOrderId) && existingOrderId > 0) &&
                Number.isFinite(pendingExistingOrderId) &&
                pendingExistingOrderId > 0 &&
                payloadTableKey &&
                pendingTableKey &&
                pendingTableKey === payloadTableKey
              ) {
                existingOrderId = pendingExistingOrderId
              }
              if ((existingOrder == null || Number(existingOrder.id ?? 0) !== existingOrderId) && Number.isFinite(existingOrderId) && existingOrderId > 0) {
                try {
                  const rows = await getPosOrders({
                    orderId: existingOrderId,
                    storeCode: currentStoreId,
                    limit: 1,
                  })
                  const hit = Array.isArray(rows) ? rows[0] : null
                  if (hit) {
                    const mappedItems: OrderItem[] = (hit.items || []).map((it, idx) => ({
                      id: String(it.id ?? `line-${idx}`),
                      name: String(it.name ?? ''),
                      quantity: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
                      price: Number(it.price ?? 0) || 0,
                      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
                      ...(String(it.promoId ?? '').trim() ? { promoId: String(it.promoId).trim() } : {}),
                      ...(String(it.promoCode ?? '').trim() ? { promoCode: String(it.promoCode).trim() } : {}),
                      ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
                      ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
                      ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
                      ...(String(it.cancelledAt ?? '').trim() ? { cancelledAt: String(it.cancelledAt) } : {}),
                      ...(String(it.cancelledBy ?? '').trim() ? { cancelledBy: String(it.cancelledBy) } : {}),
                      ...(String(it.cancelReason ?? '').trim() ? { cancelReason: String(it.cancelReason) } : {}),
                    }))
                    existingOrder = {
                      id: String(hit.id ?? existingOrderId),
                      type: 'dine-in',
                      items: mappedItems,
                      total: Number(hit.total ?? 0) || 0,
                      status: 'pending',
                      createdAt: new Date(hit.createdAt || Date.now()),
                      tableName: String(hit.tableName ?? payload.tableName ?? ''),
                      orderNo: String(hit.orderNo ?? '').trim() || undefined,
                      guestCount: Math.max(0, Math.trunc(Number(hit.guestCount ?? 0) || 0)),
                    }
                  }
                } catch (e) {
                  console.warn('lookup existing dine-in order failed:', e)
                }
              }
              const isAddOrder = existingOrder != null && Number.isFinite(existingOrderId) && existingOrderId > 0
              try {
                if (isPosDemo) {
                  const tid = selectedTableId
                  /** 데모 바닥 id(`demo-table-*`)는 매장 `tables`에 없을 수 있음 — `selectedTable`과 동일하게 해석 */
                  const tbl = tid ? selectedTable : undefined
                  if (activeTab === 'tables' && tid && tbl) {
                    const subtotal = payload.items.reduce(
                      (s, it) => s + it.price * Math.max(1, Number(it.quantity) || 1),
                      0
                    )
                    const discountAmt = payload.discountAmt ?? 0
                    const pricing = computePosPricing({
                      subtotal,
                      discountAmt,
                      cardPaymentAmount: 0,
                      adjustments: pricingAdjustments,
                    })
                    const orderItems: OrderItem[] = payload.items.map((it, idx) => ({
                      id: String(it.id || `demo-line-${idx}`),
                      name: it.name,
                      quantity: Math.max(1, Number(it.quantity) || 1),
                      price: it.price,
                      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
                    }))
                    const order: Order = {
                      id: '900001',
                      tableId: tid,
                      type: 'dine-in',
                      items: orderItems,
                      total: pricing.finalTotal,
                      status: 'preparing',
                      createdAt: new Date(),
                      orderNo: `DEMO-${Date.now()}`,
                      guestCount: Math.max(1, Math.trunc(Number(payload.guestCount ?? 1) || 1)),
                      ...(String(payload.memo ?? '').trim() ? { memo: String(payload.memo).trim() } : {}),
                    }
                    setDemoDineInOrder({ tableId: tid, order })
                    setPendingDineInOrderId(null)
                    pendingDineInOrderTableRef.current = ''
                    setServingTableId(tid)
                    setSelectedTableId(null)
                    clearCartFromTerminal()
                    await refetchCurrentStore()
                    return
                  }
                  setPendingDineInOrderId(null)
                  pendingDineInOrderTableRef.current = ''
                  setDemoDineInOrder(null)
                  setServingTableId(null)
                  setSelectedTableId(null)
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                const incomingItems = cartLinesToPosOrderItems(payloadItemsNormalized)
                /** 카트에 기존 줄이 없을 때(첫 주문 후 카트 비움)에도 DB·영수증이 한 주문으로 유지되도록 병합 */
                const posItemsForSave =
                  isAddOrder && existingOrder
                    ? mergeDineInAddonCartPosItemsWithExisting(
                        orderUiItemsToPosOrderItems(existingOrder.items),
                        incomingItems
                      )
                    : incomingItems
                let savedOrderNo = ''
                let savedOrderId: number | null = null
                let queuedLocalOrderNo: string | null = null
                let queuedWithoutServerId = false
                // 기존 주문 id만 남고 본문 스냅샷이 비는 레이스(리패치/동기화 직후)에서는
                // 저장을 막지 않고 신규 저장 경로로 폴백해 주문 유실을 방지한다.
                if (isAddOrder && existingOrder) {
                  /**
                   * 추가 주문: 카트가 기존+신규 전체일 수도 있고, 신규 줄만 있을 수도 있다.
                   * `posItemsForSave`는 `mergeDineInAddonCartPosItemsWithExisting`로 후자일 때 DB 줄을 유지한다.
                   */
                  if (isMainPosDevice) {
                    mainPosSelfDineInUpdateSuppressUntilRef.current.set(existingOrderId, Date.now() + 12_000)
                  }
                  const updateReq = {
                    id: existingOrderId,
                    items: posItemsForSave,
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    pointEarned: 0,
                    guestCount: payload.guestCount ?? existingOrder.guestCount,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                  }
                  const res = await updatePosOrder(updateReq)
                  if (!res.success) {
                    const msg = localizeApiPopupMessage(res.message, t('posOrderSaveFailed') || '주문 저장에 실패했습니다.')
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = existingOrderId
                  savedOrderNo = existingOrder.orderNo ?? ''
                  logPosPrintDebug('submit_save_success_update_pos_order', {
                    orderId: savedOrderId,
                    orderNo: savedOrderNo,
                    isAddOrder: true,
                    incomingItems: incomingItems.length,
                  })
                } else {
                  const saveReq = {
                    storeCode: currentStoreId,
                    createdBy: auth?.user ?? '',
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt,
                    discountReason: payload.discountReason,
                    serviceAmt: payload.serviceAmt,
                    serviceReason: payload.serviceReason,
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    localOrderNo: posSaveClientKey,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                    items: incomingItems,
                  }
                  const res = await savePosOrderWithOffline(saveReq)
                  if (!res.success) {
                    const msg = localizeApiPopupMessage((res as { message?: string }).message, t('posOrderSaveFailed') || '주문 저장에 실패했습니다.')
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = res.orderId ?? null
                  savedOrderNo = (res as { orderNo?: string }).orderNo ?? ''
                  const queued = Boolean((res as { queued?: boolean }).queued)
                  await notifyQueuedSave(savedOrderNo, queued)
                  if (queued && savedOrderNo.startsWith('LOCAL-')) queuedLocalOrderNo = savedOrderNo
                  queuedWithoutServerId = queued && !(savedOrderId != null && savedOrderId > 0)
                  if (queuedWithoutServerId) {
                    upsertOptimisticOrder({
                      storeCode: currentStoreId,
                      orderNo: savedOrderNo,
                      orderType: 'dine_in',
                      tableName: payload.tableName,
                      memo: payload.memo,
                      status: 'pending',
                      total: incomingItems.reduce(
                        (acc, it) => acc + Number(it.price ?? 0) * resolveCartLineQuantityForSave(it),
                        0
                      ),
                      items: incomingItems.map((it) => ({
                        id: String(it.id ?? ''),
                        name: String(it.name ?? ''),
                        quantity: resolveCartLineQuantityForSave(it),
                        price: Number(it.price ?? 0),
                        ...(String((it as { menuId?: string }).menuId ?? '').trim()
                          ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                          : {}),
                        ...(String((it as { optionId?: string }).optionId ?? '').trim()
                          ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                          : {}),
                        ...(String((it as { note?: string }).note ?? '').trim()
                          ? { note: String((it as { note?: string }).note).trim() }
                          : {}),
                      })),
                    })
                  }
                  logPosPrintDebug('submit_save_success_new_pos_order', {
                    orderId: savedOrderId,
                    orderNo: savedOrderNo,
                    queued,
                    incomingItems: incomingItems.length,
                  })
                }
                const markQueuedLocalPrintedIfNeeded = () => {
                  if (!queuedLocalOrderNo) return
                  registerLocallyPrintedQueuedOrderNo(queuedLocalOrderNo)
                  queuedLocalOrderNo = null
                }
                let skipLocalAutoPrint = false
                if (savedOrderId != null) {
                  // 추가 주문은 기존 orderId로 merge 저장이라 이미 seen에 있음. 여기서 skip하면 홀/주방 인쇄가 막힘(폴링·로컬 중복 방지는 신규 주문에만 적용).
                  if (!isAddOrder) {
                    skipLocalAutoPrint = seenOrderIdsRef.current.has(savedOrderId)
                  }
                  seenOrderIdsRef.current.add(savedOrderId)
                  bumpLastSeenOrderId(savedOrderId)
                }

                type ReceiptPrintLine = {
                  id: string
                  name: string
                  price: number
                  qty: number
                  note?: string
                  isAddon?: boolean
                  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                }
                const mapPosItemToReceiptLine = (
                  it: (typeof posItemsForSave)[number],
                  addon: boolean
                ): ReceiptPrintLine => ({
                  id: String(it.id ?? ''),
                  name: String(it.name ?? ''),
                  price: Number(it.price ?? 0),
                  qty: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }),
                  ...(String((it as { note?: string }).note ?? '').trim()
                    ? { note: String((it as { note?: string }).note).trim() }
                    : {}),
                  ...(Array.isArray((it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }).promoItems)
                    ? {
                        promoItems: enrichPromoItemsWithOptionName(
                          (it as { promoItems: { menuId: string; optionId: string | null; quantity: number }[] }).promoItems
                        ),
                      }
                    : {}),
                  ...(addon ? { isAddon: true as const } : {}),
                })
                const receiptPrintItems: ReceiptPrintLine[] = posItemsForSave.map((it) => {
                  if (!isAddOrder || !existingOrder) {
                    return mapPosItemToReceiptLine(it, false)
                  }
                  const id = normalizeCartLineIdForSave(it.id)
                  const prev = existingOrder.items.find((e) => normalizeCartLineIdForSave(e.id) === id)
                  const qNow = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
                  const qPrev = prev
                    ? resolveCartLineQuantityForSave(prev as { quantity?: unknown; qty?: unknown })
                    : 0
                  const addon = !prev || qNow > qPrev
                  return mapPosItemToReceiptLine(it, addon)
                })

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
                    ? filterKitchenCartLinesForDineInAdd(payloadItemsNormalized, existingOrder.items)
                    : payloadItemsNormalized
                const receiptPayloadSubmit = {
                  orderNo: savedOrderNo,
                  storeCode: currentStoreId,
                  orderType: t('posOrderTypeDineIn') || '매장',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  items: receiptPrintItems,
                  subtotal: mergeSubtotal,
                  discountAmt,
                  couponDiscountAmt: payload.couponDiscountAmt ?? 0,
                  discountReason: String(payload.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...posGuestCountSpread(payload.guestCount),
                }
                const storeAutoPrint = await resolveStoreAutoPrintFlags(currentStoreId)
                const shouldAutoPrintReceipt = isAddOrder
                  ? storeAutoPrint.receiptOnAddOrder
                  : storeAutoPrint.receiptOnOrder
                const autoPrintKitchenForSubmit = storeAutoPrint.kitchenOnOrder
                const runKitchenAfterDineInSubmit = () => {
                  if (kitchenCartLines.length === 0) return
                  const kitchenPrintKey =
                    savedOrderId != null
                      ? isAddOrder
                        ? `order:${savedOrderId}:kitchen:add:${kitchenCartLines.length}`
                        : `order:${savedOrderId}:kitchen`
                      : `submit:${orderNoStr}:${payload.tableName || ''}:${isAddOrder ? 'add' : 'new'}`
                  if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
                  logPosPrintDebug('submit_kitchen_autoprint_dispatch', {
                    orderId: savedOrderId,
                    orderNo: orderNoStr,
                    kitchenPrintKey,
                    kitchenLines: kitchenCartLines.length,
                    isAddOrder,
                  })
                  const itemsForKitchen = kitchenCartLines.map((i) => {
                    const line = i as {
                      menuId?: string
                      menuId1?: string
                      menu_id1?: string
                      menuId2?: string
                      note?: string
                      promoId?: string
                      promoCode?: string
                      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                    }
                    const menuId = String(
                      line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? ''
                    ).trim()
                    const note = String(line.note ?? '').trim()
                    const promoId = String(line.promoId ?? '').trim()
                    const promoCode = String(line.promoCode ?? '').trim()
                    return {
                      id: i.id,
                      name: i.name,
                      price: i.price,
                      qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
                      ...(menuId ? { menuId } : {}),
                      ...(note ? { note } : {}),
                      ...(promoId ? { promoId } : {}),
                      ...(promoCode ? { promoCode } : {}),
                      ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
                    }
                  })
                  getPrinterSettingsForStore(currentStoreId)
                    .then((settings) => {
                      const ki = kitchenSlipPrintI18n(settings, lang)
                      const slips = buildKitchenSlipGroups(
                        kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
                        buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
                      )
                      if (!slips.length) return
                      const slipDesign = resolveKitchenSlipDesign(settings)
                      const kitchenMemo = parsePosOrderMemo(payload.memo).plainMemo
                      const memoLine = kitchenMemo.trim()
                        ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                        : ''
                      const cR = (tag: string) => '\u003c/' + tag + '>'
                      const tablePartR = payload.tableName
                        ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(payload.tableName, ki.t)
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
                          orderTypeLabel: ki.orderTypeLabels.dine_in || '매장',
                          tablePart: tablePartR,
                          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                          items: kitchenSlipItemsForPrint(
                            slip.items,
                            kitchenItemsWithResolvedPromo(
                              itemsForKitchen as Record<string, unknown>[]
                            ) as KitchenSlipRoutingItem[],
                            ki
                          ),
                          memoLine: memoLine || null,
                          escapeHtml,
                          design: slipDesign,
                          optionNameByCode,
                          printColorAdjust: 'exact',
                          prependItemsHtml: isAddOrder && idx === 0 ? addonKitchenHead : '',
                          ...posKitchenGuestSpread(payload.guestCount, ki.t('posOrderGuestCount')),
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
                    setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                          },
                        })
                      }
                      setTimeout(() => printOne(0), 0)
                    })
                    .catch((e) => console.error('Kitchen slip print:', e))
                }
                if (isMainPosDevice && shouldAutoPrintReceipt && !skipLocalAutoPrint) {
                  markQueuedLocalPrintedIfNeeded()
                  logPosPrintDebug('submit_receipt_autoprint_dispatch', {
                    orderId: savedOrderId,
                    orderNo: orderNoStr,
                    autoPrintKitchenSlipOnOrder: autoPrintKitchenForSubmit,
                    skipLocalAutoPrint,
                    receiptItems: receiptPrintItems.length,
                  })
                  if (autoPrintKitchenForSubmit && kitchenCartLines.length > 0) {
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
                  autoPrintKitchenForSubmit &&
                  !skipLocalAutoPrint &&
                  payloadItemsNormalized.length > 0 &&
                  kitchenCartLines.length > 0
                ) {
                  markQueuedLocalPrintedIfNeeded()
                  logPosPrintDebug('submit_kitchen_only_autoprint_dispatch', {
                    orderId: savedOrderId,
                    orderNo: orderNoStr,
                    skipLocalAutoPrint,
                    kitchenLines: kitchenCartLines.length,
                  })
                  setTimeout(runKitchenAfterDineInSubmit, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
                } else if (
                  isMainPosDevice &&
                  !skipLocalAutoPrint &&
                  !shouldAutoPrintReceipt &&
                  !autoPrintKitchenForSubmit
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
                    ...receiptTaxDisplayFieldsFromPricing(pricing),
                    serviceFeeAmt: pricing.serviceFeeAmt,
                    serviceFeeMode: pricing.serviceFeeMode,
                    cardFeeAmt: pricing.cardFeeAmt,
                    cardFeeMode: pricing.cardFeeMode,
                    otherFeeAmt: pricing.otherFeeAmt,
                    otherFeeMode: pricing.otherFeeMode,
                    receiptAutoPrintContext: isAddOrder ? 'add_order' : 'order',
                  })
                }
                if (savedOrderId != null && savedOrderId > 0) {
                  const qtySnap = buildDineInQtySnapshot(receiptPrintItems)
                  if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(savedOrderId, qtySnap)
                }
                if (savedOrderId != null) {
                  setPendingDineInOrderId(savedOrderId)
                  pendingDineInOrderTableRef.current = String(payload.tableName ?? '').trim()
                }
                setServingTableId(null)
                setSelectedTableId(null)
                await refreshStoreListAfterOrderSave({
                  orderType: 'dine_in',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  status: 'pending',
                  orderNo: savedOrderNo,
                  serverOrderId: savedOrderId,
                  total: mergeSubtotal - (payload.discountAmt ?? 0),
                  items: receiptPrintItems.map((it) => ({
                    id: it.id,
                    name: it.name,
                    quantity: it.qty,
                    price: it.price,
                    ...(it.note ? { note: it.note } : {}),
                  })),
                  queuedWithoutServerId,
                })
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onDineInOrderComplete={async (payload, existingOrderId) => {
              if (posCartBackendBusyRef.current) return
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingDineInOrderId(null)
                  pendingDineInOrderTableRef.current = ''
                  setDemoDineInOrder(null)
                  setServingTableId(null)
                  setSelectedTableId(null)
                  clearCartFromTerminal()
                  clearReceiptQueue()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                let orderIdToComplete: number | null = null
                let orderNo: string = ''
                const pay = payload.payment
                const linkpos = pay ? await runLinkposPaymentIfNeeded(pay) : { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
                if (!linkpos.ok) return
                const kbankQr = pay
                  ? await runKbankQrPaymentIfNeeded(pay, {
                      orderType: 'dine_in',
                      orderLabel: payload.tableName,
                      orderId: existingOrderId ?? undefined,
                    })
                  : { ok: true as const }
                if (!kbankQr.ok) return
                const memoWithKbank = applyKbankManualMemoTag(payload.memo, kbankQr)
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const targetClose: 'paid' | 'completed' = payload.isPrepaid ? 'paid' : 'completed'
                /** 서버에 행이 있을 때만 update API 사용 (오프라인 임시 음수 id 제외) */
                if (existingOrderId != null && existingOrderId > 0 && pay != null) {
                  await updatePosOrder({
                    id: existingOrderId,
                    items: cartLinesToPosOrderItems(payloadItemsNormalized),
                    tableName: payload.tableName,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    ...posOrderPaymentFieldsFromSnapshot(pay),
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
                      items: cartLinesToPosOrderItems(payloadItemsNormalized),
                      tableName: payload.tableName,
                      memo: memoWithKbank,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      serviceAmt: payload.serviceAmt ?? 0,
                      serviceReason: payload.serviceReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      couponCode: payload.couponCode,
                      couponDiscountAmt: payload.couponDiscountAmt,
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      ...posOrderPaymentFieldsFromSnapshot(pay),
                      linkposPayment: linkpos.linkposPayment,
                      kbankPartnerTransactionId: String((kbankQr as { partnerTransactionId?: string }).partnerTransactionId || '') || null,
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
                      memo: memoWithKbank,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      serviceAmt: payload.serviceAmt ?? 0,
                      serviceReason: payload.serviceReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      couponCode: payload.couponCode,
                      couponDiscountAmt: payload.couponDiscountAmt,
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      localOrderNo: posSaveClientKey,
                      items: cartLinesToPosOrderItems(payloadItemsNormalized),
                      ...posOrderPaymentFieldsFromSnapshot(pay),
                      linkposPayment: linkpos.linkposPayment,
                      kbankPartnerTransactionId: String((kbankQr as { partnerTransactionId?: string }).partnerTransactionId || '') || null,
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
                  const statusOk = await applyOrderStatusWithRetry({
                    id: orderIdToComplete,
                    status: targetStatus,
                  })
                  if (!statusOk) return
                  /** 후불(완료)만 즉시 테이블 비움. 선불(paid)은 테이블·내역 유지 */
                  if (!payload.isPrepaid && payload.tableName) {
                    clearTableOrder(currentStoreId, payload.tableName)
                  }
                } else if (pay != null && payload.tableName && !payload.isPrepaid) {
                  /** 오프라인 등 orderId 없이 저장만 한 후불 완료 시 테이블 비움 */
                  clearTableOrder(currentStoreId, payload.tableName)
                }
                const subtotal = payloadItemsNormalized.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment), adjustments: pricingAdjustments })
                await tryOpenDrawerOnOrderComplete(payload.payment, {
                  skipAutoOpen: Boolean(payload.splitReceipts?.length),
                })
                const receiptPayload: ReceiptModalData = {
                  orderNo,
                  items: cartLinesToPosOrderItems(payloadItemsNormalized),
                  subtotal,
                  discountAmt,
                  total: pricing.finalTotal,
                  storeCode: currentStoreId,
                  orderType: 'dine_in',
                  tableName: payload.tableName,
                  memo: memoWithKbank,
                  discountReason: payload.discountReason,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...(pay ? receiptPaymentFieldsFromSnapshot(pay) : {}),
                  receiptAutoPrintContext: 'payment',
                  suppressReceiptModalAutoPrint: !isMainPosDevice,
                }
                const splitBatch = makeSplitPaymentReceiptBatch(
                  {
                    orderNo: receiptPayload.orderNo,
                    storeCode: receiptPayload.storeCode,
                    orderType: receiptPayload.orderType,
                    tableName: receiptPayload.tableName,
                    memo: receiptPayload.memo,
                    discountReason: receiptPayload.discountReason,
                    vatFeeMode: receiptPayload.vatFeeMode,
                  },
                  payload.splitReceipts,
                  !isMainPosDevice
                )
                if (splitBatch.length > 0) {
                  startReceiptBatch(splitBatch)
                } else {
                  setReceiptData(receiptPayload)
                }
                if (orderIdToComplete != null && orderIdToComplete > 0 && isMainPosDevice) {
                  printedPaymentReceiptIdsRef.current.add(orderIdToComplete)
                }
                setPendingReceiptOrderNo(null)
                setPendingDineInOrderId(null)
                pendingDineInOrderTableRef.current = ''
                setServingTableId(null)
                setSelectedTableId(null)
                await refetchCurrentStore()
                if (pay) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onNonDineOrderComplete={async (payload) => {
              if (posCartBackendBusyRef.current) return
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              try {
                if (isPosDemo) {
                  if (payload.orderType === 'delivery') {
                    setSelectedDeliveryTargetId(null)
                    setSelectedDeliveryTargetLabel('')
                    setDeliveryApp(null)
                    setDeliveryOrderNo('')
                  } else if (payload.orderType === 'takeout') {
                    setSelectedTakeoutTargetId(null)
                    setSelectedTakeoutTargetLabel('')
                  }
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                /** `await` 사이에 카트가 비면 터미널 보정이 불가 → 링크포스/결제 대기 전에 스냅샷 */
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                if (!linkpos.ok) return
                const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                  orderType: payload.orderType,
                  orderLabel: payload.orderLabel,
                })
                if (!kbankQr.ok) return
                const memoWithKbank = applyKbankManualMemoTag(payload.memo, kbankQr)
                const paymentSumBeforeSave =
                  Math.max(0, Number(payload.payment?.paymentCash ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentCard ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentQr ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentOther ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentDeliveryApp ?? 0))
                const hasPayment = paymentSumBeforeSave > 0.0001
                const res = await savePosOrderWithOffline({
                  storeCode: currentStoreId,
                  createdBy: auth?.user ?? '',
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  discountAmt: payload.discountAmt ?? 0,
                  discountReason: payload.discountReason ?? '',
                  serviceAmt: payload.serviceAmt ?? 0,
                  serviceReason: payload.serviceReason ?? '',
                  memberId: payload.memberId,
                  memberNo: payload.memberNo,
                  couponCode: payload.couponCode,
                  couponDiscountAmt: payload.couponDiscountAmt,
                  pointUsed: payload.pointUsed,
                  localOrderNo: posSaveClientKey,
                  items: cartLinesToPosOrderItems(payloadItemsNormalized),
                  ...(payload.orderType === 'delivery' && deliveryApp
                    ? { deliveryAppCode: String(deliveryApp) }
                    : {}),
                  ...posOrderPaymentFieldsFromSnapshot(payload.payment ?? null),
                  linkposPayment: linkpos.linkposPayment,
                  kbankPartnerTransactionId: String(kbankQr.partnerTransactionId || '') || null,
                  pricingAdjustments,
                  ...(hasPayment ? { closeStatus: 'paid' as const } : {}),
                })
                if (!res.success) {
                  const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                  await appAlert(msg)
                  return
                }
                const orderNo = (res as { orderNo?: string }).orderNo ?? ''
                const newOrderId = (res as { orderId?: number }).orderId ?? null
                const queued = Boolean((res as { queued?: boolean }).queued)
                const queuedWithoutServerId = queued && !(newOrderId != null && newOrderId > 0)
                await notifyQueuedSave(orderNo, queued)
                let queuedLocalOrderNo: string | null =
                  queued && orderNo.startsWith('LOCAL-') ? orderNo : null
                const markQueuedLocalPrintedIfNeeded = () => {
                  if (!queuedLocalOrderNo) return
                  registerLocallyPrintedQueuedOrderNo(queuedLocalOrderNo)
                  queuedLocalOrderNo = null
                }
                let suppressReceiptModalAutoPrint = !isMainPosDevice
                if (newOrderId != null && newOrderId > 0) {
                  if (seenOrderIdsRef.current.has(newOrderId)) suppressReceiptModalAutoPrint = true
                  seenOrderIdsRef.current.add(newOrderId)
                  bumpLastSeenOrderId(newOrderId)
                }
                const subtotal = payloadItemsNormalized.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment), adjustments: pricingAdjustments })
                await tryOpenDrawerOnOrderComplete(payload.payment, {
                  skipAutoOpen: Boolean(payload.splitReceipts?.length),
                })
                if (queuedWithoutServerId) {
                  upsertOptimisticOrder({
                    storeCode: currentStoreId,
                    orderNo,
                    orderType: payload.orderType,
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    status: hasPayment ? 'paid' : 'pending',
                    total: pricing.finalTotal,
                    items: payloadItemsNormalized.map((it) => ({
                      id: String(it.id ?? ''),
                      name: String(it.name ?? ''),
                      quantity: resolveCartLineQuantityForSave(it),
                      price: Number(it.price ?? 0),
                      ...(String((it as { menuId?: string }).menuId ?? '').trim()
                        ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                        : {}),
                      ...(String((it as { optionId?: string }).optionId ?? '').trim()
                        ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                        : {}),
                      ...(String((it as { note?: string }).note ?? '').trim()
                        ? { note: String((it as { note?: string }).note).trim() }
                        : {}),
                    })),
                  })
                }
                const receiptItems = cartLinesToPosOrderItems(payloadItemsNormalized)
                const receiptPayloadSubmit = {
                  orderNo,
                  storeCode: currentStoreId,
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  items: receiptItems,
                  subtotal,
                  discountAmt,
                  couponDiscountAmt: payload.couponDiscountAmt ?? 0,
                  discountReason: String(payload.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...(payload.orderType === 'delivery' && String(deliveryApp ?? '').trim()
                    ? { deliveryAppCode: String(deliveryApp).trim().toLowerCase() }
                    : {}),
                  ...(hasPayment && payload.payment
                    ? receiptPaymentFieldsFromSnapshot(payload.payment)
                    : {}),
                }
                const runKitchenAfterNonDineSubmit = () => {
                  const kitchenPrintKey =
                    newOrderId != null && newOrderId > 0
                      ? `order:${newOrderId}:kitchen`
                      : `submit:${orderNo}:${payload.orderLabel || ''}:${payload.orderType}`
                  if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
                  const itemsForKitchen = payloadItemsNormalized.map((i) => {
                    const line = i as {
                      menuId?: string
                      menuId1?: string
                      menu_id1?: string
                      menuId2?: string
                      note?: string
                      promoId?: string
                      promoCode?: string
                      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                    }
                    const menuId = String(
                      line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? ''
                    ).trim()
                    const note = String(line.note ?? '').trim()
                    const promoId = String(line.promoId ?? '').trim()
                    const promoCode = String(line.promoCode ?? '').trim()
                    return {
                      id: i.id,
                      name: i.name,
                      price: i.price,
                      qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
                      ...(menuId ? { menuId } : {}),
                      ...(note ? { note } : {}),
                      ...(promoId ? { promoId } : {}),
                      ...(promoCode ? { promoCode } : {}),
                      ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
                    }
                  })
                  getPrinterSettingsForStore(currentStoreId)
                    .then((settings) => {
                      const ki = kitchenSlipPrintI18n(settings, lang)
                      const slips = buildKitchenSlipGroups(
                        kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
                        buildKitchenSlipGroupOpts(settings, menus, ki.kLabels)
                      )
                      if (!slips.length) return
                      const slipDesign = resolveKitchenSlipDesign(settings)
                      const kitchenMemo = parsePosOrderMemo(memoWithKbank).plainMemo
                      const memoLine = kitchenMemo.trim()
                        ? (ki.t('posCustomerMemo') || '메모') + ': ' + kitchenMemo.trim()
                        : ''
                      const tablePartR = payload.orderLabel
                        ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(payload.orderLabel, ki.t)
                        : ''
                      const orderTypeLabel =
                        ki.orderTypeLabels[normalizePosOrderTypeKey(payload.orderType)] ||
                        payload.orderType
                      const printOne = (idx: number) => {
                        if (idx >= slips.length) return
                        const slip = slips[idx]
                        const html = buildKitchenSlipDocumentHtml({
                          label: slip.label,
                          orderNo,
                          storeCode: currentStoreId,
                          orderTypeLabel,
                          tablePart: tablePartR,
                          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                          items: kitchenSlipItemsForPrint(
                            slip.items,
                            kitchenItemsWithResolvedPromo(
                              itemsForKitchen as Record<string, unknown>[]
                            ) as KitchenSlipRoutingItem[],
                            ki
                          ),
                          memoLine: memoLine || null,
                          escapeHtml,
                          design: slipDesign,
                          optionNameByCode,
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
                            if (idx + 1 < slips.length) {
                              setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                            }
                          },
                        })
                      }
                      setTimeout(() => printOne(0), 0)
                    })
                    .catch((e) => console.error('Kitchen slip print(non-dine):', e))
                }

                const storeAutoPrintNonDine = await resolveStoreAutoPrintFlags(currentStoreId)
                const autoPrintReceiptNonDine = storeAutoPrintNonDine.receiptOnOrder
                const autoPrintKitchenNonDine = storeAutoPrintNonDine.kitchenOnOrder

                if (!hasPayment && isMainPosDevice && !suppressReceiptModalAutoPrint) {
                  if (autoPrintReceiptNonDine && autoPrintKitchenNonDine && payloadItemsNormalized.length > 0) {
                    markQueuedLocalPrintedIfNeeded()
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true, runKitchenAfterNonDineSubmit)
                  } else if (autoPrintReceiptNonDine) {
                    markQueuedLocalPrintedIfNeeded()
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true)
                  } else if (autoPrintKitchenNonDine && payloadItemsNormalized.length > 0) {
                    markQueuedLocalPrintedIfNeeded()
                    setTimeout(runKitchenAfterNonDineSubmit, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
                  } else {
                    setReceiptData({
                      ...receiptPayloadSubmit,
                      receiptAutoPrintContext: 'order',
                      suppressReceiptModalAutoPrint: false,
                    })
                  }
                } else {
                  if (hasPayment) {
                    const splitBatch = makeSplitPaymentReceiptBatch(
                      {
                        orderNo: receiptPayloadSubmit.orderNo,
                        storeCode: receiptPayloadSubmit.storeCode,
                        orderType: receiptPayloadSubmit.orderType,
                        tableName: receiptPayloadSubmit.tableName,
                        memo: receiptPayloadSubmit.memo,
                        discountReason: payload.discountReason,
                        vatFeeMode: receiptPayloadSubmit.vatFeeMode,
                      },
                      payload.splitReceipts,
                      suppressReceiptModalAutoPrint
                    )
                    if (splitBatch.length > 0) {
                      startReceiptBatch(splitBatch)
                    } else {
                      setReceiptData({
                        ...receiptPayloadSubmit,
                        receiptAutoPrintContext: 'payment',
                        suppressReceiptModalAutoPrint,
                      })
                    }
                  } else {
                    setReceiptData({
                      ...receiptPayloadSubmit,
                      receiptAutoPrintContext: 'order',
                      suppressReceiptModalAutoPrint,
                    })
                  }
                }
                await refreshStoreListAfterOrderSave({
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  status: hasPayment ? 'paid' : 'pending',
                  orderNo,
                  serverOrderId: newOrderId,
                  total: pricing.finalTotal,
                  items: payloadItemsNormalized.map((it) => ({
                    id: String(it.id ?? ''),
                    name: String(it.name ?? ''),
                    quantity: resolveCartLineQuantityForSave(it),
                    price: Number(it.price ?? 0),
                    ...(String((it as { menuId?: string }).menuId ?? '').trim()
                      ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                      : {}),
                    ...(String((it as { optionId?: string }).optionId ?? '').trim()
                      ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                      : {}),
                    ...(String((it as { note?: string }).note ?? '').trim()
                      ? { note: String((it as { note?: string }).note).trim() }
                      : {}),
                  })),
                  queuedWithoutServerId,
                })
                /** 배달·포장「주문」만 저장 시: 목록에서 다시 누르지 않도록 방금 저장한 건 자동 선택 */
                if (payload.orderType === 'delivery') {
                  if (!hasPayment && newOrderId != null && newOrderId > 0) {
                    if (deliveryListMode === 'completed') {
                      setDeliveryListMode('in_progress')
                    }
                    setSelectedDeliveryTargetId(`delivery-order-${newOrderId}`)
                    const lbl =
                      String(payload.orderLabel || '').trim() ||
                      (t('posOrderTypeDelivery') || '배달')
                    setSelectedDeliveryTargetLabel(lbl)
                    const app = detectDeliveryApp(lbl)
                    if (app) setDeliveryApp(app.code)
                    setDeliveryOrderNo(detectDeliveryOrderNo(lbl))
                  } else {
                    setSelectedDeliveryTargetId(null)
                    setSelectedDeliveryTargetLabel('')
                    setDeliveryApp(null)
                    setDeliveryOrderNo('')
                  }
                } else if (payload.orderType === 'takeout') {
                  if (!hasPayment && newOrderId != null && newOrderId > 0) {
                    if (takeoutListMode === 'completed') {
                      setTakeoutListMode('in_progress')
                    }
                    setSelectedTakeoutTargetId(`takeout-order-${newOrderId}`)
                    setSelectedTakeoutTargetLabel(
                      String(payload.orderLabel || '').trim() ||
                        (t('posOrderTypeTakeout') || '포장')
                    )
                  } else {
                    setSelectedTakeoutTargetId(null)
                    setSelectedTakeoutTargetLabel('')
                  }
                }
                if (hasPayment) schedulePostPaymentCustomerQr()
              } catch (e) {
                console.error('savePosOrder(non-dine):', e)
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
          />
  )
  const effectiveAutoPrint = readStoreAutoPrintFlagsSync()
  const effectiveAutoPrintReceiptOnOrder = effectiveAutoPrint.receiptOnOrder
  const effectiveAutoPrintReceiptOnAddOrder = effectiveAutoPrint.receiptOnAddOrder
  const effectiveAutoPrintReceiptOnPayment = effectiveAutoPrint.receiptOnPayment
  const effectiveAutoPrintKitchenSlipOnOrder = effectiveAutoPrint.kitchenOnOrder

  return (
    <PosTourProvider isDemo={isPosDemo} scenarioId={tourScenarioId}>
      <PosTourTerminalManualNextGates
        dineInGuestCount={tourCartGuestCount}
        activeTab={activeTab}
        mainDeviceTouched={tourMainDeviceTouched}
        onMainDeviceTourStepEnter={() => setTourMainDeviceTouched(false)}
      />
      <PosTerminalTourController
        activeTab={activeTab}
        selectedTableId={selectedTableId}
        servingTableId={servingTableId}
        cartLineCount={terminalCartLines.length}
        selectedDeliveryTargetId={selectedDeliveryTargetId}
        selectedTakeoutTargetId={selectedTakeoutTargetId}
        paymentModalOpen={tourPaymentModalOpen}
        paymentTab={tourPaymentTab}
        paymentCardAmount={tourPaymentCardAmount}
        paymentQrAmount={tourPaymentQrAmount}
        paymentDeliveryAppAmount={tourPaymentDeliveryAppAmount}
        paymentOtherAmount={tourPaymentOtherAmount}
        needTaxInvoice={tourTaxInvoiceEnabled}
        paymentCompletedCount={tourPaymentCompletedCount}
        mainDeviceModeChanged={tourMainDeviceTouched}
        servingItemChecked={tourServingItemChecked}
        servingOrderReady={tourServingOrder?.status === 'ready'}
        liveMenuSearchOpen={liveSearchOpen}
      />
      <PosTourOverlay />
      <div className="flex h-full min-h-0 flex-col">
        {isPosDemo && (
          <div
            className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            {t('posDemoBanner')}
          </div>
        )}
        <div className="bg-background flex h-full min-h-0 flex-1 flex-col">
      <POSHeader
        dataTour={isPosDemo ? 'pos-tour-header' : undefined}
        stores={stores}
        currentStoreId={currentStoreId}
        onStoreChange={() => {}}
        onRefresh={refetchCurrentStore}
        todayCompleted={todayCompleted}
        totalSales={totalSales}
        showBackButton
        canChangeStore={false}
        canAccessAdmin={false}
        isMainPosDevice={isMainPosDevice}
        onMainPosDeviceChange={(v) => {
          setTourMainDeviceTouched(true)
          setIsMainPosDevice(v)
        }}
      />
      <OfflineBanner onSyncComplete={refetchCurrentStore} />
      <div
        className={cn(
          'flex-1 flex min-h-0 min-w-0',
          isNarrowViewport
            ? shouldFullscreenOrderDetailOnNarrow
              ? 'flex-col overflow-hidden'
              : 'flex-col overflow-y-auto'
            : 'flex-row overflow-hidden'
        )}
      >
        <div
          className={cn(
            'min-w-0 flex flex-col',
            isNarrowViewport
              ? shouldFullscreenOrderDetailOnNarrow
                ? 'hidden'
                : 'min-h-0 shrink-0'
              : 'flex-1 min-h-0 overflow-hidden'
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
              <div className="flex h-12 min-[640px]:h-10 min-h-[44px] min-w-0 flex-nowrap items-center justify-between gap-1 min-[640px]:gap-2">
                {/* 좁은 화면에서 오른쪽 필터와 한 줄에 두면 탭이 flex로 압축되어 사라진 것처럼 보일 수 있음 → 가로 스크롤 */}
                <div className="min-h-[44px] min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsList
                    className="inline-flex h-12 min-[640px]:h-10 min-h-[44px] w-max min-w-0 flex-nowrap bg-transparent p-0"
                    data-tour="pos-tour-tabs-all"
                  >
                  <TabsTrigger
                    value="tables"
                    data-tour="pos-tour-tab-tables"
                    title={t('posTableStatus')}
                    aria-label={t('posTableStatus')}
                    className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <LayoutGrid className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posTableStatus')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="delivery"
                    data-tour="pos-tour-tab-delivery"
                    title={t('posOrderTypeDelivery') || '배달'}
                    aria-label={t('posOrderTypeDelivery') || '배달'}
                    className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <Bike className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeDelivery') || '배달'}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="takeout"
                    data-tour="pos-tour-tab-takeout"
                    title={t('posOrderTypeTakeout') || '포장'}
                    aria-label={t('posOrderTypeTakeout') || '포장'}
                    className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <Package className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeTakeout') || '포장'}</span>
                  </TabsTrigger>
                  </TabsList>
                </div>
                {/* 오른쪽 영역: 탭별 필터(준비중/결제완료/전체) + 실시간 메뉴 검색 — 배달/포장/테이블 동일 UI, 밑줄 정렬 */}
                <div
                  className="flex shrink-0 items-center gap-1 min-[640px]:gap-2 justify-end self-stretch min-h-0 min-[640px]:w-44"
                  data-tour="pos-tour-toolbar-filters"
                >
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 min-[640px]:h-8 gap-1.5 px-2 min-[640px]:px-3 touch-manipulation shrink-0 rounded-md"
                    onClick={() => setLiveSearchOpen(true)}
                    title={t('posLiveMenuSearch') || '실시간 메뉴 검색'}
                    data-tour={isPosDemo ? 'pos-tour-live-menu-search' : undefined}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden min-[500px]:inline">{t('posLiveMenuSearch') || '실시간 메뉴 검색'}</span>
                  </Button>
                </div>
              </div>
            </div>
            {activeTab === 'delivery' && (
              <div className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div
                  className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap"
                  data-tour={isPosDemo ? 'pos-tour-delivery-order-draft' : undefined}
                >
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
                <div
                  className="flex min-w-0 flex-wrap items-center gap-2 min-[640px]:gap-2"
                >
                  <span className="text-sm font-medium text-muted-foreground shrink-0">
                    {t('posDeliveryOrderNo') || '주문 번호'}
                  </span>
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
                    className="h-8 shrink-0"
                    onClick={() => {
                      if (!deliveryApp) return
                      const orderNo = deliveryOrderNo.trim()
                      if (!orderNo) return
                      setSelectedDeliveryTargetId('delivery-draft')
                      const appLabelEn = effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name ?? deliveryApp
                      setSelectedDeliveryTargetLabel(`${appLabelEn} #${orderNo}`)
                    }}
                    disabled={!deliveryApp || !deliveryOrderNo.trim()}
                  >
                    + {t('posNewOrder') || '새 주문'}
                  </Button>
                </div>
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
              <div
                className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0"
                data-tour="pos-tour-takeout-toolbar"
              >
                <div
                  className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap"
                  data-tour={isPosDemo ? 'pos-tour-takeout-slots' : undefined}
                >
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
                    data-tour="pos-tour-takeout-new"
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
                  <PosBusinessOpenGateBlock
                    blocked={businessOpenBlocked}
                    loading={businessOpenGate.loading}
                    businessDateYmd={businessOpenGate.businessDateYmd}
                    className="h-full"
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
                      showMenuDescriptions={showGuestMenuDescriptions}
                      touchMode={isNarrowViewport ? 'large' : 'default'}
                      containMenuHeight={isNarrowViewport}
                      className="h-full"
                    />
                  </PosBusinessOpenGateBlock>
                </div>
              ) : (
                <>
                  {loadingTables && (
                    <div className="h-full flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm min-h-[min(420px,50vh)]">
                      {t('loading')}
                    </div>
                  )}
                  {(!loadingTables && floorLayoutForView.length > 0) && (
                    <div
                      className="flex h-full min-h-[min(420px,50vh)] min-w-0 justify-center"
                      data-tour="pos-tour-floor"
                    >
                      <TableFloorWithW13dTimeTour
                        isPosDemo={isPosDemo}
                        layout={floorLayoutForView}
                        className="w-full max-w-[720px] h-full min-h-[min(420px,50vh)]"
                        displayScale={1}
                        tableListMode={tableListMode}
                        gridCols={30}
                        gridRows={20}
                        getTableStatus={(id, name) => {
                          const tbl = currentStore?.tables.find((t) => t.id === id || t.name === name)
                          const order =
                            demoDineInOrder?.tableId === id ? demoDineInOrder.order : tbl?.order
                          if (!order) {
                            const demoVisual = demoTableVisualStatusById.get(id)
                            if (demoVisual) {
                              return {
                                status: demoVisual.status,
                                createdAt: demoVisual.createdAt,
                                targetMin: demoVisual.status === 'preparing' ? 12 : 0,
                                guestCount: demoVisual.guestCount,
                              }
                            }
                            return null
                          }
                          const items = Array.isArray(order.items) ? order.items : []
                          const servedCount = items.filter((item) => Boolean(item.servedAt)).length
                          const allServed = items.length > 0 && servedCount >= items.length
                          const status: 'preparing' | 'partial_served' | 'completed' =
                            (order.status === 'completed' || (order.status === 'ready' && allServed))
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
                          const createdAt = order.createdAt
                            ? (order.createdAt instanceof Date
                                ? order.createdAt.toISOString()
                                : String(order.createdAt))
                            : undefined
                          const guestCount = Math.max(0, Math.trunc(Number(order.guestCount ?? 0) || 0))
                          return { status, createdAt, targetMin, guestCount: guestCount > 0 ? guestCount : undefined }
                        }}
                        selectedTableId={selectedTableId ?? servingTableId}
                        onTableSelect={handleTableSelect}
                        activeFloor={activeFloor}
                        onFloorChange={setActiveFloor}
                        t={t}
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
                  {!loadingTables && floorLayoutForView.length === 0 && currentStore && (
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
            {/* min-h 고정 금지: 뷰포트보다 크면 부모 overflow-hidden에 하단이 잘려 메뉴 끝까지 스크롤 불가(배달·포장 메뉴). 주문 바 목록은 OrderBarList min-h 유지 */}
            <TabsContent value="delivery" className="flex-1 m-0 min-w-0 p-4 min-h-0 overflow-auto">
              {selectedDeliveryTargetId === 'delivery-draft' ? (
                <PosBusinessOpenGateBlock
                  blocked={businessOpenBlocked}
                  loading={businessOpenGate.loading}
                  businessDateYmd={businessOpenGate.businessDateYmd}
                  className="h-full"
                >
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
                </PosBusinessOpenGateBlock>
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

            {/* 포장 탭 — 배달 TabsContent와 동일(고정 min-h 없음) */}
            <TabsContent value="takeout" className="flex-1 m-0 min-w-0 p-4 min-h-0 overflow-auto">
              {selectedTakeoutTargetId === 'takeout-draft' ? (
                <PosBusinessOpenGateBlock
                  blocked={businessOpenBlocked}
                  loading={businessOpenGate.loading}
                  businessDateYmd={businessOpenGate.businessDateYmd}
                  className="h-full"
                >
                  <PosTerminalMenuScreen
                    mode="pos-order"
                    storeCode={currentStoreId}
                    selectedTableName={`${t('posOrderTypeTakeout') || '포장'} · ${takeoutLabel}`}
                    onBack={() => setSelectedTakeoutTargetId(null)}
                    backButtonLabel={t('posBack') || '뒤로가기'}
                    onAddItem={handleAddItemToCart}
                    orderType="takeout"
                    touchMode={isNarrowViewport ? 'large' : 'default'}
                    containMenuHeight={isNarrowViewport}
                    className="h-full"
                  />
                </PosBusinessOpenGateBlock>
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
              menus={menus}
              menuOptions={menuOptions}
              promos={promosWithItems}
              deliveryApps={deliveryAppsFromApi}
              order={selectedDeliveryOrder}
              onPackaged={() => refetchStores({ scope: 'all' })}
              onAccepted={async (params) => {
                await runAutoPrintForAcceptedDeliveryOrder(params)
              }}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'delivery', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'delivery', detail)
                    }
              }
              onCancel={refetchCurrentStore}
              storeCode={currentStoreId}
              onPay={() => {
                if (!selectedDeliveryOrder) return
                setPendingDeliveryOrderId(Number(selectedDeliveryOrder.id))
                setPendingReceiptOrderNo(selectedDeliveryOrder.orderNo ?? null)
                setPendingDeliveryPayRequest({
                  tableName: selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id),
                  items: selectedDeliveryOrder.items.map((item) => ({
                    id: item.id,
                    name: resolveOrderItemDisplayName({
                      id: item.id,
                      name: item.name,
                      menuId: item.menuId,
                    }),
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.menuId ? { menuId: item.menuId } : {}),
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedDeliveryOrder.orderNo,
                })
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(selectedDeliveryOrder)}
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
              menus={menus}
              allTables={currentStore?.tables ?? []}
              takeoutMergePeers={takeoutMergePeerTables}
              isDemo={isPosDemo}
              onDemoOrderReplace={
                isPosDemo && demoDineInOrder?.tableId === servingTableId && servingTableId
                  ? (next) => setDemoDineInOrder({ tableId: servingTableId, order: next })
                  : undefined
              }
              onServed={refetchCurrentStore}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'dine_in', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'dine_in', detail)
                    }
              }
              onAfterTableTransfer={
                isPosDemo
                  ? undefined
                  : async (keepOrderId) => {
                      await runAfterTableTransferHallReprint(keepOrderId)
                    }
              }
              onAddOrder={() => {
                if (!servingTableId) return
                if (servingTable?.order?.id != null) {
                  const sid = Number(servingTable.order.id)
                  if (Number.isFinite(sid) && sid > 0) {
                    setPendingDineInOrderId(sid)
                    pendingDineInOrderTableRef.current = String(servingTable?.name ?? '').trim()
                  }
                }
                setServingTableId(null)
                setSelectedTableId(servingTableId)
              }}
              onPay={() => {
                if (isPosDemo && demoDineInOrder?.tableId === servingTableId) {
                  void appAlert(t('posDemoTablePaySkipped') || '')
                  return
                }
                if (!servingTableId || !servingTable?.order) return
                setPendingDineInOrderId(Number(servingTable.order.id))
                pendingDineInOrderTableRef.current = String(servingTable?.name ?? '').trim()
                setPendingReceiptOrderNo(servingTable.order.orderNo ?? null)
                setPendingPayRequest({
                  tableName: servingTable.name,
                  items: servingTable.order.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.menuId ? { menuId: item.menuId } : {}),
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: servingTable.order.orderNo,
                })
                setServingTableId(null)
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(servingTable?.order)}
              onLeaveTable={async () => {
                if (!servingTable?.order || !servingTable?.name) return
                clearTableOrder(currentStoreId, servingTable.name)
                setServingTableId(null)
                await refetchCurrentStore()
              }}
              onCancel={refetchCurrentStore}
              onClose={() => {
                setServingTableId(null)
                setDemoDineInOrder(null)
              }}
              t={t}
            />
          ) : activeTab === 'takeout' && selectedTakeoutOrder ? (
            <TakeoutOrderPanel
              orderLabel={resolveTakeoutOrderBarLabel(selectedTakeoutOrder)}
              order={selectedTakeoutOrder}
              menus={menus}
              onPackaged={() => refetchStores({ scope: 'all' })}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'takeout', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'takeout', detail)
                    }
              }
              onCancel={refetchCurrentStore}
              onPay={() => {
                if (!selectedTakeoutOrder) return
                setPendingTakeoutOrderId(Number(selectedTakeoutOrder.id))
                setPendingReceiptOrderNo(selectedTakeoutOrder.orderNo ?? null)
                setPendingTakeoutPayRequest({
                  tableName: resolveTakeoutOrderBarLabel(selectedTakeoutOrder),
                  items: selectedTakeoutOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.menuId ? { menuId: item.menuId } : {}),
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedTakeoutOrder.orderNo,
                })
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(selectedTakeoutOrder)}
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
                  ? shouldFullscreenOrderDetailOnNarrow
                    ? 'flex-1 min-h-0 border-t'
                    : 'border-t min-h-[180px] max-h-[50vh]'
                  : 'w-72 border-l min-h-0'
              )}
            >
              {panelContent}
            </div>
          )
        })()}
      </div>
      <Dialog
        open={taxInvoiceTargetOrder != null}
        onOpenChange={(open) => {
          if (!open) {
            setTaxInvoiceTargetOrder(null)
            setTaxInvoiceSaving(false)
            setTaxSearchLoading(false)
            setTaxSearchRows([])
            setTaxSearchMessage('')
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('posReceiptTaxInvoice') || '세금계산서'}</DialogTitle>
            <DialogDescription className="text-left">
              <span className="font-mono text-foreground">{taxInvoiceTargetOrder?.orderNo || '-'}</span>
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
            <Button type="button" variant="outline" onClick={() => setTaxInvoiceTargetOrder(null)} disabled={taxInvoiceSaving}>
              {t('btnClose') || '닫기'}
            </Button>
            <Button type="button" onClick={() => void handleSaveTaxInvoiceForOrder()} disabled={taxInvoiceSaving || taxFormErrors.length > 0}>
              {t('save') || '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PosKbankPaymentOutcomeDialog
        open={kbankOutcomeState != null}
        onOpenChange={(open) => {
          if (!open) {
            const wasCancelled = kbankOutcomeState?.kind === 'cancelled'
            setKbankOutcomeState(null)
            if (wasCancelled) {
              setLiveKbankQrPayload('')
              setLiveKbankQrType('THAI_QR')
              setKbankOpsTxnUid('')
              setKbankOpsOrigTxnUid('')
              setKbankOpsTxnNo('')
              setCustomerDisplayPaymentMessage('')
              kbankManualCancelPendingRef.current = false
            }
          }
        }}
        kind={kbankOutcomeState?.kind || 'success'}
        amount={Number(kbankOutcomeState?.amount || 0)}
        refId={String(kbankOutcomeState?.refId || '')}
        paymentMethod={kbankOutcomeState?.paymentMethod}
        cardLabel={kbankOutcomeState?.cardLabel}
        approvalCode={kbankOutcomeState?.approvalCode}
        timeLabel={kbankOutcomeState?.timeLabel}
        onViewAllOrders={() => {
          setActiveTab('tables')
          setSelectedDeliveryTargetId(null)
          setSelectedDeliveryTargetLabel('')
          setSelectedTakeoutTargetId(null)
          setSelectedTakeoutTargetLabel('')
        }}
        onCreateNewQr={() => {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
          setKbankCallbackState('idle')
          setKbankOpsTxnUid('')
          setKbankOpsOrigTxnUid('')
          setKbankOpsTxnNo('')
          setCustomerDisplayPaymentMessage('')
        }}
      />
      {String(effectiveStaffKbankQrPayload || '').trim() ? (
        <div
          className="pointer-events-auto fixed right-4 top-20 z-[70] w-[360px] rounded-lg border bg-background/95 p-3 shadow-2xl backdrop-blur"
          data-tour={isPosDemo ? 'pos-tour-kbank-qr-preview' : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {t('posPaymentQr') || 'QR 결제'} · {t('posStaffQrMonitor') || '직원 모니터'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(liveKbankQrPayload || '').trim()
                  ? t('posScanToPayHint') || '고객이 스캔해서 결제할 수 있게 이 화면을 보여주세요.'
                  : t('posDemoBanner') || '데모 — 실제 주문·결제는 실데이터에 반영되지 않습니다.'}
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
              {isPosDemo && !String(liveKbankQrPayload || '').trim() ? 'DEMO' : 'LIVE'}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {`QR ${(t('amount') || '금액')}: ${effectiveStaffKbankQrAmount.toFixed(2)} ฿`}
          </p>
          <p
            className={`mt-1 text-xs font-semibold ${
              effectiveCustomerDisplayQrType === 'CREDIT_CARD'
                ? 'text-indigo-800 dark:text-indigo-300'
                : 'text-sky-800 dark:text-sky-300'
            }`}
          >
            {staffKbankQrTypeLabel}
          </p>
          {kbankSentQrTypeCode ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {(t('posKbankSentQrTypeCode') || 'Sent qrType')}: {kbankSentQrTypeCode}
            </p>
          ) : null}
          {kbankGenerateAuditText ? (
            <div className="mt-2 space-y-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-full text-[10px]"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(kbankGenerateAuditText)
                    .then(() => appAlert(t('posKbankAuditCopied') || 'Copied KBank message for support.'))
                    .catch(() => appAlert(t('posTerminalDeviceIdCopyFail') || 'Copy failed'))
                }}
              >
                {t('posKbankCopyAuditMessage') || 'Copy request/response for KBank'}
              </Button>
            </div>
          ) : null}
          <div className="mt-3 rounded-md border bg-white p-2">
            <div className="overflow-hidden rounded-md border bg-white">
              {String(effectiveStaffKbankQrPayload || '').trim().startsWith('000201') ? (
                <PosQrGuidelineCard
                  payload={String(effectiveStaffKbankQrPayload || '').trim()}
                  kind={effectiveCustomerDisplayQrType}
                />
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                  <QrCodeIcon className="h-10 w-10 text-emerald-600" aria-hidden />
                  <span>{t('posLoading') || '로딩 중'}</span>
                </div>
              )}
            </div>
          </div>
          {!isPosDemo && isKbankPilotStore ? (
            <div className="mt-3 rounded-md border border-border/70 bg-card p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                {t('posKbankFollowupTitle') || 'KBank 후속 처리 (현재 POS)'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {`${t('posKbankPartnerTxnUidLabel') || 'partnerTxnUid'}: ${kbankOpsTxnUid || '-'}`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {`Callback: ${
                  kbankCallbackState === 'received'
                    ? 'received'
                    : kbankCallbackState === 'failed'
                      ? 'failed'
                      : kbankCallbackState === 'waiting'
                        ? 'waiting'
                        : 'idle'
                }`}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('posKbankOrigTxnUidLabel') || 'origPartnerTxnUid'}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={kbankOpsOrigTxnUid}
                    onChange={(e) => setKbankOpsOrigTxnUid(e.target.value)}
                    placeholder={t('posKbankOrigTxnUidHint') || 'QR 요청 TxnUid'}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('posKbankTxnNoLabel') || 'txnNo'}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={kbankOpsTxnNo}
                    onChange={(e) => setKbankOpsTxnNo(e.target.value)}
                    placeholder={t('posKbankTxnNoHint') || '결제 txnNo'}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px]">{t('posKbankTerminalIdLabel') || 'terminalId (QR 카드 필수)'}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={kbankOpsTerminalId}
                    onChange={(e) => setKbankOpsTerminalId(e.target.value)}
                    placeholder={t('posKbankTerminalIdHint') || '예: 09000107'}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={kbankOpsBusy}
                  onClick={() => void runKbankFollowupAction('inquiry')}
                >
                  {t('posKbankInquiry') || 'Inquiry'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={kbankOpsBusy}
                  onClick={() => void runKbankFollowupAction('settlement')}
                >
                  {t('posKbankSettlement') || 'Settlement'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={kbankOpsBusy}
                  onClick={() => void runKbankFollowupAction('cancel')}
                >
                  {t('posKbankCancel') || 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={kbankOpsBusy}
                  onClick={() => void runKbankFollowupAction('void')}
                >
                  {t('posKbankVoid') || 'Void'}
                </Button>
              </div>
              {kbankOpsLastResult ? (
                <Textarea
                  readOnly
                  value={kbankOpsLastResult}
                  className="mt-2 h-20 resize-none text-[10px]"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <LiveMenuSearchDialog
        open={liveSearchOpen}
        onOpenChange={setLiveSearchOpen}
        storeCode={currentStoreId}
        t={t}
        isDemo={isPosDemo}
        onServedUpdated={refetchCurrentStore}
      />
      <PosPostPaymentCashChangeDialog
        amountBaht={postPaymentCashChangeBaht}
        onDismiss={() => setPostPaymentCashChangeBaht(null)}
        t={t}
      />
      <PosReceiptModal
        onOpenChange={(open) => {
          if (open) return
          if (receiptData?.suppressReceiptModalAutoPrint) {
            setReceiptData(null)
            return
          }
          flushNextReceiptQueue()
        }}
        onSuppressDismiss={() => setReceiptData(null)}
        onAutoPrintComplete={flushNextReceiptQueue}
        receiptData={receiptData}
        menus={menus}
        orderTypeLabels={{
          dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
          takeout: tPrint('posOrderTypeTakeout') ?? '포장',
          delivery: tPrint('posOrderTypeDelivery') ?? '배달',
        }}
        t={tPrint}
        autoPrintReceiptOnOrder={effectiveAutoPrintReceiptOnOrder}
        autoPrintReceiptOnAddOrder={effectiveAutoPrintReceiptOnAddOrder}
        autoPrintReceiptOnPayment={effectiveAutoPrintReceiptOnPayment}
        autoPrintKitchenSlipOnOrder={effectiveAutoPrintKitchenSlipOnOrder}
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
        kitchenPromoLineEnrich={posReceiptLineOpts}
        onPaymentVoidClick={() => void runKbankFollowupAction('void')}
        paymentVoidEnabled={
          Boolean(
            isKbankPilotStore &&
            receiptData?.receiptAutoPrintContext === 'payment' &&
            String(kbankOpsTxnUid || '').trim()
          )
        }
        paymentVoidBusy={kbankOpsBusy}
      />
      <DeliveryEditOrderNoDialog
        open={deliveryEditOrderNoOpen}
        onOpenChange={setDeliveryEditOrderNoOpen}
        order={selectedDeliveryOrder}
        value={deliveryEditOrderNoValue}
        onValueChange={setDeliveryEditOrderNoValue}
        onSaved={async (newTableName) => {
          setSelectedDeliveryTargetLabel(newTableName)
          await refetchCurrentStore()
        }}
        t={t}
        deliveryApps={deliveryAppsFromApi}
      />
        </div>
      </div>
    </PosTourProvider>
  )
}
