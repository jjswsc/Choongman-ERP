import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

/** 지출 발생 삭제 시 자동 생성된 매입 부가세 장부 행 제거 (submitted 보호) */
export async function deleteExpenseAccrualInputVatLedger(expenseAccrualId: number): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:EXPENSE_ACCRUAL:${id}]`
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

/**
 * 지출 등록은 더 이상 PP.30 매입(ภาษีซื้อ)을 만들지 않는다.
 * 정본은 purchase_tax_invoices. submitted 과거 행은 마이그레이션 SQL만 정리.
 */
export async function syncExpenseAccrualInputVatLedger(
  _expenseAccrualId: number,
  _options?: { fallbackStoreName?: string }
): Promise<void> {
  return
}
