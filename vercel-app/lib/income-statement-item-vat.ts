/**
 * 손익 VAT 환산 — 품목 tax(과세/면세/영세율) 반영.
 * 발주·PP30과 동일: 과세 공급가 합에만 7% VAT (태국 반올림).
 * DB 조회는 income-statement-item-vat-server.ts (server-only).
 */
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'

export type ItemTaxType = 'taxable' | 'exempt' | 'zero'

export type NetVatBuckets = {
  taxableNet: number
  exemptNet: number
}

export function emptyNetVatBuckets(): NetVatBuckets {
  return { taxableNet: 0, exemptNet: 0 }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizeItemTaxType(raw: string | null | undefined): ItemTaxType {
  const t = String(raw ?? '').trim().toLowerCase()
  if (t === 'exempt' || t === '면세') return 'exempt'
  if (t === 'zero' || t === '영세율') return 'zero'
  return 'taxable'
}

export function isItemVatExempt(taxType: ItemTaxType): boolean {
  return taxType === 'exempt' || taxType === 'zero'
}

export function resolveItemTaxType(
  taxMap: ReadonlyMap<string, ItemTaxType>,
  itemCode: string
): ItemTaxType {
  const code = String(itemCode || '').trim()
  return taxMap.get(code) ?? 'taxable'
}

export function accumulateNetByItemTax(
  buckets: NetVatBuckets,
  itemCode: string,
  netAmount: number,
  taxMap: ReadonlyMap<string, ItemTaxType>
): void {
  const amt = Math.max(0, Number(netAmount) || 0)
  if (amt <= 0) return
  const taxType = resolveItemTaxType(taxMap, itemCode)
  if (isItemVatExempt(taxType)) {
    buckets.exemptNet = round2(buckets.exemptNet + amt)
  } else {
    buckets.taxableNet = round2(buckets.taxableNet + amt)
  }
}

/** 과세 공급가에만 VAT 7% — 면세·영세는 그대로 */
export function grossFromNetVatBuckets(buckets: NetVatBuckets): number {
  const taxable = Math.max(0, Number(buckets.taxableNet) || 0)
  const exempt = Math.max(0, Number(buckets.exemptNet) || 0)
  if (taxable <= 0) return round2(exempt)
  if (exempt <= 0) return thaiInvoiceTotalsFromRawSubtotal(taxable).grandTotal
  const vatPart = thaiInvoiceTotalsFromRawSubtotal(taxable)
  return round2(vatPart.grandTotal + exempt)
}

export function mergeNetVatBuckets(a: NetVatBuckets, b: NetVatBuckets): NetVatBuckets {
  return {
    taxableNet: round2(a.taxableNet + b.taxableNet),
    exemptNet: round2(a.exemptNet + b.exemptNet),
  }
}

export function netTotalFromBuckets(buckets: NetVatBuckets): number {
  return round2(buckets.taxableNet + buckets.exemptNet)
}

/** stock_net 줄 환산 — 부모 합계의 gross/net 비율(품목별 과세 반영 후) */
export function stockNetLineGrossAmount(
  lineNet: number,
  parentBuckets: NetVatBuckets
): number {
  const net = Math.max(0, Number(lineNet) || 0)
  const parentNet = netTotalFromBuckets(parentBuckets)
  if (net <= 0 || parentNet <= 0) return net
  const parentGross = grossFromNetVatBuckets(parentBuckets)
  return round2(net * (parentGross / parentNet))
}
