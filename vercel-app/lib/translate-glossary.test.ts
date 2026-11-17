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

  it('restores Myanmar terms for mm/my target (not English)', () => {
    const src = '오늘 업무일지와 매장 점검을 완료했습니다.'
    const { text, slots } = protectGlossaryTerms(src, 'ko')
    const outMm = restoreGlossaryTerms(text, slots, 'mm')
    const outMy = restoreGlossaryTerms(text, slots, 'my')
    expect(outMm).toContain('အလုပ်မှတ်တမ်း')
    expect(outMm).toContain('ဆိုင်စစ်ဆေးခြင်း')
    expect(outMm).not.toContain('work log')
    expect(outMy).toContain('အလုပ်မှတ်တမ်း')
  })

  it('restores Lao/Khmer for la/lo and kh/km UI codes', () => {
    const src = '오늘 업무일지와 매장 점검을 완료했습니다.'
    const { text, slots } = protectGlossaryTerms(src, 'ko')
    const lo = restoreGlossaryTerms(text, slots, 'la')
    const km = restoreGlossaryTerms(text, slots, 'kh')
    expect(lo).toContain('ບັນທຶກວຽກ')
    expect(lo).toContain('ການກວດຮ້ານ')
    expect(lo).not.toContain('work log')
    expect(km).toContain('កំណត់ហេតុការងារ')
    expect(km).toContain('ការត្រួតពិនិត្យហាង')
    expect(km).not.toContain('work log')
  })

  it('post-corrects leftover source terms in target language', () => {
    const mixed = 'Please check the 매장 and 업무일지 today'
    const fixed = applyGlossaryPostCorrect(mixed, 'en')
    expect(fixed).toContain('store')
    expect(fixed).toContain('work log')
    expect(fixed).not.toContain('매장')
    expect(fixed).not.toContain('업무일지')
  })

  it('post-corrects leftover Korean terms into Myanmar', () => {
    const mixed = '오늘 업무일지 완료'
    const fixed = applyGlossaryPostCorrect(mixed, 'my')
    expect(fixed).toContain('အလုပ်မှတ်တမ်း')
    expect(fixed).not.toContain('업무일지')
  })

  it('post-corrects leftover Korean terms into Lao and Khmer', () => {
    expect(applyGlossaryPostCorrect('업무일지 완료', 'lo')).toContain('ບັນທຶກວຽກ')
    expect(applyGlossaryPostCorrect('업무일지 완료', 'km')).toContain('កំណត់ហេតុការងារ')
  })
})
