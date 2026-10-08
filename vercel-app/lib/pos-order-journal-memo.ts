/**
 * POS 매출 분개 적요 — 일별장부에서 매장·주문·결제·채널을 구분할 수 있게 만든다.
 * 저장은 한국어 토큰, 화면은 tax-book-display에서 언어별 치환.
 */

export type PosOrderJournalMemoInput = {
  storeName?: string | null
  orderNo?: string | null
  orderType?: string | null
  deliveryAppCode?: string | null
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  depositAppliedAmt?: number
}

const PAY_LABELS = {
  cash: { ko: '현금', en: 'Cash', th: 'เงินสด' },
  card: { ko: '카드', en: 'Card', th: 'บัตร' },
  qr: { ko: 'QR', en: 'QR', th: 'QR' },
  other: { ko: '기타', en: 'Other', th: 'อื่นๆ' },
  delivery: { ko: '배달앱', en: 'Delivery app', th: 'แอปเดลิเวอรี' },
  deposit: { ko: '선수금', en: 'Deposit', th: 'มัดจำ' },
} as const

const TYPE_LABELS: Record<string, { ko: string; en: string; th: string }> = {
  dine_in: { ko: '매장', en: 'Dine-in', th: 'ทานที่ร้าน' },
  takeaway: { ko: '포장', en: 'Takeaway', th: 'ซื้อกลับ' },
  delivery: { ko: '배달', en: 'Delivery', th: 'เดลิเวอรี' },
}

const APP_LABELS: Record<string, { ko: string; en: string; th: string }> = {
  grab: { ko: 'Grab', en: 'Grab', th: 'Grab' },
  lineman: { ko: 'Line Man', en: 'Line Man', th: 'Line Man' },
  shopee: { ko: 'Shopee', en: 'Shopee', th: 'Shopee' },
  shopee_pay: { ko: 'ShopeePay', en: 'ShopeePay', th: 'ShopeePay' },
  foodpanda: { ko: 'foodpanda', en: 'foodpanda', th: 'foodpanda' },
  robinhood: { ko: 'Robinhood', en: 'Robinhood', th: 'Robinhood' },
}

export const POS_ORDER_COMPLETED_MEMO_PREFIX = 'POS 주문 완료 자동분개'
export const POS_ORDER_BACKFILL_MEMO_PREFIX = 'POS 매출 백필 분개'

function roundBaht(n: number | null | undefined): number {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100
}

function pickPayKeys(input: PosOrderJournalMemoInput): string[] {
  const parts: Array<{ key: keyof typeof PAY_LABELS; amt: number }> = [
    { key: 'cash', amt: roundBaht(input.paymentCash) },
    { key: 'card', amt: roundBaht(input.paymentCard) },
    { key: 'qr', amt: roundBaht(input.paymentQr) },
    { key: 'delivery', amt: roundBaht(input.paymentDeliveryApp) },
    { key: 'other', amt: roundBaht(input.paymentOther) },
    { key: 'deposit', amt: roundBaht(input.depositAppliedAmt) },
  ]
  const positive = parts.filter((p) => p.amt > 0.005).sort((a, b) => b.amt - a.amt)
  if (!positive.length) return []
  return positive.slice(0, 3).map((p) => PAY_LABELS[p.key].ko)
}

function normalizeOrderType(raw: string | null | undefined): string {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (t === 'dinein' || t === 'dine_in' || t === '') return 'dine_in'
  if (t === 'take_away' || t === 'takeout' || t === 'takeaway') return 'takeaway'
  if (t === 'delivery' || t === 'delivery_app') return 'delivery'
  return t
}

function normalizeApp(raw: string | null | undefined): string {
  const a = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!a) return ''
  if (a.includes('grab')) return 'grab'
  if (a.includes('line')) return 'lineman'
  if (a.includes('shopee') && a.includes('pay')) return 'shopee_pay'
  if (a.includes('shopee')) return 'shopee'
  if (a.includes('panda')) return 'foodpanda'
  if (a.includes('robin')) return 'robinhood'
  return a
}

