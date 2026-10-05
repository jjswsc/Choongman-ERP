/**
 * 이미 저장된 통장 매입대금(purchase_payment) 중 미지급 Payment가 없는 건의 삽입 행.
 * 조회 시 소급은 이 결과만 INSERT 한다. 기존 지급 행은 건드리지 않는다.
 */

export type BankPurchasePaymentBackfillRow = {
  id?: number
  vendor_code?: string | null
  amount?: number | null
  trans_date?: string | null
  memo?: string | null
  withholding_tax_amount?: number | null
}

export function purchasePaymentMemoFromBank(memo: string | null | undefined): string {
  const text = String(memo || '').trim()
  return (text ? `통장 지급: ${text.slice(0, 200)}` : '통장 지급').slice(0, 240)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function payableDate(raw: string | null | undefined): string {
  const d = String(raw || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

export function buildMissingPurchasePaymentInserts(params: {
  banks: BankPurchasePaymentBackfillRow[]
  existingPaymentBankIds: Set<number>
}): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<number>()
  for (const bt of params.banks || []) {
    const id = Number(bt.id || 0)
    const vendor = String(bt.vendor_code || '').trim()
    const amountAbs = Math.abs(Number(bt.amount) || 0)
    const transDate = payableDate(bt.trans_date)
    if (!id || seen.has(id) || !vendor || amountAbs <= 0.009 || !transDate) continue
    if (params.existingPaymentBankIds.has(id)) continue
    seen.add(id)
    out.push({
      vendor_code: vendor,
      amount: -roundMoney(amountAbs),
      ref_type: 'Payment',
      ref_id: null,
      trans_date: transDate,
      memo: purchasePaymentMemoFromBank(bt.memo),
      bank_transaction_id: id,
    })
  }
  return out
}

export function buildMissingPurchaseWithholdingInserts(params: {
  banks: BankPurchasePaymentBackfillRow[]
  existingWithholdingBankIds: Set<number>
}): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<number>()
  for (const bt of params.banks || []) {
    const id = Number(bt.id || 0)
    const vendor = String(bt.vendor_code || '').trim()
    const wht = roundMoney(Math.max(0, Number(bt.withholding_tax_amount) || 0))
    const transDate = payableDate(bt.trans_date)
    if (!id || seen.has(id) || !vendor || wht <= 0.009 || !transDate) continue
    if (params.existingWithholdingBankIds.has(id)) continue
    seen.add(id)
    out.push({
      vendor_code: vendor,
      amount: -wht,
      ref_type: 'Withholding',
      ref_id: null,
      trans_date: transDate,
      memo: '원천세',
      bank_transaction_id: id,
    })
  }
  return out
}
