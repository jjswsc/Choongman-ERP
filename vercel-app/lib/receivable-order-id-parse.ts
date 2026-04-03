/**
 * 미수금(Order) 행에서 주문 ID 추출 — ref_id 누락 시 invoice_no·memo의 IVYYYYMMDD-orderId 패턴
 */
const RE_IV_ORDER = /IV\d{8}-(\d+)/i

export function orderIdFromReceivableOrderRow(row: {
  ref_id?: number | string | null
  invoice_no?: string | null
  memo?: string | null
}): number | undefined {
  const rid = Number(row.ref_id)
  if (Number.isFinite(rid) && rid > 0) return rid
  for (const raw of [row.invoice_no, row.memo]) {
    if (raw == null || typeof raw !== 'string') continue
    const m = raw.match(RE_IV_ORDER)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return undefined
}
