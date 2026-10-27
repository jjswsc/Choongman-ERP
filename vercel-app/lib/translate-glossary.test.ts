import { describe, expect, it } from 'vitest'
import {
  applyGlossaryPostCorrect,
  protectGlossaryTerms,
  restoreGlossaryTerms,
} from './translate-glossary'

describe('translate-glossary', () => {
  it('protects Korean domain terms and restores Thai', () => {
    const src = '오늘 업무일지와 매장 점검을 완료했습니다.'
    const { text, slots } = protectGlossaryTerms(src, 'ko')
    expect(text).toContain('__CMTERM_')
    expect(text).not.toContain('업무일지')
    expect(text).not.toContain('매장 점검')
    const out = restoreGlossaryTerms(text, slots, 'th')
    expect(out).toContain('บันทึกงาน')
    expect(out).toContain('การตรวจร้าน')
  })

  it('post-corrects leftover source terms in target language', () => {
    const mixed = 'Please check the 매장 and 업무일지 today'
    const fixed = applyGlossaryPostCorrect(mixed, 'en')
    expect(fixed).toContain('store')
    expect(fixed).toContain('work log')
    expect(fixed).not.toContain('매장')
    expect(fixed).not.toContain('업무일지')
  })
})
