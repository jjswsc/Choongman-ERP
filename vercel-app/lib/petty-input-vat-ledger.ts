import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

/** 패티 지출 삭제 시 자동 생성된 매입 부가세 장부 행 제거 (submitted 보호) */
export async function deletePettyCashInputVatLedger(pettyCashId: number): Promise<void> {
  const id = Math.floor(Number(pettyCashId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:PETTY_CASH:${id}]`
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

/** 패티 자동 PP.30 매입 중단. ภาษีซื้อ는 purchase_tax_invoices. */
export async function syncPettyCashInputVatLedger(
  _pettyCashId: number,
  _options?: { skipPurchasePayment?: boolean }
): Promise<void> {
  return
}
