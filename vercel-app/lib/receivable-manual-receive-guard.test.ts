import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  supabaseSelectFilter: vi.fn(),
}))

import { supabaseSelectFilter } from '@/lib/supabase-server'
import { findConsolidatedBankReceiveBlockingManualCheck } from '@/lib/receivable-manual-receive-guard'

describe('findConsolidatedBankReceiveBlockingManualCheck', () => {
  beforeEach(() => {
    vi.mocked(supabaseSelectFilter).mockReset()
  })

  it('returns conflict when consolidated bank receive exists for store alias', async () => {
    vi.mocked(supabaseSelectFilter).mockResolvedValue([
      {
        id: 1088,
        bank_transaction_id: 7611,
        amount: -202802.45,
        store_name: 'CM Silom',
        memo: '통장 수령: Transfer Deposit',
      },
    ])
    const hit = await findConsolidatedBankReceiveBlockingManualCheck('Silom', '2026-06-18')
    expect(hit?.bankTransactionId).toBe(7611)
    expect(hit?.amountAbs).toBe(202802.45)
  })

  it('ignores non-bank memo receives', async () => {
    vi.mocked(supabaseSelectFilter).mockResolvedValue([
      {
        id: 99,
        bank_transaction_id: 1,
        amount: -100,
        store_name: 'CM Silom',
        memo: '수금확인 IV123',
      },
    ])
    const hit = await findConsolidatedBankReceiveBlockingManualCheck('CM Silom', '2026-06-18')
    expect(hit).toBeNull()
  })

  it('returns null for empty date', async () => {
    const hit = await findConsolidatedBankReceiveBlockingManualCheck('CM Silom', '')
    expect(hit).toBeNull()
    expect(supabaseSelectFilter).not.toHaveBeenCalled()
  })
})
