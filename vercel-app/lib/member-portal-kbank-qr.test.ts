import { describe, expect, it } from 'vitest'
import { isDuplicateLocalTxIdError } from '@/lib/member-portal-kbank-qr'

describe('isDuplicateLocalTxIdError', () => {
  it('detects reused partnerTxnUid unique violation', () => {
    expect(
      isDuplicateLocalTxIdError(
        'Supabase insert failed: {"code":"23505","details":"Key (local_tx_id)=(QTB34801791872802887) already exists.","hint":null,"message":"duplicate key value violates unique constraint \\"ux_pos_payment_attempts_local_tx_id\\""}'
      )
    ).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isDuplicateLocalTxIdError('duplicate key 23505 on pos_orders_pkey')).toBe(false)
    expect(isDuplicateLocalTxIdError('Supabase insert failed: timeout')).toBe(false)
  })
})
