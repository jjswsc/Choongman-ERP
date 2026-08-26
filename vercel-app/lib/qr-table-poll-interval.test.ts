import { describe, expect, it } from 'vitest'
import {
  QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS,
  QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS,
  QR_FLOOR_SESSION_HINTS_POLL_MS,
  QR_TABLE_GUEST_PAY_POLL_MS,
} from '@/lib/qr-table-poll-interval'

describe('qr-table poll intervals', () => {
  it('spaces guest prepay Inquiry to 5s', () => {
    expect(QR_TABLE_GUEST_PAY_POLL_MS).toBe(5_000)
  })

  it('polls hall QR badges every 30s when enabled', () => {
    expect(QR_FLOOR_SESSION_HINTS_POLL_MS).toBe(30_000)
    expect(QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS).toBe(300_000)
    expect(QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS).toBe(60_000)
  })
})
