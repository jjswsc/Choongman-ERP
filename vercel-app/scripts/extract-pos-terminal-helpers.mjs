#!/usr/bin/env node
/** move-only: terminal page.tsx helper block → lib/* */
import fs from 'node:fs'
import path from 'node:path'

const pagePath = path.join(path.resolve(import.meta.dirname, '..'), 'app/pos/terminal/page.tsx')
const page = fs.readFileSync(pagePath, 'utf8')
const startMarker = 'function buildCustomerDisplayPaymentLines('
const endMarker = '/** 배달앱 코드 (API에서 동적 로드 가능) */'
const startIdx = page.indexOf(startMarker)
const endIdx = page.indexOf(endMarker)
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error('markers not found', { startIdx, endIdx })
  process.exit(1)
}

const importBlock = `
import {
  buildCustomerDisplayPaymentLines,
  resolveCardPaymentAmountForPricing,
} from '@/lib/pos-terminal-customer-display'
import {
  buildKbankGenerateAuditPaste,
  extractAmountFromEmvQrPayload,
  extractKbankGenerateResponseInfo,
  kbankOrigPartnerTxnUidForFollowup,
} from '@/lib/pos-terminal-kbank-helpers'
import {
  MAIN_POS_META_SCAN_INTERVAL_MS,
  MAIN_POS_STARTUP_CATCHUP_DURATION_MS,
  MAIN_POS_STARTUP_CATCHUP_WINDOW_MS,
  coercePosOrderIdFromRealtime,
  isPosPrintDebugEnabledInBrowser,
  isSessionNewOrder,
  mergeStoreAutoPrintFlags,
  posGuestCountSpread,
  posKitchenGuestSpread,
  readMainPosLastSeenOrderId,
  storeAutoPrintFlagsFromSettings,
  writeMainPosLastSeenOrderId,
} from '@/lib/pos-terminal-auto-print'
import { getPosIncomingWavDataUri } from '@/lib/pos-incoming-order-sound'
`

const anchor = "import { ensurePosBusinessOpenForOrder } from '@/lib/pos-business-open-gate-client'"
let next = page.slice(0, startIdx) + page.slice(endIdx)
if (!next.includes("from '@/lib/pos-terminal-customer-display'")) {
  next = next.replace(anchor, `${anchor}${importBlock}`)
}
fs.writeFileSync(pagePath, next)
console.log('ok: removed', endIdx - startIdx, 'bytes from terminal page')
