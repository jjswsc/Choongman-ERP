/**
 * 영수증·영수증 목록·매출 결제수단 표에 쓰는 표시명.
 * payment_other 는 WeChat/Alipay 등 세부(또는 관리자 결제 라인 이름)로 펼친다.
 */
import {
  attachPaymentOtherAdminLabels,
  parsePaymentOtherBreakdown,
  sumPaymentOtherBreakdown,
  type PosPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'

const EPS = 0.005

export type PosPaymentTenderTr = (key: string, fallback: string) => string

export type PosPaymentTenderAmounts = {
  paymentCash?: number | null
  paymentCard?: number | null
  paymentQr?: number | null
  paymentOther?: number | null
  paymentOtherBreakdown?: unknown
  paymentDeliveryApp?: number | null
  paymentCrypto?: number | null
  paymentCryptoAsset?: string | null
  /** 배달앱 결제면 앱 이름. 없으면 Delivery app */
  deliveryChannelLabel?: string | null
}

type BuiltinOtherField = {
  field: keyof PosPaymentOtherBreakdown
  i18n: string
  fallback: string
  salesKey: string
}

const BUILTIN_OTHER: BuiltinOtherField[] = [
  { field: 'trueMoney', i18n: 'posPaymentTrueMoney', fallback: 'TrueMoney', salesKey: 'other_truemoney' },
  { field: 'weChat', i18n: 'posPaymentWeChat', fallback: 'WeChat', salesKey: 'other_wechat' },
  { field: 'alipay', i18n: 'posPaymentAlipay', fallback: 'Alipay', salesKey: 'other_alipay' },
  { field: 'unionPay', i18n: 'posPaymentUnionPay', fallback: 'UnionPay', salesKey: 'other_unionpay' },
  { field: 'linePay', i18n: 'posPaymentLinePay', fallback: 'LINE Pay', salesKey: 'other_linepay' },
  { field: 'shopeePay', i18n: 'posPaymentShopeePay', fallback: 'Shopee Pay', salesKey: 'other_shopeepay' },
  { field: 'misc', i18n: 'posPaymentOther', fallback: 'Other', salesKey: 'other_misc' },
  { field: 'serviceComp', i18n: 'posPaymentOther', fallback: 'Other', salesKey: 'other_service' },
]

function walletSalesKey(id: string): string {
  const safe = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return `other_wallet_${safe || 'unknown'}`
}

export function resolvePaymentOtherLineLabel(
  breakdown: PosPaymentOtherBreakdown | null | undefined,
  id: string,
  nameById?: Record<string, string> | null
): string {
  const saved = String(breakdown?.adminLabels?.[id] || '').trim()
  if (saved) return saved
  return String(nameById?.[id] || '').trim()
}

/** 금액이 있는 결제수단 이름. 0원인 수단은 빼다 */
export function collectPosPaymentTenderLabels(
  amounts: PosPaymentTenderAmounts,
  tr: PosPaymentTenderTr,
  nameById?: Record<string, string> | null,
  surface: 'receipt' | 'list' = 'receipt'
): string[] {
  const labels: string[] = []
  const cash = Math.max(0, Number(amounts.paymentCash ?? 0) || 0)
  const card = Math.max(0, Number(amounts.paymentCard ?? 0) || 0)
  const qr = Math.max(0, Number(amounts.paymentQr ?? 0) || 0)
  const other = Math.max(0, Number(amounts.paymentOther ?? 0) || 0)
  const del = Math.max(0, Number(amounts.paymentDeliveryApp ?? 0) || 0)
  const crypto = Math.max(0, Number(amounts.paymentCrypto ?? 0) || 0)
  if (cash > EPS) labels.push(tr('posPaymentCash', 'Cash'))
  if (card > EPS) {
    labels.push(surface === 'list' ? tr('salesPayCredit', 'Credit') : tr('posPaymentCard', 'Card'))
  }
  if (qr > EPS) {
    labels.push(surface === 'list' ? tr('salesPayQrPromptPay', 'QR PromptPay') : tr('posPaymentQrCode', 'QR'))
  }
  if (other > EPS) {
    const br = attachPaymentOtherAdminLabels(amounts.paymentOtherBreakdown, nameById)
    const sum = sumPaymentOtherBreakdown(br)
    const detailed = Boolean(br && sum > EPS && Math.abs(sum - other) <= 0.02)
    const otherLabels: string[] = []
    if (detailed && br) {
      for (const row of BUILTIN_OTHER) {
        const n = Math.max(0, Number(br[row.field] ?? 0) || 0)
        if (n > EPS) otherLabels.push(tr(row.i18n, row.fallback))
      }
      if (br.admin) {
        for (const id of Object.keys(br.admin)) {
          const n = Math.max(0, Number(br.admin[id] ?? 0) || 0)
          if (n <= EPS) continue
          const name = resolvePaymentOtherLineLabel(br, id, nameById)
          otherLabels.push(name || tr('posPaymentOther', 'Other'))
        }
      }
    }
    labels.push(...(otherLabels.length > 0 ? otherLabels : [tr('posPaymentOther', 'Other')]))
  }
  if (del > EPS) {
    const ch = String(amounts.deliveryChannelLabel || '').trim()
    labels.push(
      ch
        ? `${tr('posPaymentDeliveryApp', 'Delivery app')} (${ch})`
        : tr('posPaymentDeliveryApp', 'Delivery app')
    )
  }
  if (crypto > EPS) {
    const asset = String(amounts.paymentCryptoAsset || '').trim().toUpperCase()
    labels.push(asset ? `${tr('posPaymentCrypto', 'Crypto')} (${asset})` : tr('posPaymentCrypto', 'Crypto'))
  }
  return labels
}

export type PosPaymentSalesBucketRow = {
  paymentKey: string
  sales: number
  label?: string
}

type SalesOrderRow = {
  payment_cash?: unknown
  payment_card?: unknown
  payment_qr?: unknown
  payment_other?: unknown
  payment_other_breakdown?: unknown
  payment_delivery_app?: unknown
  payment_crypto?: unknown
}

function addSales(
  bucket: Map<string, PosPaymentSalesBucketRow>,
  key: string,
  amount: number,
  label?: string
) {
  const n = Math.round(Math.max(0, amount) * 100) / 100
  if (n <= EPS) return
  const prev = bucket.get(key)
  const name = String(label || prev?.label || '').trim()
  bucket.set(key, {
    paymentKey: key,
    sales: Math.round(((prev?.sales || 0) + n) * 100) / 100,
    ...(name ? { label: name } : {}),
  })
}

/** 완료 주문 결제액을 수단별로 합산. 기타는 WeChat 등 세부 키로 나눈다 */
export function accumulatePosOrderPaymentSales(
  rows: SalesOrderRow[],
  nameById?: Record<string, string> | null
): PosPaymentSalesBucketRow[] {
  const bucket = new Map<string, PosPaymentSalesBucketRow>()
  for (const r of rows) {
    addSales(bucket, 'cash', Number(r.payment_cash) || 0)
    addSales(bucket, 'card', Number(r.payment_card) || 0)
    addSales(bucket, 'qr', Number(r.payment_qr) || 0)
    addSales(bucket, 'delivery_app', Number(r.payment_delivery_app) || 0)
    addSales(bucket, 'crypto', Number(r.payment_crypto) || 0)
    const other = Math.max(0, Number(r.payment_other) || 0)
    if (other <= EPS) continue
    const bo = parsePaymentOtherBreakdown(r.payment_other_breakdown)
    if (bo && Math.abs(sumPaymentOtherBreakdown(bo) - other) <= 0.02) {
      for (const row of BUILTIN_OTHER) {
        addSales(bucket, row.salesKey, Number(bo[row.field] ?? 0) || 0)
      }
      if (bo.admin) {
        for (const [id, rawAmt] of Object.entries(bo.admin)) {
          const name = resolvePaymentOtherLineLabel(bo, id, nameById)
          addSales(bucket, walletSalesKey(id), Number(rawAmt) || 0, name || undefined)
        }
      }
    } else {
      addSales(bucket, 'other', other)
    }
  }
  return [...bucket.values()].filter((r) => r.sales > EPS)
}

/** Cash → Credit → QR PromptPay → Alipay → WeChat → TrueMoney 순 */
export function paymentSalesDisplayRank(paymentKey: string, label?: string): number {
  const key = String(paymentKey || '').trim().toLowerCase()
  const blob = `${key} ${String(label || '').trim().toLowerCase()}`
  if (key === 'cash' || (blob.includes('cash') && !key.startsWith('other') && !key.startsWith('delivery'))) return 10
  if (key === 'card' || key === 'credit') return 20
  if (key === 'qr' || blob.includes('promptpay') || blob.includes('prompt pay')) return 30
  if (blob.includes('alipay')) return 40
  if (blob.includes('wechat') || blob.includes('weixin')) return 50
  if (blob.includes('truemoney') || blob.includes('true money') || blob.includes('true_money')) return 60
  if (blob.includes('unionpay') || blob.includes('union pay')) return 70
  if (blob.includes('line pay') || blob.includes('linepay') || key.includes('linepay')) return 80
  if (blob.includes('shopee')) return 90
  if (key.startsWith('delivery') || blob.includes('delivery')) return 200
  if (key === 'crypto' || blob.includes('crypto')) return 210
  if (key === 'other' || key === 'other_misc' || key === 'other_service') return 300
  return 150
}

export function sortPosPaymentSalesRows<T extends { paymentKey: string; sales: number; label?: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const rank = paymentSalesDisplayRank(a.paymentKey, a.label) - paymentSalesDisplayRank(b.paymentKey, b.label)
    if (rank !== 0) return rank
    return b.sales - a.sales || a.paymentKey.localeCompare(b.paymentKey)
  })
}
