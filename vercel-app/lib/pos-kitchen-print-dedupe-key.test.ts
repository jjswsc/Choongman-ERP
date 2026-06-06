import { describe, expect, it } from 'vitest'
import {
  buildKitchenJobCreateDedupeKey,
  buildKitchenJobInboundDedupeKey,
  buildKitchenJobStatusDedupeKey,
} from '@/lib/pos-kitchen-print-dedupe-key'

describe('pos-kitchen-print-dedupe-key', () => {
  it('builds inbound key for Grab webhook and terminal', () => {
    expect(buildKitchenJobInboundDedupeKey(101)).toBe('order:101:kitchen:inbound')
    expect(buildKitchenJobInboundDedupeKey('101')).toBe('order:101:kitchen:inbound')
    expect(buildKitchenJobInboundDedupeKey(0)).toBe('')
  })

  it('builds create and status keys', () => {
    expect(buildKitchenJobCreateDedupeKey(5)).toBe('order:5:kitchen:create')
    expect(buildKitchenJobStatusDedupeKey(5, 'Cooking')).toBe('order:5:kitchen:status:cooking')
  })
})
