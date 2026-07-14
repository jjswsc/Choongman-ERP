import { describe, expect, it } from 'vitest'
import {
  matchPosTableLayoutRow,
  normalizePosTableLayoutStoreCode,
  posTableLayoutStoreCodeCandidates,
} from '@/lib/pos-table-layout-store-match'

describe('pos-table-layout-store-match', () => {
  it('builds hyphen/space/CM candidates', () => {
    expect(posTableLayoutStoreCodeCandidates('cm-asoke')).toEqual(
      expect.arrayContaining(['cm-asoke', 'CM cm-asoke', 'cm asoke'])
    )
  })

  it('normalizes store codes for comparison', () => {
    expect(normalizePosTableLayoutStoreCode('CM Asoke')).toBe(
      normalizePosTableLayoutStoreCode('cm-asoke')
    )
  })

  it('matches similar store codes without single-row fallback', () => {
    const rows = [{ store_code: 'CM Asoke', layout_json: [{ id: 't1' }] }]
    expect(matchPosTableLayoutRow('cm-asoke', rows)?.store_code).toBe('CM Asoke')
    expect(matchPosTableLayoutRow('other-store', rows)).toBeNull()
  })

  it('does not return unrelated layout when only one row exists', () => {
    const rows = [{ store_code: 'seed-store', layout_json: [{ id: 'only' }] }]
    expect(matchPosTableLayoutRow('brand-new-store', rows)).toBeNull()
  })
})
