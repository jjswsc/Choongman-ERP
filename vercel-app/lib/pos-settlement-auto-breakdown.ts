import { LEGACY_QR_BREAKDOWN_KEYS_AS_OTHER } from '@/lib/pos-payment-default-keys'
import {
  parsePaymentOtherBreakdown,
  sumPaymentOtherBreakdown,
  type PosPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'
import { isSyntheticPosPaymentMethodId } from '@/lib/pos-payment-settings-resolve'

export type PosPaymentMethodCatalogItem = {
  id: string
  name: string
  category: 'card' | 'qr' | 'delivery' | 'other'
}

const LEGACY_FIELD_TO_LABEL: Record<string, string> = {
  trueMoney: 'TrueMoney',
  weChat: 'WeChat',
  alipay: 'Alipay',
  unionPay: 'UnionPay',
  linePay: 'LINE Pay',
  shopeePay: 'Shopee Pay',
  misc: 'Other',
}

function normalizePayKey(key: string): string {
  return String(key || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

function findCanonicalKey(keys: string[], rawKey: string): string {
  const target = normalizePayKey(rawKey)
  if (!target) return rawKey
  const hit = keys.find((k) => normalizePayKey(k) === target)
  return hit ?? rawKey
}

function pickOtherFallbackKey(otherKeys: string[]): string {
  return otherKeys.find((k) => normalizePayKey(k) === 'other') ?? otherKeys[0] ?? 'Other'
}

function pickQrPromptKey(qrKeys: string[]): string {
  return (
    qrKeys.find((k) => normalizePayKey(k) === 'promptpay') ??
    qrKeys.find((k) => normalizePayKey(k) === 'qr') ??
    qrKeys[0] ??
    'PromptPay'
  )
}

function addBucketAmount(bucket: Record<string, number>, key: string, amount: number) {
  if (!(amount > 0.005)) return
  bucket[key] = (bucket[key] || 0) + amount
}

/** 결제 관리 분류(qr/other) + 매장 키 목록으로 주문 payment_other 세부를 QR·기타 결산 버킷에 배분 */
export function routeSettlementLineAmount(
  label: string,
  amount: number,
  qrKeys: string[],
  otherKeys: string[],
  autoQr: Record<string, number>,
  autoOther: Record<string, number>
): void {
  const n = Number(amount) || 0
  if (!(n > 0.005)) return
  const name = String(label || '').trim() || 'Other'
  const qrSet = new Set(qrKeys.map((k) => normalizePayKey(k)))
  const otherSet = new Set(otherKeys.map((k) => normalizePayKey(k)))
  const norm = normalizePayKey(name)

  if (otherSet.has(norm)) {
    addBucketAmount(autoOther, findCanonicalKey(otherKeys, name), n)
    return
  }
  if (qrSet.has(norm)) {
    addBucketAmount(autoQr, findCanonicalKey(qrKeys, name), n)
    return
  }

  const legacyOther = new Set(
    (LEGACY_QR_BREAKDOWN_KEYS_AS_OTHER as readonly string[]).map((k) => normalizePayKey(k))
  )
  if (legacyOther.has(norm)) {
    addBucketAmount(autoOther, pickOtherFallbackKey(otherKeys), n)
    return
  }

  addBucketAmount(autoOther, pickOtherFallbackKey(otherKeys), n)
}

function resolveAdminLineFromCatalog(
  adminId: string,
  catalog: PosPaymentMethodCatalogItem[],
  qrKeys: string[],
  otherKeys: string[]
): { label: string; category: 'qr' | 'other' } | null {
  const id = String(adminId || '').trim()
  if (!id) return null
  const row = catalog.find((c) => c.id === id)
  if (row) return { label: row.name, category: row.category === 'qr' ? 'qr' : 'other' }

  const syn = /^syn:(qr|other):/.exec(id)
  if (syn) {
    const cat = syn[1] as 'qr' | 'other'
    const idx = Number(id.split(':').pop())
    const names = cat === 'qr' ? qrKeys : otherKeys
    const name = names[Number.isFinite(idx) ? idx : 0]
    if (name) return { label: name, category: cat }
  }

  if (isSyntheticPosPaymentMethodId(id)) {
    const parts = id.split(':')
    const cat = parts[1] === 'qr' ? 'qr' : 'other'
    const idx = Number(parts[parts.length - 1])
    const names = cat === 'qr' ? qrKeys : otherKeys
    const name = names[Number.isFinite(idx) ? idx : 0]
    if (name) return { label: name, category: cat }
  }

  return null
}

function applyPaymentOtherBreakdownToBuckets(
  otherAmt: number,
  breakdown: PosPaymentOtherBreakdown | null,
  qrKeys: string[],
  otherKeys: string[],
  catalog: PosPaymentMethodCatalogItem[],
  autoQr: Record<string, number>,
  autoOther: Record<string, number>
) {
  if (!breakdown || Math.abs(sumPaymentOtherBreakdown(breakdown) - otherAmt) > 0.02) {
    addBucketAmount(autoOther, pickOtherFallbackKey(otherKeys), otherAmt)
    return
  }

  for (const [field, label] of Object.entries(LEGACY_FIELD_TO_LABEL)) {
    const n = Number((breakdown as Record<string, unknown>)[field]) || 0
    if (n > 0.005) routeSettlementLineAmount(label, n, qrKeys, otherKeys, autoQr, autoOther)
  }

  if (breakdown.admin && typeof breakdown.admin === 'object') {
    for (const [adminId, rawAmt] of Object.entries(breakdown.admin)) {
      const n = Number(rawAmt) || 0
      if (!(n > 0.005)) continue
      const resolved = resolveAdminLineFromCatalog(adminId, catalog, qrKeys, otherKeys)
      if (resolved) {
        if (resolved.category === 'qr') {
          addBucketAmount(autoQr, findCanonicalKey(qrKeys, resolved.label), n)
        } else {
          addBucketAmount(autoOther, findCanonicalKey(otherKeys, resolved.label), n)
        }
        continue
      }
      routeSettlementLineAmount(`Wallet ${adminId}`, n, qrKeys, otherKeys, autoQr, autoOther)
    }
  }
}

export type PosOrderPaymentAggregateInput = {
  payment_qr?: number
  payment_other?: number
  payment_other_breakdown?: unknown
}

/** 완료 주문 payment_qr / payment_other → 결산 AUTO qr·기타 breakdown (LinkPOS 제외) */
export function aggregateOrderPaymentsToSettlementBuckets(
  orders: PosOrderPaymentAggregateInput[],
  qrKeys: string[],
  otherKeys: string[],
  catalog: PosPaymentMethodCatalogItem[]
): { autoQrFromOrders: Record<string, number>; autoOtherFromOrders: Record<string, number> } {
  const autoQrFromOrders: Record<string, number> = {}
  const autoOtherFromOrders: Record<string, number> = {}
  const promptKey = pickQrPromptKey(qrKeys)

  for (const o of orders) {
    const qrAmt = Number(o.payment_qr) || 0
    if (qrAmt > 0) {
      addBucketAmount(autoQrFromOrders, promptKey, qrAmt)
    }
    const otherAmt = Number(o.payment_other) || 0
    if (otherAmt > 0) {
      const bo = parsePaymentOtherBreakdown(o.payment_other_breakdown)
      applyPaymentOtherBreakdownToBuckets(
        otherAmt,
        bo,
        qrKeys,
        otherKeys,
        catalog,
        autoQrFromOrders,
        autoOtherFromOrders
      )
    }
  }

  return { autoQrFromOrders, autoOtherFromOrders }
}
