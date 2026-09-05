import { describe, expect, it } from 'vitest'
import {
  POS_ORDER_ADVANCE_DEPOSIT_SELECT_COLS,
  POS_ORDER_FULL_SELECT,
  POS_ORDER_POLL_HEADS_SELECT,
  POS_ORDER_POLL_MINIMAL_SELECT,
} from '@/lib/pos-order-select'

describe('POS_ORDER_*_SELECT', () => {
  it('omits undeployed advance/deposit columns (충만 42703)', () => {
    const selects = [POS_ORDER_FULL_SELECT, POS_ORDER_POLL_MINIMAL_SELECT, POS_ORDER_POLL_HEADS_SELECT]
    for (const col of POS_ORDER_ADVANCE_DEPOSIT_SELECT_COLS) {
      const re = new RegExp(`(?:^|,)${col}(?:,|$)`)
      for (const select of selects) {
        expect(select).not.toMatch(re)
      }
    }
  })
})