/** DB에 저장할 적요 (한국어 토큰 + 구분 정보) */
export function buildPosOrderCompletedJournalMemo(
  input: PosOrderJournalMemoInput,
  prefix: string = POS_ORDER_COMPLETED_MEMO_PREFIX
): string {
  const parts: string[] = []
  const store = String(input.storeName || '').trim()
  if (store) parts.push(store)
  const orderNo = String(input.orderNo || '').trim()
  if (orderNo) parts.push(`#${orderNo.replace(/^#/, '')}`)
  const pays = pickPayKeys(input)
  if (pays.length) parts.push(pays.join('+'))
  const app = normalizeApp(input.deliveryAppCode)
  if (app) {
    parts.push(APP_LABELS[app]?.ko || app)
  }
  const typ = normalizeOrderType(input.orderType)
  if (typ && typ !== 'dine_in') {
    parts.push(TYPE_LABELS[typ]?.ko || typ)
  } else if (typ === 'dine_in' && !app) {
    parts.push(TYPE_LABELS.dine_in.ko)
  }
  if (!parts.length) return prefix
  return `${prefix} | ${parts.join(' | ')}`
}

function mapDetailToken(token: string, lang: string): string {
  const t = token.trim()
  if (!t) return ''
  for (const row of Object.values(PAY_LABELS)) {
    if (t === row.ko || t === row.en || t === row.th) {
      return lang === 'th' ? row.th : lang === 'ko' ? row.ko : row.en
    }
  }
  if (t.includes('+')) {
    return t
      .split('+')
      .map((x) => mapDetailToken(x, lang))
      .filter(Boolean)
      .join('+')
  }
  for (const row of Object.values(TYPE_LABELS)) {
    if (t === row.ko || t === row.en || t === row.th) {
      return lang === 'th' ? row.th : lang === 'ko' ? row.ko : row.en
    }
  }
  for (const row of Object.values(APP_LABELS)) {
    if (t.toLowerCase() === row.ko.toLowerCase()) return row.th && lang === 'th' ? row.th : row.en
  }
  if (t.startsWith('#')) return t
  return t
}

/** 화면 표시용: 접두 번역 + 상세 토큰 언어 치환 */
export function localizePosOrderJournalMemo(memo: string, lang: string): string | null {
  const text = String(memo || '').trim()
  if (!text) return null
  const prefixes = [
    {
      prefix: POS_ORDER_COMPLETED_MEMO_PREFIX,
      base: { ko: 'POS 주문 완료', en: 'POS order completed', th: 'ขายจากออเดอร์ POS' },
    },
    {
      prefix: POS_ORDER_BACKFILL_MEMO_PREFIX,
      base: { ko: 'POS 매출 백필', en: 'POS sales backfill', th: 'บันทึกขาย POS ย้อนหลัง' },
    },
    {
      prefix: 'POS 매출 자동분개',
      base: { ko: 'POS 매출', en: 'POS sales', th: 'ขาย POS' },
    },
    {
      prefix: 'POS 일일매출 수취분개',
      base: { ko: 'POS 일일매출 수취', en: 'POS daily sales receipt', th: 'รับเงินขายรายวัน POS' },
    },
  ]
  for (const row of prefixes) {
    if (text === row.prefix) {
      return lang === 'th' ? row.base.th : lang === 'ko' ? row.base.ko : row.base.en
    }
    if (text.startsWith(`${row.prefix} | `) || text.startsWith(`${row.prefix}|`)) {
      const detail = text.slice(row.prefix.length).replace(/^\s*\|\s*/, '')
      const base = lang === 'th' ? row.base.th : lang === 'ko' ? row.base.ko : row.base.en
      const mapped = detail
        .split(/\s*\|\s*/)
        .map((p) => mapDetailToken(p, lang))
        .filter(Boolean)
        .join(' · ')
      return mapped ? `${base} · ${mapped}` : base
    }
  }
  return null
}
