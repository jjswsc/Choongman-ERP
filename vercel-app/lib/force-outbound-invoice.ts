/**
 * 강제출고 Invoice(IVF…) 번호.
 * 같은 출고일·출고처·참조번호(Confirm 한 대기 목록)는 한 장으로 묶고,
 * 접미사는 그룹 안 최소 stock_logs.id 를 쓴다 (주문 IV{date}-{orderId} 와 같은 묶음 규칙).
 */
import { formatForceOutboundInvoiceNo } from './receivable-invoice-format'

export type ForceOutboundInvoiceLine = {
  type?: string
  date?: string
  target?: string
  referenceNo?: string
  stockLogId?: number
  invoiceNo?: string
}

/** 출고일(YYYY-MM-DD) + 출고처 + 참조번호. 하나라도 비면 묶지 않음. */
export function forceOutboundInvoiceGroupKey(params: {
  date: string
  target: string
  referenceNo?: string | null
}): string | null {
  const date = String(params.date || '')
    .trim()
    .slice(0, 10)
  const target = String(params.target || '').trim()
  const referenceNo = String(params.referenceNo || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !target || !referenceNo) return null
  return `${date}\u0000${target}\u0000${referenceNo}`
}

export function forceOutboundInvoiceAccKey(params: {
  ymd: string
  target: string
  referenceNo?: string | null
  stockLogId: number
}): string {
  const grouped = forceOutboundInvoiceGroupKey({
    date: params.ymd,
    target: params.target,
    referenceNo: params.referenceNo,
  })
  if (grouped) return `f|${grouped}`
  return `f|${params.ymd}|${params.target}|${params.stockLogId}`
}

export function forceOutboundInvoiceAnchorId(ids: number[]): number {
  const clean = ids.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0)
  if (!clean.length) return 0
  return Math.min(...clean)
}

/** 이력 줄에 IVF{date}-{minStockLogId} 부여. 참조번호가 없으면 품목별 번호. */
export function assignForceOutboundInvoiceNos<T extends ForceOutboundInvoiceLine>(rows: T[]): T[] {
  const grouped = new Map<string, T[]>()
  for (const r of rows) {
    if (String(r.type || '') !== 'Force') continue
    const sid = Math.floor(Number(r.stockLogId || 0))
    const date = String(r.date || '').trim().slice(0, 10)
    if (sid <= 0) continue
    const key = forceOutboundInvoiceGroupKey({
      date,
      target: String(r.target || ''),
      referenceNo: r.referenceNo,
    })
    if (!key) {
      r.invoiceNo = formatForceOutboundInvoiceNo(sid, date) || r.invoiceNo
      continue
    }
    const arr = grouped.get(key)
    if (arr) arr.push(r)
    else grouped.set(key, [r])
  }
  for (const group of grouped.values()) {
    const anchor = forceOutboundInvoiceAnchorId(group.map((r) => Number(r.stockLogId || 0)))
    const date = String(group[0]?.date || '').trim().slice(0, 10)
    const inv = formatForceOutboundInvoiceNo(anchor, date)
    if (!inv) continue
    for (const r of group) r.invoiceNo = inv
  }
  return rows
}
