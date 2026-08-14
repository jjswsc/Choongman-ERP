/**
 * 출고 인보이스 인쇄(=วางบิล) 번호 수집·매칭.
 * Tax Invoice 문서번호(IV.YYYYMMDD-NNN)와 출고 IV/IVF 번호를 구분한다.
 */

/** IVYYYYMMDD-{orderId} 또는 IVFYYYYMMDD-{stockLogId} */
export function isOutboundPrintStatusInvoiceNo(value: string | undefined | null): boolean {
  return /^IVF?\d{8}-\d+$/i.test(String(value || '').trim())
}

export type OutboundPrintStatusSource = {
  documentNo?: string | null
  referenceNo?: string | null
  sourceRefType?: string | null
  sourceRefId?: number | null
  issueDate?: string | null
}

/** 인쇄 화면 Document No / Reference / 주문·강제출고 식별자로 วางบิล 저장 키를 모은다. */
export function collectOutboundInvoiceNosForPrintStatus(
  datas: readonly OutboundPrintStatusSource[]
): string[] {
  const out = new Set<string>()
  const push = (raw: string | null | undefined) => {
    const v = String(raw || '').trim()
    if (isOutboundPrintStatusInvoiceNo(v)) out.add(v)
  }
  for (const d of datas || []) {
    push(d.documentNo)
    push(d.referenceNo)
    const refType = String(d.sourceRefType || '').trim()
    const refId = Number(d.sourceRefId || 0)
    const datePart = String(d.issueDate || '').replace(/\D/g, '').slice(0, 8)
    if (!Number.isFinite(refId) || refId <= 0 || datePart.length < 8) continue
    if (refType === 'Order') push(`IV${datePart}-${refId}`)
    if (refType === 'ForceOutbound') push(`IVF${datePart}-${refId}`)
  }
  return [...out]
}

export type OutboundBillPlacedRow = {
  invoiceNo?: string
  orderRowId?: string
  stockLogId?: number
  type?: string
  billPlaced?: boolean
  billPlacedAt?: string
}

export type OutboundInvoicePrintStatusRow = {
  invoice_no?: string
  printed?: boolean
  printed_at?: string
}

function takeLaterPrintedAt(
  map: Map<string, { printedAt?: string }>,
  key: string,
  printedAt?: string
) {
  const prev = map.get(key)
  if (!prev || String(printedAt || '') > String(prev.printedAt || '')) {
    map.set(key, { printedAt })
  }
}

/**
 * 출고 이력 줄에 วางบิล 여부를 붙인다.
 * 1) 표시 IV 번호 정확 일치
 * 2) 같은 주문/강제출고 id 접미사 (출고일과 미수 trans_date가 달라도 표시)
 */
export function applyOutboundBillPlacedStatus(
  rows: OutboundBillPlacedRow[],
  statusRows: OutboundInvoicePrintStatusRow[]
): void {
  const exact = new Map<string, { printedAt?: string }>()
  const byOrderId = new Map<string, { printedAt?: string }>()
  const byForceId = new Map<string, { printedAt?: string }>()

  for (const s of statusRows || []) {
    if (!s.printed) continue
    const inv = String(s.invoice_no || '').trim()
    if (!inv) continue
    const printedAt = String(s.printed_at || '').trim() || undefined
    exact.set(inv.toLowerCase(), { printedAt })
    const orderM = /^IV\d{8}-(\d+)$/i.exec(inv)
    if (orderM) takeLaterPrintedAt(byOrderId, orderM[1], printedAt)
    const forceM = /^IVF\d{8}-(\d+)$/i.exec(inv)
    if (forceM) takeLaterPrintedAt(byForceId, forceM[1], printedAt)
  }

  for (const row of rows) {
    const exactKey = String(row.invoiceNo || '').trim().toLowerCase()
    const fromExact = exactKey ? exact.get(exactKey) : undefined
    const orderId = String(row.orderRowId || '').trim()
    const fromOrder = orderId ? byOrderId.get(orderId) : undefined
    const sid = Number(row.stockLogId || 0)
    const fromForce =
      String(row.type || '').trim() === 'Force' && Number.isFinite(sid) && sid > 0
        ? byForceId.get(String(sid))
        : undefined
    const hit = fromExact || fromOrder || fromForce
    if (!hit) continue
    row.billPlaced = true
    row.billPlacedAt = hit.printedAt
  }
}

export function unmatchedOutboundBillLookupIds(rows: OutboundBillPlacedRow[]): {
  orderIds: string[]
  forceStockLogIds: string[]
} {
  const orderIds = new Set<string>()
  const forceStockLogIds = new Set<string>()
  for (const row of rows) {
    if (row.billPlaced) continue
    const orderId = String(row.orderRowId || '').trim()
    if (/^\d+$/.test(orderId)) orderIds.add(orderId)
    const sid = Number(row.stockLogId || 0)
    if (String(row.type || '').trim() === 'Force' && Number.isFinite(sid) && sid > 0) {
      forceStockLogIds.add(String(sid))
    }
  }
  return { orderIds: [...orderIds], forceStockLogIds: [...forceStockLogIds] }
}
