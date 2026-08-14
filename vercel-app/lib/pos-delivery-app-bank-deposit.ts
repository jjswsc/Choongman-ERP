/**
 * 배달앱 확인 — 통장 입금(Grab/LINE MAN/Shopee)을 인식일 기준으로 매장×앱 합산.
 * 채널 정산(pos_channel_settlements)을 안 넣어도, 통장에 등록한 실입금을 비교할 수 있게 한다.
 */
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'
import {
  canonicalSalesStoreRowKey,
  resolveBankRowStoreName,
  rowMatchesAnySalesStoreSelection,
} from '@/lib/pos-sales-store-filter'
import { bankDepositRecognitionDate } from '@/lib/pos-channel-reconcile-match'

const DELIVERY_APP_BANK_APPS = ['grab', 'lineman', 'shopee'] as const
export type DeliveryAppBankApp = (typeof DELIVERY_APP_BANK_APPS)[number]

export type DeliveryAppBankDepositInput = {
  transDate?: string | null
  salesDate?: string | null
  transType?: string | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  category?: string | null
  storeName?: string | null
  store?: string | null
  /** 매장 통장 bank_accounts.store — 있으면 행 매장명보다 우선 */
  accountStore?: string | null
  accountSubjectCode?: string | null
  accountSubjectName?: string | null
}

/** 통장 계정과목 4111/4112/4113 — 적요에 grab이 없어도 앱을 식별 */
export const DELIVERY_APP_GL_CODES: Record<string, DeliveryAppBankApp> = {
  '4111': 'grab',
  '4112': 'lineman',
  '4113': 'shopee',
}

const SKIP_DEPOSIT_CATEGORIES = new Set([
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
  'payable_pay',
  'expense',
  'advance',
  'transfer',
])

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 통장 조회 창: 인식일 있는 행 + 인식일 없는 행(입금일-1)을 모두 담기 위한 trans_date 버퍼 */
export function bankDepositQueryTransDateWindow(startStr: string, endStr: string): { from: string; to: string } {
  const start = String(startStr || '').slice(0, 10)
  const end = String(endStr || '').slice(0, 10)
  return { from: addDaysToYmd(start, -1), to: addDaysToYmd(end, 7) }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function deliveryAppBankDepositKey(storeCode: string, appCode: string): string {
  return `${storeCode}\t${appCode}`
}

export function deliveryAppBankDepositDateKey(storeCode: string, appCode: string, date: string): string {
  return `${storeCode}\t${appCode}\t${date}`
}

export type DeliveryAppBankDepositAgg = {
  byStoreApp: Map<string, number>
  byStoreAppDate: Map<string, number>
}

export function emptyDeliveryAppBankDepositAgg(): DeliveryAppBankDepositAgg {
  return { byStoreApp: new Map(), byStoreAppDate: new Map() }
}

/** 적요·비고에서 Grab / LINE MAN / Shopee만 식별. GRABFOOD처럼 붙여 쓴 표기도 포함. */
export function inferDeliveryAppCodeFromBankText(text: string): DeliveryAppBankApp | '' {
  const raw = String(text || '')
  const m = raw.toLowerCase()
  if (!m.trim()) return ''
  if (/grabfood|grabtaxi|\bgrab\b|그랩|แกร็บ/i.test(raw)) return 'grab'
  if (/\b(line\s*man|lineman)\b/i.test(m)) return 'lineman'
  if (/shopeefood|shopee\s*food|\bshopee\b/i.test(m)) return 'shopee'
  return ''
}

export function resolveDeliveryAppFromBankRow(row: DeliveryAppBankDepositInput): DeliveryAppBankApp | '' {
  const gl = String(row.accountSubjectCode || '').trim()
  if (gl && DELIVERY_APP_GL_CODES[gl]) return DELIVERY_APP_GL_CODES[gl]
  return inferDeliveryAppCodeFromBankText(
    `${row.memo || ''} ${row.note || ''} ${row.accountSubjectName || ''}`
  )
}

/** 통장 인식일. 없으면 입금일 전날(통장 화면 인식일 기본과 동일). */
export function attributedSalesDateForBankDeposit(row: {
  transDate?: string | null
  salesDate?: string | null
}): string {
  return bankDepositRecognitionDate(row)
}

export function isDeliveryAppBankDepositRow(row: DeliveryAppBankDepositInput): boolean {
  if (String(row.transType || '').trim().toLowerCase() !== 'deposit') return false
  if (isExpenseInternalBankNote(row.note)) return false
  const gl = String(row.accountSubjectCode || '').trim()
  if (gl && DELIVERY_APP_GL_CODES[gl]) return true
  const cat = String(row.category || '').trim().toLowerCase()
  if (cat && SKIP_DEPOSIT_CATEGORIES.has(cat)) return false
  const app = resolveDeliveryAppFromBankRow(row)
  return (DELIVERY_APP_BANK_APPS as readonly string[]).includes(app)
}

export function aggregateDeliveryAppBankDeposits(params: {
  rows: DeliveryAppBankDepositInput[]
  startStr: string
  endStr: string
  storeCodes?: string[]
}): DeliveryAppBankDepositAgg {
  const start = String(params.startStr || '').slice(0, 10)
  const end = String(params.endStr || '').slice(0, 10)
  const byStoreApp = new Map<string, number>()
  const byStoreAppDate = new Map<string, number>()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { byStoreApp, byStoreAppDate }
  }

  const storeCodes = (params.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean)

  for (const row of params.rows) {
    if (!isDeliveryAppBankDepositRow(row)) continue
    const storeRaw =
      String(row.accountStore || '').trim() ||
      resolveBankRowStoreName({
        storeName: row.storeName,
        store: row.store,
        memo: row.memo,
        note: row.note,
        storeCodes,
      })
    if (!storeRaw) continue
    if (storeCodes.length > 0 && !rowMatchesAnySalesStoreSelection(storeRaw, storeCodes)) continue

    const date = attributedSalesDateForBankDeposit(row)
    if (!date || date < start || date > end) continue

    const app = resolveDeliveryAppFromBankRow(row)
    if (!app) continue

    const amt = Math.abs(Number(row.amount) || 0)
    if (amt <= 0.005) continue

    const store = canonicalSalesStoreRowKey(storeRaw)
    const key = deliveryAppBankDepositKey(store, app)
    byStoreApp.set(key, round2((byStoreApp.get(key) || 0) + amt))
    const dayKey = deliveryAppBankDepositDateKey(store, app, date)
    byStoreAppDate.set(dayKey, round2((byStoreAppDate.get(dayKey) || 0) + amt))
  }
  return { byStoreApp, byStoreAppDate }
}
