import { describe, expect, it } from 'vitest'
import {
  buildForcePushWithOptionalItemFilter,
  buildInboundFromHqWithOptionalItemFilter,
  buildOutboundLogDateFilterLike,
} from '@/lib/outbound-store-item-summary'

describe('outbound-store-item-summary filters', () => {
  it('builds date filter with soft-delete', () => {
    const f = buildOutboundLogDateFilterLike('2026-07-01', '2026-07-31')
    expect(f).toContain('log_date=gte.')
    expect(f).toContain('log_date=lt.')
    expect(f).toContain('is_deleted=is.false')
  })

  it('inbound filter nests item search without breaking vendor', () => {
    const date = buildOutboundLogDateFilterLike('2026-07-01', '2026-07-31')
    const f = buildInboundFromHqWithOptionalItemFilter(date, 'CM006')
    expect(f).toContain('log_type=eq.Inbound')
    expect(f).toContain('From%20HQ')
    expect(f).toContain('item_code.ilike.')
    expect(f).toContain('CM006')
  })

  it('force push wraps vendor or + item or in and()', () => {
    const date = buildOutboundLogDateFilterLike('2026-07-01', '2026-07-31')
    const f = buildForcePushWithOptionalItemFilter(date, 'Garlic')
    expect(f).toContain('log_type=eq.ForcePush')
    expect(f).toContain('and=(or(vendor_target')
    expect(f).toContain('item_name.ilike.')
  })
})
