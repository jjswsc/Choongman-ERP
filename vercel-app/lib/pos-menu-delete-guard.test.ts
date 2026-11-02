import { describe, expect, it } from 'vitest'
import {
  buildPosOrderMenuIdLikePatterns,
  posMenuDeleteBlockMessage,
} from '@/lib/pos-menu-delete-guard'

describe('buildPosOrderMenuIdLikePatterns', () => {
  it('rejects non-numeric ids', () => {
    expect(buildPosOrderMenuIdLikePatterns('')).toEqual([])
    expect(buildPosOrderMenuIdLikePatterns('K047')).toEqual([])
  })

  it('builds quoted patterns that avoid prefix false positives', () => {
    const pats = buildPosOrderMenuIdLikePatterns('47')
    expect(pats.some((p) => p.includes('"menuId1":"47"'))).toBe(true)
    expect(pats.some((p) => p.includes('"menuId2":"47"'))).toBe(true)
    // 470 과 혼동되는 비인용 숫자 패턴은 넣지 않음
    expect(pats.every((p) => !p.includes('"menuId1":47'))).toBe(true)
  })
})

describe('posMenuDeleteBlockMessage', () => {
  it('returns order guidance', () => {
    expect(posMenuDeleteBlockMessage('order')).toMatch(/사용 안함/)
  })
})
