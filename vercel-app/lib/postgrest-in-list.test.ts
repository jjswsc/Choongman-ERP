import { describe, expect, it } from 'vitest'
import { postgrestInQuotedList } from '@/lib/postgrest-in-list'

describe('postgrestInQuotedList', () => {
  it('quotes numeric store codes and ISO dates so in.() is not arithmetic', () => {
    expect(postgrestInQuotedList(['1001', '2026-09-21'])).toBe('"1001","2026-09-21"')
  })

  it('drops blanks and duplicate values', () => {
    expect(postgrestInQuotedList(['1001', '', '1001', ' 1000 '])).toBe('"1001","1000"')
  })
})
