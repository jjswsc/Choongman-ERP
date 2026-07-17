import { describe, expect, it } from 'vitest'
import {
  classifyKitchenAutoprintFailure,
  shouldShowKitchenAutoprintNotice,
} from '@/lib/pos-kitchen-autoprint-notice'

describe('classifyKitchenAutoprintFailure', () => {
  it('skips empty slip cases', () => {
    expect(classifyKitchenAutoprintFailure(new Error('no_slips_to_print'))).toBe('skip')
    expect(classifyKitchenAutoprintFailure(new Error('empty_order_items'))).toBe('skip')
  })

  it('detects print unavailable', () => {
    expect(classifyKitchenAutoprintFailure(new Error('print_unavailable'))).toBe('print')
  })

  it('detects fetch/network failures', () => {
    expect(classifyKitchenAutoprintFailure(new Error('Failed to fetch'))).toBe('network')
    expect(classifyKitchenAutoprintFailure(new Error('NetworkError when attempting to fetch'))).toBe(
      'network'
    )
    expect(classifyKitchenAutoprintFailure(new Error('timeout'))).toBe('network')
  })

  it('treats other errors as other', () => {
    expect(classifyKitchenAutoprintFailure(new Error('missing_store_code'))).toBe('other')
  })
})

describe('shouldShowKitchenAutoprintNotice', () => {
  it('allows first notice and throttles within cooldown', () => {
    expect(shouldShowKitchenAutoprintNotice(0, 1000)).toBe(true)
    expect(shouldShowKitchenAutoprintNotice(1000, 10_000, 25_000)).toBe(false)
    expect(shouldShowKitchenAutoprintNotice(1000, 30_000, 25_000)).toBe(true)
  })
})
