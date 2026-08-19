function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function vatSplitFromTaxInvoiceGross(gross: number): { net: number; vat: number } {
  const g = Math.max(0, Math.abs(Number(gross) || 0))
  if (g <= 0) return { net: 0, vat: 0 }
  const vat = round2((g * 7) / 107)
  const net = round2(g - vat)
  return { net, vat }
}

/**
 * 통장 지출 자동 PP.30 매입은 중단. ภาษีซื้อ는 purchase_tax_invoices.
 */
export async function syncInvoiceBackedBankInputVatLedgers(_params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number; skipped: number }> {
  return { upserted: 0, deleted: 0, skipped: 0 }
}

export async function syncInvoiceBackedBankInputVatLedgerForBankId(
  _bankTransactionId: number
): Promise<{ upserted: boolean; deleted: boolean; skipped: boolean }> {
  return { upserted: false, deleted: false, skipped: true }
}
