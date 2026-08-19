import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

/** 카드 지출(배분 행) 삭제 시 자동 생성된 매입 부가세 장부 행 제거 (submitted 보호) */
export async function deleteCardTransactionInputVatLedger(cardTransactionId: number): Promise<void> {
  const id = Math.floor(Number(cardTransactionId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:CARD_TX:${id}]`
  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 20, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  for (const e of existing || []) {
    const eid = Math.floor(Number(e?.id) || 0)
    if (eid <= 0) continue
    if (String(e?.filing_status || '').trim().toLowerCase() === 'submitted') continue
    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
  }
}

/** 카드 자동 PP.30 매입 중단. ภาษีซื้อ는 purchase_tax_invoices. */
export async function syncCardTransactionInputVatLedger(
  _cardTransactionId: number,
  _options?: { createdBy?: string; fallbackStoreName?: string }
): Promise<void> {
  return
}

export async function syncCardAllocationInputVatLedgers(_params: {
  months: string[]
  storeFilter?: string
  createdBy?: string
}): Promise<{ synced: number; skipped: number }> {
  return { synced: 0, skipped: 0 }
}
