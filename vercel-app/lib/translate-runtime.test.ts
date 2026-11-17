import { describe, expect, it } from 'vitest'
import {
  normalizeTranslateTargetLang,
  parseOpenAiTranslatedArray,
  targetLangLabel,
} from './translate-runtime'

describe('translate-runtime openai helpers', () => {
  it('normalizes mm/la/kh to provider lang codes', () => {
    expect(normalizeTranslateTargetLang('mm')).toBe('my')
    expect(normalizeTranslateTargetLang('la')).toBe('lo')
    expect(normalizeTranslateTargetLang('kh')).toBe('km')
    expect(normalizeTranslateTargetLang('TH')).toBe('th')
  })

  it('maps target lang labels for prompts', () => {
    expect(targetLangLabel('th')).toBe('Thai')
    expect(targetLangLabel('my')).toContain('Myanmar')
    expect(targetLangLabel('lo')).toContain('Lao')
    expect(targetLangLabel('km')).toContain('Khmer')
  })

  it('parses plain JSON array', () => {
    const raw = '["สวัสดี","ร้าน"]'
    expect(parseOpenAiTranslatedArray(raw, 2)).toEqual(['สวัสดี', 'ร้าน'])
  })

  it('parses fenced JSON and ignores length mismatch', () => {
    expect(parseOpenAiTranslatedArray('```json\n["a","b"]\n```', 2)).toEqual(['a', 'b'])
    expect(parseOpenAiTranslatedArray('["only-one"]', 2)).toEqual([null, null])
  })

  it('extracts JSON array from surrounding prose', () => {
    const raw = 'Here you go:\n["ok","done"]\nThanks'
    expect(parseOpenAiTranslatedArray(raw, 2)).toEqual(['ok', 'done'])
  })
})
