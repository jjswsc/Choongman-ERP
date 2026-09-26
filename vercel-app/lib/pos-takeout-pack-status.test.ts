import { describe, expect, it } from 'vitest'
import {
  isPaidStatusDowngradeBlockedMessage,
  POS_PAID_STATUS_DOWNGRADE_BLOCKED_MESSAGE,
  resolveTakeoutPackStatusSteps,
} from '@/lib/pos-takeout-pack-status'

describe('resolveTakeoutPackStatusSteps', () => {
  it('skips ready when the order is already paid', () => {
    expect(resolveTakeoutPackStatusSteps({ currentStatus: 'paid', alsoComplete: true })).toEqual([
      'completed',
    ])
  })

  it('marks unpaid takeout ready only', () => {
    expect(resolveTakeoutPackStatusSteps({ currentStatus: 'cooking', alsoComplete: false })).toEqual([
      'ready',
    ])
  })

  it('completes a paid-at-counter order after ready', () => {
    expect(resolveTakeoutPackStatusSteps({ currentStatus: 'pending', alsoComplete: true })).toEqual([
      'ready',
      'completed',
    ])
  })
})

describe('isPaidStatusDowngradeBlockedMessage', () => {
  it('matches the paid downgrade rejection', () => {
    expect(isPaidStatusDowngradeBlockedMessage(POS_PAID_STATUS_DOWNGRADE_BLOCKED_MESSAGE)).toBe(true)
    expect(isPaidStatusDowngradeBlockedMessage('체크리스트를 불러오지 못했습니다.')).toBe(false)
  })
})
