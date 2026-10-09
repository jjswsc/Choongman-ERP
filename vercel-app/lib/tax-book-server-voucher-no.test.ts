import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  supabaseDeleteByFilter: vi.fn(),
  supabaseInsertMany: vi.fn(),
  supabaseSelectFilter: vi.fn(),
  supabaseSelectFilterAllPages: vi.fn(),
}))
vi.mock('@/lib/accounting-posting', () => ({ syncPettyCashExpenseAccount: vi.fn() }))

const { toTaxBookEntries } = await import('./tax-book-server')

function purchaseLines(id: number) {
  return [
    { journal_entry_id: id, account_code: '5100', side: 'debit', amount: 100 },
    { journal_entry_id: id, account_code: '1360', side: 'debit', amount: 7 },
    { journal_entry_id: id, account_code: '2110', side: 'credit', amount: 107 },
  ]
}

describe('toTaxBookEntries voucher numbers', () => {
  it('uses the expense PV number and skips it for generated numbers', () => {
    const heads = [
      { id: 1, entry_no: 'EXP2026100042', accounting_date: '2026-10-02', source_type: 'expense_accrual', voucher_kind: 'purchase' },
      { id: 2, entry_no: 'JE-1', accounting_date: '2026-10-03', source_type: 'store_purchase', voucher_kind: 'purchase' },
      { id: 3, entry_no: 'PV2026100001', accounting_date: '2026-10-08', source_type: 'expense_accrual', voucher_kind: 'purchase' },
      { id: 4, entry_no: 'pv2026100004', accounting_date: '2026-10-09', source_type: 'expense_accrual', voucher_kind: 'purchase' },
      { id: 5, entry_no: 'JE-2', accounting_date: '2026-10-09', source_type: 'store_purchase', voucher_kind: 'purchase' },
    ]
    const lines = heads.flatMap((h) => purchaseLines(h.id))
    const rows = toTaxBookEntries('2026-10', heads, lines)
    const byId = new Map(rows.map((r) => [r.id, r.voucherNo]))
    expect(byId.get(1)).toBe('EXP2026100042')
    expect(byId.get(3)).toBe('PV2026100001')
    expect(byId.get(4)).toBe('PV2026100004')
    expect(byId.get(2)).toBe('PV2026100002')
    expect(byId.get(5)).toBe('PV2026100003')
  })
})
