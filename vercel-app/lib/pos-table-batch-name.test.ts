import { describe, expect, it } from 'vitest'
import {
  buildPosTableBatchNames,
  previewPosTableBatchNames,
  resolvePosTableZoneNamePrefix,
} from '@/lib/pos-table-batch-name'

describe('pos-table-batch-name', () => {
  it('builds A-1 … A-10 style names', () => {
    expect(
      buildPosTableBatchNames({ count: 10, prefix: 'A-', start: 1, step: 1 })
    ).toEqual(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8', 'A-9', 'A-10'])
  })

  it('supports suffix and custom step', () => {
    expect(
      buildPosTableBatchNames({ count: 3, prefix: 'VIP', start: 10, step: 2, suffix: '번' })
    ).toEqual(['VIP10번', 'VIP12번', 'VIP14번'])
  })

  it('defaults step to 1 when zero', () => {
    expect(buildPosTableBatchNames({ count: 2, prefix: 'T', start: 1, step: 0 })).toEqual([
      'T1',
      'T2',
    ])
  })

  it('previews long lists', () => {
    expect(previewPosTableBatchNames({ count: 10, prefix: 'A-', start: 1, step: 1 }, 3)).toBe(
      'A-1 A-2 A-3 … A-10'
    )
  })

  it('uses zone label for Name 1–99 prefix', () => {
    expect(resolvePosTableZoneNamePrefix(2, 'VIP')).toBe('VIP-')
    expect(resolvePosTableZoneNamePrefix(2, 'VIP-')).toBe('VIP-')
    expect(resolvePosTableZoneNamePrefix(2, '')).toBe('2F-')
    expect(resolvePosTableZoneNamePrefix(1, null)).toBe('1F-')
  })
})
