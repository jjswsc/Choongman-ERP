import { orderIdFromReceivableOrderRow } from '@/lib/receivable-order-id-parse'

export type InvoiceFilterRow = {
  invoice_no?: string | null
  memo?: string | null
  ref_type?: string | null
  ref_id?: number | null
  trans_date?: string | null
}

export function normalizeInvoiceFilterQuery(q: string): string {
  return String(q || '').trim().toLowerCase()
}

/** 미수·미지급 원장 행에서 인보이스 검색에 쓰는 후보 문자열 */
export function invoiceFilterCandidates(row: InvoiceFilterRow): string[] {
  const out: string[] = []
  const push = (v: string | null | undefined) => {
    const s = String(v || '').trim()
    if (s) out.push(s)
  }

  push(row.invoice_no)
  push(row.memo)

  const refType = String(row.ref_type || '').trim()
  const refId = Number(row.ref_id)
  const dateDigits = String(row.trans_date || '').replace(/\D/g, '').slice(0, 8)

  if (refType === 'AccountingPO' && refId > 0) {
    push(`APO#${refId}`)
    if (dateDigits) push(`APO${dateDigits}-${refId}`)
  }
  if (refType === 'ForceOutbound' && refId > 0) {
    push(`IVF#${refId}`)
  }
  if (refType === 'PO' && refId > 0) {
    push(`APO#${refId}`)
    if (dateDigits) push(`APO${dateDigits}-${refId}`)
  }
  if (refType === 'Inbound' && refId > 0) {
    push(`INB#${refId}`)
  }
  if (refType === 'Order') {
    const orderId = orderIdFromReceivableOrderRow(row)
    if (orderId != null) {
      push(String(orderId))
      push(`#${orderId}`)
      if (dateDigits) push(`IV${dateDigits}-${orderId}`)
    } else if (refId > 0) {
      push(String(refId))
      push(`#${refId}`)
      if (dateDigits) push(`IV${dateDigits}-${refId}`)
    }
  }

  return out
}

export function rowMatchesInvoiceFilter(row: InvoiceFilterRow, query: string): boolean {
  const q = normalizeInvoiceFilterQuery(query)
  if (!q) return true
  return invoiceFilterCandidates(row).some((c) => c.toLowerCase().includes(q))
}
