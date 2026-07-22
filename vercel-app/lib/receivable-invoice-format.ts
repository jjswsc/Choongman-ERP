import { isOutboundReceivableInvoiceNo, isTaxInvoiceDocumentNo } from './tax-invoice-doc-no'

/** 인보이스 번호 생성: IV{yyyymmdd}-{orderId} (출고 관리와 동일 형식) — 서버 의존 없음 */
export function formatReceivableInvoiceNo(orderId: number, transDate: string): string {
  const datePart =
    String(transDate || '')
      .replace(/\D/g, '')
      .slice(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `IV${datePart}-${orderId}`
}

/** 강제출고 인보이스: IVF{yyyymmdd}-{stockLogId} */
export function formatForceOutboundInvoiceNo(stockLogId: number, transDate: string): string {
  const datePart = String(transDate || '')
    .replace(/\D/g, '')
    .slice(0, 8)
  if (datePart.length < 8 || !stockLogId) return ''
  return `IVF${datePart}-${stockLogId}`
}

/** 회계발주 인보이스: APO{yyyymmdd}-{poId} */
export function formatAccountingPoInvoiceNo(poId: number, transDate: string): string {
  const datePart = String(transDate || '')
    .replace(/\D/g, '')
    .slice(0, 8)
  if (datePart.length < 8 || !poId) return ''
  return `APO${datePart}-${poId}`
}

export function taxInvoiceOverrideCodesForRef(refType: string, refId: number): string[] {
  const rt = String(refType || '').trim()
  if (!rt || !Number.isFinite(refId) || refId <= 0) return []
  if (rt === 'AccountingPO' || rt === 'PO') {
    return [
      `invoice_print_override:tax:PO:${refId}`,
      `invoice_print_override:tax:AccountingPO:${refId}`,
    ]
  }
  return [`invoice_print_override:tax:${rt}:${refId}`]
}

/**
 * 미수 원장 「Invoice」표시.
 * Tax Invoice 문서번호(IV.YYYYMMDD-NNN)가 invoice_no에 잘못 저장된 경우
 * 출고 Invoice(IV/IVF/APO…)로 복구해 보여 준다.
 * → AR(ลูกหนี้) 연결·검색은 이 값을 사용한다.
 */
export function resolveReceivableOrderNoDisplay(row: {
  ref_type?: string | null
  ref_id?: number | null
  invoice_no?: string | null
  trans_date?: string | null
}): string {
  const refType = String(row.ref_type || '').trim()
  const refId = Number(row.ref_id || 0)
  const inv = String(row.invoice_no || '').trim()
  const date = String(row.trans_date || '').slice(0, 10)

  if (refType === 'AccountingPO') {
    if (inv && !isTaxInvoiceDocumentNo(inv)) return inv
    const restored = refId > 0 ? formatAccountingPoInvoiceNo(refId, date) : ''
    return restored || (refId > 0 ? `APO#${refId}` : '-')
  }

  if (refType === 'ForceOutbound') {
    if (inv && !isTaxInvoiceDocumentNo(inv)) return inv
    const restored = refId > 0 ? formatForceOutboundInvoiceNo(refId, date) : ''
    return restored || (refId > 0 ? `IVF#${refId}` : '-')
  }

  if (refType === 'Order') {
    if (inv && isOutboundReceivableInvoiceNo(inv)) return inv
    if (inv && !isTaxInvoiceDocumentNo(inv)) return inv
    if (refId > 0) {
      const restored = formatReceivableInvoiceNo(refId, date)
      if (restored) return restored
      return `#${refId}`
    }
    return inv || '-'
  }

  return '-'
}

/**
 * Tax Invoice/Receipt 문서번호 표시 (IV.YYYYMMDD-NNN).
 * 1) invoice_settings override  2) 레거시로 invoice_no/memo에 남은 Tax 번호
 */
export function resolveReceivableTaxInvoiceDocNoDisplay(
  row: {
    ref_type?: string | null
    ref_id?: number | null
    invoice_no?: string | null
    memo?: string | null
  },
  overrideMap?: Record<string, { documentNo?: string | null } | undefined> | null
): string {
  const refType = String(row.ref_type || '').trim()
  if (refType !== 'Order' && refType !== 'ForceOutbound' && refType !== 'AccountingPO' && refType !== 'PO') {
    return ''
  }
  const refId = Number(row.ref_id || 0)
  if (overrideMap && refId > 0) {
    for (const code of taxInvoiceOverrideCodesForRef(refType, refId)) {
      const doc = String(overrideMap[code]?.documentNo || '').trim()
      if (doc && isTaxInvoiceDocumentNo(doc)) return doc
    }
  }
  const inv = String(row.invoice_no || '').trim()
  if (isTaxInvoiceDocumentNo(inv)) return inv
  const memo = String(row.memo || '')
  const m = memo.match(/IV\.\d{8}-\d+/i)
  return m ? m[0] : ''
}
